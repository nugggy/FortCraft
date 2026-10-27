// Build pieces snap to a 4-block grid and are made of voxels, so collision,
// raycasts and destruction all reuse the voxel world.
import * as THREE from '../vendor/three.module.min.js';
import { B, BLOCKS, BUILD_BLOCK } from './blocks.js';

const replaceable = (id) => id === B.AIR || id === B.WATER || BLOCKS[id].plant;
import { SX, SZ } from './world.js';

export const GRID = 4;
export const PIECE_TYPES = ['wall', 'floor', 'ramp', 'cone'];
export const PIECE_HP = { wood: 150, brick: 260, metal: 420 };
export const PIECE_COST = 10;

export class BuildSystem {
  constructor(game) {
    this.game = game;
    this.pieces = new Map();     // id -> { id, blocks:[idx], hp, maxHp, mat }
    this.blockPiece = new Map(); // world idx -> piece id
    this.counter = 0;
    const g = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x3fa8ff, transparent: true, opacity: 0.32, depthWrite: false });
    this.ghost = new THREE.InstancedMesh(g, this.ghostMat, 64);
    this.ghost.count = 0; this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 5;
    game.scene.add(this.ghost);
  }

  reset() {
    this.pieces.clear(); this.blockPiece.clear(); this.counter = 0; this.ghost.count = 0;
  }

  // Candidate block positions for a piece in front of the actor.
  compute(actor, type) {
    const p = actor.pos;
    const dir = actor.lookDir();
    // quantise horizontal facing to +-x / +-z
    const fx = -Math.sin(actor.yaw), fz = -Math.cos(actor.yaw);
    const ax = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z';
    const sgn = ax === 'x' ? Math.sign(fx) : Math.sign(fz);
    const out = [];
    if (type === 'wall') {
      const gx = Math.floor(p.x / GRID), gz = Math.floor(p.z / GRID);
      let gy = Math.floor((p.y + 0.5) / GRID);
      if (actor.pitch > 0.65) gy += 1;
      const by = gy * GRID;
      if (ax === 'x') {
        const x = (sgn > 0 ? gx + 1 : gx) * GRID;
        for (let y = by; y <= by + GRID; y++) for (let z = gz * GRID; z <= gz * GRID + GRID; z++) out.push([x, y, z]);
      } else {
        const z = (sgn > 0 ? gz + 1 : gz) * GRID;
        for (let y = by; y <= by + GRID; y++) for (let x = gx * GRID; x <= gx * GRID + GRID; x++) out.push([x, y, z]);
      }
      return out;
    }
    // target point ahead of the eye picks the cell
    const reach = type === 'floor' && actor.pitch < -0.5 ? 1.5 : 3.6;
    const tx = p.x + dir.x * reach, tz = p.z + dir.z * reach;
    const ty = p.y + actor.eye + dir.y * reach - (type === 'floor' ? 1.2 : 1.6);
    const gx = Math.floor(tx / GRID), gz = Math.floor(tz / GRID);
    const gy = Math.floor((ty + 0.5) / GRID);
    const bx = gx * GRID, bz = gz * GRID, by = gy * GRID;
    if (type === 'floor') {
      for (let z = bz; z <= bz + GRID; z++) for (let x = bx; x <= bx + GRID; x++) out.push([x, by, z]);
    } else if (type === 'ramp') {
      // staircase rising in the facing direction; 1-block steps so actors auto-step up
      for (let s = 0; s <= GRID; s++) for (let w = 0; w <= GRID; w++) {
        const along = sgn > 0 ? s : GRID - s;
        if (ax === 'x') out.push([bx + along, by + s, bz + w]);
        else out.push([bx + w, by + s, bz + along]);
      }
    } else if (type === 'cone') {
      for (let l = 0; l < 3; l++) {
        const lo = l, hi = GRID - l;
        for (let z = bz + lo; z <= bz + hi; z++) for (let x = bx + lo; x <= bx + hi; x++) {
          if (l < 2 && x !== bx + lo && x !== bx + hi && z !== bz + lo && z !== bz + hi) continue;
          out.push([x, by + l, z]);
        }
      }
    }
    return out;
  }

  // Keep only cells that are free (air/water) and don't trap an actor.
  filter(blocks) {
    const w = this.game.world;
    return blocks.filter(([x, y, z]) => {
      if (!w.inBounds(x, y, z)) return false;
      if (!replaceable(w.get(x, y, z))) return false;
      for (const a of this.game.actors) {
        if (!a.alive || a.state === 'bus') continue;
        const r = a.radius;
        if (x + 1 > a.pos.x - r && x < a.pos.x + r && z + 1 > a.pos.z - r && z < a.pos.z + r && y + 1 > a.pos.y && y < a.pos.y + a.height) return false;
      }
      return true;
    });
  }

  showGhost(actor, type, mat) {
    const blocks = this.filter(this.compute(actor, type));
    const m = new THREE.Matrix4();
    let n = 0;
    for (const [x, y, z] of blocks) { if (n >= 64) break; m.makeTranslation(x + 0.5, y + 0.5, z + 0.5); this.ghost.setMatrixAt(n++, m); }
    this.ghost.count = n;
    this.ghost.instanceMatrix.needsUpdate = true;
    const ok = actor.mats[mat] >= PIECE_COST && n > 0;
    this.ghostMat.color.set(ok ? 0x3fa8ff : 0xff4040);
    return blocks;
  }

  hideGhost() { this.ghost.count = 0; }

  // Local placement. Returns true if placed.
  place(actor, type, mat) {
    if (this.game.noBuild || actor.mats[mat] < PIECE_COST) return false;
    const blocks = this.filter(this.compute(actor, type));
    if (!blocks.length) return false;
    actor.mats[mat] -= PIECE_COST;
    const id = `${actor.id}:${++this.counter}`;
    this.create(id, mat, blocks);
    this.game.net.send({ t: 'piece', id, mat, blocks });
    this.game.audio.play('build', { pos: actor.pos, vol: 0.8 });
    if (actor !== this.game.player) this.game.soundPing('build', actor.pos, actor.id + 'b');
    this.game.events.emit('build', actor);
    return true;
  }

  create(id, mat, blocks) {
    const w = this.game.world;
    const blockId = BUILD_BLOCK[mat];
    const idxs = [];
    for (const [x, y, z] of blocks) {
      if (!replaceable(w.get(x, y, z))) continue;
      w.set(x, y, z, blockId);
      const i = w.idx(x, y, z);
      idxs.push(i);
      this.blockPiece.set(i, id);
    }
    this.pieces.set(id, { id, blocks: idxs, hp: PIECE_HP[mat], maxHp: PIECE_HP[mat], mat });
  }

  pieceAt(x, y, z) {
    const id = this.blockPiece.get(this.game.world.idx(x, y, z));
    return id ? this.pieces.get(id) : null;
  }

  // Apply damage to a piece; returns true if destroyed. Deterministic on all clients.
  damagePiece(piece, dmg) {
    piece.hp -= dmg;
    if (piece.hp > 0) return false;
    this.destroy(piece);
    return true;
  }

  destroy(piece) {
    const w = this.game.world;
    const SXZ = SX * SZ;
    let cx = 0, cy = 0, cz = 0;
    for (const i of piece.blocks) {
      if (this.blockPiece.get(i) !== piece.id) continue;
      const y = Math.floor(i / SXZ), r = i - y * SXZ, z = Math.floor(r / SX), x = r - z * SX;
      w.set(x, y, z, B.AIR);
      this.blockPiece.delete(i);
      cx = x; cy = y; cz = z;
      if (Math.random() < 0.25) this.game.effects.burst(x + 0.5, y + 0.5, z + 0.5, this.game.blockColor(BUILD_BLOCK[piece.mat]), 2, 4);
    }
    this.pieces.delete(piece.id);
    this.game.audio.play('break', { pos: { x: cx, y: cy, z: cz } });
  }

  // When a block is removed by other means (explosion), forget its ownership.
  forget(i) {
    const id = this.blockPiece.get(i);
    if (!id) return;
    this.blockPiece.delete(i);
  }
}
