// Renders the island overview image: block colours, hillshading, water depth,
// and biome tint / roads when the world provides them.
import { BLOCKS, B } from '../blocks.js';
import * as W from '../world.js';

const { SX, SZ, WATER_LEVEL } = W;

function toRgb(c) {
  if (c == null) return null;
  if (Array.isArray(c)) return c[0] > 1 || c[1] > 1 || c[2] > 1 ? c.map(v => v / 255) : c;
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  if (typeof c === 'string' && c[0] === '#') {
    const n = parseInt(c.length === 4 ? c.slice(1).split('').map(h => h + h).join('') : c.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  return null;
}

export function renderMapImage(world, atlas) {
  const c = document.createElement('canvas');
  c.width = SX; c.height = SZ;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(SX, SZ);
  const H = new Int16Array(SX * SZ);
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) H[x + z * SX] = world.topSolid(x, z);
  const h = (x, z) => H[Math.max(0, Math.min(SX - 1, x)) + Math.max(0, Math.min(SZ - 1, z)) * SX];
  const biome = world.biome && W.BIOMES ? world.biome : null;
  const road = world.road || null;
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const i = x + z * SX;
    const y = H[i];
    let col;
    const wet = y < WATER_LEVEL && world.get(x, WATER_LEVEL, z) === B.WATER;
    if (wet) {
      const depth = Math.min(1, (WATER_LEVEL - y) / 9);
      col = [0.25 - depth * 0.15, 0.62 - depth * 0.36, 0.9 - depth * 0.38];
    } else {
      const id = y >= 0 ? world.get(x, y, z) : B.STONE;
      const def = BLOCKS[id] || BLOCKS[B.STONE];
      col = (atlas.avg[def.top] || [0.5, 0.5, 0.5]).slice();
      if (biome) {
        const bd = W.BIOMES[biome[i]];
        const bc = toRgb(bd && (bd.color ?? bd.mapColor));
        if (bc) col = col.map((v, k) => v * 0.8 + bc[k] * 0.2);
      }
      if (road && road[i]) col = [0.78, 0.7, 0.54];
      // hillshade, light from the north-west
      const slope = (h(x - 1, z - 1) - h(x + 1, z + 1)) * 0.09;
      const shade = Math.max(0.62, Math.min(1.35, 1 + slope)) * (0.86 + Math.min(0.3, (y - WATER_LEVEL) * 0.006));
      col = col.map(v => v * shade);
      // shoreline foam
      if (y <= WATER_LEVEL + 1 && (h(x + 1, z) < WATER_LEVEL || h(x - 1, z) < WATER_LEVEL || h(x, z + 1) < WATER_LEVEL || h(x, z - 1) < WATER_LEVEL)) col = col.map(v => v * 0.6 + 0.4);
    }
    const o = i * 4;
    img.data[o] = Math.min(255, col[0] * 255); img.data[o + 1] = Math.min(255, col[1] * 255); img.data[o + 2] = Math.min(255, col[2] * 255); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Simple glyphs for named locations on the big map.
export function drawPoiIcon(ctx, type, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(8,12,30,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  switch (type) {
    case 'city': ctx.fillRect(-6, -5, 4, 10); ctx.fillRect(-1, -7, 4, 12); ctx.fillRect(4, -3, 3, 8); break;
    case 'town': ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); break;
    case 'farm': ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(-7, -1); ctx.lineTo(0, -7); ctx.lineTo(7, -1); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#2a1a00'; ctx.fillRect(-2, 1, 4, 5); break;
    case 'castle': case 'fort': ctx.fillRect(-7, -2, 14, 8); for (const cx of [-7, -2, 3]) ctx.fillRect(cx, -6, 4, 4); break;
    case 'temple': case 'pyramid': ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(0, -7); ctx.lineTo(8, 6); ctx.closePath(); ctx.fill(); break;
    case 'lighthouse': ctx.fillRect(-3, -4, 6, 10); ctx.fillStyle = '#fff'; ctx.fillRect(-4, -8, 8, 4); break;
    case 'mine': ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(6, -6); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(0, -9, 6, -4); ctx.stroke(); break;
    case 'factory': ctx.fillRect(-7, -1, 14, 7); ctx.fillRect(-6, -7, 3, 6); ctx.fillRect(1, -5, 3, 4); break;
    default: ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
