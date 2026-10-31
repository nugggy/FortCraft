// Supply drops: the host drops one crate per storm phase (from phase 1) inside the next circle.
// It floats down under a blocky balloon with a beam of light; hold interact to open it.
import * as THREE from '../vendor/three.module.min.js';
import { rollWeapon, WEAPONS } from './items.js';
import { WATER_LEVEL, SX, SZ } from './world.js';

const FALL_SPEED = 3.2, START_Y = 105, OPEN_TIME = 1.5;
const lambert = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 });

function makeDrop() {
  const g = new THREE.Group();
  const crate = new THREE.Group();
  const add = (parent, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
  add(crate, 1.4, 1.1, 1.4, lambert(0x2f6fd0, 0x0a1a40), 0, 0.55, 0);
  const trim = lambert(0xf5c542, 0x3a2a00);
  for (const y of [0.05, 1.05]) { add(crate, 1.46, 0.1, 1.46, trim, 0, y, 0); }
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) add(crate, 0.12, 1.1, 0.12, trim, x, 0.55, z);
  add(crate, 0.5, 0.5, 0.06, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe0ff).multiplyScalar(1.8) }), 0, 0.6, 0.71);
  g.add(crate);
  const balloon = new THREE.Group();
  const cols = [lambert(0xe23b3b), lambert(0xffffff)];
  for (let y = 0; y < 5; y++) {
    const r = Math.round(Math.sin((y + 0.5) / 5 * Math.PI) * 2);
    for (let k = -r; k <= r; k++) add(balloon, 1, 1, 2 * r + 1, cols[(k + 10) % 2], k, 4.5 + y, 0);
  }
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) add(balloon, 0.05, 3.4, 0.05, lambert(0x333333), x, 2.8, z);
  g.add(balloon);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58b8ff).multiplyScalar(1.8), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 160, 8, 1, true), beamMat);
  beam.position.y = 80;
  g.add(beam);
  return { g, crate, balloon, beam };
}

export class SupplyDrops {
  constructor(game) {
    this.game = game;
    this.map = new Map();
    this.n = 0;
    this.holdT = 0; this.holdId = null;
    const n = game.net;
    n.on('sdrop+', (m) => this.create(m.id, m.x, m.y, m.z));
    n.on('sdrop-', (m) => this.remove(m.id, true));
    n.on('sdropopen', (m) => { if (n.isHost) this.hostOpen(m.id); });
    game.events.on((ev, phase) => { if (ev === 'stormPhase' && game.net.isHost && phase >= 1 && !game.creative) this.spawn(); });
    game.interactProviders.push((a, C, dt) => this.prompt(a, C, dt));
  }

  reset() {
    for (const d of this.map.values()) this.game.scene.remove(d.mesh.g);
    this.map.clear(); this.holdT = 0; this.holdId = null;
  }

