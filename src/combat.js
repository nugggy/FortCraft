// Weapons: hitscan, pellets, rockets, melee, reloads and consumables.
import * as THREE from '../vendor/three.module.min.js';
import { WEAPONS, HEALS } from './items.js';
import { BLOCKS, B } from './blocks.js';

const tmpV = new THREE.Vector3();

// Ray vs axis-aligned box; returns entry distance or -1.
export function rayBox(o, d, minx, miny, minz, maxx, maxy, maxz) {
  let tmin = 0, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z;
    const da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const lo = a === 0 ? minx : a === 1 ? miny : minz;
    const hi = a === 0 ? maxx : a === 1 ? maxy : maxz;
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return -1; continue; }
    let t1 = (lo - oa) / da, t2 = (hi - oa) / da;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

export function spreadDir(dir, spread) {
  if (spread <= 0) return dir.clone();
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const r = new THREE.Vector3().crossVectors(dir, up).normalize();
  const u = new THREE.Vector3().crossVectors(r, dir).normalize();
  const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * spread;
  return dir.clone().addScaledVector(r, Math.cos(a) * m).addScaledVector(u, Math.sin(a) * m).normalize();
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.rockets = [];
    this.rocketGeo = new THREE.BoxGeometry(0.2, 0.2, 0.7);
    this.rocketMat = new THREE.MeshBasicMaterial({ color: 0xff7a30 });
    this.rocketId = 0;
  }

  reset() { for (const r of this.rockets) this.game.scene.remove(r.mesh); this.rockets.length = 0; }

  // Nearest hit along a ray: actor hitbox or block.
  trace(shooter, o, d, range, opts = {}) {
    const w = this.game.world;
    const bh = w.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range, opts.pass);
    let best = bh ? bh.t : range, hitActor = null, head = false;
    for (const a of this.game.actors) {
      if (a === shooter || !a.alive || a.state === 'bus') continue;
      const r = a.radius * 1.15, s = a.scale, p = a.pos;
      if (Math.abs(p.x - o.x) > range + 2 && Math.abs(p.z - o.z) > range + 2) continue;
      const headY = p.y + a.height * 0.75;
      const th = rayBox(o, d, p.x - 0.26 * s, headY, p.z - 0.26 * s, p.x + 0.26 * s, p.y + a.height + 0.05, p.z + 0.26 * s);
      if (th >= 0 && th < best) { best = th; hitActor = a; head = true; }
      const tb = rayBox(o, d, p.x - r, p.y, p.z - r, p.x + r, headY, p.z + r);
      if (tb >= 0 && tb < best) { best = tb; hitActor = a; head = false; }
    }
    const point = o.clone().addScaledVector(d, best);
    if (hitActor) return { t: best, actor: hitActor, head, point };
    if (bh) return { t: best, block: bh, point };
    return { t: range, point };
  }

  startReload(a) {
    const w = a.heldWeapon();
    if (!w || w.id === 'pickaxe' || a.reloading > 0) return;
    const def = WEAPONS[w.id];
    if (w.mag >= def.mag || a.ammo[def.ammo] <= 0) return;
    a.reloading = def.reload[w.rarity];
    a.reloadTotal = a.reloading;
    if (a === this.game.player) this.game.audio.play('reload', { vol: 0.7 });
  }

  startHeal(a) {
    const it = a.held();
    if (!it || it.kind !== 'heal' || a.using) return false;
    const h = HEALS[it.id];
    if (h.heal && a.hp >= h.cap) { if (a === this.game.player) this.game.hud.notice('Health is full'); return false; }
    if (h.shield && a.shield >= h.cap) { if (a === this.game.player) this.game.hud.notice('Shield is full'); return false; }
    a.using = { slot: a.selected - 1, t: h.time, total: h.time };
    return true;
  }

  // Per-frame weapon timers for a locally simulated actor.
  tick(a, dt) {
    a.cooldown -= dt;
    if (a.burstLeft > 0) {
      a.burstT -= dt;
      const held = a.held();
      if (!held || held.id !== 'burst' || a.reloading > 0 || held.mag <= 0) a.burstLeft = 0;
      else if (a.burstT <= 0) {
        // keep the original aim offset but follow the actor's current look
        const look = a.lookDir();
        const dir = look.add(a.burstAim).normalize();
        held.mag--;
        this.shoot(a, held, WEAPONS.burst, a.eyePos, dir);
        a.burstLeft--; a.burstT = WEAPONS.burst.burstGap;
      }
    }
    a.swingT = Math.max(0, a.swingT - dt);
    a.bloom = Math.max(0, a.bloom - dt * 0.12);
    if (a.reloading > 0) {
      a.reloading -= dt;
      if (a.reloading <= 0) {
        const w = a.heldWeapon();
        if (w && w.id !== 'pickaxe') {
          const def = WEAPONS[w.id];
          const take = Math.min(def.mag - w.mag, a.ammo[def.ammo]);
          w.mag += take; a.ammo[def.ammo] -= take;
        }
        a.reloading = 0;
      }
    }
    if (a.using) {
      const it = a.slots[a.using.slot];
      if (!it || a.selected - 1 !== a.using.slot) { a.using = null; return; }
      a.using.t -= dt;
      if (a.using.t <= 0) {
        const h = HEALS[it.id];
        if (h.heal) a.hp = Math.min(Math.max(a.hp, h.cap === 100 ? a.maxHp : h.cap), a.hp + h.heal);
        if (h.shield) a.shield = Math.min(Math.max(a.shield, h.cap), a.shield + h.shield);
        it.count--;
        if (it.count <= 0) { a.slots[a.using.slot] = null; a.select(0); }
        a.using = null;
        if (a === this.game.player) this.game.audio.play('heal');
      }
    }
  }

  // Fire the held weapon from origin along dir. pressed = new trigger press this frame.
  fire(a, origin, dir, pressed) {
    if (a.cooldown > 0 || a.reloading > 0 || a.using) return false;
    const held = a.held();
    if (!held) return false;
    if (held.kind === 'heal') { if (pressed) this.startHeal(a); return false; }
    if (held.kind === 'throwable' || held.kind === 'utility') {
      if (!pressed || !this.game.gadgets) return false;
      return this.game.gadgets.use(a, held, origin, dir);
    }
    if (a.burstLeft > 0) return false;
    const def = WEAPONS[held.id];
    if (def.melee) return this.swing(a, origin, dir);
    if (!def.auto && !pressed) return false;
    if (held.mag <= 0) {
      if (a.ammo[def.ammo] > 0) this.startReload(a);
      else if (a === this.game.player && pressed) this.game.audio.play('empty');
      return false;
    }
    held.mag--;
    a.cooldown = 1 / def.rate;
    if (def.burst) {
      a.burstLeft = Math.min(def.burst - 1, held.mag);
      a.burstT = def.burstGap;
      a.burstAim = dir.clone().sub(a.lookDir());
    }
    if (def.projectile) {
      const muzzle = origin.clone().addScaledVector(dir, 0.8);
      const id = `${a.id}:${++this.rocketId}`;
      this.spawnRocket(id, a, muzzle, dir.clone().multiplyScalar(def.speed), def.damage[held.rarity], def.radius, true);
      this.game.net.send({ t: 'fx', k: 'rocket', id, p: muzzle.toArray(), v: dir.clone().multiplyScalar(def.speed).toArray() });
      this.game.audio.play('rocket', { pos: a.pos });
      this.game.events.emit('shot', a);
      return true;
    }
    return this.shoot(a, held, def, origin, dir);
  }

  // One hitscan shot (or pellet volley) of an already-fired round.
  shoot(a, held, def, origin, dir) {
    const isPlayer = a === this.game.player;
    let spread = (a.ads ? def.ads : def.spread) + a.bloom;
    if (!a.onGround) spread *= 1.5;
    if (a.isBot) spread += a.aimError || 0;
    a.bloom = Math.min(def.maxBloom, a.bloom + def.bloom);
    const muzzle = origin.clone().addScaledVector(dir, 0.8);
    const pellets = def.pellets || 1;
    const per = def.damage[held.rarity] / pellets;
    const ends = [];
    for (let i = 0; i < pellets; i++) {
      const d = spreadDir(dir, spread);
      const res = this.trace(a, origin, d, def.range);
      ends.push(res.point);
      if (res.actor) {
        let dmg = per * (res.head ? def.head : 1);
        if (held.id === 'shotgun') dmg *= Math.max(0.35, 1 - Math.max(0, res.t - 8) / 22);
        this.game.damage(res.actor, Math.round(dmg), a, res.head, held.id, res.point);
      } else if (res.block) {
        const bd = BLOCKS[res.block.id];
        if (!bd.bulletproof) this.game.damageBlock(res.block.x, res.block.y, res.block.z, per * (def.blockMul || 1), a, false);
        if (isPlayer || pellets === 1) this.game.effects.burst(res.point.x, res.point.y, res.point.z, this.game.blockColor(res.block.id), pellets > 1 ? 1 : 3, 3, 0.08, 0.4);
      }
    }
    for (const e of ends) this.game.effects.tracer(muzzle, e);
    this.game.effects.flash(muzzle);
    this.game.audio.play(held.id === 'burst' ? 'ar' : held.id, { pos: a.pos, vol: isPlayer ? 0.55 : 0.9, range: held.id === 'sniper' ? 200 : 120, rate: held.id === 'burst' ? 1.12 : 1 });
    this.game.net.send({ t: 'fx', k: 'shot', w: held.id === 'burst' ? 'ar' : held.id, a: a.id, p: muzzle.toArray().map(v => +v.toFixed(2)), e: ends.map(e => e.toArray().map(v => +v.toFixed(2))) });
    this.game.events.emit('shot', a);
    if (!isPlayer) this.game.soundPing('shot', a.pos, a.id);
    if (isPlayer) this.game.controller.kick(held.id);
    return true;
  }

  swing(a, origin, dir) {
    const def = WEAPONS.pickaxe;
    a.cooldown = 1 / def.rate;
    a.swingT = 0.45;
    if (a !== this.game.player) this.game.soundPing('pickaxe', a.pos, a.id);
    const res = this.trace(a, origin, dir, def.range);
    if (res.actor) {
      this.game.damage(res.actor, def.damage, a, false, 'pickaxe', res.point);
      this.game.audio.play('pickaxe', { pos: a.pos });
    } else if (res.block) {
      const { x, y, z, id } = res.block;
      if (id === B.CHEST) { this.game.loot.openChest(a, x, y, z); return true; }
      this.game.damageBlock(x, y, z, def.blockDamage, a, true);
      this.game.effects.burst(res.point.x, res.point.y, res.point.z, this.game.blockColor(id), 4, 3, 0.1, 0.5);
      this.game.audio.play('pickaxe', { pos: a.pos, rate: 0.9 + Math.random() * 0.2 });
    } else this.game.audio.play('swing', { pos: a.pos, vol: 0.5 });
    this.game.net.send({ t: 'fx', k: 'swing', a: a.id });
    return true;
  }

  spawnRocket(id, owner, pos, vel, dmg, radius, live) {
    const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(vel));
    this.game.scene.add(mesh);
    this.rockets.push({ id, owner, pos: pos.clone(), vel, dmg, radius, live, mesh, life: 6 });
  }

  removeRocket(id) {
    if (this.game.gadgets) this.game.gadgets.removeProjectile(id);
    const i = this.rockets.findIndex(r => r.id === id);
    if (i >= 0) { this.game.scene.remove(this.rockets[i].mesh); this.rockets.splice(i, 1); }
  }

  update(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      const step = r.vel.length() * dt;
      const d = tmpV.copy(r.vel).normalize().clone();
      const res = this.trace(r.owner, r.pos, d, step);
      if (res.actor || res.block || r.life <= 0) {
        this.game.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        if (r.live) this.game.explode(res.point, r.radius, r.owner, r.dmg, r.id);
        continue;
      }
      r.pos.addScaledVector(d, step);
      r.mesh.position.copy(r.pos);
      if (Math.random() < 0.6) this.game.effects.burst(r.pos.x, r.pos.y, r.pos.z, [0.6, 0.6, 0.6], 1, 0.5, 0.15, 0.5);
    }
  }
}
