// Throwables and utilities: grenades, Med Mist and launch pads.
// The thrower's client simulates its own throws ("live"); other clients run visual-only copies.
import * as THREE from '../vendor/three.module.min.js';
import { THROWABLES, UTILITIES } from './items.js';
import { BLOCKS, SOLID } from './blocks.js';

const GRAV = 22;
const box = (w, h, d, color, extra = {}) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, ...extra }));

export class Gadgets {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.clouds = [];
    this.pads = new Map();
    this.n = 0;
    this.net();
  }

  reset() {
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    for (const c of this.clouds) this.game.scene.remove(c.mesh);
    for (const p of this.pads.values()) this.game.scene.remove(p.mesh);
    this.projectiles = []; this.clouds = []; this.pads.clear();
  }

  net() {
    const n = this.game.net;
    n.on('throw', (m) => {
      const owner = this.game.actorById(m.a);
      this.spawn(m.id, m.k, owner, new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), false);
    });
    n.on('mist', (m) => { this.removeProjectile(m.id); this.addCloud(new THREE.Vector3(...m.p)); });
    n.on('pad+', (m) => this.addPad(m.id, m.x, m.y, m.z, m.life));
    n.on('pad-', (m) => this.removePad(m.id));
  }

  // Called from combat.fire for a held throwable or utility. Returns true when used.
  use(a, held, origin, dir) {
    const g = this.game;
    const def = THROWABLES[held.id] || UTILITIES[held.id];
    if (!def) return false;
    if (held.kind === 'utility') {
      if (!this.placePad(a)) { a.cooldown = 0.2; if (a === g.player) g.hud.notice('No room for a launch pad here', '#ff9a7a'); return false; }
    } else {
      const id = `${a.id}:t${++this.n}`;
      const pos = a.eyePos.addScaledVector(dir, 0.6);
      const vel = dir.clone().multiplyScalar(held.id === 'grenade' ? 17 : 14);
      vel.y += 4; vel.x += a.vel.x * 0.4; vel.z += a.vel.z * 0.4;
      this.spawn(id, held.id, a, pos, vel, true);
      g.net.send({ t: 'throw', id, k: held.id, a: a.id, p: pos.toArray().map(v => +v.toFixed(2)), v: vel.toArray().map(v => +v.toFixed(2)) });
      g.audio.play('swing', { pos: a.pos, vol: 0.8, rate: 0.8 });
    }
    a.cooldown = def.cooldown || 0.8;
    a.swingT = 0.3;
    held.count--;
    if (held.count <= 0) { a.slots[a.selected - 1] = null; a.selected = -1; a.select(0); }
    return true;
  }

  // ---------------------------------------------------------------- projectiles
  spawn(id, kind, owner, pos, vel, live) {
    let mesh;
    if (kind === 'grenade') {
      mesh = new THREE.Group();
      mesh.add(box(0.22, 0.26, 0.22, 0x4f6b3a));
      const pin = box(0.08, 0.08, 0.08, 0x9aa3ad); pin.position.y = 0.16; mesh.add(pin);
    } else {
      mesh = box(0.22, 0.3, 0.22, 0xe8f6ec);
      const cap = box(0.23, 0.08, 0.23, 0x7fe07f); cap.position.y = 0.08; mesh.add(cap);
    }
    mesh.position.copy(pos);
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(mesh);
    this.projectiles.push({ id, kind, owner, pos: pos.clone(), vel: vel.clone(), live, mesh, t: 0, bounces: 0, rest: false });
  }

  removeProjectile(id) {
    const i = this.projectiles.findIndex(p => p.id === id);
    if (i >= 0) { this.game.scene.remove(this.projectiles[i].mesh); this.projectiles.splice(i, 1); }
  }

  stepProjectile(p, dt) {
    const w = this.game.world;
    if (!p.rest) {
      p.vel.y -= GRAV * dt;
      const len = p.vel.length() * dt;
      if (len > 0) {
        const d = p.vel.clone().normalize();
        const hit = w.raycast(p.pos.x, p.pos.y, p.pos.z, d.x, d.y, d.z, len + 0.15);
        let actorHit = false;
        for (const a of this.game.actors) {
          if (!a.alive || a === p.owner || a.state === 'bus' || p.t < 0.15) continue;
          if (Math.abs(a.pos.x - p.pos.x) < a.radius + 0.15 && Math.abs(a.pos.z - p.pos.z) < a.radius + 0.15 && p.pos.y > a.pos.y && p.pos.y < a.pos.y + a.height) { actorHit = true; break; }
        }
        if (hit || actorHit) {
          if (p.kind === 'grenade' && p.bounces < 1 && hit) {
            // bounce once off the surface we hit
            p.bounces++;
            p.pos.addScaledVector(d, Math.max(0, hit.t - 0.12));
            if (hit.nx) p.vel.x *= -0.45; if (hit.ny) p.vel.y *= -0.45; if (hit.nz) p.vel.z *= -0.45;
            p.vel.multiplyScalar(0.7);
            this.game.audio.play('land', { pos: p.pos, vol: 0.3, rate: 1.8 });
          } else {
            if (hit) p.pos.addScaledVector(d, Math.max(0, hit.t - 0.12));
            p.vel.set(0, 0, 0); p.rest = true;
          }
        } else p.pos.addScaledVector(p.vel, dt);
      }
      if (p.pos.y < 0) p.rest = true;
    } else if (!SOLID[w.get(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.2), Math.floor(p.pos.z))]) {
      p.rest = false; // the ground under it was destroyed
    }
    p.mesh.position.copy(p.pos);
    if (!p.rest) { p.mesh.rotation.x += dt * 8; p.mesh.rotation.z += dt * 5; }
  }

  update(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      this.stepProjectile(p, dt);
      if (p.kind === 'grenade') {
        if (Math.random() < 0.4) g.effects.sparkle(p.pos.x, p.pos.y + 0.2, p.pos.z, [1, 0.5, 0.2], 1);
        const fuse = THROWABLES.grenade.fuse;
        if (p.t >= fuse) {
          g.scene.remove(p.mesh); this.projectiles.splice(i, 1);
          const def = THROWABLES.grenade;
          if (p.live) g.explode(p.pos.clone(), def.radius, p.owner, def.damage, p.id);
        } else if (!p.live && p.t > fuse + 1) { g.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
      } else if (p.rest || p.t > 2.5) {
        // Med Mist: the thrower turns it into a cloud and tells everyone
        if (p.live) {
          this.addCloud(p.pos);
          g.net.send({ t: 'mist', id: p.id, p: p.pos.toArray().map(v => +v.toFixed(2)) });
          g.scene.remove(p.mesh); this.projectiles.splice(i, 1);
        } else if (p.t > 4) { g.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
      }
    }
    this.updateClouds(dt);
    this.updatePads(dt);
  }

  // ---------------------------------------------------------------- Med Mist
  addCloud(pos) {
    const def = THROWABLES.medmist;
    const mesh = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x7fe08f, transparent: true, opacity: 0.22, depthWrite: false });
    for (let k = 0; k < 16; k++) {
      const s = 1.2 + Math.random() * 1.6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), mat);
      const a = Math.random() * Math.PI * 2, r = Math.random() * (def.radius - 1);
      b.position.set(Math.cos(a) * r, 0.4 + Math.random() * 1.6, Math.sin(a) * r);
      mesh.add(b);
    }
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.clouds.push({ pos: pos.clone(), t: def.duration, tick: 0.5, mesh });
    this.game.audio.play('heal', { pos, vol: 0.8 });
  }

  updateClouds(dt) {
    const g = this.game, def = THROWABLES.medmist;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t -= dt; c.tick -= dt;
      c.mesh.rotation.y += dt * 0.3;
      const fade = Math.min(1, c.t / 1.2);
      c.mesh.children.forEach((b, k) => { b.position.y += Math.sin(g.time * 1.5 + k) * dt * 0.2; });
      c.mesh.children[0].material.opacity = 0.22 * fade;
      if (Math.random() < dt * 20) g.effects.sparkle(c.pos.x + (Math.random() - 0.5) * def.radius * 1.4, c.pos.y + 0.2, c.pos.z + (Math.random() - 0.5) * def.radius * 1.4, [0.5, 1, 0.55], 1);
      if (c.tick <= 0) {
        c.tick += 0.5;
        // each client heals the actors it simulates
        for (const a of g.localActors()) {
          if (!a.alive || a.state === 'bus' || a.dormant) continue;
          if (Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) < def.radius && Math.abs(a.pos.y - c.pos.y) < 3 && a.hp < a.maxHp) {
            a.hp = Math.min(a.maxHp, a.hp + def.heal);
            if (a === g.player) g.hud.damageNumber(a.center, `+${def.heal}`, 'mat');
          }
        }
      }
      if (c.t <= 0) { g.scene.remove(c.mesh); this.clouds.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- launch pads
  placePad(a) {
    const g = this.game, w = g.world;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    const x = Math.floor(a.pos.x + fx * 2.2), z = Math.floor(a.pos.z + fz * 2.2);
    let y = -1;
    for (let yy = Math.floor(a.pos.y) + 2; yy >= Math.floor(a.pos.y) - 3; yy--) {
      const id = w.get(x, yy, z), below = w.get(x, yy - 1, z);
      const free = id === 0 || BLOCKS[id].plant;
      if (free && SOLID[below] && (w.get(x, yy + 1, z) === 0 || BLOCKS[w.get(x, yy + 1, z)].plant)) { y = yy; break; }
    }
    if (y < 0) return false;
    for (const p of this.pads.values()) if (p.x === x && p.z === z && p.y === y) return false;
    const id = `${a.id}:p${++this.n}`;
    const life = UTILITIES.launchpad.life;
    this.addPad(id, x, y, z, life);
    g.net.send({ t: 'pad+', id, x, y, z, life });
    g.audio.play('build', { pos: a.pos, rate: 1.4 });
    return true;
  }

  addPad(id, x, y, z, life) {
    if (this.pads.has(id)) return;
    const mesh = new THREE.Group();
    const base = box(1.6, 0.16, 1.6, 0x3a3d42); base.position.y = 0.08; mesh.add(base);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fa8ff).multiplyScalar(2.2) }));
    glow.position.y = 0.19; mesh.add(glow);
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd84a).multiplyScalar(2) }));
    arrow.position.y = 0.23; mesh.add(arrow);
    const arrowHead = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.25), arrow.material);
    arrowHead.position.set(0, 0.23, -0.4); mesh.add(arrowHead);
    mesh.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    mesh.position.set(x + 0.5, y, z + 0.5);
    this.game.scene.add(mesh);
    this.pads.set(id, { id, x, y, z, life, mesh, glow, mine: id.startsWith((this.game.player && this.game.player.id) + ':') });
  }

  removePad(id) {
    const p = this.pads.get(id);
    if (!p) return;
    this.game.scene.remove(p.mesh);
    this.pads.delete(id);
  }

  updatePads(dt) {
    const g = this.game;
    for (const p of [...this.pads.values()]) {
      p.life -= dt;
      p.glow.material.color.setScalar(1).set(0x3fa8ff).multiplyScalar(1.6 + Math.sin(g.time * 6) * 0.6);
      if (p.life <= 0) {
        if (p.mine) g.net.send({ t: 'pad-', id: p.id });
        this.removePad(p.id);
        continue;
      }
      for (const a of g.localActors()) {
        if (!a.alive || a.state !== 'ground' || a.vehicle || a.downed) continue;
        if (Math.abs(a.pos.x - (p.x + 0.5)) < 0.95 && Math.abs(a.pos.z - (p.z + 0.5)) < 0.95 && Math.abs(a.pos.y - p.y) < 0.7) {
          a.state = 'launch';
          a.vel.y = 30; a.vel.x *= 0.5; a.vel.z *= 0.5;
          a.onGround = false; a.sliding = false;
          g.effects.burst(p.x + 0.5, p.y + 0.4, p.z + 0.5, [0.4, 0.75, 1], 18, 6, 0.14, 0.7);
          g.audio.play('rocket', { pos: a.pos, vol: 0.6, rate: 1.6 });
        }
      }
    }
  }
}

export function installGadgets(game) {
  game.gadgets = new Gadgets(game);
  game.addSystem(game.gadgets);
}
