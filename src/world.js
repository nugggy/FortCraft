// Voxel world: storage, deterministic generation, raycasting, collision.
import { B, BLOCKS, SOLID, PASS } from './blocks.js';
import { makeNoise2D, fbm, mulberry32 } from './noise.js';

export const SX = 320, SY = 64, SZ = 320, CHUNK = 16;
export const WATER_LEVEL = 12;
export const CX = SX / CHUNK, CZ = SZ / CHUNK;

export const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOW: 3, SWAMP: 4, BEACH: 5, OCEAN: 6 };
export const BIOMES = [
  { name: 'Plains', color: '#86c55a' },
  { name: 'Forest', color: '#3f8a35' },
  { name: 'Desert', color: '#e3cf8f' },
  { name: 'Snowy Peaks', color: '#eef4fa' },
  { name: 'Swamp', color: '#5b7a3c' },
  { name: 'Beach', color: '#eadfa6' },
  { name: 'Ocean', color: '#2d6fc4' },
];

const POI_NAMES = {
  city: ['Pixel Plaza', 'Tilted Tiles', 'Blockburg'],
  town: ['Pleasant Pines', 'Creeper Creek', 'Blocky Bay', 'Cobble Corner', 'Mossy Mews', 'Lucky Landing', 'Snoozy Shores'],
  farm: ['Haystack Hollow', 'Fertile Fields'],
  temple: ['Sandy Sphinx'],
  lighthouse: ['Beacon Bluff'],
  castle: ['Castle Cobble'],
  mine: ['Diamond Dig'],
  factory: ['Rusty Works'],
  lake: ['Loot Lake'],
};

const WL = WATER_LEVEL;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

