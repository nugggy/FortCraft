// Weapons, consumables, rarity tables, loot rolls and HUD icons.

export const RARITY = [
  { name: 'Common', color: '#a8a8a8', hex: 0xa8a8a8 },
  { name: 'Uncommon', color: '#5cc449', hex: 0x5cc449 },
  { name: 'Rare', color: '#3b9ef0', hex: 0x3b9ef0 },
  { name: 'Epic', color: '#b65cf0', hex: 0xb65cf0 },
  { name: 'Legendary', color: '#f5a623', hex: 0xf5a623 },
];

export const WEAPONS = {
  pickaxe: { name: 'Pickaxe', melee: true, damage: 20, blockDamage: 26, rate: 1.9, range: 3.4, rarities: [0] },
  ar: { name: 'Assault Rifle', short: 'AR', ammo: 'medium', damage: [30, 31, 33, 35, 36], rate: 5.5, mag: 30, reload: [2.7, 2.6, 2.4, 2.3, 2.2], spread: 0.03, ads: 0.007, bloom: 0.006, maxBloom: 0.05, range: 160, head: 1.5, auto: true, zoom: 1.5, rarities: [0, 1, 2, 3, 4], blockMul: 1 },
  smg: { name: 'Submachine Gun', short: 'SMG', ammo: 'light', damage: [16, 17, 18, 19, 20], rate: 12, mag: 30, reload: [2.4, 2.3, 2.2, 2.1, 2.0], spread: 0.045, ads: 0.025, bloom: 0.004, maxBloom: 0.06, range: 80, head: 1.75, auto: true, zoom: 1.25, rarities: [0, 1, 2, 3] },
  shotgun: { name: 'Pump Shotgun', short: 'Shotgun', ammo: 'shells', damage: [74, 80, 86, 92, 98], pellets: 10, rate: 0.75, mag: 5, reload: [4.8, 4.6, 4.4, 4.2, 4.0], spread: 0.085, ads: 0.07, bloom: 0, maxBloom: 0, range: 35, head: 2, auto: false, zoom: 1.2, rarities: [1, 2, 3, 4] },
  sniper: { name: 'Bolt Sniper', short: 'Sniper', ammo: 'heavy', damage: [100, 105, 110, 116, 121], rate: 0.33, mag: 1, reload: [3.0, 3.0, 2.85, 2.7, 2.55], spread: 0.15, ads: 0.0, bloom: 0, maxBloom: 0, range: 400, head: 2.5, auto: false, zoom: 4.5, scope: true, rarities: [2, 3, 4] },
  pistol: { name: 'Pistol', short: 'Pistol', ammo: 'light', damage: [23, 24, 25, 26, 27], rate: 6.75, mag: 16, reload: [1.5, 1.45, 1.4, 1.35, 1.3], spread: 0.035, ads: 0.012, bloom: 0.01, maxBloom: 0.05, range: 90, head: 2, auto: false, zoom: 1.25, rarities: [0, 1, 2, 3, 4] },
  burst: { name: 'Burst Rifle', short: 'Burst', ammo: 'medium', damage: [27, 28, 30, 31, 33], rate: 2.4, burst: 3, burstGap: 0.075, mag: 30, reload: [2.8, 2.7, 2.6, 2.45, 2.3], spread: 0.02, ads: 0.004, bloom: 0.004, maxBloom: 0.03, range: 170, head: 1.5, auto: false, zoom: 1.6, rarities: [0, 1, 2, 3, 4] },
  rocket: { name: 'Rocket Launcher', short: 'Rocket', ammo: 'rockets', damage: [0, 0, 100, 110, 120], rate: 0.8, mag: 1, reload: [3, 3, 2.8, 2.6, 2.4], spread: 0.0, ads: 0, bloom: 0, maxBloom: 0, range: 300, projectile: true, speed: 50, radius: 3.6, zoom: 1.3, rarities: [3, 4] },
};

export const HEALS = {
  bandage: { name: 'Bandages', heal: 15, cap: 75, time: 3.0, max: 15, per: 5, rarity: 0 },
  medkit: { name: 'Med Kit', heal: 100, cap: 100, time: 7.0, max: 3, per: 1, rarity: 1 },
  mini: { name: 'Small Shield', shield: 25, cap: 50, time: 2.0, max: 6, per: 3, rarity: 1 },
  shield: { name: 'Shield Potion', shield: 50, cap: 100, time: 4.5, max: 3, per: 1, rarity: 2 },
};