  // Host only: pick a dry spot inside the next safe zone.
  spawn() {
    const g = this.game, w = g.world, st = g.storm.next;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.max(6, st.r * 0.7);
      const x = Math.floor(st.x + Math.cos(a) * r), z = Math.floor(st.z + Math.sin(a) * r);
      if (x < 8 || z < 8 || x >= SX - 8 || z >= SZ - 8) continue;
      const y = w.groundY(x, z);
      if (y <= WATER_LEVEL + 1 || y > 58) continue;
      const id = 'sd' + (++this.n);
      this.create(id, x, y, z);
      g.net.send({ t: 'sdrop+', id, x, y, z });
      return;
    }
  }

  create(id, x, y, z) {
    if (this.map.has(id)) return;
    const mesh = makeDrop();
    mesh.g.position.set(x + 0.5, START_Y, z + 0.5);
    this.game.scene.add(mesh.g);
    this.map.set(id, { id, x, y, z, cy: START_Y, landed: false, mesh, balloonT: 0, pos: new THREE.Vector3(x + 0.5, START_Y, z + 0.5), opened: false, falling: true });
    this.game.hud.notice('A supply drop is falling!', '#7fd0ff');
    this.game.audio.play('horn', { vol: 0.5 });
  }

  remove(id, opened) {
    const d = this.map.get(id);
    if (!d) return;
    this.game.scene.remove(d.mesh.g);
    this.map.delete(id);
    if (opened) {
      this.game.effects.burst(d.x + 0.5, d.cy + 0.6, d.z + 0.5, [0.4, 0.7, 1], 30, 6, 0.15, 1);
      this.game.audio.play('chestopen', { pos: { x: d.x, y: d.cy, z: d.z }, rate: 0.9 });
    }
  }

  // Bot-facing view (see bot.js): drops as { pos, opened, falling }, opened via open(actor, drop).
  get drops() { return [...this.map.values()]; }

  open(actor, drop) {
    if (!drop || !drop.landed || drop.opened) return false;
    if (actor.pos.distanceTo(drop.pos) > 3.5) return false;
    drop.opened = true;
    this.game.events.emit('sdropopen', actor.id, drop);
    if (this.game.net.isHost) this.hostOpen(drop.id);
    else this.game.net.sendTo('host', { t: 'sdropopen', id: drop.id });
    return true;
  }

  hostOpen(id) {
    const g = this.game, d = this.map.get(id);
    if (!d || !d.landed) return;
    this.remove(id, true);
    g.net.send({ t: 'sdrop-', id });
    const rand = Math.random;
    const items = [];
    for (let k = 0; k < 2; k++) {
      const w = rollWeapon(rand, [0, 0, 0, 0.6, 0.4]);
      items.push(w);
    }
    items.push({ kind: 'heal', id: 'shield', count: 2 }, { kind: 'heal', id: 'mini', count: 3 });
    if (!g.noBuild) items.push({ kind: 'mats', mat: 'brick', count: 100 }, { kind: 'mats', mat: 'metal', count: 100 });
    items.forEach((it, i) => {
      const a = (i / items.length) * Math.PI * 2;
      g.loot.spawn(it, { x: d.x + 0.5, y: d.y + 1, z: d.z + 0.5 }, { x: Math.cos(a) * 2.5, y: 5, z: Math.sin(a) * 2.5 });
    });
  }

  prompt(a, C, dt) {
    let near = null;
    for (const d of this.map.values()) {
      if (d.landed && !d.opened && Math.hypot(d.x + 0.5 - a.pos.x, d.z + 0.5 - a.pos.z) < 2.4 && Math.abs(d.cy - a.pos.y) < 2.5) { near = d; break; }
    }
    if (!near) { this.holdT = 0; this.holdId = null; return ''; }
    const key = C.usingPad ? 'X' : C.label('interact');
    if (C.down('interact')) {
      if (this.holdId !== near.id) { this.holdId = near.id; this.holdT = 0; }
      this.holdT += dt;
      a.searchT = Math.min(0.45, this.holdT / OPEN_TIME * 0.45); // drives the HUD progress ring
      if (this.holdT >= OPEN_TIME) {
        this.holdT = 0;
        this.open(a, near);
      }
      return `Opening supply drop <b>${Math.round(this.holdT / OPEN_TIME * 100)}%</b>`;
    }
    this.holdT = 0;
    return `Hold <b>${key}</b> to open the supply drop`;
  }

  update(dt) {
    for (const d of this.map.values()) {
      const m = d.mesh;
      if (!d.landed) {
        d.cy = Math.max(d.y, d.cy - FALL_SPEED * dt);
        m.crate.rotation.y += dt * 0.3;
        if (d.cy <= d.y) { d.landed = true; d.falling = false; this.game.effects.dust({ x: d.x + 0.5, y: d.y, z: d.z + 0.5 }); this.game.audio.play('land', { pos: { x: d.x, y: d.y, z: d.z } }); }
      } else if (m.balloon.visible) {
        // the balloon lets go and drifts away
        d.balloonT += dt;
        m.balloon.position.y += dt * (4 + d.balloonT * 3);
        m.balloon.position.x += dt * 1.5;
        if (d.balloonT > 6) m.balloon.visible = false;
      }
      m.g.position.y = d.cy;
      d.pos.y = d.cy;
      m.beam.material.opacity = 0.25 + Math.sin(this.game.time * 3) * 0.1;
    }
  }
}

export function installSupplyDrops(game) {
  game.supplyDrops = game.addSystem(new SupplyDrops(game));
}
