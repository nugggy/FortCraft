// Pickups and chests. The host owns all loot; clients request and the host grants.
import * as THREE from '../vendor/three.module.min.js';
import { B } from './blocks.js';
import { makePickupMesh } from './models.js';
import { rollChest, rollFloor, itemName } from './items.js';

export class LootSystem {
  constructor(game) {
    this.game = game;
    this.pickups = new Map();
    this.nextId = 1;
    this.pending = new Set();
    this.chestSoundT = 0;
  }

  reset() {
    for (const p of this.pickups.values()) this.game.scene.remove(p.mesh);
    this.pickups.clear(); this.pending.clear(); this.nextId = 1;
  }

  // Host only.
  spawn(item, pos, vel = null) {
    if (!this.game.net.isHost) return;
    const id = this.nextId++;
    const v = vel || { x: (Math.random() - 0.5) * 3, y: 4, z: (Math.random() - 0.5) * 3 };
    this.create(id, item, pos, v);
    this.game.net.send({ t: 'loot+', id, item, p: [pos.x, pos.y, pos.z], v: [v.x, v.y, v.z] });
  }

  create(id, item, pos, vel) {
    const mesh = makePickupMesh(item);
    mesh.position.set(pos.x, pos.y, pos.z);
    this.game.scene.add(mesh);
    this.pickups.set(id, { id, item, pos: new THREE.Vector3(pos.x, pos.y, pos.z), vel: new THREE.Vector3(vel.x, vel.y, vel.z), mesh, age: 0, rest: false });
  }

  remove(id) {
    const p = this.pickups.get(id);
    if (!p) return;
    this.game.scene.remove(p.mesh);
    this.pickups.delete(id);
    this.pending.delete(id);
  }

  spawnInitial() {
    const rand = Math.random;
    for (const [x, y, z] of this.game.world.lootSpots) {
      if (rand() < 0.25) continue;
      const items = rollFloor(rand);
      items.forEach((it, i) => this.spawn(it, { x: x + 0.5 + i * 0.6, y: y + 0.3, z: z + 0.5 }, { x: 0, y: 0, z: 0 }));
    }
  }

  // ---------------------------------------------------------------- taking
  // Called by whoever simulates the actor. Host resolves immediately.
  requestTake(actor, id) {
    if (this.pending.has(id)) return;
    const p = this.pickups.get(id);
    if (!p) return;
    if (this.game.net.isHost) this.hostGrant(actor.id, id);
    else { this.pending.add(id); this.game.net.send({ t: 'take', id, actor: actor.id }); }
  }

  hostGrant(actorId, id) {
    const p = this.pickups.get(id);
    if (!p) return;
    this.remove(id);
    this.game.net.send({ t: 'loot-', id, who: actorId, item: p.item });
    this.receive(actorId, p.item);
  }

  // Item granted to an actor: only the actor's simulator adds it.
  receive(actorId, item) {
    const a = this.game.actorById(actorId);
    if (!a || a.remote || !a.alive) return;
    const it = { ...item };
    if (!a.hasRoomFor(it)) {
      // swap with held slot
      const slot = a.selected > 0 ? a.selected - 1 : a.slots.findIndex(s => s && s.kind === 'weapon');
      if (slot >= 0 && a.slots[slot]) {
        this.drop(a, a.slots[slot]);
        a.slots[slot] = null;
      }
    }
    if (!a.addItem(it)) { this.drop(a, it); return; }
    if (a.selected === 0 && it.kind === 'weapon') a.select(a.slots.findIndex(s => s && s.id === it.id && s.rarity === it.rarity) + 1);
    if (a === this.game.player) {
      this.game.audio.play('pickup');
      this.game.hud.toast(`+ ${itemName(item)}`, item);
      this.game.events.emit('pickup', a, item);
    }
  }

  drop(actor, item, scatter = 1) {
    const pos = { x: actor.pos.x, y: actor.pos.y + 0.8, z: actor.pos.z };
    const vel = { x: (Math.random() - 0.5) * 4 * scatter - Math.sin(actor.yaw) * 2, y: 4, z: (Math.random() - 0.5) * 4 * scatter - Math.cos(actor.yaw) * 2 };
    if (this.game.net.isHost) this.spawn(item, pos, vel);
    else this.game.net.send({ t: 'drop', item, p: [pos.x, pos.y, pos.z], v: [vel.x, vel.y, vel.z] });
  }