// Throwables and utilities stack in one inventory slot and are used with fire.
export const THROWABLES = {
  grenade: { name: 'Grenade', short: 'Grenade', max: 6, per: 3, rarity: 1, cooldown: 0.9, damage: 70, radius: 3.5, fuse: 2.5 },
  medmist: { name: 'Med Mist', short: 'Med Mist', max: 2, per: 1, rarity: 3, cooldown: 1.0, heal: 5, radius: 4, duration: 6 },
};
export const UTILITIES = {
  launchpad: { name: 'Launch Pad', short: 'Launch Pad', max: 1, per: 1, rarity: 3, life: 60 },
};

// Largest stack for stackable items, or 0 when the item doesn't stack.
export function stackMax(it) {
  if (!it) return 0;
  if (it.kind === 'heal') return HEALS[it.id].max;
  if (it.kind === 'throwable') return THROWABLES[it.id].max;
  if (it.kind === 'utility') return UTILITIES[it.id].max;
  return 0;
}

export const AMMO = {
  light: { name: 'Light Ammo', color: '#8fd3ff', per: 30, max: 999 },
  medium: { name: 'Medium Ammo', color: '#9be36b', per: 30, max: 999 },
  heavy: { name: 'Heavy Ammo', color: '#4f6f9f', per: 6, max: 999 },
  shells: { name: 'Shells', color: '#ffb84a', per: 6, max: 999 },
  rockets: { name: 'Rockets', color: '#cf5050', per: 2, max: 99 },
};

export const MATS = ['wood', 'brick', 'metal'];
export const MAT_MAX = 999;

export function itemName(it) {
  if (!it) return '';
  if (it.kind === 'weapon') return `${RARITY[it.rarity].name} ${WEAPONS[it.id].name}`;
  if (it.kind === 'heal') return HEALS[it.id].name + (it.count > 1 ? ` x${it.count}` : '');
  if (it.kind === 'throwable') return THROWABLES[it.id].name + (it.count > 1 ? ` x${it.count}` : '');
  if (it.kind === 'utility') return UTILITIES[it.id].name + (it.count > 1 ? ` x${it.count}` : '');
  if (it.kind === 'ammo') return `${AMMO[it.ammo].name} x${it.count}`;
  if (it.kind === 'mats') return `${it.mat[0].toUpperCase() + it.mat.slice(1)} x${it.count}`;
  return '?';
}

export function itemRarity(it) {
  if (it.kind === 'weapon') return it.rarity;
  if (it.kind === 'heal') return HEALS[it.id].rarity;
  if (it.kind === 'throwable') return THROWABLES[it.id].rarity;
  if (it.kind === 'utility') return UTILITIES[it.id].rarity;
  return 0;
}

export function makeWeapon(id, rarity) {
  return { kind: 'weapon', id, rarity, mag: WEAPONS[id].mag };
}

function pickRarity(rand, table) {
  let r = rand(), acc = 0;
  for (let i = 0; i < table.length; i++) { acc += table[i]; if (r < acc) return i; }
  return 0;
}

const WEAPON_POOL = [['ar', 28], ['burst', 14], ['smg', 18], ['shotgun', 24], ['pistol', 14], ['sniper', 8], ['rocket', 4]];

export function rollWeapon(rand, table) {
  let total = WEAPON_POOL.reduce((s, w) => s + w[1], 0);
  let r = rand() * total, id = 'ar';
  for (const [wid, wt] of WEAPON_POOL) { if ((r -= wt) <= 0) { id = wid; break; } }
  const allowed = WEAPONS[id].rarities;
  let rar = pickRarity(rand, table);
  rar = Math.max(allowed[0], Math.min(allowed[allowed.length - 1], rar));
  return makeWeapon(id, rar);
}

export function rollHeal(rand) {
  const r = rand();
  const id = r < 0.35 ? 'bandage' : r < 0.6 ? 'mini' : r < 0.82 ? 'shield' : 'medkit';
  return { kind: 'heal', id, count: HEALS[id].per };
}

export function rollThrowable(rand) {
  if (rand() < 0.12) return { kind: 'utility', id: 'launchpad', count: 1 };
  const id = rand() < 0.75 ? 'grenade' : 'medmist';
  return { kind: 'throwable', id, count: THROWABLES[id].per };
}

export function ammoFor(weaponId, mult = 1) {
  const a = WEAPONS[weaponId].ammo;
  return { kind: 'ammo', ammo: a, count: AMMO[a].per * mult };
}

export const CHEST_TABLE = [0.22, 0.33, 0.27, 0.13, 0.05];
export const FLOOR_TABLE = [0.42, 0.32, 0.17, 0.07, 0.02];

