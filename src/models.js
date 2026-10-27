// Blocky models: characters, held items, pickups, glider, battle bus.
import * as THREE from '../vendor/three.module.min.js';
import { pixelTexture } from './textures.js';
import { RARITY, AMMO } from './items.js';

export const OUTFITS = [
  { name: 'Recruit', skin: '#e0ac80', hair: '#4a2f1b', shirt: '#3b6fd1', pants: '#2d3b5a', shoes: '#222', eyes: '#2a4a8a' },
  { name: 'Banana Bob', skin: '#f4d03f', hair: '#c9a21d', shirt: '#f4d03f', pants: '#e6c22a', shoes: '#6b4a1b', eyes: '#111', face: 'banana' },
  { name: 'Skelly', skin: '#ececec', hair: '#ececec', shirt: '#151515', pants: '#151515', shoes: '#0a0a0a', eyes: '#000', face: 'skull', pattern: 'ribs' },
  { name: 'Goldie', skin: '#e8b84a', hair: '#c99320', shirt: '#f0c040', pants: '#c99320', shoes: '#8a6410', eyes: '#3a2a08', pattern: 'suit' },
  { name: 'Pinky', skin: '#f0c8a0', hair: '#ff5fb0', shirt: '#ff5fb0', pants: '#2b2b3a', shoes: '#ff5fb0', eyes: '#3a2a50', pattern: 'stripe' },
  { name: 'Creep', skin: '#5fbf4a', hair: '#4aa63a', shirt: '#5fbf4a', pants: '#4aa63a', shoes: '#2f7a24', eyes: '#111', face: 'creeper' },
  { name: 'Fishy', skin: '#f08a3c', hair: '#f08a3c', shirt: '#2a3a5a', pants: '#1e2a40', shoes: '#111', eyes: '#111', face: 'fish' },
  { name: 'Ranger', skin: '#c48a5c', hair: '#2a1a10', shirt: '#4f6b3a', pants: '#3b4f2c', shoes: '#2a2216', eyes: '#2a1a10', pattern: 'camo' },
  { name: 'Aviator', skin: '#d9a07a', hair: '#6b4a2b', shirt: '#7a4f2a', pants: '#3a3a3a', shoes: '#1a1a1a', eyes: '#2a4a6a', pattern: 'jacket' },
  { name: 'Frosty', skin: '#e8f0ff', hair: '#bfe0ff', shirt: '#6fb4ff', pants: '#e8f0ff', shoes: '#4a7ab0', eyes: '#1a3a6a', pattern: 'stripe' },
  // Locker unlocks (see src/ui/cosmetics.js for unlock levels)
  { name: 'Sir Blockalot', skin: '#9aa3ad', hair: '#9aa3ad', shirt: '#a7b0bb', pants: '#7d8792', shoes: '#4a5058', eyes: '#111', face: 'knight', helmet: '#9aa3ad', pattern: 'armour', accent: '#c0392b' },
  { name: 'Cosmo', skin: '#f2f2f2', hair: '#f2f2f2', shirt: '#f2f2f2', pants: '#e2e2e2', shoes: '#9a9a9a', eyes: '#111', face: 'astro', helmet: '#f2f2f2', pattern: 'spacesuit', accent: '#ff7a1a' },
  { name: 'Captain Cubebeard', skin: '#d9a07a', hair: '#3a2410', shirt: '#2b2b3a', pants: '#3a2a1a', shoes: '#1a1a1a', eyes: '#2a1a10', face: 'pirate', pattern: 'pirate', accent: '#c0392b' },
  { name: 'Bolt-9', skin: '#8a96a3', hair: '#6c7681', shirt: '#7f8b97', pants: '#5f6a75', shoes: '#3b434b', eyes: '#3fe0ff', face: 'robot', helmet: '#8a96a3', pattern: 'robot', accent: '#3fe0ff' },
  { name: 'Chef Crumble', skin: '#f0c8a0', hair: '#ffffff', shirt: '#ffffff', pants: '#2b2b2b', shoes: '#111', eyes: '#3a2a10', face: 'chef', pattern: 'apron', accent: '#e23b3b' },
  { name: 'Shadow Step', skin: '#d9a07a', hair: '#141418', shirt: '#141418', pants: '#141418', shoes: '#0a0a0a', eyes: '#fff', face: 'ninja', helmet: '#141418', pattern: 'ninja', accent: '#c0392b' },
];

const P = 1.8 / 32;
const matCache = new Map();
function lambert(color) {
  const key = 'c' + color;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(key);
}
function texMat(tex) { return new THREE.MeshLambertMaterial({ map: tex, transparent: false }); }