  dropAll(actor) {
    for (let i = 0; i < 5; i++) if (actor.slots[i]) { this.drop(actor, actor.slots[i], 2.2); actor.slots[i] = null; }
    for (const k in actor.mats) if (actor.mats[k] > 0) { this.drop(actor, { kind: 'mats', mat: k, count: actor.mats[k] }, 2.2); actor.mats[k] = 0; }
  }

  // ---------------------------------------------------------------- chests
  openChest(actor, x, y, z) {
    if (!this.game.net.isHost) { this.game.net.send({ t: 'chest', x, y, z, actor: actor.id }); return; }
    this.hostOpenChest(x, y, z, actor.id);
  }

  hostOpenChest(x, y, z, actorId) {
    const w = this.game.world;
    if (w.get(x, y, z) !== B.CHEST) return;
    this.game.setBlock(x, y, z, B.AIR);
    this.game.net.send({ t: 'fx', k: 'chest', p: [x, y, z], a: actorId });
    this.game.fxChest(x, y, z, actorId);
    const items = rollChest(Math.random).filter(it => !(this.game.noBuild && it.kind === 'mats'));
    items.forEach((it, i) => {
      const ang = (i / items.length) * Math.PI * 2;
      this.spawn(it, { x: x + 0.5, y: y + 0.6, z: z + 0.5 }, { x: Math.cos(ang) * 2.2, y: 5, z: Math.sin(ang) * 2.2 });
    });
  }

  // ---------------------------------------------------------------- per frame
  nearest(actor, maxDist = 2.6, filter = null) {
    let best = null, bd = maxDist;
    for (const p of this.pickups.values()) {
      if (filter && !filter(p)) continue;
      const d = Math.hypot(p.pos.x - actor.pos.x, p.pos.y - (actor.pos.y + 0.5), p.pos.z - actor.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  update(dt, t) {
    const w = this.game.world;
    for (const p of this.pickups.values()) {
      p.age += dt;
      if (!p.rest) {
        p.vel.y -= 22 * dt;
        p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
        if (w.isSolid(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z))) { p.pos.x -= p.vel.x * dt; p.pos.z -= p.vel.z * dt; p.vel.x = p.vel.z = 0; }
        p.pos.y += p.vel.y * dt;
        if (p.vel.y < 0 && w.isSolid(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.25), Math.floor(p.pos.z))) {
          p.pos.y = Math.floor(p.pos.y - 0.25) + 1.25; p.vel.set(0, 0, 0); p.rest = true;
        }
        p.vel.x *= 1 - dt * 1.5; p.vel.z *= 1 - dt * 1.5;
      } else if (!w.isSolid(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.3), Math.floor(p.pos.z))) p.rest = false;
      p.mesh.position.set(p.pos.x, p.pos.y + Math.sin(t * 2 + p.id) * 0.08, p.pos.z);
      p.mesh.children[0].rotation.y = t * 1.2 + p.id;
    }

    // auto-pickup ammo/mats for locally simulated actors
    for (const a of this.game.localActors()) {
      if (!a.alive || a.state !== 'ground') continue;
      const p = this.nearest(a, 1.6, q => q.item.kind === 'ammo' || q.item.kind === 'mats');
      if (p) this.requestTake(a, p.id);
    }

    // chest sparkle near the player
    const pl = this.game.viewActor();
    if (pl) {
      this.chestSoundT -= dt;
      let nearestD = 1e9, np = null;
      for (const [x, y, z] of w.chests) {
        const dx = x - pl.pos.x, dz = z - pl.pos.z;
        if (Math.abs(dx) > 24 || Math.abs(dz) > 24) continue;
        if (w.get(x, y, z) !== B.CHEST) continue;
        const d = Math.hypot(dx, y - pl.pos.y, dz);
        if (d < nearestD) { nearestD = d; np = { x: x + 0.5, y: y + 0.5, z: z + 0.5 }; }
        if (Math.random() < dt * 3) this.game.effects.sparkle(x + 0.5, y + 0.6, z + 0.5, [1, 0.9, 0.4], 1);
      }
      if (np && this.chestSoundT <= 0 && nearestD < 20) { this.game.audio.play('chest', { pos: np, range: 22, vol: 0.9 }); this.game.soundPing('chest', np, 'chest'); this.chestSoundT = 1.4; }
    }
  }
}