export function rollChest(rand) {
  const w = rollWeapon(rand, CHEST_TABLE);
  const items = [w, ammoFor(w.id, 2)];
  if (rand() < 0.7) items.push(rollHeal(rand));
  if (rand() < 0.28) items.push(rollThrowable(rand));
  items.push({ kind: 'mats', mat: 'wood', count: 30 });
  if (rand() < 0.3) items.push({ kind: 'mats', mat: rand() < 0.5 ? 'brick' : 'metal', count: 20 });
  return items;
}

export function rollFloor(rand) {
  const r = rand();
  if (r < 0.55) { const w = rollWeapon(rand, FLOOR_TABLE); return [w, ammoFor(w.id)]; }
  if (r < 0.75) return [rollHeal(rand)];
  if (r < 0.85) return [rollThrowable(rand)];
  const keys = Object.keys(AMMO).filter(k => k !== 'rockets');
  const a = keys[rand() * keys.length | 0];
  return [{ kind: 'ammo', ammo: a, count: AMMO[a].per }];
}

// ---------------------------------------------------------------- icons
// 26x14 pixel grid, drawn with a black outline and a top highlight so items read clearly.
const W = '#2a2c30', M = '#4a4f57', M2 = '#5d636c', WD = '#7a5230', WD2 = '#5a3a20', OL = '#5a6b3a';
const ICON_SHAPES = {
  pickaxe: [[3, 11, 2, 2, WD], [5, 9, 2, 2, WD], [7, 7, 2, 2, WD], [9, 5, 2, 2, WD], [11, 3, 2, 2, WD],
    [6, 1, 14, 2, '#b8c2cc'], [4, 2, 3, 2, '#b8c2cc'], [19, 2, 3, 2, '#b8c2cc'], [3, 3, 2, 2, '#d8e0e8'], [21, 3, 2, 3, '#d8e0e8'], [11, 2, 3, 3, '#8a949e']],
  ar: [[0, 4, 5, 4, WD], [5, 3, 10, 4, M], [15, 4, 7, 2, W], [22, 3, 2, 3, W], [14, 6, 5, 1, M2], [9, 7, 3, 3, W], [10, 10, 3, 2, W],
    [6, 7, 2, 4, W], [8, 2, 5, 1, W], [6, 4, 8, 1, 'R']],
  smg: [[1, 4, 4, 1, W], [1, 5, 1, 2, W], [1, 7, 4, 1, W], [5, 3, 11, 4, M], [16, 4, 4, 2, W], [9, 7, 3, 6, W], [6, 7, 2, 4, W], [7, 2, 4, 1, W], [6, 4, 9, 1, 'R']],
  shotgun: [[0, 4, 7, 3, WD], [1, 7, 4, 1, WD2], [5, 6, 3, 4, WD2], [7, 3, 17, 2, M], [10, 5, 13, 1, W], [12, 5, 6, 3, WD], [8, 3, 5, 1, 'R'], [22, 2, 1, 1, '#ddd']],
  sniper: [[0, 5, 6, 4, OL], [6, 4, 8, 3, OL], [14, 5, 11, 1, W], [24, 4, 2, 3, W], [7, 1, 7, 2, '#1e2024'], [6, 1, 1, 2, '#7fd0ff'], [14, 1, 1, 2, '#7fd0ff'],
    [9, 3, 1, 1, W], [12, 3, 1, 1, W], [7, 7, 2, 4, W], [12, 3, 2, 1, '#ccc'], [6, 6, 8, 1, 'R']],
  pistol: [[6, 2, 13, 3, M], [7, 5, 8, 2, W], [7, 7, 4, 6, W], [12, 7, 2, 2, W], [18, 2, 1, 1, '#ddd'], [8, 3, 9, 1, 'R']],
  burst: [[0, 4, 5, 4, M2], [5, 3, 11, 4, '#3f444c'], [16, 4, 6, 2, W], [22, 3, 2, 3, W], [9, 7, 3, 4, W], [6, 7, 2, 4, W], [8, 1, 6, 2, W], [9, 1, 1, 1, '#ff6060'],
    [17, 6, 4, 1, M2], [6, 4, 9, 1, 'R']],
  grenade: [[9, 4, 9, 9, '#4f6b3a'], [10, 5, 7, 1, '#6f8b52'], [11, 1, 5, 3, '#888'], [16, 2, 4, 1, '#bbb'], [19, 3, 1, 3, '#bbb'], [9, 8, 9, 1, '#3d5430']],
  medmist: [[8, 3, 11, 10, '#e8f6ec'], [8, 3, 11, 2, '#7fe07f'], [12, 6, 3, 6, '#3fb84f'], [10, 8, 7, 2, '#3fb84f'], [11, 0, 5, 3, '#888'], [8, 11, 11, 2, '#7fe07f']],
  launchpad: [[2, 9, 22, 4, '#3a3d42'], [4, 7, 18, 2, '#2f86e0'], [6, 5, 14, 2, '#6cc0ff'], [11, 1, 4, 4, '#ffd84a'], [9, 3, 8, 1, '#ffd84a'], [2, 12, 22, 1, '#24262a']],
  rocket: [[2, 3, 19, 5, '#4f6b3a'], [0, 2, 2, 7, W], [21, 2, 3, 7, W], [24, 4, 2, 3, '#d04040'], [8, 8, 2, 4, W], [12, 1, 4, 2, W], [3, 7, 17, 1, '#3d5430'], [4, 4, 14, 1, 'R']],
  bandage: [[4, 3, 16, 9, '#f0ece0'], [4, 6, 16, 2, '#d8d0bc'], [10, 3, 4, 9, '#c9c0aa'], [20, 5, 3, 5, '#e0d8c4']],
  medkit: [[3, 3, 20, 10, '#f2f2f2'], [11, 4, 4, 8, '#e23b3b'], [8, 6, 10, 4, '#e23b3b'], [10, 1, 6, 2, '#888']],
  mini: [[9, 5, 8, 8, '#5ab4ff'], [11, 2, 4, 3, '#d8e8f8'], [10, 1, 6, 1, '#888'], [10, 7, 3, 3, '#bfe4ff']],
  shield: [[7, 4, 12, 10, '#2f7de8'], [10, 1, 6, 3, '#d8e8f8'], [9, 0, 8, 1, '#888'], [8, 6, 3, 5, '#9dd0ff'], [17, 6, 2, 6, '#1d5cb8']],
};
const S = 4, GW = 28, GH = 16;
const iconCache = new Map();
export function itemIcon(id, rarity = 0) {
  const key = id + rarity;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas');
  c.width = GW * S; c.height = GH * S;
  const ctx = c.getContext('2d');
  const shapes = ICON_SHAPES[id] || [];
  const ox = 1, oy = 1;
  ctx.fillStyle = '#000';
  for (const [x, y, w, h] of shapes) ctx.fillRect((x + ox - 1) * S, (y + oy - 1) * S, (w + 2) * S, (h + 2) * S);
  for (const [x, y, w, h, col] of shapes) {
    ctx.fillStyle = col === 'R' ? RARITY[rarity].color : col;
    ctx.fillRect((x + ox) * S, (y + oy) * S, w * S, h * S);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect((x + ox) * S, (y + oy) * S, w * S, Math.min(1, h) * S * 0.5);
  }
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function shortName(it) {
  if (!it) return '';
  if (it.kind === 'weapon') return WEAPONS[it.id].short || WEAPONS[it.id].name;
  if (it.kind === 'heal') return { bandage: 'Bandage', medkit: 'Medkit', mini: 'Mini', shield: 'Big Pot' }[it.id];
  if (it.kind === 'throwable') return THROWABLES[it.id].short;
  if (it.kind === 'utility') return UTILITIES[it.id].short;
  return '';
}

// ---------------------------------------------------------------- colour-blind palettes (agent E)
// Rarity colours chosen to stay distinct for each colour vision deficiency. Mutates RARITY in place
// so every caller picks up the new colours; icons are re-drawn on next use.
const RARITY_DEFAULT = RARITY.map(r => r.color);
export const COLOUR_BLIND_PALETTES = {
  off: RARITY_DEFAULT,
  deuteranopia: ['#b4b4b4', '#f0e442', '#0072b2', '#cc79a7', '#e69f00'],
  protanopia: ['#b4b4b4', '#f0e442', '#56b4e9', '#cc79a7', '#e69f00'],
  tritanopia: ['#b4b4b4', '#2ec27e', '#ff4f6e', '#c7a6ff', '#ffd23f'],
};
export const RARITY_LETTERS = ['C', 'U', 'R', 'E', 'L'];
export function applyColourBlind(mode = 'off') {
  const pal = COLOUR_BLIND_PALETTES[mode] || RARITY_DEFAULT;
  RARITY.forEach((r, i) => { r.color = pal[i]; r.hex = parseInt(pal[i].slice(1), 16); });
  iconCache.clear();
  return pal;
}