function headFaces(o) {
  const front = pixelTexture([8, 8], (c) => {
    c.fillStyle = o.skin; c.fillRect(0, 0, 8, 8);
    c.fillStyle = o.hair; c.fillRect(0, 0, 8, 2);
    if (o.face === 'creeper') {
      c.fillStyle = '#111';
      c.fillRect(1, 2, 2, 2); c.fillRect(5, 2, 2, 2); c.fillRect(3, 4, 2, 3); c.fillRect(2, 5, 1, 3); c.fillRect(5, 5, 1, 3);
    } else if (o.face === 'skull') {
      c.fillStyle = '#111'; c.fillRect(1, 3, 2, 2); c.fillRect(5, 3, 2, 2); c.fillRect(3, 5, 2, 1);
      c.fillRect(2, 7, 1, 1); c.fillRect(4, 7, 1, 1);
    } else if (o.face === 'fish') {
      c.fillStyle = '#fff'; c.fillRect(1, 2, 2, 2); c.fillRect(5, 2, 2, 2);
      c.fillStyle = '#111'; c.fillRect(2, 3, 1, 1); c.fillRect(5, 3, 1, 1);
      c.fillStyle = '#c0502a'; c.fillRect(2, 5, 4, 2);
    } else if (o.face === 'banana') {
      c.fillStyle = '#6b4a1b'; c.fillRect(3, 0, 2, 1);
      c.fillStyle = '#111'; c.fillRect(2, 3, 1, 2); c.fillRect(5, 3, 1, 2);
      c.fillRect(2, 6, 4, 1);
    } else if (o.face === 'knight') {
      c.fillStyle = o.helmet; c.fillRect(0, 0, 8, 8);
      c.fillStyle = '#111'; c.fillRect(1, 3, 6, 1); c.fillRect(3, 4, 2, 3);
      c.fillStyle = '#c2cad3'; c.fillRect(0, 0, 8, 1);
      c.fillStyle = o.accent; c.fillRect(3, 0, 2, 1);
    } else if (o.face === 'astro') {
      c.fillStyle = o.helmet; c.fillRect(0, 0, 8, 8);
      c.fillStyle = '#1b2a4a'; c.fillRect(1, 2, 6, 4);
      c.fillStyle = '#6fd0ff'; c.fillRect(2, 2, 2, 1); c.fillRect(1, 3, 1, 1);
      c.fillStyle = o.accent; c.fillRect(0, 7, 8, 1);
    } else if (o.face === 'pirate') {
      c.fillStyle = o.accent; c.fillRect(0, 0, 8, 2);
      c.fillStyle = '#fff'; c.fillRect(2, 0, 1, 1); c.fillRect(5, 1, 1, 1);
      c.fillStyle = '#111'; c.fillRect(1, 3, 3, 2); c.fillRect(0, 3, 8, 1);
      c.fillStyle = '#fff'; c.fillRect(5, 4, 1, 1);
      c.fillStyle = o.hair; c.fillRect(1, 6, 6, 2);
      c.fillStyle = '#c0502a'; c.fillRect(3, 6, 2, 1);
    } else if (o.face === 'robot') {
      c.fillStyle = o.helmet; c.fillRect(0, 0, 8, 8);
      c.fillStyle = '#2a3038'; c.fillRect(1, 2, 6, 3);
      c.fillStyle = o.eyes; c.fillRect(2, 3, 1, 1); c.fillRect(5, 3, 1, 1);
      c.fillStyle = '#2a3038'; c.fillRect(2, 6, 4, 1);
      c.fillStyle = '#c2cad3'; c.fillRect(3, 6, 1, 1); c.fillRect(5, 6, 1, 1);
    } else if (o.face === 'chef') {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 8, 3);
      c.fillStyle = '#e6e6e6'; c.fillRect(0, 2, 8, 1);
      c.fillStyle = '#fff'; c.fillRect(1, 4, 2, 1); c.fillRect(5, 4, 2, 1);
      c.fillStyle = o.eyes; c.fillRect(2, 4, 1, 1); c.fillRect(5, 4, 1, 1);
      c.fillStyle = '#3a2410'; c.fillRect(2, 6, 4, 1); c.fillRect(1, 5, 1, 1); c.fillRect(6, 5, 1, 1);
    } else if (o.face === 'ninja') {
      c.fillStyle = o.helmet; c.fillRect(0, 0, 8, 8);
      c.fillStyle = o.skin; c.fillRect(1, 3, 6, 2);
      c.fillStyle = '#111'; c.fillRect(2, 3, 1, 1); c.fillRect(5, 3, 1, 1);
      c.fillStyle = o.accent; c.fillRect(0, 2, 8, 1);
    } else {
      c.fillStyle = '#fff'; c.fillRect(1, 4, 2, 1); c.fillRect(5, 4, 2, 1);
      c.fillStyle = o.eyes; c.fillRect(2, 4, 1, 1); c.fillRect(5, 4, 1, 1);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(3, 6, 2, 1);
      c.fillStyle = o.hair; c.fillRect(0, 2, 1, 1); c.fillRect(7, 2, 1, 1);
    }
  });
  const side = pixelTexture([8, 8], (c) => {
    c.fillStyle = o.skin; c.fillRect(0, 0, 8, 8);
    c.fillStyle = o.hair; c.fillRect(0, 0, 8, 3); c.fillRect(0, 3, 3, 2);
    if (o.helmet) { c.fillStyle = o.helmet; c.fillRect(0, 0, 8, 8); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 7, 8, 1); }
    if (o.face === 'pirate') { c.fillStyle = o.accent; c.fillRect(0, 0, 8, 2); }
    if (o.face === 'chef') { c.fillStyle = '#fff'; c.fillRect(0, 0, 8, 3); }
  });
  const back = pixelTexture([8, 8], (c) => {
    c.fillStyle = o.hair; c.fillRect(0, 0, 8, 6); c.fillStyle = o.skin; c.fillRect(0, 6, 8, 2);
    if (o.helmet) { c.fillStyle = o.helmet; c.fillRect(0, 0, 8, 8); if (o.face === 'ninja') { c.fillStyle = o.accent; c.fillRect(0, 2, 8, 1); c.fillRect(3, 3, 1, 3); } }
    if (o.face === 'pirate') { c.fillStyle = o.accent; c.fillRect(0, 0, 8, 2); c.fillRect(1, 2, 1, 2); }
    if (o.face === 'chef') { c.fillStyle = '#fff'; c.fillRect(0, 0, 8, 3); }
  });
  const top = lambert(o.helmet || (o.face === 'chef' ? '#ffffff' : o.face === 'pirate' ? o.accent : o.hair)), bottom = lambert(o.skin);
  // BoxGeometry order: +x, -x, +y, -y, +z, -z (model faces -z)
  return [texMat(side), texMat(side), top, bottom, texMat(back), texMat(front)];
}

