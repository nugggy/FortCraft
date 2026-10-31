// Bot brain. Runs on the host for every bot actor.
// Personalities, cover and retreat, a local walkability planner with a stuck watchdog,
// hearing, team play (follow, revive) and generic use of throwables and launch pads.
import * as THREE from '../vendor/three.module.min.js';
import { B, BLOCKS } from './blocks.js';
import { WEAPONS, HEALS } from './items.js';
import { SX, SZ } from './world.js';

const DIFF = {
  easy: { react: 0.8, err: 0.07, turn: 3.0, build: 0.12, see: 45, burst: 0.5 },
  normal: { react: 0.5, err: 0.04, turn: 5.0, build: 0.3, see: 60, burst: 0.75 },
  hard: { react: 0.28, err: 0.022, turn: 8.0, build: 0.55, see: 75, burst: 0.95 },
};
const PREF_RANGE = { shotgun: 5, smg: 12, pistol: 15, ar: 24, burst: 22, sniper: 55, rocket: 25, pickaxe: 1.5 };

// Personalities shape how a bot fights, loots and rotates. Weights pick how common each is.
const PERSONAS = {
  aggressive: { weight: 3, push: 1.0, range: 0.75, build: 1.0, ramps: true, rotateEarly: 0, loot: 0.8, retreatAt: 45, prefer: { shotgun: 1.5, smg: 0.6 } },
  passive: { weight: 2, push: 0.2, range: 1.3, build: 0.8, rotateEarly: 35, loot: 1.0, retreatAt: 95, thirdParty: true, prefer: { ar: 0.5, burst: 0.5 } },
  builder: { weight: 2, push: 0.55, range: 1.0, build: 1.8, box: true, ramps: true, rotateEarly: 10, loot: 1.0, retreatAt: 75, prefer: {} },
  sniper: { weight: 1, push: 0.3, range: 1.8, build: 0.9, highGround: true, rotateEarly: 20, loot: 1.0, retreatAt: 80, prefer: { sniper: 2.0, ar: 0.4 } },
  looter: { weight: 2, push: 0.5, range: 1.0, build: 0.8, rotateEarly: 15, loot: 1.6, retreatAt: 70, prefer: {} },
};
const PERSONA_KEYS = Object.keys(PERSONAS);

export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const HEADINGS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];
const MAX_BUILDS_PER_SEC = 4;

// One shared listener per game turns gunshots into hearing cues for every bot.
function ensureHearing(game) {
  if (game.__botHearing) return;
  game.__botHearing = true;
  game.events.on((ev, a) => {
    if (ev !== 'shot' || !a || !a.pos) return;
    for (const b of game.brains || []) if (b.hear) b.hear(a);
  });
}

export class BotBrain {
  constructor(game, actor, difficulty, rand) {
    this.game = game; this.a = actor;
    this.d = { ...DIFF[difficulty] || DIFF.normal };
    this.rand = rand;
    this.persona = actor.boss ? 'builder' : pickPersona(rand);
    this.p = actor.boss ? { ...PERSONAS.builder, push: 0.9, prefer: { ar: 1, rocket: 1 } } : PERSONAS[this.persona];
    if (actor.boss) this.d = { ...DIFF.hard, err: 0.015, build: 0.7, see: 90 };
    actor.persona = this.persona;
    this.think = rand() * 0.3;
    this.goal = null;
    this.target = null; this.targetSeenAt = -99; this.lastSeenPos = new THREE.Vector3();
    this.reactAt = 0;
    this.strafe = 1; this.strafeT = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.buildCd = 0; this.buildQueue = []; this.buildStamps = [];
    this.dropTarget = null;
    this.jumpTime = 1e9;
    this.chestTarget = null; this.harvestTarget = null;
    this.wantJump = false;
    this.desiredYaw = actor.yaw; this.desiredPitch = 0;
    this.fireHeld = false;
    this.navHeading = null;
    this.watch = { key: '', best: Infinity, t: 0 };
    this.detour = null;
    this.investigate = null;
    this.cover = null; this.coverT = 0;
    this.reviveTarget = null;
    this.throwCd = 0; this.padCd = 0;
    this.holdSpot = null;
    this.sprint = false;
    ensureHearing(game);
  }

  now() { return this.game.time; }
  sameTeam(o) { return !!(this.game.sameTeam && this.game.sameTeam(this.a, o)); }
  canBuild() { return !this.game.noBuild && this.game.build && (this.a.mats.wood + this.a.mats.brick + this.a.mats.metal) >= 10; }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const a = this.a;
    if (!a.alive) return;
    const g = this.game;
    if (a.state === 'bus') {
      if (g.busT >= this.jumpTime) g.jumpFromBus(a);
      return;
    }
    if (a.state === 'dive' || a.state === 'glide') {
      const t = this.dropTarget || a.pos;
      const dx = t.x - a.pos.x, dz = t.z - a.pos.z, dist = Math.hypot(dx, dz);
      a.yaw = yawTo(dx, dz);
      a.pitch = dist > 30 ? -1 : -0.3;
      const k = Math.min(1, dist / 6);
      a.physics(dt, { mx: dist > 0.1 ? dx / dist * k : 0, mz: dist > 0.1 ? dz / dist * k : 0, jump: false });
      return;
    }

    g.combat.tick(a, dt);
    this.think -= dt; this.buildCd -= dt; this.throwCd -= dt; this.padCd -= dt;
    if (this.think <= 0) { this.think = 0.2 + this.rand() * 0.1; this.decide(); }

