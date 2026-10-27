// Actor: shared body for the local player, bots and remote LAN players.
import * as THREE from '../vendor/three.module.min.js';
import { B } from './blocks.js';
import { SX, SZ } from './world.js';
import { makeCharacter, setHeld, makeNameTag } from './models.js';
import { WEAPONS, HEALS, MAT_MAX, AMMO, stackMax } from './items.js';

export const RADIUS = 0.3, HEIGHT = 1.8, EYE = 1.6;
const GRAV = 28, RUN = 5.8, ADS_SPEED = 3.4, JUMP = 8.6;
const SPRINT = 8.5, CROUCH = 2.6, CROUCH_HEIGHT = 1.4, CROUCH_EYE = 1.2;
const SLIDE_TIME = 0.85, SLIDE_BOOST = 1.35, SLIDE_DECEL = 7, SLIDE_COOLDOWN = 0.6, MANTLE_TIME = 0.35;
const PICKAXE = { kind: 'weapon', id: 'pickaxe', rarity: 0 };

export class Actor {
  constructor(game, o) {
    this.game = game;
    this.id = o.id; this.name = o.name; this.outfit = o.outfit ?? 0;
    this.owner = o.owner;              // network client id that simulates this actor
    this.isBot = !!o.isBot; this.isPlayer = !!o.isPlayer;
    this.remote = !!o.remote;          // proxy driven by network snapshots
    this.boss = !!o.boss;
    this.scale = this.boss ? 1.6 : 1;
    this.radius = RADIUS * this.scale; this.height = HEIGHT * this.scale; this.eye = EYE * this.scale;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.state = 'bus';
    this.onGround = false; this.inWater = false;
    this.maxHp = this.boss ? 400 : 100; this.maxShield = this.boss ? 200 : 100;
    this.hp = this.maxHp; this.shield = this.boss ? 200 : 0;
    this.over = 0; this.maxOver = 0;
    this.alive = true;
    this.slots = [null, null, null, null, null];
    this.selected = 0;
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    this.mats = { wood: 0, brick: 0, metal: 0 };
    this.kills = 0; this.placement = 0;
    this.cooldown = 0; this.reloading = 0; this.bloom = 0; this.swingT = 0; this.using = null;
    this.ads = false;
    this.lastHitBy = null; this.lastHitTime = -99; this.lastDamagedAt = -99;
    this.stepOffset = 0; this.walkPhase = 0; this.fallSpeed = 0;
    // movement states (read by animation and the camera)
    this.baseHeight = this.height; this.baseEye = this.eye;
    this.sprinting = false; this.crouching = false; this.sliding = false; this.mantling = false;
    this.slideT = 0; this.slideCd = 0; this.mantle = null; this.mantleCd = 0;
    this.vehicle = null;
    this.netTarget = null;
    this.pickaxeSkin = o.pickaxe || 'default'; this.pickaxeItem = { ...PICKAXE, skin: this.pickaxeSkin }; this.gliderId = o.glider; // Locker cosmetics
    this.model = makeCharacter(this.outfit, { glider: o.glider });
    this.model.root.scale.setScalar(this.scale);
    if (o.nameTag) { this.tag = makeNameTag(o.name, o.tagColor || '#ffffff'); this.tag.position.y = 2.25; this.model.root.add(this.tag); }
    game.scene.add(this.model.root);
  }