function bodyFaces(o) {
  const draw = (back) => (c) => {
    c.fillStyle = o.shirt; c.fillRect(0, 0, 8, 12);
    if (o.pattern === 'ribs') { c.fillStyle = '#ececec'; for (let y = 3; y < 10; y += 2) c.fillRect(1, y, 6, 1); c.fillRect(3, 1, 2, 10); }
    else if (o.pattern === 'stripe') { c.fillStyle = '#fff'; c.fillRect(0, 5, 8, 2); }
    else if (o.pattern === 'camo') { c.fillStyle = '#2f4a22'; [[1, 1], [5, 3], [2, 7], [6, 9], [0, 10]].forEach(([x, y]) => c.fillRect(x, y, 2, 2)); }
    else if (o.pattern === 'jacket') { c.fillStyle = '#c9a27a'; c.fillRect(0, 0, 8, 2); if (!back) { c.fillStyle = '#2a1a10'; c.fillRect(3, 2, 2, 10); } }
    else if (o.pattern === 'suit') { if (!back) { c.fillStyle = '#fff'; c.fillRect(3, 0, 2, 5); c.fillStyle = '#111'; c.fillRect(3, 1, 2, 4); } }
    else if (o.pattern === 'armour') {
      c.fillStyle = '#c2cad3'; c.fillRect(0, 0, 8, 1); c.fillRect(0, 6, 8, 1);
      if (!back) { c.fillStyle = o.accent; c.fillRect(3, 1, 2, 5); c.fillRect(1, 3, 6, 1); }
      c.fillStyle = '#6b4a2b'; c.fillRect(0, 9, 8, 1); c.fillStyle = '#d4af37'; c.fillRect(3, 9, 2, 1);
    }
    else if (o.pattern === 'spacesuit') {
      if (!back) { c.fillStyle = '#3a4a6a'; c.fillRect(2, 2, 4, 3); c.fillStyle = '#ff4a4a'; c.fillRect(2, 2, 1, 1); c.fillStyle = '#6ee05a'; c.fillRect(4, 2, 1, 1); c.fillStyle = '#ffd23f'; c.fillRect(3, 4, 2, 1); }
      else { c.fillStyle = '#c8c8c8'; c.fillRect(1, 1, 6, 8); c.fillStyle = '#9a9a9a'; c.fillRect(2, 2, 4, 6); }
      c.fillStyle = o.accent; c.fillRect(0, 8, 8, 1);
    }
    else if (o.pattern === 'pirate') {
      c.fillStyle = '#f2ecd8'; if (!back) c.fillRect(3, 0, 2, 6);
      c.fillStyle = '#6b4a2b'; c.fillRect(0, 8, 8, 1); c.fillStyle = '#d4af37'; c.fillRect(3, 8, 2, 1);
      if (!back) { c.fillStyle = '#d4af37'; c.fillRect(1, 2, 1, 1); c.fillRect(1, 4, 1, 1); c.fillRect(6, 2, 1, 1); c.fillRect(6, 4, 1, 1); }
    }
    else if (o.pattern === 'robot') {
      c.fillStyle = '#5f6a75'; c.fillRect(0, 0, 8, 1); c.fillRect(0, 11, 8, 1);
      if (!back) { c.fillStyle = '#2a3038'; c.fillRect(2, 2, 4, 4); c.fillStyle = o.accent; c.fillRect(3, 3, 2, 2); c.fillStyle = '#c2cad3'; c.fillRect(1, 8, 1, 1); c.fillRect(6, 8, 1, 1); }
      else { c.fillStyle = '#2a3038'; c.fillRect(2, 2, 4, 6); c.fillStyle = '#c2cad3'; c.fillRect(3, 3, 2, 1); c.fillRect(3, 5, 2, 1); }
    }
    else if (o.pattern === 'apron') {
      if (!back) { c.fillStyle = '#ececec'; c.fillRect(1, 4, 6, 8); c.fillStyle = o.accent; c.fillRect(2, 1, 1, 1); c.fillRect(5, 1, 1, 1); c.fillRect(2, 3, 1, 1); c.fillRect(5, 3, 1, 1); }
      else { c.fillStyle = '#ececec'; c.fillRect(0, 5, 8, 1); }
    }
    else if (o.pattern === 'ninja') {
      c.fillStyle = o.accent; c.fillRect(0, 7, 8, 1);
      if (!back) { c.fillStyle = '#2a2a30'; c.fillRect(0, 0, 3, 7); c.fillRect(5, 0, 3, 7); }
      else { c.fillStyle = '#6b6b70'; for (let i = 0; i < 6; i++) c.fillRect(1 + i, 1 + i, 1, 1); }
    }
    else if (!back) { c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(2, 2, 4, 3); }
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 11, 8, 1);
  };
  const front = texMat(pixelTexture([8, 12], draw(false)));
  const backM = texMat(pixelTexture([8, 12], draw(true)));
  const s = lambert(o.shirt);
  return [s, s, s, lambert(o.pants), backM, front];
}

