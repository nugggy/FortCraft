// Vending machines: each sells one rotating weapon of a fixed rarity for materials.
// Stock is derived from the seed and storm phase so every client agrees without messages.
// The buyer's simulator pays; the host spawns the item.
import * as THREE from '../vendor/three.module.min.js';
import { RARITY, WEAPONS, makeWeapon, ammoFor, itemName } from './items.js';
import { makePickupMesh } from './models.js';
import { mulberry32 } from './noise.js';

const COST = [100, 200, 300, 400, 500];
const MATS = ['wood', 'brick', 'metal'];
const POOL = ['ar', 'burst', 'smg', 'shotgun', 'pistol', 'sniper', 'rocket'];

function priceSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,14,30,0.85)'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = color; x.fillRect(0, 56, 256, 8);
  x.font = 'bold 30px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.fillStyle = '#fff';
  x.fillText(text, 128, 40);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  s.scale.set(2, 0.5, 1);
  return s;
}

export class Vending {
  constructor(game) {
    this.game = game;
    this.machines = [];
    this.cool = new Map();
    game.net.on('vend', (m) => { if (game.net.isHost) this.hostBuy(m.m, m.a); });
    game.interactProviders.push((a, C) => this.prompt(a, C));
    game.events.on((ev, phase) => { if (ev === 'stormPhase') this.restock(phase); });
  }

  start() {
    this.reset();
    const w = this.game.world;
    (w.vendSpots || []).forEach(([x, y, z, fx, fz, poi], i) => {
      const rarity = 1 + (i % 4);
      const m = { i, x, y, z, fx, fz, poi, rarity, mat: MATS[i % 3], cost: COST[rarity], item: null, group: new THREE.Group() };
      m.group.position.set(x + 0.5, y + 2.4, z + 0.5);
      this.game.scene.add(m.group);
      this.machines.push(m);
    });
    this.restock(0);
  }

  reset() {
    for (const m of this.machines) this.game.scene.remove(m.group);
    this.machines = []; this.cool.clear();
  }

  restock(phase) {
    const seed = this.game.world ? this.game.world.seed : 0;
    for (const m of this.machines) {
      const r = mulberry32((seed ^ (m.i * 7919) ^ (phase * 104729)) >>> 0);
      const pool = POOL.filter(id => WEAPONS[id].rarities.includes(m.rarity));
      m.item = makeWeapon(pool[Math.floor(r() * pool.length)], m.rarity);
      m.group.clear();
      const show = makePickupMesh(m.item);
      show.scale.setScalar(1.2);
      m.show = show;
      m.group.add(show);
      const sign = priceSprite(`${m.cost} ${m.mat.toUpperCase()}`, RARITY[m.rarity].color);
      sign.position.y = -0.55;
      m.group.add(sign);
    }
  }

  near(a) {
    let best = null, bd = 2.6;
    for (const m of this.machines) {
      const d = Math.hypot(m.x + 0.5 + m.fx * 0.6 - a.pos.x, m.z + 0.5 + m.fz * 0.6 - a.pos.z);
      if (d < bd && Math.abs(a.pos.y - m.y) < 2) { bd = d; best = m; }
    }
    return best;
  }

  prompt(a, C) {
    const m = this.near(a);
    if (!m || !m.item) return '';
    const key = C.usingPad ? 'X' : C.label('interact');
    const col = RARITY[m.rarity].color;
    const name = `<span style="color:${col}">${itemName(m.item)}</span>`;
    if (this.game.noBuild) {
      // No Builds has no materials, so machines are free but slower to dispense
      if (C.pressed('interact')) this.buy(a, m, true);
      return `<b>${key}</b> Take ${name} <small>(free in No Builds)</small>`;
    }
    if (a.mats[m.mat] < m.cost) return `${name} <small>needs ${m.cost} ${m.mat} (you have ${a.mats[m.mat]})</small>`;
    if (C.pressed('interact')) this.buy(a, m, false);
    return `<b>${key}</b> Buy ${name} for ${m.cost} ${m.mat}`;
  }

  buy(a, m, free) {
    const g = this.game;
    const t = this.cool.get(m.i) || 0;
    if (g.time < t) return;
    this.cool.set(m.i, g.time + (free ? 20 : 1));
    if (!free) a.mats[m.mat] -= m.cost;
    g.audio.play('chestopen', { pos: a.pos, rate: 1.2 });
    g.events.emit('vend', a.id, m.item);
    if (g.net.isHost) this.hostBuy(m.i, a.id);
    else g.net.sendTo('host', { t: 'vend', m: m.i, a: a.id });
  }

  hostBuy(i, actorId) {
    const g = this.game, m = this.machines[i];
    if (!m || !m.item) return;
    const pos = { x: m.x + 0.5 + m.fx * 0.9, y: m.y + 1.0, z: m.z + 0.5 + m.fz * 0.9 };
    const vel = { x: m.fx * 2.5, y: 3, z: m.fz * 2.5 };
    g.loot.spawn({ ...m.item }, pos, vel);
    if (WEAPONS[m.item.id].ammo) g.loot.spawn(ammoFor(m.item.id, 2), pos, { x: m.fx * 2, y: 4, z: m.fz * 2 });
  }

  update(dt) {
    for (const m of this.machines) if (m.show) {
      m.show.rotation.y += dt * 1.2;
      m.show.position.y = Math.sin(this.game.time * 2 + m.i) * 0.12;
    }
  }
}

export function installVending(game) {
  game.vending = game.addSystem(new Vending(game));
}