    // queued builds (box-ups, ramps) run one piece at a time, rate-capped
    if (this.buildQueue.length && this.buildCd <= 0 && !a.downed) this.runBuildQueue();

    // revive: hold on the downed teammate every frame while close and not under fire
    if (this.reviveTarget && g.revive && !a.downed) {
      const r = this.reviveTarget;
      if (r.alive && r.downed && a.pos.distanceTo(r.pos) < 2.6 && g.time - a.lastDamagedAt > 1) g.revive(a, r);
    }

    // aim smoothing
    const turn = this.d.turn * dt;
    a.yaw += Math.max(-turn, Math.min(turn, angDiff(this.desiredYaw, a.yaw)));
    a.pitch += Math.max(-turn, Math.min(turn, this.desiredPitch - a.pitch));

    // movement
    const ctl = { mx: 0, mz: 0, jump: false, sprint: this.sprint && !a.downed };
    if (this.move) { ctl.mx = this.move.x; ctl.mz = this.move.z; }
    if (this.wantJump && !a.downed) { ctl.jump = true; this.wantJump = false; }
    if (a.blocked && a.onGround && (ctl.mx || ctl.mz) && !a.downed) ctl.jump = true;
    // swim at the surface so the bank is within one step
    if (a.inWater && (ctl.mx || ctl.mz)) ctl.jump = true;
    a.physics(dt, ctl);

    // short-term stuck handling: jump (above), then dig, then a fresh goal
    const moved = Math.hypot(a.pos.x - this.lastPos.x, a.pos.z - this.lastPos.z);
    if ((ctl.mx || ctl.mz) && moved < dt * 1.2) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    this.lastPos.copy(a.pos);
    if (this.stuckT > 1.0 && !this.target && !a.downed) this.digForward();
    if (this.stuckT > 3.5) { this.goal = this.randomGoal(); this.navHeading = null; this.stuckT = 0; }

    // queued item use (grenade, med mist, launch pad): retry each frame until it goes off
    if (this.pendingUse && !a.downed) {
      const u = this.pendingUse;
      if (g.time > u.until || !a.slots[u.slot]) this.pendingUse = null;
      else {
        a.select(u.slot + 1);
        a.yaw = u.yaw; a.pitch = u.pitch; this.desiredYaw = u.yaw; this.desiredPitch = u.pitch;
        if (g.combat.fire(a, a.eyePos, a.lookDir(), true)) this.pendingUse = null;
      }
      return;
    }