function limbFaces(top, bottom, bottomRows) {
  const tex = texMat(pixelTexture([4, 12], (c) => {
    c.fillStyle = top; c.fillRect(0, 0, 4, 12);
    c.fillStyle = bottom; c.fillRect(0, 12 - bottomRows, 4, bottomRows);
  }));
  return [tex, tex, lambert(top), lambert(bottom), tex, tex];
}

const outfitMats = new Map();
function getOutfitMats(i) {
  if (outfitMats.has(i)) return outfitMats.get(i);
  const o = OUTFITS[i % OUTFITS.length];
  const m = {
    head: headFaces(o), body: bodyFaces(o),
    arm: limbFaces(o.shirt, o.skin, 4),
    leg: limbFaces(o.pants, o.shoes, 2),
  };
  outfitMats.set(i, m);
  return m;
}

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w},${h},${d}`;
  if (!boxGeoCache.has(k)) boxGeoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxGeoCache.get(k);
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// opts.glider: glider cosmetic id (see GLIDER_IDS); defaults to the striped canopy.
export function makeCharacter(outfit, opts = {}) {
  const mats = getOutfitMats(outfit);
  const root = new THREE.Group();
  const pose = new THREE.Group(); pose.position.y = 0.9; root.add(pose);
  const inner = new THREE.Group(); inner.position.y = -0.9; pose.add(inner);

  const mkLimb = (x, y, mat) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    pivot.add(box(4 * P, 12 * P, 4 * P, mat, 0, -4 * P, 0));
    inner.add(pivot);
    return pivot;
  };
  const legL = new THREE.Group(); legL.position.set(-2 * P, 12 * P, 0);
  legL.add(box(4 * P, 12 * P, 4 * P, mats.leg, 0, -6 * P, 0)); inner.add(legL);
  const legR = new THREE.Group(); legR.position.set(2 * P, 12 * P, 0);
  legR.add(box(4 * P, 12 * P, 4 * P, mats.leg, 0, -6 * P, 0)); inner.add(legR);
  inner.add(box(8 * P, 12 * P, 4 * P, mats.body, 0, 18 * P, 0));
  const head = new THREE.Group(); head.position.set(0, 24 * P, 0);
  head.add(box(8 * P, 8 * P, 8 * P, mats.head, 0, 4 * P, 0)); inner.add(head);
  const armL = mkLimb(-6 * P, 22 * P, mats.arm);
  const armR = mkLimb(6 * P, 22 * P, mats.arm);
  const hold = new THREE.Group(); hold.position.set(0, -10 * P, 0); hold.rotation.x = -Math.PI / 2;
  armR.add(hold);

  const glider = makeGlider(outfit, opts.glider);
  glider.visible = false;
  root.add(glider);

  root.traverse(o => { if (o.isMesh && o.parent !== glider) o.castShadow = true; });
  return { root, pose, legL, legR, armL, armR, head, hold, glider, held: null, heldKey: '' };
}

// ---------------------------------------------------------------- gliders
export const GLIDER_IDS = ['default', 'umbrella', 'paperplane', 'balloons', 'rainbow', 'dragon', 'golden'];

// A thin box stretched between two points (ropes, strings, spars).
function strut(a, b, thick, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(boxGeo(thick, 1, thick), mat);
  m.scale.y = len;
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function stripedCanopy(g, a, b, trim) {
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + i * 0.5;
    const y = 3.0 - Math.abs(x) * 0.25;
    g.add(box(0.5, 0.12, 1.4, i % 2 ? a : b, x, y, 0));
    if (trim) g.add(box(0.5, 0.06, 0.08, trim, x, y - 0.08, -0.72));
  }
}

function ropes(g, mat, tops) {
  for (const t of tops) g.add(strut(new THREE.Vector3(Math.sign(t.x) * 0.34, 1.95, 0), t, 0.03, mat));
}

export function makeGlider(outfit, id = 'default') {
  const o = OUTFITS[outfit % OUTFITS.length];
  const g = new THREE.Group();
  const rope = lambert('#333333');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  switch (id) {
    case 'umbrella': {
      const red = lambert('#d8323c'), white = lambert('#f4f4f4');
      g.add(box(2.6, 0.12, 2.6, red, 0, 3.05, 0));
      g.add(box(1.9, 0.12, 1.9, white, 0, 3.17, 0));
      g.add(box(1.2, 0.12, 1.2, red, 0, 3.29, 0));
      g.add(box(0.5, 0.12, 0.5, white, 0, 3.41, 0));
      g.add(box(0.1, 0.25, 0.1, lambert('#222'), 0, 3.6, 0));
      for (const [x, z] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) g.add(box(0.14, 0.18, 0.14, white, x, 2.92, z));
      g.add(box(0.06, 1.25, 0.06, lambert('#5a3a20'), 0, 2.4, 0));
      g.add(box(0.06, 0.06, 0.25, lambert('#5a3a20'), 0, 1.8, 0.1));
      ropes(g, rope, [V(-0.9, 3.0, 0), V(0.9, 3.0, 0)]);
      break;
    }
    case 'paperplane': {
      const paper = lambert('#f6f6f0'), fold = lambert('#d2d2c8');
      for (let k = 0; k < 6; k++) g.add(box(0.3 + k * 0.48, 0.06, 0.42, k % 2 ? paper : fold, 0, 3.0 + k * 0.03, -1.15 + k * 0.42));
      g.add(box(0.08, 0.32, 2.4, fold, 0, 2.85, -0.1));
      g.add(box(0.5, 0.05, 0.3, lambert('#4fb6ff'), 0, 3.2, 0.95));
      ropes(g, rope, [V(-0.8, 3.0, 0.3), V(0.8, 3.0, 0.3)]);
      break;
    }
    case 'balloons': {
      const cols = ['#ff4f6e', '#ffd23f', '#4fb6ff', '#6ee05a', '#b65cf0', '#ff9f1c', '#ffffff'];
      const spots = [[0, 3.6, 0], [-0.55, 3.3, 0.2], [0.55, 3.3, -0.2], [-0.3, 3.0, -0.45], [0.35, 3.05, 0.45], [-0.75, 2.85, -0.1], [0.75, 2.9, 0.15]];
      const str = lambert('#dddddd');
      spots.forEach(([x, y, z], i) => {
        g.add(box(0.48, 0.55, 0.48, lambert(cols[i]), x, y, z));
        g.add(box(0.12, 0.1, 0.12, lambert(cols[i]), x, y - 0.32, z));
        g.add(strut(V(0.3, 1.95, 0), V(x, y - 0.36, z), 0.02, str));
      });
      break;
    }
    case 'rainbow': {
      const bands = ['#ff4040', '#ff9f1c', '#ffd23f', '#5cc449', '#3b9ef0', '#9a5cf0'];
      for (let i = 0; i < 6; i++) {
        const x = -1.25 + i * 0.5, y = 3.0 - Math.abs(x) * 0.28;
        bands.forEach((c, j) => g.add(box(0.5, 0.12, 0.24, lambert(c), x, y, -0.6 + j * 0.24)));
      }
      g.add(box(0.3, 0.3, 1.5, lambert('#ffffff'), -1.45, 2.55, 0)); g.add(box(0.3, 0.3, 1.5, lambert('#ffffff'), 1.45, 2.55, 0));
      ropes(g, rope, [V(-1.2, 2.7, 0), V(1.2, 2.7, 0)]);
      break;
    }
    case 'dragon': {
      const skin = lambert('#8e2a2a'), bone = lambert('#3a1414'), belly = lambert('#d8a040');
      for (const s of [-1, 1]) {
        const wing = new THREE.Group();
        wing.position.set(s * 0.25, 2.9, 0);
        wing.rotation.z = s * 0.28;
        for (let k = 0; k < 4; k++) {
          const len = 1.3 - k * 0.22;
          wing.add(box(0.42, 0.06, len, skin, s * (0.3 + k * 0.42), 0, -0.1 + k * 0.05));
          wing.add(box(0.06, 0.1, len + 0.1, bone, s * (0.52 + k * 0.42), 0.04, -0.1 + k * 0.05));
        }
        wing.add(box(1.75, 0.1, 0.1, bone, s * 0.9, 0.06, -0.72));
        g.add(wing);
      }
      g.add(box(0.36, 0.3, 1.2, belly, 0, 2.85, 0));
      g.add(box(0.34, 0.3, 0.4, skin, 0, 2.95, -0.75));
      g.add(box(0.06, 0.14, 0.06, bone, -0.1, 3.15, -0.7)); g.add(box(0.06, 0.14, 0.06, bone, 0.1, 3.15, -0.7));
      g.add(box(0.2, 0.15, 0.6, skin, 0, 2.8, 0.85));
      ropes(g, rope, [V(-0.6, 2.85, 0), V(0.6, 2.85, 0)]);
      break;
    }
    case 'golden':
      stripedCanopy(g, lambert('#f0c040'), lambert('#fff6d8'), lambert('#b8860b'));
      ropes(g, lambert('#b8860b'), [V(-0.72, 2.7, 0), V(0.72, 2.7, 0)]);
      break;
    default:
      stripedCanopy(g, lambert(o.shirt), lambert('#ffffff'));
      for (const x of [-1.2, 1.2]) { const r = box(0.03, 1.7, 0.03, rope, x * 0.6, 2.0, 0); r.rotation.z = x > 0 ? 0.55 : -0.55; g.add(r); }
  }
  return g;
}

// ---------------------------------------------------------------- pickaxe skins
export const PICKAXE_IDS = ['default', 'candy', 'fish', 'gold', 'sword', 'frost', 'diamond'];

// Built in the same frame as the default pickaxe: handle along -z, head across y at z = -0.66.
export function makePickaxeSkin(skin) {
  const g = new THREE.Group();
  const head = (mat, tip) => {
    g.add(box(0.08, 0.5, 0.1, mat, 0, 0, -0.66));
    g.add(box(0.06, 0.12, 0.1, tip || mat, 0, 0.28, -0.62));
    g.add(box(0.06, 0.12, 0.1, tip || mat, 0, -0.28, -0.62));
  };
  switch (skin) {
    case 'gold':
      g.add(box(0.06, 0.06, 0.85, lambert('#3a2410'), 0, 0, -0.25));
      head(lambert('#f0c040'), lambert('#fff0a0'));
      g.add(box(0.07, 0.07, 0.08, lambert('#e23b3b'), 0, 0, -0.66));
      break;
    case 'diamond':
      g.add(box(0.06, 0.06, 0.85, lambert('#6b4a2b'), 0, 0, -0.25));
      head(lambert('#5ce8e0'), lambert('#c8fffa'));
      break;
    case 'candy':
      for (let k = 0; k < 7; k++) g.add(box(0.07, 0.07, 0.12, lambert(k % 2 ? '#ffffff' : '#e23b3b'), 0, 0, 0.12 - k * 0.12));
      g.add(box(0.07, 0.07, 0.12, lambert('#ffffff'), 0, 0.08, -0.72));
      g.add(box(0.07, 0.12, 0.07, lambert('#e23b3b'), 0, 0.18, -0.76));
      g.add(box(0.07, 0.07, 0.14, lambert('#ffffff'), 0, 0.27, -0.7));
      g.add(box(0.07, 0.1, 0.07, lambert('#e23b3b'), 0, 0.24, -0.6));
      break;
    case 'sword':
      g.add(box(0.06, 0.06, 0.28, lambert('#3a2410'), 0, 0, 0.05));
      g.add(box(0.07, 0.3, 0.06, lambert('#d4af37'), 0, 0, -0.1));
      g.add(box(0.03, 0.12, 0.8, lambert('#d8e0e8'), 0, 0, -0.55));
      g.add(box(0.035, 0.03, 0.8, lambert('#ffffff'), 0, 0.04, -0.55));
      g.add(box(0.03, 0.06, 0.1, lambert('#d8e0e8'), 0, 0, -1.0));
      break;
    case 'fish': {
      const scale = lambert('#5a9fd8'), fin = lambert('#f08a3c');
      g.add(box(0.06, 0.06, 0.45, lambert('#6b4a2b'), 0, 0, -0.05));
      g.add(box(0.12, 0.3, 0.55, scale, 0, 0, -0.55));
      g.add(box(0.13, 0.18, 0.2, lambert('#8ac4f0'), 0, -0.04, -0.6));
      g.add(box(0.06, 0.32, 0.12, fin, 0, 0, -0.25));
      g.add(box(0.06, 0.12, 0.2, fin, 0, 0.2, -0.55));
      g.add(box(0.14, 0.05, 0.05, lambert('#111'), 0, 0.07, -0.78));
      break;
    }
    case 'frost':
      g.add(box(0.06, 0.06, 0.85, lambert('#bfe4ff'), 0, 0, -0.25));
      head(lambert('#8fd8ff'), lambert('#ffffff'));
      g.add(box(0.05, 0.22, 0.05, lambert('#e8f8ff'), 0, -0.4, -0.62));
      g.add(box(0.05, 0.14, 0.05, lambert('#e8f8ff'), 0, 0.38, -0.62));
      break;
    default:
      g.add(box(0.06, 0.06, 0.85, woodM(), 0, 0, -0.25));
      head(lambert('#9aa3ad'), lambert('#c2cad3'));
  }
  return g;
}

// ---------------------------------------------------------------- held items
const metal = () => lambert('#3a3d42'), dark = () => lambert('#24262a'), woodM = () => lambert('#6b4a2b');

export function makeItemMesh(item) {
  const g = new THREE.Group();
  if (!item) return g;
  if (item.kind === 'weapon') {
    const R = lambert(RARITY[item.rarity].color);
    switch (item.id) {
      case 'pickaxe':
        if (item.skin && item.skin !== 'default') { g.add(makePickaxeSkin(item.skin)); break; } // Locker pickaxe skins
        g.add(box(0.06, 0.06, 0.85, woodM(), 0, 0, -0.25));
        g.add(box(0.08, 0.5, 0.1, lambert('#9aa3ad'), 0, 0, -0.66));
        g.add(box(0.06, 0.12, 0.1, lambert('#c2cad3'), 0, 0.28, -0.62));
        g.add(box(0.06, 0.12, 0.1, lambert('#c2cad3'), 0, -0.28, -0.62));
        break;
      case 'ar':
        g.add(box(0.1, 0.14, 0.62, metal(), 0, 0.05, -0.22));
        g.add(box(0.05, 0.05, 0.3, dark(), 0, 0.07, -0.66));
        g.add(box(0.08, 0.12, 0.26, woodM(), 0, 0.02, 0.18));
        g.add(box(0.07, 0.2, 0.1, dark(), 0, -0.1, -0.26));
        g.add(box(0.105, 0.03, 0.3, R, 0, 0.13, -0.2));
        break;
      case 'smg':
        g.add(box(0.1, 0.14, 0.45, metal(), 0, 0.05, -0.15));
        g.add(box(0.05, 0.05, 0.15, dark(), 0, 0.06, -0.45));
        g.add(box(0.06, 0.24, 0.08, dark(), 0, -0.12, -0.18));
        g.add(box(0.105, 0.03, 0.2, R, 0, 0.13, -0.12));
        break;
      case 'shotgun':
        g.add(box(0.09, 0.1, 0.8, metal(), 0, 0.06, -0.3));
        g.add(box(0.1, 0.09, 0.25, woodM(), 0, -0.01, -0.35));
        g.add(box(0.08, 0.13, 0.28, woodM(), 0, 0.0, 0.2));
        g.add(box(0.095, 0.03, 0.18, R, 0, 0.12, -0.05));
        break;
      case 'sniper':
        g.add(box(0.09, 0.12, 0.7, lambert('#4a5a3a'), 0, 0.04, -0.15));
        g.add(box(0.05, 0.05, 0.6, dark(), 0, 0.06, -0.75));
        g.add(box(0.08, 0.08, 0.32, dark(), 0, 0.17, -0.2));
        g.add(box(0.095, 0.03, 0.2, R, 0, 0.1, 0.1));
        break;
      case 'pistol':
        g.add(box(0.08, 0.1, 0.3, metal(), 0, 0.06, -0.1));
        g.add(box(0.07, 0.18, 0.08, dark(), 0, -0.06, 0.0));
        g.add(box(0.085, 0.025, 0.14, R, 0, 0.12, -0.1));
        break;
      case 'burst':
        g.add(box(0.1, 0.14, 0.58, lambert('#3f444c'), 0, 0.05, -0.2));
        g.add(box(0.05, 0.05, 0.32, dark(), 0, 0.07, -0.64));
        g.add(box(0.08, 0.12, 0.24, lambert('#5d636c'), 0, 0.02, 0.17));
        g.add(box(0.07, 0.2, 0.1, dark(), 0, -0.1, -0.22));
        g.add(box(0.06, 0.07, 0.18, dark(), 0, 0.17, -0.18));
        g.add(box(0.105, 0.03, 0.28, R, 0, 0.12, -0.3));
        break;
      case 'rocket':
        g.add(box(0.2, 0.2, 1.1, lambert('#4f6b3a'), 0.08, 0.15, -0.2));
        g.add(box(0.24, 0.24, 0.1, dark(), 0.08, 0.15, -0.78));
        g.add(box(0.06, 0.16, 0.08, dark(), 0, -0.04, -0.1));
        g.add(box(0.21, 0.04, 0.3, R, 0.08, 0.27, -0.1));
        break;
    }
  } else if (item.kind === 'heal') {
    const cols = { bandage: '#f0ece0', medkit: '#f2f2f2', mini: '#5ab4ff', shield: '#2f7de8' };
    g.add(box(0.22, 0.26, 0.22, lambert(cols[item.id]), 0, 0.1, -0.1));
    if (item.id === 'medkit') g.add(box(0.23, 0.08, 0.08, lambert('#e23b3b'), 0, 0.12, -0.1));
    if (item.id === 'mini' || item.id === 'shield') g.add(box(0.1, 0.08, 0.1, lambert('#d8e8f8'), 0, 0.27, -0.1));
  } else if (item.kind === 'throwable' && item.id === 'grenade') {
    g.add(box(0.2, 0.24, 0.2, lambert('#4f6b3a'), 0, 0.1, -0.1));
    g.add(box(0.21, 0.04, 0.21, lambert('#3d5430'), 0, 0.12, -0.1));
    g.add(box(0.08, 0.08, 0.08, lambert('#9aa3ad'), 0, 0.26, -0.1));
    g.add(box(0.03, 0.12, 0.03, lambert('#c2cad3'), 0.07, 0.24, -0.1));
  } else if (item.kind === 'throwable') {
    g.add(box(0.22, 0.3, 0.22, lambert('#e8f6ec'), 0, 0.12, -0.1));
    g.add(box(0.23, 0.08, 0.23, lambert('#7fe07f'), 0, 0.2, -0.1));
    g.add(box(0.1, 0.08, 0.1, lambert('#9aa3ad'), 0, 0.31, -0.1));
  } else if (item.kind === 'utility') {
    g.add(box(0.5, 0.08, 0.5, lambert('#3a3d42'), 0, 0.02, -0.15));
    g.add(box(0.4, 0.05, 0.4, lambert('#2f86e0'), 0, 0.08, -0.15));
    g.add(box(0.12, 0.04, 0.2, lambert('#ffd84a'), 0, 0.11, -0.15));
  } else if (item.kind === 'ammo') {
    g.add(box(0.3, 0.2, 0.2, lambert(AMMO[item.ammo].color)));
    g.add(box(0.31, 0.05, 0.21, dark(), 0, 0.06, 0));
  } else if (item.kind === 'mats') {
    const cols = { wood: '#c9955a', brick: '#a85a44', metal: '#a7b0bb' };
    g.add(box(0.32, 0.32, 0.32, lambert(cols[item.mat])));
  }
  return g;
}

export function setHeld(model, item) {
  const key = item ? (item.kind === 'weapon' ? item.id + item.rarity + (item.skin || '') : item.kind + (item.id || '')) : 'none';
  if (model.heldKey === key) return;
  model.heldKey = key;
  if (model.held) model.hold.remove(model.held);
  model.held = makeItemMesh(item);
  model.held.scale.setScalar(item && item.kind === 'weapon' ? 1.3 : 1.15);
  model.hold.add(model.held);
}

// ---------------------------------------------------------------- pickups
const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 6, 1, true);
export function makePickupMesh(item) {
  const g = new THREE.Group();
  const m = makeItemMesh(item);
  m.scale.setScalar(item.kind === 'weapon' ? 1.1 : 1.3);
  m.rotation.y = Math.PI / 2;
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(m);
  if (item.kind === 'weapon' && item.rarity > 0) {
    const beamMat = new THREE.MeshBasicMaterial({ color: RARITY[item.rarity].hex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    beamMat.color.multiplyScalar(1.6 + item.rarity * 0.35);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 3;
    g.add(beam);
  }
  return g;
}

// ---------------------------------------------------------------- name tags
export function makeNameTag(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 28px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = Math.min(250, ctx.measureText(text).width + 20);
  ctx.fillRect(128 - w / 2, 4, w, 40);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.45, 1);
  s.position.y = 2.25;
  s.renderOrder = 10;
  return s;
}

// ---------------------------------------------------------------- battle bus
export function makeBus() {
  const g = new THREE.Group();
  const blue = lambert('#2d7fe0'), white = lambert('#f4f4f4'), glass = lambert('#9fd8ff'), black = lambert('#1a1a1a');
  g.add(box(3, 2.4, 7.5, blue, 0, 0, 0));
  g.add(box(3.05, 0.5, 7.55, white, 0, 0.9, 0));
  for (let i = 0; i < 4; i++) { g.add(box(3.1, 0.7, 1.1, glass, 0, 0.35, -2.6 + i * 1.6)); }
  g.add(box(2.6, 0.9, 0.1, glass, 0, 0.45, -3.8));
  for (const x of [-1.4, 1.4]) for (const z of [-2.5, 2.5]) g.add(box(0.4, 0.9, 0.9, black, x, -1.3, z));
  // balloon
  const bal = [lambert('#3b9ef0'), lambert('#ffffff')];
  for (let y = 0; y < 7; y++) {
    const r = Math.round(Math.sin((y + 0.5) / 7 * Math.PI) * 3.2);
    for (let k = -r; k <= r; k++) g.add(box(1, 1, 2 * r + 1, bal[(k + 10) % 2], k, 5 + y, 0));
  }
  g.add(box(1.5, 0.6, 1.5, lambert('#d0a040'), 0, 4.3, 0));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const rope = lambert('#222');
  for (const [x, z] of [[-1.2, -3], [1.2, -3], [-1.2, 3], [1.2, 3]]) g.add(box(0.06, 3.6, 0.06, rope, x, 3, z * 0.6));
  return g;
}