// Deterministic per-block hash in [0, 1), used for ores so they cost no rand() calls.
function hash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.data = new Uint8Array(SX * SY * SZ);
    this.dirty = new Set();
    this.blockDamage = new Map();
    this.pois = [];
    this.chests = [];      // [x,y,z] of chest blocks at generation
    this.lootSpots = [];   // [x,y,z] floor loot positions
    this.buildings = [];
    this.biome = new Uint8Array(SX * SZ); // BIOME index per column
    this.road = new Uint8Array(SX * SZ);  // 1 where a road or bridge runs
  }

  idx(x, y, z) { return x + SX * (z + SZ * y); }
  inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ; }

  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return y < 0 ? B.BEDROCK : B.AIR;
    return this.data[x + SX * (z + SZ * y)];
  }

  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.data[i] === id) return;
    this.data[i] = id;
    this.blockDamage.delete(i);
    const cx = x >> 4, cz = z >> 4;
    this.dirty.add(cx + cz * CX);
    const lx = x & 15, lz = z & 15;
    if (lx === 0 && cx > 0) this.dirty.add(cx - 1 + cz * CX);
    if (lx === 15 && cx < CX - 1) this.dirty.add(cx + 1 + cz * CX);
    if (lz === 0 && cz > 0) this.dirty.add(cx + (cz - 1) * CX);
    if (lz === 15 && cz < CZ - 1) this.dirty.add(cx + (cz + 1) * CX);
  }

  // Raw write used during generation (no dirty tracking).
  put(x, y, z, id) {
    if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return;
    this.data[x + SX * (z + SZ * y)] = id;
  }

  isSolid(x, y, z) {
    if (y < 0) return true;
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return true; // invisible map border
    if (y >= SY) return false;
    return SOLID[this.data[x + SX * (z + SZ * y)]] === 1;
  }

  collides(minx, miny, minz, maxx, maxy, maxz) {
    const x0 = Math.floor(minx), x1 = Math.floor(maxx - 1e-6);
    const y0 = Math.floor(miny), y1 = Math.floor(maxy - 1e-6);
    const z0 = Math.floor(minz), z1 = Math.floor(maxz - 1e-6);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          if (this.isSolid(x, y, z)) return true;
    return false;
  }

  // Top solid block y at column (or -1).
  topSolid(x, z) {
    x = Math.max(0, Math.min(SX - 1, x | 0)); z = Math.max(0, Math.min(SZ - 1, z | 0));
    for (let y = SY - 1; y >= 0; y--) if (SOLID[this.data[x + SX * (z + SZ * y)]]) return y;
    return -1;
  }

  // Ground height (first air above top solid, ignoring water).
  groundY(x, z) { return this.topSolid(x, z) + 1; }

  // Amanatides & Woo voxel traversal. pass(id) => true to ignore a block.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, pass = defaultPass) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tdx = sx ? Math.abs(1 / dx) : Infinity;
    const tdy = sy ? Math.abs(1 / dy) : Infinity;
    const tdz = sz ? Math.abs(1 / dz) : Infinity;
    let tmx = sx > 0 ? (x + 1 - ox) * tdx : sx < 0 ? (ox - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - oy) * tdy : sy < 0 ? (oy - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - oz) * tdz : sz < 0 ? (oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let guard = 0; guard < 1024; guard++) {
      if (y >= SY && sy >= 0) return null;
      const id = this.get(x, y, z);
      if (id !== B.AIR && !pass(id)) return { id, x, y, z, nx, ny, nz, t };
      if (tmx < tmy && tmx < tmz) { t = tmx; x += sx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { t = tmy; y += sy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tmz; z += sz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxDist) return null;
      if (y < 0) return { id: B.BEDROCK, x, y, z, nx, ny, nz, t };
    }
    return null;
  }

  // Clear line of sight between two points (water and plants are see-through, cutout blocks are not).
  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return !this.raycast(a.x, a.y, a.z, dx / d, dy / d, dz / d, d);
  }

  // ---------------------------------------------------------------- generation
  generate() {
    const seed = this.seed;
    const rand = mulberry32(seed);
    const nElev = makeNoise2D(seed + 1), nRidge = makeNoise2D(seed + 2), nCoast = makeNoise2D(seed + 3);
    const nDetail = makeNoise2D(seed + 4), nTemp = makeNoise2D(seed + 5), nMoist = makeNoise2D(seed + 6);
    const nRiver = makeNoise2D(seed + 7), nPatch = makeNoise2D(seed + 8);
    const N = SX * SZ;
    const H = new Int16Array(N), mask = new Float32Array(N);
    const cold = new Float32Array(N), dry = new Float32Array(N), wet = new Float32Array(N), moist = new Float32Array(N);
    const biome = this.biome, road = this.road;
    const R = SX * 0.46;
    const lake = { x: SX / 2 + (rand() - 0.5) * 50, z: SZ / 2 + (rand() - 0.5) * 50, r: 19 + rand() * 5 };

    // --- heights and climate
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX;
      const dx = (x - SX / 2) / R, dz = (z - SZ / 2) / R;
      const d = Math.sqrt(dx * dx + dz * dz) + 0.14 * nCoast(x * 0.016, z * 0.016);
      const m = smooth((1 - d) / 0.25);
      const t = fbm(nTemp, x * 0.005 + 300, z * 0.005, 3) * 1.8;
      const mo = fbm(nMoist, x * 0.005, z * 0.005 + 300, 3) * 1.8;
      const c = smooth((-t - 0.12) * 2.4);
      const dr = smooth((t - 0.12) * 2.6) * smooth((0.05 - mo) * 2.6);
      const w = smooth((mo - 0.28) * 2.6) * (1 - c) * (1 - dr);
      const e = fbm(nElev, x * 0.011, z * 0.011, 4);
      const ridge = 1 - Math.abs(fbm(nRidge, x * 0.007 + 50, z * 0.007, 3));
      const r4 = ridge * ridge * ridge * ridge;
      const land = 17 + e * 8 * (1 - dr * 0.55) + r4 * (12 + c * 34) * m;
      let h = WL - 5 + m * land;
      h = h * (1 - w * m) + (WL + 1.4 + e * 2.5) * w * m; // swamps sit just above the water
      const rv = Math.abs(fbm(nRiver, x * 0.0042, z * 0.0042, 2));
      if (m > 0.3 && rv < 0.032) { const k = smooth((1 - rv / 0.032) * 1.6); h = h * (1 - k) + (WL - 2) * k; }
      const ld = Math.hypot(x - lake.x, z - lake.z) / (lake.r * (1 + 0.15 * nCoast(x * 0.05, z * 0.05)));
      if (ld < 1.5) { const k = smooth((1.5 - ld) / 0.6); h = h * (1 - k) + (WL - 3) * k; }
      if (ld < 0.32) h = Math.max(h, WL + 2.4);
      H[i] = Math.max(2, Math.min(SY - 8, Math.round(h)));
      mask[i] = m; cold[i] = c; dry[i] = dr; wet[i] = w; moist[i] = mo;
    }
    const biomeOf = (i) => {
      const h = H[i];
      if (h < WL && mask[i] < 0.55) return BIOME.OCEAN;
      if (h <= WL + 1) return wet[i] > 0.5 ? BIOME.SWAMP : BIOME.BEACH;
      if (cold[i] > 0.5 || h > 40) return BIOME.SNOW;
      if (dry[i] > 0.35) return BIOME.DESERT;
      if (wet[i] > 0.4) return BIOME.SWAMP;
      return moist[i] > -0.05 ? BIOME.FOREST : BIOME.PLAINS;
    };
    const ci = (x, z) => Math.max(0, Math.min(SX - 1, Math.round(x))) + Math.max(0, Math.min(SZ - 1, Math.round(z))) * SX;
    const hAt = (x, z) => H[ci(x, z)];

    // --- plan POIs and buildings
    const rects = [], plans = [], mines = [];
    const overlaps = (r) => rects.some(o => r.x0 - 3 < o.x1 && r.x1 + 3 > o.x0 && r.z0 - 3 < o.z1 && r.z1 + 3 > o.z0);
    const landOK = (x, z) => {
      if (x < 14 || z < 14 || x > SX - 14 || z > SZ - 14) return false;
      const h = hAt(x, z);
      return h >= WL + 2 && h <= 38;
    };
    const areaOK = (cx, cz, w, d) => {
      const pts = [[cx, cz], [cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2]];
      if (!pts.every(([x, z]) => landOK(x, z))) return false;
      const hs = pts.map(([x, z]) => hAt(x, z));
      return Math.max(...hs) - Math.min(...hs) <= 9;
    };
    const far = (x, z, minD) => this.pois.every(p => Math.hypot(p.x - x, p.z - z) >= minD);
    const nameFor = (type) => {
      const used = new Set(this.pois.map(p => p.name));
      const free = POI_NAMES[type].filter(n => !used.has(n));
      return free.length ? free[(rand() * free.length) | 0] : `${POI_NAMES[type][0]} ${this.pois.length + 1}`;
    };
    const addPoi = (type, x, z) => { const p = { name: nameFor(type), x: Math.round(x), z: Math.round(z), type }; this.pois.push(p); return p; };
    const search = (pred, tries = 500, minD = 48) => {
      for (let a = 0; a < tries; a++) {
        const x = 20 + ((rand() * (SX - 40)) | 0), z = 20 + ((rand() * (SZ - 40)) | 0);
        if (far(x, z, minD) && pred(x, z)) return [x, z];
      }
      return null;
    };
    const tryPlan = (kind, cx, cz, w, d, floors, extra = {}) => {
      const r = { x0: Math.round(cx - w / 2), z0: Math.round(cz - d / 2) };
      r.x1 = r.x0 + w; r.z1 = r.z0 + d;
      if (!extra.force) {
        if (!landOK(r.x0, r.z0) || !landOK(r.x1, r.z1) || !landOK(r.x0, r.z1) || !landOK(r.x1, r.z0) || !landOK(cx, cz)) return false;
        if (overlaps(r)) return false;
      }
      rects.push(r);
      plans.push({ kind, ...r, w, d, floors, ...extra });
      return true;
    };

    // Loot Lake with a little island house
    addPoi('lake', lake.x, lake.z);
    tryPlan('house', lake.x, lake.z, 7, 7, 1, { force: true, base: WL + 3 });

    // Landmarks
    let at = search((x, z) => biomeOf(ci(x, z)) === BIOME.DESERT && areaOK(x, z, 19, 19));
    if (at) { addPoi('temple', at[0], at[1]); tryPlan('temple', at[0], at[1], 17, 17, 1); }

    at = search((x, z) => {
      if (!landOK(x, z) || hAt(x, z) > WL + 8) return false;
      for (let a = 0; a < 8; a++) {
        const ox = x + Math.cos(a * Math.PI / 4) * 11, oz = z + Math.sin(a * Math.PI / 4) * 11;
        if (hAt(ox, oz) < WL && mask[ci(ox, oz)] < 0.6) return true;
      }
      return false;
    }, 1500);
    if (at) { addPoi('lighthouse', at[0], at[1]); tryPlan('lighthouse', at[0], at[1], 7, 7, 1); }

    at = search((x, z) => hAt(x, z) >= 21 && hAt(x, z) <= 36 && areaOK(x, z, 27, 27));
    if (at) { addPoi('castle', at[0], at[1]); tryPlan('castle', at[0], at[1], 25, 25, 1, { margin: 6 }); }

    let mineDir = null;
    at = search((x, z) => {
      if (!landOK(x, z) || hAt(x, z) < 18) return false;
      const h = hAt(x, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let ok = hAt(x + dx * 12, z + dz * 12) >= h + 6 && hAt(x + dx * 24, z + dz * 24) >= h + 5;
        for (let s = 0; ok && s <= 30; s += 3) if (hAt(x + dx * s, z + dz * s) <= WL + 1) ok = false;
        if (ok) { mineDir = [dx, dz]; return true; }
      }
      return false;
    }, 1500);
    if (at) {
      const [dx, dz] = mineDir, [ex, ez] = at;
      const xs = [ex - 3, ex + 3, ex + dx * 30 - 3, ex + dx * 30 + 3], zs = [ez - 3, ez + 3, ez + dz * 30 - 3, ez + dz * 30 + 3];
      const r = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
      if (!overlaps(r)) {
        addPoi('mine', ex, ez);
        rects.push(r);
        mines.push({ ex, ez, dx, dz, rect: r });
        tryPlan('house', ex - dx * 10, ez - dz * 10, 7, 7, 1);
      }
    }

    at = search((x, z) => areaOK(x, z, 23, 15));
    if (at) { addPoi('factory', at[0], at[1]); tryPlan('factory', at[0], at[1], 21, 13, 1); }

    // Settlements
    const generic = ['city', 'town', 'town', 'city', 'farm', 'town', 'town', 'farm', 'town'];
    for (let gi = 0; gi < generic.length && this.pois.length < 12; gi++) {
      const type = generic[gi];
      at = search((x, z) => areaOK(x, z, 14, 14));
      if (!at) continue;
      const [px, pz] = at;
      const before = plans.length;
      if (type === 'city') {
        let placed = 0;
        for (let a = 0; a < 40 && placed < 5; a++) {
          const ang = rand() * Math.PI * 2, rr = placed === 0 ? 0 : 10 + rand() * 12;
          const s = rand() < 0.5 ? 9 : 11;
          if (tryPlan('tower', px + Math.cos(ang) * rr, pz + Math.sin(ang) * rr, s, s, 3 + ((rand() * 3) | 0))) placed++;
        }
      } else if (type === 'town') {
        let placed = 0;
        for (let a = 0; a < 50 && placed < 6; a++) {
          const ang = rand() * Math.PI * 2, rr = 6 + rand() * 18;
          const w = 7 + ((rand() * 4) | 0), d = 7 + ((rand() * 4) | 0);
          if (tryPlan('house', px + Math.cos(ang) * rr, pz + Math.sin(ang) * rr, w, d, rand() < 0.45 ? 2 : 1)) placed++;
        }
      } else {
        tryPlan('barn', px, pz, 13, 9, 1);
        for (let a = 0; a < 20; a++) {
          const ang = rand() * Math.PI * 2, rr = 12 + rand() * 10;
          if (tryPlan('house', px + Math.cos(ang) * rr, pz + Math.sin(ang) * rr, 7, 7, 1)) break;
        }
      }
      if (plans.length > before) addPoi(type, px, pz);
    }
    // lone shacks
    for (let a = 0, n = 0; a < 400 && n < 12; a++) {
      const x = 20 + rand() * (SX - 40), z = 20 + rand() * (SZ - 40);
      if (this.pois.some(p => Math.hypot(p.x - x, p.z - z) < 30)) continue;
      if (tryPlan('house', x, z, 7, 7, 1)) n++;
    }

    // --- flatten building lots
    for (const p of plans) {
      let sum = 0, cnt = 0;
      for (let z = p.z0; z < p.z1; z++) for (let x = p.x0; x < p.x1; x++) { sum += H[ci(x, z)]; cnt++; }
      const target = p.base ?? Math.max(WL + 2, Math.round(sum / cnt));
      p.base = target;
      const M = p.margin || 4;
      for (let z = p.z0 - M - 1; z <= p.z1 + M; z++) for (let x = p.x0 - M - 1; x <= p.x1 + M; x++) {
        if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
        const ox = Math.max(p.x0 - 1 - x, 0, x - p.x1), oz = Math.max(p.z0 - 1 - z, 0, z - p.z1);
        const k = Math.min(1, Math.max(ox, oz) / M);
        const i = x + z * SX;
        H[i] = Math.round(target * (1 - k) + H[i] * k);
      }
    }
    const lot = new Uint8Array(N);
    for (const r of rects) for (let z = r.z0 - 3; z <= r.z1 + 3; z++) for (let x = r.x0 - 3; x <= r.x1 + 3; x++) {
      if (x >= 0 && z >= 0 && x < SX && z < SZ) lot[x + z * SX] = 1;
    }
    const inRect = (x, z) => rects.some(r => x >= r.x0 - 1 && x <= r.x1 && z >= r.z0 - 1 && z <= r.z1);

    // --- roads: minimum spanning tree between POIs (the lake is skipped)
    const nodes = this.pois.filter(p => p.type !== 'lake');
    const bridgeSamples = [];
    if (nodes.length > 1) {
      const inTree = [0], edges = [];
      while (inTree.length < nodes.length) {
        let best = null, bd = Infinity;
        for (const a of inTree) for (let b = 0; b < nodes.length; b++) {
          if (inTree.includes(b)) continue;
          const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
          if (d < bd) { bd = d; best = [a, b]; }
        }
        inTree.push(best[1]); edges.push(best);
      }
      for (const [ai, bi] of edges) {
        const A = nodes[ai], Bn = nodes[bi];
        const L = Math.hypot(Bn.x - A.x, Bn.z - A.z);
        const px = -(Bn.z - A.z) / L, pz = (Bn.x - A.x) / L;
        const phase = rand() * 10;
        for (let s = 0; s <= L; s += 0.7) {
          const t = s / L;
          if (s < 8 || L - s < 8) continue;
          const wob = nDetail(t * 2.5 + phase, phase) * 8 * Math.sin(Math.PI * t);
          const cx = A.x + (Bn.x - A.x) * t + px * wob, cz = A.z + (Bn.z - A.z) * t + pz * wob;
          let marked = false;
          for (let w = -1; w <= 1; w++) {
            const x = Math.round(cx + px * w), z = Math.round(cz + pz * w);
            if (x < 2 || z < 2 || x >= SX - 2 || z >= SZ - 2 || inRect(x, z)) continue;
            road[x + z * SX] = 1; marked = true;
          }
          if (marked) bridgeSamples.push([cx, cz, px, pz]);
        }
      }
      // smooth road heights so paths roll gently over the terrain
      const Hs = Int16Array.from(H);
      for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
        const i = x + z * SX;
        if (!road[i] || H[i] <= WL) continue;
        let s = 0, n = 0;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const j = Math.max(0, Math.min(SX - 1, x + dx)) + Math.max(0, Math.min(SZ - 1, z + dz)) * SX;
          if (H[j] > WL) { s += H[j]; n++; }
        }
        if (n) Hs[i] = Math.max(WL + 1, Math.round(s / n));
      }
      H.set(Hs);
    }

    // --- biomes and swamp pools
    for (let i = 0; i < N; i++) {
      biome[i] = biomeOf(i);
      if (biome[i] === BIOME.SWAMP && !road[i] && !lot[i] && H[i] <= WL + 2 && H[i] > WL) {
        const x = i % SX, z = (i / SX) | 0;
        if (nPatch(x * 0.09, z * 0.09) > 0.28) H[i] = WL;
      }
    }

    // --- fill columns
    const stoneAt = (x, y, z) => {
      const v = hash3(x, y, z, seed);
      if (v < 0.0012 && y < 16) return B.DIAMOND_ORE;
      if (v < 0.004 && y < 26) return B.GOLD_ORE;
      if (v < 0.012 && y < 42) return B.IRON_ORE;
      if (v < 0.026) return B.COAL_ORE;
      return B.STONE;
    };
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX, h = H[i], b = biome[i];
      let maxDiff = 0;
      if (x > 0) maxDiff = Math.max(maxDiff, Math.abs(H[i - 1] - h));
      if (x < SX - 1) maxDiff = Math.max(maxDiff, Math.abs(H[i + 1] - h));
      if (z > 0) maxDiff = Math.max(maxDiff, Math.abs(H[i - SX] - h));
      if (z < SZ - 1) maxDiff = Math.max(maxDiff, Math.abs(H[i + SX] - h));
      let top, fill = B.DIRT, under = 0;
      if (b === BIOME.OCEAN || b === BIOME.BEACH || h <= WL + 1) { top = B.SAND; fill = B.SAND; if (b === BIOME.SWAMP) { top = B.MUD; fill = B.DIRT; } }
      else if (b === BIOME.DESERT) { top = B.SAND; fill = B.SAND; under = B.SANDSTONE; }
      else if (b === BIOME.SNOW) top = B.SNOW;
      else if (b === BIOME.SWAMP) top = nPatch(x * 0.05 + 40, z * 0.05) > 0.15 ? B.MUD : B.GRASS;
      else top = nDetail(x * 0.05, z * 0.05) > 0.62 && h < 30 ? B.GRAVEL : B.GRASS;
      if (h > 44 && b !== BIOME.DESERT) top = B.SNOW;
      if (maxDiff >= 3 && h > WL + 1 && b !== BIOME.DESERT && !lot[i]) { top = h > 42 ? B.SNOW : B.STONE; fill = B.STONE; }
      if (road[i] && h > WL) { top = B.PATH; fill = B.DIRT; }
      const fillStart = h - 4, underStart = under ? h - 7 : fillStart;
      for (let y = 0; y < h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y < underStart) id = stoneAt(x, y, z);
        else if (y < fillStart) id = under;
        else if (y < h - 1) id = fill === B.STONE ? stoneAt(x, y, z) : fill;
        else id = top;
        this.data[x + SX * (z + SZ * y)] = id;
      }
      for (let y = h; y <= WL; y++) this.data[x + SX * (z + SZ * y)] = b === BIOME.SNOW && y === WL ? B.ICE : B.WATER;
      if (road[i] && h <= WL) this.put(x, WL + 1, z, B.PLANKS);
    }
    // bridge rails and posts
    bridgeSamples.forEach(([cx, cz, px, pz], k) => {
      if (H[ci(cx, cz)] > WL) return;
      for (const sgn of [-1, 1]) {
        const x = Math.round(cx + px * 2 * sgn), z = Math.round(cz + pz * 2 * sgn);
        if (x < 0 || z < 0 || x >= SX || z >= SZ || road[x + z * SX] || H[x + z * SX] > WL) continue;
        this.put(x, WL + 1, z, B.PLANKS);
        if (k % 4 === 0) this.put(x, WL + 2, z, B.LOG);
      }
    });

    // --- trees, plants, boulders
    for (let z = 3; z < SZ - 3; z++) for (let x = 3; x < SX - 3; x++) {
      const i = x + z * SX;
      if (lot[i] || road[i]) continue;
      const h = H[i];
      if (h <= WL) continue;
      const b = biome[i];
      const top = this.data[x + SX * (z + SZ * (h - 1))];
      if (this.data[x + SX * (z + SZ * h)] !== B.AIR) continue;
      const r = rand();
      if (r < 0.0012 && (b === BIOME.PLAINS || b === BIOME.FOREST || b === BIOME.SNOW)) { this.boulder(x, h, z, rand, b === BIOME.FOREST); continue; }
      if (b === BIOME.FOREST && top === B.GRASS) {
        if (r < 0.055) { if (rand() < 0.3) this.birch(x, h, z, rand); else this.oak(x, h, z, rand); }
        else if (r < 0.2) this.put(x, h, z, rand() < 0.3 ? B.FERN : B.TALL_GRASS);
        else if (r < 0.215) this.put(x, h, z, B.FLOWER_BLUE);
      } else if (b === BIOME.PLAINS && top === B.GRASS) {
        if (r < 0.005) this.oak(x, h, z, rand);
        else if (r < 0.008) this.birch(x, h, z, rand);
        else if (r < 0.2) this.put(x, h, z, B.TALL_GRASS);
        else if (r < 0.26) { const f = rand(); this.put(x, h, z, f < 0.45 ? B.FLOWER_YELLOW : f < 0.85 ? B.FLOWER_RED : B.FLOWER_BLUE); }
      } else if (b === BIOME.SWAMP && (top === B.GRASS || top === B.MUD)) {
        if (r < 0.03) this.darkOak(x, h, z, rand);
        else if (r < 0.26) this.put(x, h, z, rand() < 0.4 ? B.FERN : B.TALL_GRASS);
      } else if (b === BIOME.SNOW && top === B.SNOW) {
        if (r < 0.028) this.pine(x, h, z, rand);
      } else if (b === BIOME.DESERT && top === B.SAND) {
        if (r < 0.006) this.cactus(x, h, z, rand);
        else if (r < 0.016) this.put(x, h, z, B.DEAD_BUSH);
      } else if (b === BIOME.BEACH && top === B.SAND && r < 0.004) this.put(x, h, z, B.DEAD_BUSH);
    }

    // --- buildings
    for (const p of plans) {
      switch (p.kind) {
        case 'house': this.house(p, rand); break;
        case 'tower': this.tower(p, rand); break;
        case 'barn': this.barn(p, rand); break;
        case 'temple': this.temple(p, rand); break;
        case 'lighthouse': this.lighthouse(p, rand); break;
        case 'castle': this.castle(p, rand); break;
        case 'factory': this.factory(p, rand); break;
      }
      this.buildings.push(p);
    }
    for (const m of mines) this.mine(m, H[ci(m.ex, m.ez)], rand);
    // --- minecart rails out of the mine, then vending machines at named locations
    this.rails = []; this.cartSpawns = []; this.vendSpots = [];
    for (const m of mines) this.layRails(m, H[ci(m.ex, m.ez)], H, rects);
    this.placeVending(H, lot);

    // --- outdoor chests
    for (let a = 0, n = 0; a < 800 && n < 14; a++) {
      const x = 10 + ((rand() * (SX - 20)) | 0), z = 10 + ((rand() * (SZ - 20)) | 0);
      const i = x + z * SX, h = H[i];
      if (h <= WL + 1 || lot[i] || road[i]) continue;
      if (this.get(x, h, z) !== B.AIR || this.get(x, h + 1, z) !== B.AIR || !SOLID[this.get(x, h - 1, z)]) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => this.get(x + dx, h, z + dz) === B.AIR && this.get(x + dx, h + 1, z + dz) === B.AIR).length;
      if (open < 2) continue;
      this.placeChest(x, h, z);
      n++;
    }
    // floor loot scattered around POIs
    for (const poi of this.pois) for (let k = 0; k < 4; k++) {
      const x = poi.x + ((rand() * 30 - 15) | 0), z = poi.z + ((rand() * 30 - 15) | 0);
      const y = this.groundY(x, z);
      if (y > WL && this.get(x, y, z) === B.AIR) this.lootSpots.push([x, y, z]);
    }

    for (let i = 0; i < CX * CZ; i++) this.dirty.add(i);
  }

  placeChest(x, y, z) { this.put(x, y, z, B.CHEST); this.chests.push([x, y, z]); }

  // Rail track from the back of the mine, out of the entrance and across country toward the
  // nearest named location. Points are ordered; minecarts follow them. Fully deterministic.
  layRails(m, y0, H, rects) {
    // route around real building footprints (plus 1), ignoring the mine's own area
    const blocked = (x, z) => rects.some(r => r !== m.rect && x >= r.x0 - 1 && x <= r.x1 + 1 && z >= r.z0 - 1 && z <= r.z1 + 1);
    const { ex, ez, dx, dz } = m;
    const pts = [];
    for (let s = 24; s >= 1; s--) pts.push([ex + dx * s, y0, ez + dz * s]);
    const inside = pts.length;
    // pick a destination: nearest named location that isn't the lake or the mine itself
    let target = null, best = 1e9;
    for (const p of this.pois) {
      if (p.type === 'lake' || p.type === 'mine') continue;
      const d = Math.hypot(p.x - ex, p.z - ez);
      if (d > 30 && d < best) { best = d; target = p; }
    }
    const path = [[ex, ez]];
    for (let k = 1; k <= 4; k++) path.push([ex - dx * k, ez - dz * k]);
    if (target) {
      const seen = new Set(path.map(([x, z]) => x + z * SX));
      let [x, z] = path[path.length - 1];
      for (let step = 0; step < 320; step++) {
        if (Math.hypot(target.x - x, target.z - z) < 11) break;
        const ox = Math.sign(target.x - x), oz = Math.sign(target.z - z);
        const prefX = Math.abs(target.x - x) >= Math.abs(target.z - z);
        const opts = prefX ? [[ox, 0], [0, oz], [0, -oz || 1], [0, oz ? -oz : -1]] : [[0, oz], [ox, 0], [-ox || 1, 0], [ox ? -ox : -1, 0]];
        let moved = false;
        for (const [sx, sz] of opts) {
          if (!sx && !sz) continue;
          const nx = x + sx, nz = z + sz;
          if (nx < 4 || nz < 4 || nx >= SX - 4 || nz >= SZ - 4) continue;
          const i = nx + nz * SX;
          if (seen.has(i) || blocked(nx, nz)) continue;
          x = nx; z = nz; seen.add(i); path.push([x, z]); moved = true; break;
        }
        if (!moved) break;
      }
    }
    // heights: follow the ground (bridges sit above water) with at most 1 block change per step
    let prev = y0;
    for (let k = 0; k < path.length; k++) {
      const [x, z] = path[k];
      const h = k === 0 ? y0 : H[x + z * SX];
      const want = h <= WATER_LEVEL ? WATER_LEVEL + 2 : h;
      prev = Math.max(prev - 1, Math.min(prev + 1, want));
      pts.push([x, prev, z]);
    }
    if (pts.length - inside < 8) { pts.length = inside; }
    // lay it down
    pts.forEach(([x, y, z], k) => {
      for (let yy = y; yy <= y + (k < inside ? 1 : 2); yy++) {
        const cur = this.get(x, yy, z);
        if (cur !== B.CHEST && cur !== B.AIR) this.put(x, yy, z, B.AIR);
      }
      if (!SOLID[this.get(x, y - 1, z)]) {
        this.put(x, y - 1, z, B.PLANKS);
        if (k % 3 === 0) for (let yy = y - 2; yy > 0 && !SOLID[this.get(x, yy, z)]; yy--) this.put(x, yy, z, B.LOG);
      }
      this.put(x, y, z, B.RAIL);
    });
    const track = this.rails.length;
    this.rails.push({ pts });
    this.cartSpawns.push({ track, idx: 2 }, { track, idx: Math.min(pts.length - 1, inside + 2) });
    if (pts.length > inside + 20) this.cartSpawns.push({ track, idx: pts.length - 3 });
  }

  // Vending machines (two blocks tall) near the middle of named locations.
  placeVending(H, lot) {
    let n = 0;
    for (const p of this.pois) {
      if (n >= 8) break;
      if (p.type === 'lake') continue;
      let done = false;
      for (let r = 3; r <= 16 && !done; r++) {
        for (let a = 0; a < 16 && !done; a++) {
          const ang = (a / 16) * Math.PI * 2 + r * 0.7;
          const x = Math.round(p.x + Math.cos(ang) * r), z = Math.round(p.z + Math.sin(ang) * r);
          if (x < 6 || z < 6 || x >= SX - 6 || z >= SZ - 6) continue;
          const y = this.groundY(x, z);
          if (y <= WATER_LEVEL + 1 || y > SY - 4) continue;
          const below = this.get(x, y - 1, z);
          if (!SOLID[below] || below === B.RAIL || below === B.CHEST) continue;
          const free = (xx, yy, zz) => { const id = this.get(xx, yy, zz); return id === B.AIR || BLOCKS[id].plant && id !== B.RAIL; };
          if (!free(x, y, z) || !free(x, y + 1, z) || !free(x, y + 2, z)) continue;
          // need at least one open side to stand at
          const fronts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([fx, fz]) => free(x + fx, y, z + fz) && free(x + fx, y + 1, z + fz) && SOLID[this.get(x + fx, y - 1, z + fz)]);
          if (!fronts.length) continue;
          this.put(x, y, z, B.VEND_LOW); this.put(x, y + 1, z, B.VEND_HIGH);
          this.vendSpots.push([x, y, z, fronts[0][0], fronts[0][1], p.name]);
          done = true; n++;
        }
      }
    }
  }

  // ---------------------------------------------------------------- trees and rocks
  oak(x, y, z, rand) {
    const h = 4 + ((rand() * 3) | 0);
    for (let i = 0; i < h; i++) this.put(x, y + i, z, B.LOG);
    const top = y + h;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || rand() < 0.5)) continue;
        if (this.get(x + dx, top + dy, z + dz) === B.AIR) this.put(x + dx, top + dy, z + dz, B.LEAVES);
      }
    }
  }

  birch(x, y, z, rand) {
    const h = 5 + ((rand() * 3) | 0);
    for (let i = 0; i < h; i++) this.put(x, y + i, z, B.BIRCH_LOG);
    const top = y + h;
    for (let dy = -3; dy <= 1; dy++) {
      const r = dy >= 0 || dy === -3 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (r === 2 || rand() < 0.6)) continue;
        if (this.get(x + dx, top + dy, z + dz) === B.AIR) this.put(x + dx, top + dy, z + dz, B.BIRCH_LEAVES);
      }
    }
  }

  darkOak(x, y, z, rand) {
    const h = 4 + ((rand() * 2) | 0);
    for (let i = 0; i < h; i++) this.put(x, y + i, z, B.DARK_LOG);
    const top = y + h;
    for (let dy = -1; dy <= 1; dy++) {
      const r = dy === 1 ? 2 : 3;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1 || (dy === -1 && rand() < 0.45)) continue;
        if (this.get(x + dx, top + dy, z + dz) === B.AIR) this.put(x + dx, top + dy, z + dz, B.DARK_LEAVES);
      }
    }
  }

  pine(x, y, z, rand) {
    const h = 6 + ((rand() * 3) | 0);
    for (let i = 0; i < h; i++) this.put(x, y + i, z, B.LOG);
    for (let dy = 2; dy <= h + 1; dy++) {
      const r = dy >= h ? (dy === h + 1 ? 0 : 1) : (dy % 2 ? 1 : 2);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        if (this.get(x + dx, y + dy, z + dz) === B.AIR) this.put(x + dx, y + dy, z + dz, B.PINE_LEAVES);
      }
    }
  }

  cactus(x, y, z, rand) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.get(x + dx, y, z + dz) !== B.AIR) return;
    const h = 1 + ((rand() * 3) | 0);
    for (let i = 0; i < h; i++) this.put(x, y + i, z, B.CACTUS);
  }

  boulder(x, y, z, rand, mossy) {
    const r = 1 + rand() * 1.5;
    for (let dy = -1; dy <= r; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy * 1.6 + dz * dz <= r * r + rand() * 0.8) {
        const k = rand();
        this.put(x + dx, y + dy, z + dz, mossy && k < 0.35 ? B.MOSSY_COBBLE : k < 0.4 ? B.COBBLE : B.STONE);
      }
    }
  }

  // Square spiral staircase around (cx, cz) at radius r. The doorway cell gets the
  // highest step of the first loop so the climb starts right next to the door.
  spiral(cx, cz, r, y0, y1, block, door) {
    const ring = [];
    for (let x = cx - r; x < cx + r; x++) ring.push([x, cz - r]);
    for (let z = cz - r; z < cz + r; z++) ring.push([cx + r, z]);
    for (let x = cx + r; x > cx - r; x--) ring.push([x, cz + r]);
    for (let z = cz + r; z > cz - r; z--) ring.push([cx - r, z]);
    let k = ring.findIndex(([x, z]) => x === door[0] && z === door[1]);
    if (k < 0) k = ring.length - 1;
    const steps = [];
    for (let i = 0; y0 + i <= y1; i++) {
      const [x, z] = ring[(k + 1 + i) % ring.length];
      this.put(x, y0 + i, z, block);
      steps.push([x, y0 + i, z]);
    }
    return steps;
  }

  // ---------------------------------------------------------------- buildings
  // Generic storeyed box building. Storey pitch is 4: walls 3 high, slab on top.
  shell(p, rand, wall, opts) {
    const { x0, z0, w, d, base, floors } = p;
    const x1 = x0 + w - 1, z1 = z0 + d - 1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      this.put(x, base - 1, z, opts.floorBlock);
      for (let y = base; y < base + floors * 4 + 1; y++) this.put(x, y, z, B.AIR);
    }
    for (let f = 0; f < floors; f++) {
      const wy = base + f * 4;
      for (let y = wy; y < wy + 3; y++) {
        for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) this.put(x, y, z, wall);
        for (let z = z0; z <= z1; z++) for (const x of [x0, x1]) this.put(x, y, z, wall);
        if (opts.pillar) for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this.put(x, y, z, opts.pillar);
      }
      const wy1 = wy + 1;
      for (let x = x0 + 1; x < x1; x++) if ((x - x0) % opts.winStep === opts.winOff) { this.put(x, wy1, z0, B.GLASS); this.put(x, wy1, z1, B.GLASS); }
      for (let z = z0 + 1; z < z1; z++) if ((z - z0) % opts.winStep === opts.winOff) { this.put(x0, wy1, z, B.GLASS); this.put(x1, wy1, z, B.GLASS); }
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.put(x, wy + 3, z, f === floors - 1 ? opts.roofSlab : opts.floorBlock);
      if (f < floors - 1) {
        for (let s = 0; s < 3; s++) this.put(x0 + 1 + s, wy + s, z1 - 1, opts.floorBlock);
        for (let s = 0; s < 3; s++) { this.put(x0 + 1 + s, wy + 3, z1 - 1, B.AIR); this.put(x0 + 1 + s, wy + 3, z1 - 2, B.AIR); }
        this.put(x0 + 1, wy + 1, z1, wall);
      }
      if (rand() < opts.chestChance) this.placeChest(x1 - 1, wy, z0 + 1 + ((rand() * (d - 3)) | 0));
      this.lootSpots.push([x0 + (w >> 1), wy, z0 + (d >> 1)]);
    }
    const dx = x0 + (w >> 1);
    this.put(dx, base, z0, B.AIR); this.put(dx, base + 1, z0, B.AIR);
    this.put(dx, base - 1, z0 - 1, opts.floorBlock);
    this.put(dx, base, z0 - 1, B.AIR); this.put(dx, base + 1, z0 - 1, B.AIR);
  }

  house(p, rand) {
    const walls = [B.PLANKS, B.COBBLE, B.HOUSE_BRICK, B.PLANKS, B.MOSSY_COBBLE];
    const wall = walls[(rand() * walls.length) | 0];
    this.shell(p, rand, wall, { floorBlock: B.PLANKS, roofSlab: B.PLANKS, pillar: B.LOG, winStep: 3, winOff: 1, chestChance: 0.65 });
    const { x0, z0, w, d, base, floors } = p;
    const yTop = base + floors * 4 - 1;
    for (let k = 0; ; k++) {
      const za = z0 - 1 + k, zb = z0 + d - k;
      if (za > zb) break;
      const y = yTop + 1 + k;
      for (let x = x0 - 1; x <= x0 + w; x++) { this.put(x, y, za, B.ROOF); this.put(x, y, zb, B.ROOF); }
      if (k > 0) for (let z = za + 1; z < zb; z++) { this.put(x0, y, z, wall); this.put(x0 + w - 1, y, z, wall); }
    }
  }

  tower(p, rand) {
    this.shell(p, rand, B.CONCRETE, { floorBlock: B.CONCRETE, roofSlab: B.CONCRETE, pillar: null, winStep: 2, winOff: 1, chestChance: 0.5 });
    const { x0, z0, w, d, base, floors } = p;
    const yTop = base + floors * 4;
    for (let x = x0; x < x0 + w; x++) { this.put(x, yTop, z0, B.CONCRETE); this.put(x, yTop, z0 + d - 1, B.CONCRETE); }
    for (let z = z0; z < z0 + d; z++) { this.put(x0, yTop, z, B.CONCRETE); this.put(x0 + w - 1, yTop, z, B.CONCRETE); }
    if (rand() < 0.6) this.placeChest(x0 + 2, yTop, z0 + 2);
  }

  barn(p, rand) {
    this.shell(p, rand, B.PLANKS, { floorBlock: B.PLANKS, roofSlab: B.PLANKS, pillar: B.LOG, winStep: 4, winOff: 2, chestChance: 1 });
    const { x0, z0, w, d, base } = p;
    const yTop = base + 3;
    for (let k = 0; ; k++) {
      const za = z0 - 1 + k, zb = z0 + d - k;
      if (za > zb) break;
      for (let x = x0 - 1; x <= x0 + w; x++) { this.put(x, yTop + 1 + k, za, B.ROOF); this.put(x, yTop + 1 + k, zb, B.ROOF); }
    }
    for (let i = 0; i < 6; i++) {
      const x = x0 - 2 - ((rand() * 3) | 0), z = z0 + ((rand() * d) | 0);
      const y = this.groundY(x, z);
      this.put(x, y, z, B.CRATE);
      if (rand() < 0.4) this.put(x, y + 1, z, B.CRATE);
    }
  }

  // Sandstone pyramid with a lit treasure chamber.
  temple(p) {
    const { x0, z0, base } = p;
    const c = x0 + 8, cz = z0 + 8;
    for (let z = z0 - 1; z <= z0 + 17; z++) for (let x = x0 - 1; x <= x0 + 17; x++) {
      this.put(x, base - 1, z, B.SANDSTONE);
      for (let y = base; y < base + 10; y++) this.put(x, y, z, B.AIR);
    }
    for (let k = 0; k <= 8; k++) {
      for (let z = z0 + k; z <= z0 + 16 - k; z++) for (let x = x0 + k; x <= x0 + 16 - k; x++) this.put(x, base + k, z, B.SANDSTONE);
    }
    this.put(c, base + 8, cz, B.LAMP);
    for (let z = z0 + 4; z <= z0 + 12; z++) for (let x = x0 + 4; x <= x0 + 12; x++) for (let y = base; y <= base + 3; y++) this.put(x, y, z, B.AIR);
    for (const [px, pz] of [[x0 + 6, z0 + 6], [x0 + 10, z0 + 6], [x0 + 6, z0 + 10], [x0 + 10, z0 + 10]]) for (let y = base; y <= base + 3; y++) this.put(px, y, pz, B.SANDSTONE);
    this.put(x0 + 3, base + 2, cz, B.LAMP); this.put(x0 + 13, base + 2, cz, B.LAMP); this.put(c, base + 2, z0 + 13, B.LAMP);
    for (let z = z0 - 1; z <= z0 + 4; z++) for (let x = c - 1; x <= c + 1; x++) for (let y = base; y <= base + 2; y++) this.put(x, y, z, B.AIR);
    for (let y = base; y <= base + 3; y++) { this.put(c - 2, y, z0 - 1, B.SANDSTONE); this.put(c + 2, y, z0 - 1, B.SANDSTONE); }
    this.placeChest(x0 + 5, base, z0 + 11);
    this.placeChest(x0 + 11, base, z0 + 11);
    this.lootSpots.push([c, base, cz]);
  }

  // Striped lighthouse with a spiral stair and a lamp room up top.
  lighthouse(p) {
    const { x0, z0, base } = p;
    const cx = x0 + 3, cz = z0 + 3, top = base + 19;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) this.put(cx + dx, base - 1, cz + dz, B.COBBLE);
    for (let y = base; y <= top + 8; y++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) this.put(cx + dx, y, cz + dz, B.AIR);
    for (let y = base; y <= top; y++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      if (ring === 3) this.put(cx + dx, y, cz + dz, ((((y - base) / 4) | 0) % 2) ? B.RED_WOOL : B.WHITE_WOOL);
      else if (ring <= 1) this.put(cx + dx, y, cz + dz, B.WHITE_WOOL);
    }
    this.put(cx - 3, base, cz, B.AIR); this.put(cx - 3, base + 1, cz, B.AIR);
    this.put(cx - 4, base - 1, cz, B.COBBLE);
    const steps = this.spiral(cx, cz, 2, base, top, B.PLANKS, [cx - 2, cz]);
    const hole = new Set(steps.filter(s => s[1] >= top - 2).map(s => s[0] + ',' + s[2]));
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (!hole.has((cx + dx) + ',' + (cz + dz))) this.put(cx + dx, top + 1, cz + dz, B.PLANKS);
      if (Math.max(Math.abs(dx), Math.abs(dz)) === 4) this.put(cx + dx, top + 2, cz + dz, B.GLASS);
    }
    for (let y = top + 2; y <= top + 4; y++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) this.put(cx, y, cz, B.LAMP);
      else this.put(cx + dx, y, cz + dz, Math.abs(dx) === 1 && Math.abs(dz) === 1 ? B.LOG : B.GLASS);
    }
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) this.put(cx + dx, top + 5, cz + dz, B.ROOF);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.put(cx + dx, top + 6, cz + dz, B.ROOF);
    this.put(cx, top + 7, cz, B.RED_WOOL);
    this.placeChest(cx + 3, top + 2, cz);
    this.lootSpots.push([cx - 5, base, cz]);
  }

  // Stone castle: curtain walls, four climbable corner towers and a keep.
  castle(p, rand) {
    const { x0, z0, base } = p;
    const x1 = x0 + 24, z1 = z0 + 24, cxm = x0 + 12, czm = z0 + 12;
    const stone = () => (rand() < 0.18 ? B.MOSSY_COBBLE : B.STONE_BRICK);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      this.put(x, base - 1, z, (x + z) % 5 === 0 ? B.MOSSY_COBBLE : B.COBBLE);
      for (let y = base; y <= base + 14; y++) this.put(x, y, z, B.AIR);
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const band = x < x0 + 2 || x > x1 - 2 || z < z0 + 2 || z > z1 - 2;
      if (!band) continue;
      for (let y = base; y <= base + 5; y++) this.put(x, y, z, stone());
      if ((x === x0 || x === x1 || z === z0 || z === z1) && (x + z) % 2 === 0) this.put(x, base + 6, z, stone());
    }
    // gate with lamps
    for (let x = cxm - 1; x <= cxm + 1; x++) for (let y = base; y <= base + 3; y++) for (let z = z0; z <= z0 + 1; z++) this.put(x, y, z, B.AIR);
    this.put(cxm - 2, base + 3, z0, B.LAMP); this.put(cxm + 2, base + 3, z0, B.LAMP);
    this.put(cxm, base - 1, z0 - 1, B.COBBLE);
    // stairs up to the wall walk
    for (let s = 0; s <= 5; s++) this.put(cxm + 3 + s, base + s, z0 + 2, B.STONE_BRICK);
    // corner towers
    const corners = [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]];
    corners.forEach(([tcx, tcz], ti) => {
      for (let y = base; y <= base + 9; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        this.put(tcx + dx, y, tcz + dz, ring === 2 ? stone() : dx === 0 && dz === 0 ? B.STONE_BRICK : B.AIR);
      }
      const sx = Math.sign(cxm - tcx);
      this.put(tcx + 2 * sx, base, tcz, B.AIR); this.put(tcx + 2 * sx, base + 1, tcz, B.AIR);
      const steps = this.spiral(tcx, tcz, 1, base, base + 9, B.STONE_BRICK, [tcx + sx, tcz]);
      const hole = new Set(steps.filter(s => s[1] >= base + 7).map(s => s[0] + ',' + s[2]));
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (!hole.has((tcx + dx) + ',' + (tcz + dz))) this.put(tcx + dx, base + 10, tcz + dz, B.STONE_BRICK);
        if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && (dx + dz) % 2 === 0) this.put(tcx + dx, base + 11, tcz + dz, stone());
      }
      if (ti % 2 === 0) {
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          if (!hole.has((tcx + dx) + ',' + (tcz + dz))) { this.placeChest(tcx + dx, base + 11, tcz + dz); break; }
        }
      }
    });
    // keep
    const keep = { x0: cxm - 4, z0: czm - 2, w: 9, d: 9, base, floors: 2 };
    this.shell(keep, rand, B.STONE_BRICK, { floorBlock: B.COBBLE, roofSlab: B.STONE_BRICK, pillar: B.MOSSY_COBBLE, winStep: 3, winOff: 1, chestChance: 0.8 });
    for (let x = keep.x0; x < keep.x0 + 9; x++) for (const z of [keep.z0, keep.z0 + 8]) if (x % 2 === 0) this.put(x, base + 8, z, B.STONE_BRICK);
    for (let z = keep.z0; z < keep.z0 + 9; z++) for (const x of [keep.x0, keep.x0 + 8]) if (z % 2 === 0) this.put(x, base + 8, z, B.STONE_BRICK);
    this.placeChest(x0 + 3, base, czm);
    this.lootSpots.push([cxm, base, z0 + 5], [x1 - 4, base, czm]);
  }

  // Concrete and metal warehouse with a mezzanine and a brick chimney.
  factory(p, rand) {
    const { x0, z0, base } = p;
    const x1 = x0 + 20, z1 = z0 + 12, c = x0 + 10;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      this.put(x, base - 1, z, B.CONCRETE);
      for (let y = base; y <= base + 8; y++) this.put(x, y, z, B.AIR);
    }
    for (let y = base; y <= base + 6; y++) {
      const blk = y === base + 3 ? B.METAL : B.CONCRETE;
      for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) this.put(x, y, z, y === base + 5 && x % 2 === 1 && x > x0 && x < x1 ? B.GLASS : blk);
      for (let z = z0; z <= z1; z++) for (const x of [x0, x1]) this.put(x, y, z, y === base + 5 && z % 2 === 1 && z > z0 && z < z1 ? B.GLASS : blk);
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.put(x, base + 7, z, B.METAL);
    for (let x = c - 1; x <= c + 1; x++) for (let y = base; y <= base + 3; y++) this.put(x, y, z0, B.AIR);
    this.put(c, base - 1, z0 - 1, B.CONCRETE);
    // mezzanine and stairs
    for (let z = z1 - 3; z <= z1 - 1; z++) for (let x = x0 + 1; x <= x1 - 1; x++) this.put(x, base + 3, z, B.METAL);
    for (let s = 0; s < 3; s++) this.put(x0 + 2 + s, base + s, z1 - 4, B.METAL);
    // crates
    for (let i = 0; i < 8; i++) {
      const x = x0 + 2 + ((rand() * 6) | 0), z = z0 + 2 + ((rand() * 4) | 0);
      this.put(x, base, z, B.CRATE);
      if (rand() < 0.5) this.put(x, base + 1, z, B.CRATE);
    }
    // chimney
    const top = Math.min(SY - 2, base + 19);
    for (let y = base; y <= top; y++) for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
      this.put(x1 - 3 + dx, y, z0 + 1 + dz, dx === 1 && dz === 1 ? B.AIR : B.HOUSE_BRICK);
    }
    this.placeChest(x1 - 2, base, z0 + 6);
    this.placeChest(x1 - 2, base + 4, z1 - 2);
    this.lootSpots.push([c, base, z0 + 6], [x0 + 8, base + 4, z1 - 2]);
  }

  // Tunnel dug into a hillside with timber supports, lamps, ore veins and a treasure room.
  mine(m, y0, rand) {
    const { ex, ez, dx, dz } = m;
    const px = -dz, pz = dx, len = 22;
    const at = (s, w) => [ex + dx * s + px * w, ez + dz * s + pz * w];
    const oreFor = (s) => { const k = rand(); return s > 14 && k < 0.15 ? B.DIAMOND_ORE : k < 0.35 ? B.GOLD_ORE : k < 0.65 ? B.IRON_ORE : B.COAL_ORE; };
    for (let s = 0; s <= len + 5; s++) {
      const room = s > len;
      const half = room ? 2 : 1;
      for (let w = -half - 1; w <= half + 1; w++) {
        const [x, z] = at(s, w);
        const edge = Math.abs(w) === half + 1;
        for (let y = y0 - 1; y <= y0 + 3; y++) {
          const cur = this.get(x, y, z);
          if (y === y0 - 1) { if (!edge) this.put(x, y, z, B.GRAVEL); continue; }
          if (!edge && y <= y0 + 2 + (room ? 1 : 0)) { this.put(x, y, z, B.AIR); continue; }
          if (cur !== B.AIR && cur !== B.WATER && rand() < 0.3) this.put(x, y, z, oreFor(s));
        }
      }
      if (!room && s > 1 && s % 5 === 2) {
        for (const w of [-1, 1]) { const [x, z] = at(s, w); this.put(x, y0, z, B.LOG); this.put(x, y0 + 1, z, B.LOG); }
        for (let w = -1; w <= 1; w++) { const [x, z] = at(s, w); this.put(x, y0 + 2, z, B.PLANKS); }
      }
      if (!room && s % 7 === 4) { const [x, z] = at(s, 2); this.put(x, y0 + 1, z, B.LAMP); }
    }
    // entrance frame
    for (const w of [-2, 2]) { const [x, z] = at(0, w); for (let y = y0; y <= y0 + 3; y++) this.put(x, y, z, B.LOG); }
    for (let w = -2; w <= 2; w++) { const [x, z] = at(0, w); this.put(x, y0 + 3, z, B.PLANKS); }
    // side alcove with a chest, plus the treasure room
    for (let y = y0; y <= y0 + 2; y++) { const [x, z] = at(10, 2); this.put(x, y, z, B.AIR); }
    { const [x, z] = at(10, 2); this.put(x, y0 - 1, z, B.GRAVEL); this.placeChest(x, y0, z); }
    { const [x, z] = at(len + 5, -2); this.placeChest(x, y0, z); }
    { const [x, z] = at(len + 5, 2); this.placeChest(x, y0, z); }
    { const [x, z] = at(len + 3, 0); this.put(x, y0 + 3, z, B.LAMP); this.lootSpots.push([x, y0, z]); }
    { const [x, z] = at(6, 0); this.lootSpots.push([x, y0, z]); }
  }
}

function defaultPass(id) { return PASS[id] === 1; }
