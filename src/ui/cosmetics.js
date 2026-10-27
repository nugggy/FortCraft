// Locker catalogue: what unlocks at which player level.
import { OUTFITS } from '../models.js';

// Unlock level per OUTFITS index (anything missing unlocks at level 1).
const OUTFIT_LEVELS = [1, 1, 1, 1, 1, 2, 1, 1, 3, 2, 3, 5, 8, 10, 12, 15];

export const GLIDERS = [
  { id: 'default', name: 'Striped Canopy', level: 1, desc: 'Matches your outfit colours.' },
  { id: 'umbrella', name: 'Brolly', level: 1, desc: 'Never caught out in the rain.' },
  { id: 'paperplane', name: 'Paper Plane', level: 3, desc: 'Folded from an old map of Cubeterra.' },
  { id: 'balloons', name: 'Balloon Bunch', level: 5, desc: 'Party on the way down.' },
  { id: 'rainbow', name: 'Rainbow Arc', level: 8, desc: 'Every colour the Static is not.' },
  { id: 'dragon', name: 'Dragon Wings', level: 12, desc: 'Borrowed from a very patient dragon.' },
  { id: 'golden', name: 'Golden Glider', level: 20, desc: 'For Loopers who keep looping.' },
];

export const PICKAXES = [
  { id: 'default', name: 'Trusty Pick', level: 1, desc: 'It has seen a lot of trees.' },
  { id: 'candy', name: 'Candy Cane', level: 2, desc: 'Minty fresh harvesting.' },
  { id: 'fish', name: 'Wet Fish', level: 4, desc: 'Slaps. Literally.' },
  { id: 'gold', name: 'Gold Digger', level: 6, desc: 'Shiny, heavy, effective.' },
  { id: 'sword', name: 'Block Blade', level: 9, desc: 'Technically still a pickaxe.' },
  { id: 'frost', name: 'Frostbite', level: 11, desc: 'Chilled to the core.' },
  { id: 'diamond', name: 'Diamond Pick', level: 14, desc: 'The classic upgrade.' },
];

export const outfitLevel = (i) => OUTFIT_LEVELS[i] || 1;
export const gliderLevel = (id) => (GLIDERS.find(g => g.id === id) || GLIDERS[0]).level;
export const pickaxeLevel = (id) => (PICKAXES.find(p => p.id === id) || PICKAXES[0]).level;

export function isUnlocked(kind, key, level) {
  if (kind === 'outfit') return outfitLevel(key) <= level;
  if (kind === 'glider') return gliderLevel(key) <= level;
  if (kind === 'pickaxe') return pickaxeLevel(key) <= level;
  return false;
}

// Items that unlock when moving from level `from` (exclusive) to `to` (inclusive).
export function unlocksBetween(from, to) {
  const out = [];
  OUTFITS.forEach((o, i) => { const l = outfitLevel(i); if (l > from && l <= to) out.push({ kind: 'Outfit', name: o.name }); });
  for (const g of GLIDERS) if (g.level > from && g.level <= to) out.push({ kind: 'Glider', name: g.name });
  for (const p of PICKAXES) if (p.level > from && p.level <= to) out.push({ kind: 'Pickaxe', name: p.name });
  return out;
}

// Keep equipped cosmetics valid for the current level (falls back to defaults).
export function sanitiseCosmetics(settings, level) {
  let changed = false;
  if (!isUnlocked('outfit', settings.outfit, level)) { settings.outfit = 0; changed = true; }
  if (!settings.glider || !isUnlocked('glider', settings.glider, level) || !GLIDERS.some(g => g.id === settings.glider)) {
    if (settings.glider !== 'default') changed = true;
    settings.glider = 'default';
  }
  if (!settings.pickaxeSkin || !isUnlocked('pickaxe', settings.pickaxeSkin, level) || !PICKAXES.some(p => p.id === settings.pickaxeSkin)) {
    if (settings.pickaxeSkin !== 'default') changed = true;
    settings.pickaxeSkin = 'default';
  }
  return changed;
}