  dispose() { this.game.scene.remove(this.model.root); }

  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z); }

  held() {
    if (this.remote) return !this.remoteHeld || this.remoteHeld.id === 'pickaxe' ? this.pickaxeItem : this.remoteHeld;
    return this.selected === 0 ? this.pickaxeItem : this.slots[this.selected - 1];
  }
  heldWeapon() { const h = this.held(); return h && h.kind === 'weapon' ? h : null; }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  select(i) {
    if (i === this.selected) return;
    if (i > 0 && !this.slots[i - 1]) return;
    this.selected = i; this.reloading = 0; this.using = null;
    this.cooldown = Math.max(this.cooldown, 0.25);
  }

  // ------------------------------------------------------------- inventory
  addItem(it) {
    if (it.kind === 'ammo') { this.ammo[it.ammo] = Math.min(AMMO[it.ammo].max, this.ammo[it.ammo] + it.count); return true; }
    if (it.kind === 'mats') { this.mats[it.mat] = Math.min(MAT_MAX, this.mats[it.mat] + it.count); return true; }
    const max = stackMax(it);
    if (max) {
      for (const s of this.slots) {
        if (s && s.kind === it.kind && s.id === it.id && s.count < max) {
          const take = Math.min(max - s.count, it.count);
          s.count += take; it.count -= take;
          if (it.count <= 0) return true;
        }
      }
    }
    const empty = this.slots.indexOf(null);
    if (empty < 0) return false;
    this.slots[empty] = { ...it };
    return true;
  }

  hasRoomFor(it) {
    if (it.kind === 'ammo' || it.kind === 'mats') return true;
    const max = stackMax(it);
    if (max && this.slots.some(s => s && s.kind === it.kind && s.id === it.id && s.count < max)) return true;
    return this.slots.includes(null);
  }

  // ------------------------------------------------------------- physics
  collidesAt(x, y, z) {
    const r = this.radius;
    return this.game.world.collides(x - r, y, z - r, x + r, y + this.height, z + r);
  }

  moveAxis(axis, amt) {
    if (!amt) return false;
    const p = this.pos, r = this.radius, h = this.height;
    const before = p.getComponent(axis);
    p.setComponent(axis, before + amt);
    if (!this.collidesAt(p.x, p.y, p.z)) return false;
    if (axis !== 1 && this.canStep && this.state === 'ground') {
      if (!this.collidesAt(p.x, p.y + 1.01, p.z)) { p.y += 1.01; this.stepOffset += 1.01; return false; }
    }
    if (axis === 1) {
      if (amt < 0) { p.y = Math.floor(p.y) + 1; this.onGround = true; }
      else { p.y = Math.floor(p.y + h) - h - 0.001; }
      if (this.collidesAt(p.x, p.y, p.z)) p.y = before;
    } else {
      const v = p.getComponent(axis);
      p.setComponent(axis, amt > 0 ? Math.floor(v + r) - r - 0.001 : Math.floor(v - r) + 1 + r + 0.001);
      if (this.collidesAt(p.x, p.y, p.z)) p.setComponent(axis, before);
    }
    return true;
  }

  // ctl: { mx, mz } world-space wish direction (length 0..1), jump bool
  physics(dt, ctl) {
    const w = this.game.world;
    const v = this.vel;
    this.mantleCd -= dt;
    if (this.mantle) { this.stepMantle(dt); return; }
    if (this.vehicle) { this.vel.set(0, 0, 0); this.sprinting = this.sliding = false; return; } // the vehicle positions its rider
    const feet = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z));
    const wasInWater = this.inWater;
    this.inWater = feet === B.WATER;
    if (this.inWater && !wasInWater && this.vel.y < -4) this.game.effects.splash(this.pos);

    if (this.state !== 'ground' || this.inWater) { this.sprinting = this.sliding = this.crouching = false; this.setLow(false, dt); }
    if (this.state === 'launch') {
      // thrown upwards by a launch pad: ballistic with air control, glider opens on the way down
      v.x += (ctl.mx * 12 - v.x) * Math.min(1, dt * 2);
      v.z += (ctl.mz * 12 - v.z) * Math.min(1, dt * 2);
      v.y -= GRAV * 0.55 * dt;
      if (v.y < 0) this.state = 'glide';
    } else if (this.state === 'dive' || this.state === 'glide') {
      const glide = this.state === 'glide';
      const hs = glide ? 10 : 15;
      const fall = glide ? 5.5 : (this.pitch < -0.6 ? 42 : 28);
      v.x += (ctl.mx * hs - v.x) * Math.min(1, dt * 2.5);
      v.z += (ctl.mz * hs - v.z) * Math.min(1, dt * 2.5);
      v.y += (-fall - v.y) * Math.min(1, dt * 3);
    } else if (this.inWater) {
      const sp = 3.4;
      v.x += (ctl.mx * sp - v.x) * Math.min(1, dt * 8);
      v.z += (ctl.mz * sp - v.z) * Math.min(1, dt * 8);
      v.y = ctl.jump ? 4.5 : Math.max(v.y - 10 * dt, -2.5);
    } else {
      this.updateStance(dt, ctl);
      if (this.sliding) {
        // keep momentum and decelerate (slower when going downhill), with slight steering
        const hs = Math.hypot(v.x, v.z) || 0.001;
        const downhill = this.lastY !== undefined && this.pos.y < this.lastY - 0.01;
        if (downhill) this.slideT = Math.min(SLIDE_TIME, this.slideT + dt * 0.6);
        const nhs = Math.max(0, hs - SLIDE_DECEL * (downhill ? 0.25 : 1) * dt);
        let dx = v.x / hs, dz = v.z / hs;
        if (ctl.mx || ctl.mz) { dx += ctl.mx * dt * 1.5; dz += ctl.mz * dt * 1.5; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
        v.x = dx * nhs; v.z = dz * nhs;
      } else {
        let sp = (this.ads ? ADS_SPEED : RUN) * (this.using ? 0.45 : 1);
        if (this.sprinting) sp = SPRINT;
        if (this.crouching) sp = Math.min(sp, CROUCH);
        sp *= this.boss ? 0.85 : 1;
        const acc = this.onGround ? 14 : 3.5;
        v.x += (ctl.mx * sp - v.x) * Math.min(1, dt * acc);
        v.z += (ctl.mz * sp - v.z) * Math.min(1, dt * acc);
      }
      if (ctl.jump && this.onGround) {
        v.y = JUMP * (this.boss ? 1.15 : 1); this.onGround = false;
        if (this.sliding) { this.sliding = false; this.slideCd = SLIDE_COOLDOWN; }
      }
      v.y = Math.max(v.y - GRAV * dt, -55);
      if (this.tryMantle(ctl)) return;
    }

    const wasGround = this.onGround;
    const vyBefore = v.y;
    const dx = v.x * dt, dy = v.y * dt, dz = v.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.35));
    this.onGround = false;
    let hitX = false, hitZ = false;
    for (let s = 0; s < steps; s++) {
      this.canStep = wasGround || this.onGround || this.inWater;
      if (this.moveAxis(0, dx / steps)) hitX = true;
      if (this.moveAxis(2, dz / steps)) hitZ = true;
      if (this.moveAxis(1, dy / steps)) { if (dy < 0) this.onGround = true; v.y = 0; }
    }
    if (hitX) v.x = 0;
    if (hitZ) v.z = 0;
    this.blocked = hitX || hitZ;
    this.stepOffset = Math.max(0, this.stepOffset - dt * 8);

    // map bounds clamp
    this.pos.x = Math.max(0.5, Math.min(SX - 0.5, this.pos.x));
    this.pos.z = Math.max(0.5, Math.min(SZ - 0.5, this.pos.z));
    if (this.pos.y < -5) this.pos.y = 70;

    this.lastY = this.pos.y;
    if (this.onGround && !wasGround) {
      if ((this.state === 'dive' || this.state === 'glide' || this.state === 'launch')) { this.state = 'ground'; this.game.onLanded(this); }
      else if (vyBefore < -21 && !this.inWater) {
        this.game.damage(this, Math.round((-vyBefore - 21) * 5), null, false, 'fall');
      }
      if (this.isPlayer && vyBefore < -8) this.game.audio.play('land', { vol: 0.5 });
    }
    // auto deploy glider
    if (this.state === 'dive') {
      const gy = w.groundY(this.pos.x, this.pos.z);
      if (this.pos.y - gy < 22) this.state = 'glide';
    }
  }

  // ------------------------------------------------------------- stance
  setLow(low, dt) {
    const s = this.scale;
    const targetH = low ? CROUCH_HEIGHT * s : this.baseHeight;
    if (!low && this.height < this.baseHeight) {
      // only stand up when there is headroom
      const r = this.radius;
      if (this.game.world.collides(this.pos.x - r, this.pos.y, this.pos.z - r, this.pos.x + r, this.pos.y + this.baseHeight, this.pos.z + r)) return false;
    }
    this.height = targetH;
    const eyeT = low ? CROUCH_EYE * s : this.baseEye;
    this.eye += (eyeT - this.eye) * Math.min(1, (dt || 0.016) * 14);
    return true;
  }

  updateStance(dt, ctl) {
    this.slideCd -= dt;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const building = this === this.game.player && this.game.buildMode;
    const movingForward = ctl.forward !== undefined ? ctl.forward > 0.3 : Math.hypot(ctl.mx, ctl.mz) > 0.3;
    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0 || hs < 2.5) { this.sliding = false; this.slideCd = SLIDE_COOLDOWN; }
    } else if (ctl.crouchPressed && this.sprinting && this.onGround && this.slideCd <= 0) {
      this.sliding = true; this.slideT = SLIDE_TIME;
      const l = hs || 1, b = Math.max(hs, SPRINT) * SLIDE_BOOST;
      const dx = hs > 0.5 ? this.vel.x / l : -Math.sin(this.yaw), dz = hs > 0.5 ? this.vel.z / l : -Math.cos(this.yaw);
      this.vel.x = dx * b; this.vel.z = dz * b;
      this.sprinting = false;
      this.game.effects.dust(this.pos);
    }
    this.sprinting = !this.sliding && !!ctl.sprint && !ctl.crouch && !this.ads && !this.using && !building && movingForward && !this.crouching;
    const wantLow = this.sliding || !!ctl.crouch;
    const stood = this.setLow(wantLow, dt);
    this.crouching = !this.sliding && (!!ctl.crouch || (!wantLow && !stood));
    if (this.crouching) this.sprinting = false;
  }

  // Climb onto a ledge 1 to 2.2 blocks above the feet when jumping into it.
  tryMantle(ctl) {
    if (this.mantleCd > 0 || this.inWater || this.state !== 'ground') return false;
    const wish = Math.hypot(ctl.mx, ctl.mz);
    if (wish < 0.3 || !(ctl.jump || !this.onGround)) return false;
    const dx = ctl.mx / wish, dz = ctl.mz / wish;
    if (!this.collidesAt(this.pos.x + dx * 0.35, this.pos.y + 0.05, this.pos.z + dz * 0.35)) return false;
    const fy = this.pos.y;
    for (let top = Math.floor(fy) + 1; top <= Math.floor(fy + 2.2); top++) {
      if (top - fy < 0.6 || top - fy > 2.2) continue;
      const tx = this.pos.x + dx * 0.8, tz = this.pos.z + dz * 0.8;
      if (this.collidesAt(tx, top + 0.001, tz)) continue;                       // no room on the ledge
      if (!this.collidesAt(tx, top - 0.4, tz)) continue;                        // nothing to stand on
      if (this.collidesAt(this.pos.x, top + 0.001, this.pos.z)) continue;       // no headroom to rise
      this.mantle = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(tx, top + 0.001, tz) };
      this.mantling = true;
      this.sprinting = this.sliding = false;
      this.vel.set(0, 0, 0);
      return true;
    }
    return false;
  }

  stepMantle(dt) {
    const m = this.mantle;
    m.t = Math.min(1, m.t + dt / MANTLE_TIME);
    const up = Math.min(1, m.t / 0.6), fwd = Math.max(0, (m.t - 0.4) / 0.6);
    const e = (k) => 1 - (1 - k) * (1 - k);
    this.pos.y = m.from.y + (m.to.y - m.from.y) * e(up);
    this.pos.x = m.from.x + (m.to.x - m.from.x) * e(fwd);
    this.pos.z = m.from.z + (m.to.z - m.from.z) * e(fwd);
    if (m.t >= 1) {
      this.pos.copy(m.to);
      this.mantle = null; this.mantling = false; this.mantleCd = 0.3;
      this.onGround = true; this.vel.set(0, 0, 0);
    }
  }

  // ------------------------------------------------------------- model
  // Procedural animation (owned by the presentation module). Reads movement flags
  // (sprinting, crouching, sliding, mantling, downed), weapon state and emotes.
  updateModel(dt) {
    const m = this.model;
    m.root.visible = this.alive && this.state !== 'bus' && !this.hidden;
    if (!m.root.visible) return;
    const A = this._anim || (this._anim = { t: 0, flinch: 0, squash: 0, air: 0, kick: 0, swim: 0, life: this.hp + this.shield + (this.over || 0), lean: 0, lower: 0 });
    A.t += dt;
    const t = A.t;
    m.root.position.set(this.pos.x, this.pos.y - this.stepOffset, this.pos.z);
    m.root.rotation.set(0, this.yaw, 0);
    const emote = this.emote && this.state === 'ground' && !this.downed ? this.emote : null;
    if (emote) emote.t = (emote.t || 0) + dt;
    const held = emote || this.downed ? null : this.held();
    setHeld(m, held);
    if (m.held) { m.held.position.set(0, 0, 0); m.held.rotation.set(0, 0, 0); m.held.visible = !emote; }
    m.glider.visible = this.state === 'glide';
    m.glider.rotation.set(0, 0, 0);

    // reset the rig
    m.pose.position.set(0, 0.9, 0); m.pose.rotation.set(0, 0, 0);
    m.root.scale.setScalar(this.scale);
    m.head.rotation.set(0, 0, 0);
    m.armL.rotation.set(0, 0, 0); m.armR.rotation.set(0, 0, 0);
    m.legL.rotation.set(0, 0, 0); m.legR.rotation.set(0, 0, 0);

    // reactions: hit flinch, landing squash, weapon kick
    const life = this.hp + this.shield + (this.over || 0);
    if (life < A.life - 0.5) A.flinch = 0.22;
    A.life = life;
    if (!this.onGround && this.state === 'ground' && !this.inWater) A.air += dt;
    else { if (A.air > 0.35 && this.onGround) A.squash = 0.2; A.air = 0; }
    A.flinch = Math.max(0, A.flinch - dt); A.squash = Math.max(0, A.squash - dt);
    if (this.kickT > 0) { A.kick = Math.max(A.kick, Math.min(1, this.kickT / 0.14)); this.kickT = 0; }
    A.kick = Math.max(0, A.kick - dt * 7);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const bump = (k, a, b) => (k < a || k > b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));

    if (this.state === 'dive') {
      m.pose.rotation.x = -1.25;
      m.pose.rotation.z = Math.sin(t * 3) * 0.05;
      m.armL.rotation.set(0, 0, -1.3 + Math.sin(t * 9) * 0.08); m.armR.rotation.set(0, 0, 1.3 - Math.sin(t * 9) * 0.08);
      m.legL.rotation.x = 0.2 + Math.sin(t * 7) * 0.1; m.legR.rotation.x = -0.2 - Math.sin(t * 7) * 0.1;
      m.head.rotation.x = 0.9;
      return;
    }
    if (this.state === 'glide') {
      // bank into turns: lateral velocity relative to facing
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const lat = this.vel.x * rx + this.vel.z * rz;
      A.lean += ((-lat * 0.05 + Math.sin(t * 1.3) * 0.05) - A.lean) * Math.min(1, dt * 4);
      m.pose.rotation.x = -0.15;
      m.pose.rotation.z = A.lean;
      m.glider.rotation.z = A.lean * 0.8;
      m.glider.position.y = Math.sin(t * 2) * 0.05;
      m.armL.rotation.set(Math.PI - 0.3, 0, 0.3); m.armR.rotation.set(Math.PI - 0.3, 0, -0.3);
      m.legL.rotation.x = 0.3 * Math.sin(t * 3.3); m.legR.rotation.x = -m.legL.rotation.x;
      return;
    }

    const flinch = A.flinch / 0.22;
    if (this.downed) {
      // knocked: on hands and knees, crawling when moving
      this.walkPhase += dt * hs * 2.4;
      const c = hs > 0.3 ? Math.sin(this.walkPhase) : Math.sin(t * 1.5) * 0.15;
      m.pose.position.y = 0.9 - 0.55;
      m.pose.rotation.x = -1.05;
      m.armL.rotation.x = 1.25 + c * 0.45; m.armR.rotation.x = 1.25 - c * 0.45;
      m.legL.rotation.x = 1.0 - c * 0.35; m.legR.rotation.x = 1.0 + c * 0.35;
      m.head.rotation.x = 0.75;
      return;
    }
    if (this.vehicle || this.vehicleId) {
      // seated in a minecart or other vehicle
      m.pose.position.y = 0.9 - 0.45;
      m.legL.rotation.x = -1.45; m.legR.rotation.x = -1.45;
      m.armL.rotation.x = 0.5; m.armR.rotation.x = 0.5;
      m.head.rotation.x = Math.max(-0.6, Math.min(0.6, this.pitch));
      return;
    }
    if (this.inWater && !this.onGround) {
      A.swim += dt * (hs > 0.5 ? 6 : 2.5);
      m.pose.position.y = 0.9 - 0.35;
      m.pose.rotation.x = hs > 0.5 ? -1.15 : -0.3;
      m.armL.rotation.x = A.swim % (Math.PI * 2); m.armR.rotation.x = (A.swim + Math.PI) % (Math.PI * 2);
      m.legL.rotation.x = Math.sin(A.swim * 2) * 0.35; m.legR.rotation.x = -m.legL.rotation.x;
      m.head.rotation.x = hs > 0.5 ? 0.9 : 0;
      return;
    }
    if (emote) { this.animateEmote(m, emote, t); return; }

    // ---- ground locomotion
    const moving = hs > 0.5 && this.onGround;
    this.walkPhase += dt * hs * (this.sprinting ? 1.6 : 1.9);
    let amp = this.sprinting ? 1.15 : 0.8;
    const swing = moving ? Math.sin(this.walkPhase) * Math.min(1, hs / 5) * amp : 0;
    let lean = 0, lower = 0;
    m.legL.rotation.x = swing; m.legR.rotation.x = -swing;
    if (this.sliding) {
      lean = 0.55; lower = 0.5;
      m.legL.rotation.x = -1.35; m.legR.rotation.x = -0.75;
    } else if (this.mantling) {
      lean = -0.3;
      m.legL.rotation.x = -0.9; m.legR.rotation.x = 0.4;
    } else if (this.crouching) {
      lean = -0.22; lower = 0.3;
      m.legL.rotation.x = -0.95 + swing * 0.45; m.legR.rotation.x = -0.95 - swing * 0.45;
    } else if (this.sprinting) {
      lean = -0.2;
    } else if (!this.onGround && this.state === 'ground') {
      m.legL.rotation.x = 0.5; m.legR.rotation.x = -0.3;
    }
    A.lean += (lean - A.lean) * Math.min(1, dt * 12);
    A.lower += (lower - A.lower) * Math.min(1, dt * 12);
    m.pose.rotation.x = A.lean + flinch * 0.2;
    m.pose.position.y = 0.9 - A.lower + (moving && !this.crouching && !this.sliding ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : 0);
    m.head.rotation.x = Math.max(-0.8, Math.min(0.8, this.pitch)) - A.lean * 0.8 - flinch * 0.2;

    // ---- arms
    const aimX = Math.PI / 2 + this.pitch - A.lean;
    if (this.mantling) {
      m.armL.rotation.set(Math.PI - 0.35, 0, 0.2); m.armR.rotation.set(Math.PI - 0.35, 0, -0.2);
    } else if (this.using) {
      m.armR.rotation.x = 1.0 + Math.sin(t * 6) * 0.08; m.armL.rotation.x = 1.0; m.armL.rotation.z = 0.2;
    } else if (held && held.id === 'pickaxe') {
      if (this.swingT > 0) {
        const k = 1 - this.swingT / 0.45;
        m.armR.rotation.x = 2.8 - Math.sin(Math.min(1, k) * Math.PI * 0.5) * 2.4;
      } else m.armR.rotation.x = 0.4 - swing * 0.5;
      m.armL.rotation.x = swing * 0.8;
    } else if (held && (held.kind === 'weapon' || held.kind === 'throwable' || held.kind === 'utility')) {
      if (this.sprinting && !this.reloading) {
        // weapon held low across the body while running
        m.armR.rotation.x = 0.75 + swing * 0.3; m.armL.rotation.x = 0.65 - swing * 0.3;
        m.armL.rotation.y = -0.45;
      } else if (this.sliding) {
        m.armR.rotation.x = aimX; m.armL.rotation.x = 0.4; m.armL.rotation.z = -0.7;
      } else {
        const k = A.kick;
        m.armR.rotation.x = aimX + k * 0.45;
        m.armL.rotation.x = aimX + k * 0.4 - 0.05;
        m.armL.rotation.y = -0.45;
        if (m.held) { m.held.position.z = k * 0.22; m.held.rotation.x = k * 0.35; }
        this.animateReload(m, held, aimX, bump);
      }
    } else {
      m.armR.rotation.x = -swing; m.armL.rotation.x = swing;
    }

    // ---- squash on landing
    if (A.squash > 0) {
      const k = A.squash / 0.2;
      m.root.scale.set(this.scale * (1 + 0.1 * k), this.scale * (1 - 0.18 * k), this.scale * (1 + 0.1 * k));
    }
  }

  // Reload motion for locally simulated actors (remote reloads are not synced).
  animateReload(m, held, aimX, bump) {
    if (!(this.reloading > 0) || !this.reloadTotal || held.kind !== 'weapon') return;
    const k = 1 - this.reloading / this.reloadTotal;
    const h = m.held;
    switch (held.id) {
      case 'shotgun': {
        const shells = 4;
        m.armL.rotation.x = aimX - 0.35 + Math.sin(k * Math.PI * 2 * shells) * 0.25;
        if (h) h.rotation.z = 0.25;
        break;
      }
      case 'sniper': {
        const b = bump(k, 0.05, 0.35) + bump(k, 0.7, 0.95);
        if (h) { h.rotation.z = b * 0.5; h.position.z = b * 0.08; }
        m.armL.rotation.x = aimX - bump(k, 0.35, 0.7) * 0.9;
        break;
      }
      case 'rocket': {
        const b = bump(k, 0.1, 0.9);
        m.armR.rotation.x = aimX + b * 0.6; m.armL.rotation.x = aimX - b * 0.9;
        if (h) h.rotation.x = b * 0.5;
        break;
      }
      default: {
        // magazine weapons: left hand drops to the mag and back, gun rolls
        const b = bump(k, 0.1, 0.65);
        m.armL.rotation.x = aimX - b * 1.0;
        m.armL.rotation.z = b * 0.3;
        if (h) h.rotation.z = b * 0.55 + bump(k, 0.75, 0.95) * 0.2;
      }
    }
  }

  animateEmote(m, e, t) {
    const te = e.t || 0, S = Math.sin;
    switch (e.id) {
      case 'wave':
        m.armR.rotation.set(Math.PI - 0.25, 0, -0.25 + S(te * 10) * 0.35);
        m.head.rotation.z = S(te * 5) * 0.08;
        break;
      case 'bop': // Block Bop
        m.pose.position.y = 0.9 + Math.abs(S(te * 6)) * 0.14;
        m.pose.rotation.z = S(te * 3) * 0.12;
        m.armL.rotation.x = Math.PI * 0.8 * (0.5 + 0.5 * S(te * 6));
        m.armR.rotation.x = Math.PI * 0.8 * (0.5 - 0.5 * S(te * 6));
        m.legL.rotation.x = S(te * 6) * 0.35; m.legR.rotation.x = -S(te * 6) * 0.35;
        m.head.rotation.z = S(te * 6) * 0.2;
        m.root.rotation.y += S(te * 1.5) * 0.6;
        break;
      case 'swing': { // Pixel Swing
        const s = S(te * 9);
        m.pose.rotation.z = -s * 0.2;
        m.armL.rotation.set(s > 0 ? 0.35 : -0.35, 0, -0.55 + s * 0.7);
        m.armR.rotation.set(s > 0 ? -0.35 : 0.35, 0, 0.55 + s * 0.7);
        m.legL.rotation.z = s * 0.1; m.legR.rotation.z = s * 0.1;
        break;
      }
      case 'laugh':
        m.pose.rotation.x = 0.3 + S(te * 22) * 0.05;
        m.armL.rotation.set(0.7, 0, 0.55); m.armR.rotation.set(0.7, 0, -0.55);
        m.head.rotation.x = -0.45 + S(te * 22) * 0.06;
        break;
      case 'salute':
        m.armR.rotation.set(2.5, -0.7, 0);
        m.head.rotation.x = 0.05;
        break;
      case 'sit':
        m.pose.position.y = 0.9 - 0.62;
        m.pose.rotation.x = 0.12;
        m.legL.rotation.x = -1.5; m.legR.rotation.x = -1.45;
        m.armL.rotation.set(-0.35, 0, 0.15); m.armR.rotation.set(-0.35, 0, -0.15);
        m.head.rotation.x = S(t * 0.7) * 0.1;
        break;
    }
  }

  // ------------------------------------------------------------- network
  snapshot() {
    const h = this.using ? this.slots[this.selected - 1] : this.held();
    return {
      id: this.id,
      p: [+this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)],
      v: [+this.vel.x.toFixed(1), +this.vel.y.toFixed(1), +this.vel.z.toFixed(1)],
      y: +this.yaw.toFixed(3), pt: +this.pitch.toFixed(3),
      s: this.state, hp: this.hp, sh: this.shield, o: Math.round(this.over), a: this.alive ? 1 : 0,
      h: h ? (h.kind === 'weapon' ? [h.kind, h.id, h.rarity] : [h.kind, h.id || h.ammo || h.mat, 0]) : null,
      sw: +this.swingT.toFixed(2), u: this.using ? 1 : 0, g: this.onGround ? 1 : 0, k: this.kills,
      mv: (this.sprinting ? 1 : 0) | (this.crouching ? 2 : 0) | (this.sliding ? 4 : 0) | (this.mantling ? 8 : 0),
      vh: this.vehicle ? this.vehicle.id : null,
      em: this.emote ? [this.emote.id] : null,
      dn: this.downed ? 1 : 0, dh: Math.round(this.downHp || 0), tm: this.team, // teams (agent B)
    };
  }

  applySnapshot(s) {
    this.netTarget = s;
    this.state = s.s; this.hp = s.hp; this.shield = s.sh; this.kills = s.k; this.over = s.o || 0;
    this.alive = !!s.a;
    this.vel.set(s.v[0], s.v[1], s.v[2]);
    this.pitch = s.pt;
    this.swingT = s.sw; this.onGround = !!s.g;
    this.remoteHeld = s.h ? (s.h[0] === 'weapon' ? { kind: 'weapon', id: s.h[1], rarity: s.h[2] } : { kind: s.h[0], id: s.h[1] }) : null;
    this.using = s.u ? true : null;
    const mv = s.mv || 0;
    this.sprinting = !!(mv & 1); this.crouching = !!(mv & 2); this.sliding = !!(mv & 4); this.mantling = !!(mv & 8);
    this.height = (this.crouching || this.sliding) ? CROUCH_HEIGHT * this.scale : this.baseHeight;
    this.vehicleId = s.vh ?? null;
    if (s.em) { if (!this.emote || this.emote.id !== s.em[0]) this.emote = { id: s.em[0], t: 0 }; } else this.emote = null;
    this.downed = !!s.dn; this.downHp = s.dh || 0; if (s.tm !== undefined) this.team = s.tm; // teams (agent B)
    if (!this.netInit) { this.pos.set(s.p[0], s.p[1], s.p[2]); this.yaw = s.y; this.netInit = true; }
  }

  // Smooth remote proxies toward the latest snapshot.
  interpolate(dt) {
    const t = this.netTarget;
    if (!t) return;
    const k = Math.min(1, dt * 12);
    const tx = t.p[0] + t.v[0] * 0.05, ty = t.p[1], tz = t.p[2] + t.v[2] * 0.05;
    if (Math.hypot(tx - this.pos.x, tz - this.pos.z) > 8) this.pos.set(tx, ty, tz);
    else { this.pos.x += (tx - this.pos.x) * k; this.pos.y += (ty - this.pos.y) * k; this.pos.z += (tz - this.pos.z) * k; }
    let dy = t.y - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
  }

}
