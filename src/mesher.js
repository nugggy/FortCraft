// Chunk mesher: face culling + per-vertex ambient occlusion.
import * as THREE from '../vendor/three.module.min.js';
import { BLOCKS, OCCLUDES, B } from './blocks.js';
import { SX, SY, SZ, CHUNK, CX, CZ } from './world.js';

// Corners listed BL, BR, TR, TL as seen from outside the face.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tile: 'side' },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tile: 'side' },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: 'top' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: 'bottom' },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tile: 'side' },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tile: 'side' },
];
const AO_LEVELS = [0.42, 0.62, 0.82, 1.0];

// Precompute AO neighbour offsets per face corner.
for (const f of FACES) {
  const axis = f.n.findIndex(v => v !== 0);
  const tang = [0, 1, 2].filter(a => a !== axis);
  f.ao = f.c.map(c => {
    const du = [0, 0, 0], dv = [0, 0, 0];
    du[tang[0]] = c[tang[0]] ? 1 : -1;
    dv[tang[1]] = c[tang[1]] ? 1 : -1;
    const base = f.n;
    return [
      [base[0] + du[0], base[1] + du[1], base[2] + du[2]],
      [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]],
      [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]],
    ];
  });
}

export class ChunkMesher {
  constructor(world, scene, atlas) {
    this.world = world; this.scene = scene; this.atlas = atlas;
    this.opaqueMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5 });
    this.waterMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    this.plantMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    this.meshes = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  dispose() {
    for (const m of this.meshes.values()) { for (const x of m) { if (x) { x.geometry.dispose(); this.group.remove(x); } } }
    this.meshes.clear();
    this.scene.remove(this.group);
  }

  update(budget = 4) {
    const dirty = this.world.dirty;
    let n = 0;
    for (const key of dirty) {
      dirty.delete(key);
      this.rebuild(key % CX, Math.floor(key / CX));
      if (++n >= budget) break;
    }
    return dirty.size;
  }

  rebuild(cx, cz) {
    const key = cx + cz * CX;
    const old = this.meshes.get(key);
    if (old) for (const m of old) if (m) { this.group.remove(m); m.geometry.dispose(); }
    const opaque = new Buf(), water = new Buf(), plants = new Buf();
    const w = this.world, data = w.data, uvs = this.atlas.uvs;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const occ = (x, y, z) => {
      if (y < 0) return 1;
      if (x < 0 || z < 0 || x >= SX || z >= SZ || y >= SY) return 0;
      return OCCLUDES[data[x + SX * (z + SZ * y)]];
    };
    for (let y = 0; y < SY; y++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          const id = data[x + SX * (z + SZ * y)];
          if (id === B.AIR) continue;
          const def = BLOCKS[id];
          if (def.flat) { plants.flat(x, y, z, uvs[def.top], w.get(x - 1, y, z) === id || w.get(x + 1, y, z) === id); continue; }
          if (def.plant) { plants.cross(x, y, z, uvs[def.side]); continue; }
          const isWater = def.liquid;
          for (let fi = 0; fi < 6; fi++) {
            const f = FACES[fi];
            const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
            const nid = w.get(nx, ny, nz);
            if (ny < 0) continue;
            if (isWater) {
              if (nid !== B.AIR && !BLOCKS[nid].cutout && !BLOCKS[nid].plant) continue;
            } else {
              if (OCCLUDES[nid]) continue;
              if (nid === id && def.cutout) continue;
            }
            const uv = uvs[def[f.tile]];
            const buf = isWater ? water : opaque;
            const ao = [0, 0, 0, 0];
            for (let k = 0; k < 4; k++) {
              if (isWater) { ao[k] = 3; continue; }
              const a = f.ao[k];
              const s1 = occ(x + a[0][0], y + a[0][1], z + a[0][2]);
              const s2 = occ(x + a[1][0], y + a[1][1], z + a[1][2]);
              const c = occ(x + a[2][0], y + a[2][1], z + a[2][2]);
              ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
            }
            const topDrop = isWater && fi === 2 ? 0.12 : 0;
            buf.quad(x, y, z, f, uv, ao, topDrop, id === B.LAMP ? 3.2 : 1);
          }
        }
      }
    }
    const meshes = [opaque.build(this.opaqueMat), water.build(this.waterMat), plants.build(this.plantMat)];
    const [om, wm, pm] = meshes;
    if (om) { om.castShadow = true; om.receiveShadow = true; }
    if (pm) { pm.castShadow = true; pm.receiveShadow = true; }
    if (wm) { wm.receiveShadow = true; wm.renderOrder = 2; }
    for (const m of meshes) if (m) this.group.add(m);
    this.meshes.set(key, meshes);
  }
}

class Buf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  quad(x, y, z, f, uv, ao, topDrop, glow = 1) {
    const cuv = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    for (let k = 0; k < 4; k++) {
      const c = f.c[k];
      this.pos.push(x + c[0], y + c[1] - (c[1] ? topDrop : 0), z + c[2]);
      this.nor.push(f.n[0], f.n[1], f.n[2]);
      this.uv.push(cuv[k][0], cuv[k][1]);
      const l = glow > 1 ? glow : AO_LEVELS[ao[k]];
      this.col.push(l, l, l);
    }
    const n = this.n;
    if (ao[0] + ao[2] < ao[1] + ao[3]) this.idx.push(n + 1, n + 2, n + 3, n + 1, n + 3, n);
    else this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  // Single quad lying just above the floor (rails). alongX rotates the texture so rails follow x.
  flat(x, y, z, uv, alongX) {
    const n = this.n, h = y + 0.06;
    this.pos.push(x, h, z + 1, x + 1, h, z + 1, x + 1, h, z, x, h, z);
    for (let k = 0; k < 4; k++) this.nor.push(0, 1, 0);
    if (alongX) this.uv.push(uv[0], uv[1], uv[0], uv[3], uv[2], uv[3], uv[2], uv[1]);
    else this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    for (let k = 0; k < 4; k++) this.col.push(1, 1, 1);
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  // Two crossed quads for plants; normals point up so lighting stays even.
  cross(x, y, z, uv) {
    const a = 0.15, b = 0.85, h = 0.95;
    const quads = [[[x + a, z + a], [x + b, z + b]], [[x + b, z + a], [x + a, z + b]]];
    for (const [[x0, z0], [x1, z1]] of quads) {
      const n = this.n;
      this.pos.push(x0, y, z0, x1, y, z1, x1, y + h, z1, x0, y + h, z0);
      for (let k = 0; k < 4; k++) this.nor.push(0, 1, 0);
      this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
      this.col.push(0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 1, 1, 1, 1, 1, 1);
      this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      this.n += 4;
    }
  }
  build(mat) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.matrixAutoUpdate = false;
    return m;
  }
}