    // bots always "press"; weapon cooldowns limit the fire rate
    if (this.fireHeld && !a.downed) {
      const h = a.held();
      if (h && h.kind === 'weapon') g.combat.fire(a, a.eyePos, a.lookDir(), true);
    }
  }

  // ---------------------------------------------------------------- decisions
  decide() {
    const a = this.a, g = this.game;
    this.fireHeld = false;
    this.move = null;
    this.sprint = false;
    const t = this.now();

    if (a.downed) { this.decideDowned(); return; }

    // perception
    const seen = this.scanEnemies();
    const enemy = seen.best;
    if (enemy) {
      if (this.target !== enemy) { this.target = enemy; this.reactAt = t + this.d.react * (0.6 + this.rand() * 0.8); }
      this.targetSeenAt = t; this.lastSeenPos.copy(enemy.pos);
      this.investigate = null;
    } else if (this.target && (t - this.targetSeenAt > 4 || !this.target.alive || this.sameTeam(this.target))) this.target = null;
    this.visibleCount = seen.count;

    // react to damage: builders box up, everyone else may throw a wall (and maybe a ramp)
    if (t - a.lastDamagedAt < 0.6 && this.canBuild() && this.rand() < this.d.build * this.p.build) this.panicBuild();

    const storm = g.storm;
    const inStorm = storm.outside(a.pos);
    const early = this.p.rotateEarly || 0;
    const needRotate = inStorm || (storm.outsideNext(a.pos, 6) && (storm.stage === 'shrink' || storm.timer < 30 + early));

    // teammates first: revive when it's safe enough
    if (!this.target || t - this.targetSeenAt > 2) {
      const mate = this.downedMate();
      if (mate) {
        this.reviveTarget = mate;
        if (a.pos.distanceTo(mate.pos) > 2) { this.moveToward(mate.pos, 1); this.lookAlongMove(); }
        else { this.desiredYaw = yawTo(mate.pos.x - a.pos.x, mate.pos.z - a.pos.z); this.desiredPitch = -0.6; }
        return;
      }
    }
    this.reviveTarget = null;

    // heal when safe (or behind cover)
    const safe = !this.target || (t - this.targetSeenAt > 1.2 && !this.visibleCount);
    if (safe && !inStorm && !a.using) {
      if (!this.useMist()) {
        const slot = this.pickHeal();
        if (slot >= 0) { a.select(slot + 1); g.combat.startHeal(a); }
      }
    }
    if (a.using) { if (needRotate) this.moveToward(this.zonePoint(), 1); return; }

    const w = a.heldWeapon();
    if (!this.target && w && WEAPONS[w.id] && w.id !== 'pickaxe' && w.mag < WEAPONS[w.id].mag) g.combat.startReload(a);

    if (this.target) { this.fight(needRotate); return; }
    if (needRotate) {
      this.goal = null;
      if (!this.tryLaunchPad()) { this.sprint = true; this.moveToward(this.zonePoint(), 1); this.lookAlongMove(); }
      return;
    }
    if (this.investigate && t < this.investigate.until) {
      const iv = this.investigate;
      if (Math.hypot(iv.x - a.pos.x, iv.z - a.pos.z) < 4) this.investigate = null;
      else { this.moveToward(iv, 0.9); this.lookAlongMove(); return; }
    }
    if (this.followLeader()) return;
    this.loot();
  }

  decideDowned() {
    // crawl toward a teammate, otherwise toward cover away from the last threat
    const a = this.a;
    this.target = null; this.reviveTarget = null;
    let best = null, bd = 60;
    for (const o of this.game.actors) {
      if (o === a || !o.alive || o.downed || !this.sameTeam(o)) continue;
      const d = a.pos.distanceTo(o.pos);
      if (d < bd) { bd = d; best = o; }
    }
    if (best && bd > 1.5) { this.moveToward(best.pos, 1); this.lookAlongMove(); return; }
    const src = a.lastHitBy && this.game.actorById(a.lastHitBy);
    if (src) {
      const c = this.findCover(src);
      if (c) { this.moveToward(c, 1); this.lookAlongMove(); }
    }
  }

  // Visible enemies, with priority: standing threats beat downed ones; healing,
  // reloading or hurt targets are preferred (pushing). No wallhacks: LOS is required.
  scanEnemies() {
    const a = this.a, g = this.game;
    const eye = a.eyePos;
    const fwd = a.lookDir();
    let best = null, bestScore = -1e9, count = 0, standingNear = false;
    const cands = [];
    for (const o of g.actors) {
      if (o === a || !o.alive || o.state === 'bus' || o.dormant || this.sameTeam(o)) continue;
      const d = a.pos.distanceTo(o.pos);
      if (d > this.d.see) continue;
      if (o !== this.target && d > 12) {
        const to = o.pos.clone().sub(a.pos).normalize();
        if (fwd.dot(to) < -0.1 && g.time - a.lastDamagedAt > 1) continue;
      }
      if (!g.world.los(eye, o.center)) continue;
      count++;
      if (!o.downed && d < 35) standingNear = true;
      cands.push([o, d]);
    }
    for (const [o, d] of cands) {
      let s = -d;
      if (o === this.target) s += 8;
      if (o.downed) s -= standingNear ? 1000 : 10;
      if (o.using) s += 12 * this.p.push;
      if (o.reloading > 0) s += 8 * this.p.push;
      if (g.time - o.lastDamagedAt < 1 && o.hp + o.shield < 100) s += 10 * this.p.push;
      if (o.id === a.lastHitBy && g.time - a.lastDamagedAt < 3) s += 15;
      if (s > bestScore) { bestScore = s; best = o; }
    }
    // passive bots leave distant fights alone unless someone is shooting at them or the target is busy
    if (best && this.persona === 'passive' && best !== this.target) {
      const d = a.pos.distanceTo(best.pos);
      const busy = g.time - best.lastDamagedAt < 2 || best.using;
      if (d > 30 && !busy && g.time - a.lastDamagedAt > 2) best = null;
    }
    return { best, count };
  }

  // Gunshots heard within range become an investigation goal (a guess, not a lock-on).
  hear(src) {
    const a = this.a;
    if (!a.alive || src === a || a.downed || this.sameTeam(src) || this.target) return;
    const d = a.pos.distanceTo(src.pos);
    if (d > 75) return;
    const lowHp = a.hp + a.shield < 60;
    const keen = this.persona === 'passive' ? 0.75 : this.persona === 'aggressive' ? 0.9 : 0.5;
    if (lowHp || this.rand() > keen) return;
    const err = Math.min(10, d * 0.12);
    this.investigate = { x: src.pos.x + (this.rand() - 0.5) * err, z: src.pos.z + (this.rand() - 0.5) * err, until: this.now() + 10 };
  }

  hasGun() {
    return this.a.slots.some(s => s && s.kind === 'weapon' && WEAPONS[s.id]); // ammo is unlimited
  }

  pickWeapon(dist) {
    const a = this.a;
    let best = -1, score = -1e9;
    a.slots.forEach((s, i) => {
      if (!s || s.kind !== 'weapon') return;
      const def = WEAPONS[s.id];
      if (!def) return;
      const pr = (PREF_RANGE[s.id] || 15) * (s.id === 'sniper' ? 1 : this.p.range);
      let sc = -Math.abs(Math.log((dist + 2) / (pr + 2))) * 3 + s.rarity * 0.3 + (this.p.prefer[s.id] || 0);
      if (s.id === 'rocket' && dist < 8) sc -= 5;
      if (s.mag <= 0) sc -= 1;
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }

  fight(needRotate) {
    const a = this.a, g = this.game, tg = this.target;
    const t = this.now();
    const visible = t - this.targetSeenAt < 0.35;
    const aimAt = visible ? tg.pos : this.lastSeenPos;
    const dx = aimAt.x - a.pos.x, dz = aimAt.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    const hpTotal = a.hp + a.shield;

    // grenades for targets hiding behind cover or in boxes
    if (!visible && t - this.targetSeenAt < 4 && dist < 28 && this.throwAt(aimAt)) return;
    // now and then lob one at a visible mid-range enemy to flush them out of position
    if (visible && dist > 8 && dist < 25 && t > this.reactAt && this.rand() < 0.08 && this.throwAt(aimAt)) return;

    // retreat to cover when hurt, reloading up close, or outnumbered
    const retreat = (hpTotal < this.p.retreatAt && tg.hp + tg.shield > hpTotal * 0.6) || (a.reloading > 0 && dist < 18) || this.visibleCount >= 2;
    if (retreat && visible) {
      if (t - this.coverT > 0.8 || !this.cover) { this.cover = this.findCover(tg); this.coverT = t; }
      if (this.cover) {
        this.sprint = true;
        this.moveToward(this.cover, 1);
        this.aimTowards(tg, aimAt, dist, visible);
        return;
      }
      if (this.canBuild() && this.buildCd <= 0 && !this.buildQueue.length) this.queueBox(tg, this.p.box);
    }

    const slot = this.pickWeapon(dist);
    if (slot >= 0) a.select(slot + 1); else a.select(0);
    const held = a.held();
    const id = (held && held.id) || 'pickaxe';
    this.aimTowards(tg, aimAt, dist, visible);

    const yawErr = Math.abs(angDiff(this.desiredYaw, a.yaw));
    if (t > this.reactAt && yawErr < 0.12 + (id === 'shotgun' ? 0.1 : 0) && this.rand() < this.d.burst) {
      if (id === 'pickaxe' ? dist < 3 : visible || t - this.targetSeenAt < 1) this.fireHeld = true;
      if (held && held.kind === 'weapon' && held.id !== 'pickaxe' && held.mag <= 0) { this.fireHeld = false; g.combat.startReload(a); }
    }

    // take the high ground with a ramp now and then
    if (this.p.ramps && visible && tg.pos.y - a.pos.y > 3 && this.canBuild() && this.buildCd <= 0 && this.rand() < 0.3) {
      this.buildQueue.push({ type: 'ramp', yaw: yawTo(dx, dz), pitch: 0.25 });
    }

    // movement: hold preferred range (pushing when the target is vulnerable), strafe
    this.strafeT -= 0.25;
    if (this.strafeT <= 0) { this.strafe = this.rand() < 0.5 ? -1 : 1; this.strafeT = 2 + this.rand() * 4; }
    const pr = (PREF_RANGE[id] || 15) * (id === 'sniper' ? 1 : this.p.range);
    // overlapping the target gives no direction, so pick one at random rather than freezing
    const ra = this.rand() * Math.PI * 2;
    const fx = dist > 0.6 ? dx / dist : Math.cos(ra), fz = dist > 0.6 ? dz / dist : Math.sin(ra);
    let along = dist > pr * 1.3 ? 1 : dist < pr * 0.7 ? -0.7 : 0;
    const vulnerable = tg.using || tg.reloading > 0 || (t - tg.lastDamagedAt < 1 && tg.hp + tg.shield < 100) || tg.downed;
    if (vulnerable && this.rand() < this.p.push + 0.2) { along = 1; this.sprint = true; }
    if (!this.hasGun()) along = dist < 25 ? 1 : -1;
    if (!visible) along = 1;
    let mx = fx * along + (-fz) * this.strafe * 0.8, mz = fz * along + fx * this.strafe * 0.8;
    if (needRotate) {
      const s = this.zonePoint();
      const sx = s.x - a.pos.x, sz = s.z - a.pos.z, sd = Math.hypot(sx, sz) || 1;
      mx = mx * 0.4 + sx / sd; mz = mz * 0.4 + sz / sd;
    }
    const l = Math.hypot(mx, mz) || 1;
    mx /= l; mz /= l;
    // don't strafe off cliffs or into walls: flip the strafe if the way is bad
    if (this.probe(Math.atan2(mz, mx)) < -2) { this.strafe = -this.strafe; mx = fx * along + (-fz) * this.strafe * 0.8; mz = fz * along + fx * this.strafe * 0.8; const l2 = Math.hypot(mx, mz) || 1; mx /= l2; mz /= l2; }
    this.move = { x: mx, z: mz };
    if (this.rand() < 0.08) this.wantJump = true;
    if (!this.hasGun() && dist > 25) this.target = null;
  }

  aimTowards(tg, aimAt, dist, visible) {
    const a = this.a;
    const held = a.held();
    const id = (held && held.id) || 'pickaxe';
    const lead = id === 'rocket' ? dist / 50 : id === 'sniper' ? 0.05 : 0.02;
    const tx = aimAt.x + (visible ? tg.vel.x * lead : 0), tz = aimAt.z + (visible ? tg.vel.z * lead : 0);
    const headAim = this.rand() < (a.boss ? 0.4 : 0.2);
    const h = tg.downed ? tg.height * 0.3 : tg.height;
    const ty = aimAt.y + h * (headAim ? 0.86 : 0.55) - (id === 'rocket' ? h * 0.5 : 0);
    const eye = a.eyePos;
    const hd = Math.hypot(tx - eye.x, tz - eye.z);
    this.desiredYaw = yawTo(tx - eye.x, tz - eye.z);
    this.desiredPitch = Math.atan2(ty - eye.y, hd);
    a.aimError = this.d.err * (1 + Math.min(2, dist / 40)) * (a.onGround ? 1 : 1.6);
  }

  // ---------------------------------------------------------------- cover
  // Sample nearby standing spots and keep those the threat can't see.
  findCover(threat) {
    const a = this.a, w = this.game.world;
    const te = threat.eyePos || threat.pos;
    let best = null, bs = -1e9;
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + this.rand() * 0.3;
      const r = 3 + this.rand() * 10;
      const x = a.pos.x + Math.cos(ang) * r, z = a.pos.z + Math.sin(ang) * r;
      if (x < 2 || z < 2 || x > SX - 2 || z > SZ - 2) continue;
      const y = this.standY(x, z, a.pos.y);
      if (y === null || Math.abs(y - a.pos.y) > 3) continue;
      if (w.get(Math.floor(x), y, Math.floor(z)) === B.WATER) continue;
      if (this.game.storm.outside({ x, z })) continue;
      const chest = new THREE.Vector3(x, y + 1.2, z);
      if (w.los(te, chest)) continue;
      // prefer close spots that are further from the threat
      const away = Math.hypot(x - threat.pos.x, z - threat.pos.z) - a.pos.distanceTo(threat.pos);
      const s = -r + away * 0.4;
      if (s > bs) { bs = s; best = { x, y, z }; }
    }
    return best;
  }

  panicBuild() {
    const a = this.a, g = this.game;
    if (this.buildCd > 0 || this.buildQueue.length) return;
    const src = a.lastHitBy && g.actorById(a.lastHitBy);
    const yaw = src ? yawTo(src.pos.x - a.pos.x, src.pos.z - a.pos.z) : a.yaw;
    if (this.p.box && this.rand() < 0.7) { this.queueBox(src, true); return; }
    this.buildQueue.push({ type: 'wall', yaw, pitch: 0 });
    if (this.p.ramps && this.rand() < 0.45) this.buildQueue.push({ type: 'ramp', yaw, pitch: 0.2 });
  }

  // Four walls (threat side first) plus a cone overhead for a full box.
  queueBox(threat, full) {
    const a = this.a;
    const yaw = threat ? yawTo(threat.pos.x - a.pos.x, threat.pos.z - a.pos.z) : a.yaw;
    this.buildQueue.push({ type: 'wall', yaw, pitch: 0 });
    if (!full) return;
    for (const k of [1, -1, 2]) this.buildQueue.push({ type: 'wall', yaw: yaw + k * Math.PI / 2, pitch: 0 });
    this.buildQueue.push({ type: 'cone', yaw, pitch: 1.3 });
  }

  runBuildQueue() {
    const a = this.a, g = this.game;
    const t = this.now();
    this.buildStamps = this.buildStamps.filter(s => t - s < 1);
    if (this.buildStamps.length >= MAX_BUILDS_PER_SEC) return;
    const job = this.buildQueue.shift();
    const mat = a.mats.wood >= 10 ? 'wood' : a.mats.brick >= 10 ? 'brick' : a.mats.metal >= 10 ? 'metal' : null;
    if (!mat || g.noBuild) { this.buildQueue.length = 0; return; }
    const sy = a.yaw, sp = a.pitch;
    a.yaw = job.yaw; a.pitch = job.pitch;
    if (g.build.place(a, job.type, mat)) this.buildStamps.push(t);
    a.yaw = sy; a.pitch = sp;
    this.buildCd = 1 / MAX_BUILDS_PER_SEC;
    if (!this.buildQueue.length) this.buildCd = 1.2 + this.rand() * 1.5;
  }

  // ---------------------------------------------------------------- items
  slotOf(kind, id) { return this.a.slots.findIndex(s => s && s.kind === kind && (!id || s.id === id) && (s.count === undefined || s.count > 0)); }

  // Lob a grenade at a spot with a simple arc estimate.
  throwAt(p) {
    const a = this.a;
    if (this.throwCd > 0) return false;
    const slot = this.slotOf('throwable', 'grenade');
    if (slot < 0) return false;
    const eye = a.eyePos;
    const dx = p.x - eye.x, dz = p.z - eye.z, d = Math.hypot(dx, dz);
    const pitch = Math.max(-0.3, Math.min(1.0, Math.atan2(p.y + 0.5 - eye.y, d) + Math.min(0.75, d / 38)));
    this.pendingUse = { slot, yaw: yawTo(dx, dz), pitch, until: this.now() + 1.2 };
    this.throwCd = 3 + this.rand() * 3;
    return true;
  }

  // Med mist at your feet when hurt and safe.
  useMist() {
    const a = this.a;
    if (this.throwCd > 0 || a.hp > 60) return false;
    const slot = this.slotOf('throwable', 'medmist');
    if (slot < 0) return false;
    this.pendingUse = { slot, yaw: a.yaw, pitch: -1.2, until: this.now() + 1.2 };
    this.throwCd = 4;
    return true;
  }

  // Place a launch pad to rotate when the zone is far away.
  tryLaunchPad() {
    const a = this.a, s = this.game.storm.next;
    if (this.padCd > 0 || !a.onGround) return false;
    const d = Math.hypot(s.x - a.pos.x, s.z - a.pos.z) - s.r;
    if (d < 45) return false;
    const slot = this.slotOf('utility', 'launchpad');
    if (slot < 0) return false;
    this.pendingUse = { slot, yaw: a.yaw, pitch: -0.9, until: this.now() + 1.2 };
    this.dropTarget = this.zonePoint();
    this.padCd = 15;
    this.wantJump = true;
    return true;
  }

  pickHeal() {
    const a = this.a;
    let best = -1;
    a.slots.forEach((s, i) => {
      if (!s || s.kind !== 'heal' || !HEALS[s.id]) return;
      const h = HEALS[s.id];
      if (h.heal && a.hp < Math.min(h.cap, a.maxHp) - 20) best = i;
      if (h.shield && a.shield < h.cap - 20 && a.hp > 50) best = i;
    });
    return best;
  }

  // ---------------------------------------------------------------- team
  downedMate() {
    const a = this.a, g = this.game;
    if (!g.revive) return null;
    let best = null, bd = 45;
    for (const o of g.actors) {
      if (o === a || !o.alive || !o.downed || !this.sameTeam(o)) continue;
      const d = a.pos.distanceTo(o.pos);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return null;
    // don't walk into an open fight to revive
    if (this.target && this.target.alive && this.now() - this.targetSeenAt < 1 && this.target.pos.distanceTo(best.pos) < 30) return null;
    return best;
  }

  followLeader() {
    const a = this.a, g = this.game;
    if (!g.sameTeam) return false;
    let leader = null;
    for (const o of g.actors) {
      if (o === a || !o.alive || o.downed || o.state === 'bus' || !this.sameTeam(o)) continue;
      if (!leader || (o.isPlayer && !leader.isPlayer) || (o.isPlayer === leader.isPlayer && o.id < leader.id)) leader = o;
    }
    if (!leader) return false;
    // the leader (lowest id bot) leads unless a human is on the team
    if (!leader.isPlayer && a.id < leader.id) return false;
    const d = a.pos.distanceTo(leader.pos);
    if (d < 15) return false;
    this.sprint = d > 30;
    this.moveToward(leader.pos, 1); this.lookAlongMove();
    return true;
  }

  // ---------------------------------------------------------------- looting and roaming
  loot() {
    const a = this.a, g = this.game, w = g.world;
    const near = g.loot.nearest(a, 2.4, p => (p.item.kind === 'weapon' || p.item.kind === 'heal' || p.item.kind === 'throwable' || p.item.kind === 'utility') && a.hasRoomFor(p.item));
    if (near) { g.loot.requestTake(a, near.id); return; }

    const weapons = a.slots.filter(s => s && s.kind === 'weapon').length;
    const lootK = this.p.loot;

    // supply drops (if the feature exists): looters chase them hardest
    const drop = this.findSupplyDrop(lootK);
    if (drop) {
      const dd = Math.hypot(drop.x - a.pos.x, drop.z - a.pos.z);
      if (dd < 2.6 && typeof drop.open === 'function') { drop.open(a); return; }
      this.sprint = dd > 20;
      this.moveToward(drop, 1); this.lookAlongMove(); return;
    }

    if (!this.chestTarget || w.get(...this.chestTarget) !== B.CHEST) {
      this.chestTarget = null;
      let bd = (weapons >= 3 ? 25 : 55) * lootK;
      for (const c of w.chests) {
        if (w.get(c[0], c[1], c[2]) !== B.CHEST) continue;
        if (this.game.storm.outsideNext({ x: c[0], z: c[2] }, -10) && this.game.storm.stage === 'shrink') continue;
        const d = Math.hypot(c[0] - a.pos.x, c[1] - a.pos.y, c[2] - a.pos.z);
        if (d < bd) { bd = d; this.chestTarget = c; }
      }
    }
    if (this.chestTarget) {
      const [cx, cy, cz] = this.chestTarget;
      const d = Math.hypot(cx + 0.5 - a.pos.x, cz + 0.5 - a.pos.z);
      if (d < 2.2 && Math.abs(cy - a.pos.y) < 2.5) { g.loot.openChest(a, cx, cy, cz); this.chestTarget = null; return; }
      this.sprint = d > 25;
      this.moveToward({ x: cx + 0.5, z: cz + 0.5 }, 1); this.lookAlongMove(); return;
    }
    const item = g.loot.nearest(a, 35 * lootK, p => (p.item.kind === 'weapon' && weapons < 4) || ((p.item.kind === 'heal' || p.item.kind === 'throwable' || p.item.kind === 'utility') && a.hasRoomFor(p.item)));
    if (item) { this.moveToward(item.pos, 1); this.lookAlongMove(); return; }

    if (!g.noBuild && a.mats.wood + a.mats.brick + a.mats.metal < (this.p.box ? 150 : 60)) {
      if (!this.harvestTarget || w.get(...this.harvestTarget) === B.AIR) this.harvestTarget = this.findHarvest();
      if (this.harvestTarget) {
        const [hx, hy, hz] = this.harvestTarget;
        const d = Math.hypot(hx + 0.5 - a.pos.x, hz + 0.5 - a.pos.z);
        if (d < 2.4) {
          a.select(0);
          const eye = a.eyePos;
          this.desiredYaw = yawTo(hx + 0.5 - eye.x, hz + 0.5 - eye.z);
          this.desiredPitch = Math.atan2(hy + 0.5 - eye.y, Math.max(0.3, d));
          this.fireHeld = true;
          return;
        }
        this.moveToward({ x: hx + 0.5, z: hz + 0.5 }, 1); this.lookAlongMove(); return;
      }
    }

    // snipers hold high ground; late game everyone avoids the open
    const late = g.storm.phase >= 3;
    if ((this.p.highGround || late) && this.holdPosition(late)) return;

    if (!this.goal || Math.hypot(this.goal.x - a.pos.x, this.goal.z - a.pos.z) < 3) this.goal = this.randomGoal();
    this.moveToward(this.goal, 0.85); this.lookAlongMove();
  }

  findSupplyDrop(lootK) {
    const g = this.game, a = this.a;
    const src = g.supplyDrops || g.supplydrop || g.supplyDrop;
    const list = src && (Array.isArray(src) ? src : src.drops || src.list);
    if (!Array.isArray(list)) return null;
    let best = null, bd = 60 * lootK;
    for (const d of list) {
      const p = d.pos || d;
      if (!p || d.opened || d.falling || p.x === undefined) continue;
      const dist = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
      if (dist < bd) {
        bd = dist;
        best = { x: p.x, y: p.y, z: p.z, open: (actor) => (src.open ? src.open(actor, d) : d.open?.(actor)) };
      }
    }
    return best;
  }

  // Find a defensible spot (high ground or near a building) inside the next circle and sit there.
  holdPosition(late) {
    const a = this.a, g = this.game, s = g.storm.next;
    const t = this.now();
    if (this.holdSpot && t < this.holdSpot.until && !g.storm.outsideNext(this.holdSpot, 4)) {
      const d = Math.hypot(this.holdSpot.x - a.pos.x, this.holdSpot.z - a.pos.z);
      if (d > 1.5) { this.moveToward(this.holdSpot, 1); this.lookAlongMove(); }
      else { this.desiredYaw += 0.6 * (this.rand() - 0.5); this.desiredPitch = -0.05; }
      return true;
    }
    let best = null, bs = -1e9;
    if (late) {
      for (const b of g.world.buildings || []) {
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        if (Math.hypot(cx - s.x, cz - s.z) > s.r * 0.8) continue;
        const sc = -Math.hypot(cx - a.pos.x, cz - a.pos.z);
        if (sc > bs) { bs = sc; best = { x: cx, z: cz }; }
      }
    }
    if (!best) {
      for (let i = 0; i < 12; i++) {
        const ang = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * Math.max(6, s.r * 0.7);
        const x = Math.max(4, Math.min(SX - 4, s.x + Math.cos(ang) * r)), z = Math.max(4, Math.min(SZ - 4, s.z + Math.sin(ang) * r));
        const y = g.world.groundY(Math.floor(x), Math.floor(z));
        const sc = y - Math.hypot(x - a.pos.x, z - a.pos.z) * 0.15;
        if (sc > bs) { bs = sc; best = { x, z }; }
      }
    }
    if (!best) return false;
    this.holdSpot = { ...best, until: t + 20 + this.rand() * 20 };
    this.moveToward(this.holdSpot, 1); this.lookAlongMove();
    return true;
  }

  findHarvest() {
    const a = this.a, w = this.game.world;
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(a.pos.x + (this.rand() - 0.5) * 30), z = Math.floor(a.pos.z + (this.rand() - 0.5) * 30);
      const y = Math.floor(a.pos.y + 1);
      for (let dy = -1; dy <= 2; dy++) {
        const id = w.get(x, y + dy, z);
        if (id === B.LOG || id === B.CRATE || id === B.PLANKS || id === B.BIRCH_LOG || id === B.DARK_LOG) return [x, y + dy, z];
      }
    }
    return null;
  }

  randomGoal() {
    const s = this.game.storm.next;
    const ang = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * Math.max(5, s.r * 0.8);
    return { x: Math.max(4, Math.min(SX - 4, s.x + Math.cos(ang) * r)), z: Math.max(4, Math.min(SZ - 4, s.z + Math.sin(ang) * r)) };
  }

  // A point inside the next circle on our side of it, so bots spread round the edge instead of piling on the centre.
  // Chosen once per circle so the stuck watchdog sees a fixed goal.
  zonePoint() {
    const a = this.a, s = this.game.storm.next;
    const key = `${s.x.toFixed(0)},${s.z.toFixed(0)},${s.r.toFixed(0)}`;
    if (this.zoneKey !== key || !this.zoneTarget) {
      const dx = a.pos.x - s.x, dz = a.pos.z - s.z, d = Math.hypot(dx, dz) || 1;
      const k = Math.min(d, s.r * 0.55);
      this.zoneTarget = { x: s.x + dx / d * k, z: s.z + dz / d * k };
      this.zoneKey = key;
    }
    return this.zoneTarget;
  }

  // ---------------------------------------------------------------- navigation
  // Feet height of a walkable spot near y0 in this column, or null.
  standY(x, z, y0) {
    const w = this.game.world;
    const xi = Math.floor(x), zi = Math.floor(z), yb = Math.floor(y0);
    for (let y = yb + 3; y >= yb - 7; y--) {
      if (w.isSolid(xi, y - 1, zi) && !w.isSolid(xi, y, zi) && !w.isSolid(xi, y + 1, zi)) return y;
    }
    return null;
  }

  // Walkability score for heading `ang` (radians, atan2(z, x) convention). 0 is fine, negative is bad.
  probe(ang) {
    const a = this.a, w = this.game.world;
    const cx = Math.cos(ang), cz = Math.sin(ang);
    let y0 = a.pos.y, score = 0;
    for (const dist of [1.3, 2.8]) {
      const x = a.pos.x + cx * dist, z = a.pos.z + cz * dist;
      if (x < 1 || z < 1 || x > SX - 1 || z > SZ - 1) return -5;
      const y = this.standY(x, z, y0);
      if (y === null) { score -= 3; break; }
      const step = y - y0;
      if (step > 1.1) score -= 2.5 + step * 0.2;
      else if (step < -4) score -= 2;
      else if (step < -1.5) score -= 0.3;
      if (w.get(Math.floor(x), y, Math.floor(z)) === B.WATER) score -= 0.8;
      y0 = y;
    }
    return score;
  }

  // Steer toward p with a local planner, watchdog and detours.
  moveToward(p, speed) {
    const a = this.a, t = this.now();
    let tx = p.x, tz = p.z;
    // watchdog: no real progress toward this goal for a while
    const key = `${Math.round(p.x / 12)},${Math.round(p.z / 12)}`;
    const dGoal = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
    if (this.watch.key !== key) this.watch = { key, best: dGoal, t };
    else if (dGoal < this.watch.best - 2) { this.watch.best = dGoal; this.watch.t = t; }
    const stall = t - this.watch.t;
    if (stall > 8 && stall < 12 && a.inWater && !this.detour) {
      const land = this.nearestLand();
      if (land) this.detour = { ...land, until: t + 6 };
    }
    if (stall > 6 && stall < 12 && !this.detour) {
      const side = this.rand() < 0.5 ? 1 : -1, ang = Math.atan2(p.z - a.pos.z, p.x - a.pos.x) + side * (1.2 + this.rand() * 0.6);
      this.detour = { x: a.pos.x + Math.cos(ang) * 14, z: a.pos.z + Math.sin(ang) * 14, until: t + 4 };
    }
    if (stall > 12 && this.canBuild() && this.buildCd <= 0 && !this.buildQueue.length) {
      this.buildQueue.push({ type: 'ramp', yaw: yawTo(p.x - a.pos.x, p.z - a.pos.z), pitch: 0.25 });
    }
    // past 12s: stop detouring and tunnel or ramp straight at the goal
    if (stall > 12) { this.detour = null; this.digForward(p.x - a.pos.x, p.z - a.pos.z); }
    if (stall > 20) { this.watch.t = t; this.watch.best = dGoal; this.goal = this.randomGoal(); this.investigate = null; this.chestTarget = null; this.holdSpot = null; }
    if (this.detour) {
      if (t > this.detour.until || Math.hypot(this.detour.x - a.pos.x, this.detour.z - a.pos.z) < 2) this.detour = null;
      else { tx = this.detour.x; tz = this.detour.z; }
    }

    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { this.move = null; return; }
    const direct = Math.atan2(dz, dx);
    let bestAng = direct, bestScore = -1e9;
    for (const off of HEADINGS) {
      const ang = direct + off;
      let s = Math.cos(off) * 1.5 + this.probe(ang);
      if (this.navHeading !== null && Math.abs(angDiff(ang, this.navHeading)) < 0.3) s += 0.3;
      if (s > bestScore) { bestScore = s; bestAng = ang; }
      if (off === 0 && s >= 1.5) break; // straight line is clear
    }
    if (stall > 12) bestAng = Math.atan2(p.z - a.pos.z, p.x - a.pos.x);
    this.navHeading = bestAng;
    this.move = { x: Math.cos(bestAng) * speed, z: Math.sin(bestAng) * speed };
  }

  // Closest dry standing spot within ~16 blocks (used to climb out of rivers and lakes).
  nearestLand() {
    const a = this.a, w = this.game.world;
    let best = null, bd = 1e9;
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2, r = 3 + (i % 4) * 4;
      const x = a.pos.x + Math.cos(ang) * r, z = a.pos.z + Math.sin(ang) * r;
      if (x < 2 || z < 2 || x > SX - 2 || z > SZ - 2) continue;
      const y = this.standY(x, z, a.pos.y + 1);
      if (y === null || y - a.pos.y > 2.5) continue;
      if (w.get(Math.floor(x), y, Math.floor(z)) === B.WATER || w.get(Math.floor(x), y - 1, Math.floor(z)) === B.WATER) continue;
      if (r < bd) { bd = r; best = { x, z }; }
    }
    return best;
  }

  lookAlongMove() {
    if (!this.move) return;
    this.desiredYaw = yawTo(this.move.x, this.move.z);
    this.desiredPitch = 0;
  }

  // Pickaxe through whatever is blocking the way (along the move, or toward a given direction).
  digForward(dirX, dirZ) {
    const a = this.a, w = this.game.world;
    if (a.downed) return;
    let mx = dirX, mz = dirZ;
    if (mx === undefined) { if (!this.move) return; mx = this.move.x; mz = this.move.z; }
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const fx = Math.floor(a.pos.x + mx * 0.9), fz = Math.floor(a.pos.z + mz * 0.9);
    const hx = Math.floor(a.pos.x), hz = Math.floor(a.pos.z), fy = Math.floor(a.pos.y);
    // underground (solid two blocks above head): dig a rising staircase to reach the surface;
    // otherwise just clear the two blocks needed to walk through
    const underground = w.isSolid(hx, fy + 2, hz) && w.isSolid(hx, fy + 3, hz);
    const cells = underground ? [[hx, 2, hz], [fx, 1, fz], [fx, 2, fz]] : [[fx, 1, fz], [fx, 0, fz]];
    for (const [cx, dy, cz] of cells) {
      const y = fy + dy;
      const id = w.get(cx, y, cz);
      const def = BLOCKS[id];
      if (id !== B.AIR && id !== B.WATER && def && def.hp < 1000 && !def.plant) {
        a.select(0);
        if (cx !== hx || cz !== hz) a.yaw = yawTo(cx + 0.5 - a.pos.x, cz + 0.5 - a.pos.z);
        const eye = a.eyePos;
        a.pitch = cx === hx && cz === hz ? 1.45 : Math.atan2(y + 0.5 - eye.y, Math.max(0.3, Math.hypot(cx + 0.5 - eye.x, cz + 0.5 - eye.z)));
        this.desiredYaw = a.yaw; this.desiredPitch = a.pitch;
        this.game.combat.fire(a, eye, a.lookDir(), true);
        return;
      }
    }
  }
}

function pickPersona(rand) {
  const total = PERSONA_KEYS.reduce((s, k) => s + PERSONAS[k].weight, 0);
  let r = rand() * total;
  for (const k of PERSONA_KEYS) { r -= PERSONAS[k].weight; if (r <= 0) return k; }
  return 'aggressive';
}
