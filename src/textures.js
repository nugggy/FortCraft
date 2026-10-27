// Procedural 16x16 pixel-art texture atlas (original art, generated at runtime).
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './noise.js';

export const TILE = 16;
const COLS = 16;

const NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'water', 'log_side', 'log_top',
  'leaves', 'wood_build', 'brick_build', 'metal_build', 'cobble', 'planks', 'glass', 'roof',
  'snow', 'snow_side', 'chest_side', 'chest_top', 'bedrock', 'gravel', 'house_brick', 'concrete',
  'pine_leaves', 'crate',
  'sandstone_top', 'sandstone_side', 'cactus_side', 'cactus_top', 'dead_bush', 'tall_grass', 'fern', 'flower_red',
  'flower_yellow', 'flower_blue', 'birch_side', 'birch_top', 'birch_leaves', 'dark_log_side', 'dark_log_top', 'dark_leaves',
  'mossy_cobble', 'ice', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'stone_brick', 'lamp',
  'path_top', 'path_side', 'wool_red', 'wool_white', 'mud',
  'rail', 'vend_low', 'vend_high', 'vend_top',
];
export const TILES = Object.fromEntries(NAMES.map((n, i) => [n, i]));

const clamp = (v) => Math.max(0, Math.min(255, v | 0));

function painter(img, tx, ty, w) {
  return {
    set(x, y, c, a = 255) {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const i = ((ty * TILE + y) * w + tx * TILE + x) * 4;
      img.data[i] = clamp(c[0]); img.data[i + 1] = clamp(c[1]); img.data[i + 2] = clamp(c[2]); img.data[i + 3] = a;
    },
    get(x, y) {
      const i = ((ty * TILE + y) * w + tx * TILE + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    },
  };
}

const vary = (c, r, amt) => { const d = (r() - 0.5) * amt; return [c[0] + d, c[1] + d, c[2] + d]; };
const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

function noiseFill(p, r, base, amt) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) p.set(x, y, vary(base, r, amt));
}

// Ore: stone base with clustered coloured specks.
function ore(p, r, c1, c2) {
  DRAW.stone(p, r);
  for (let n = 0; n < 5; n++) {
    const cx = 2 + ((r() * 12) | 0), cy = 2 + ((r() * 12) | 0);
    for (let k = 0; k < 4; k++) {
      const x = cx + ((r() * 3) | 0) - 1, y = cy + ((r() * 3) | 0) - 1;
      p.set(x, y, k === 0 ? c2 : c1);
    }
  }
}
// Plant sprites sit on a transparent tile.
function clearTile(p) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, [0, 0, 0], 0); }
function flower(p, r, petal, centre) {
  clearTile(p);
  for (let y = 7; y < 16; y++) p.set(8, y, [58, 128, 40]);
  p.set(7, 11, [70, 150, 48]); p.set(6, 10, [70, 150, 48]); p.set(9, 13, [70, 150, 48]); p.set(10, 12, [70, 150, 48]);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]]) p.set(8 + dx, 5 + dy, vary(petal, r, 20));
  for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) p.set(8 + dx, 5 + dy, petal);
  p.set(8, 5, centre);
}

const DRAW = {
  grass_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      p.set(x, y, k < 0.15 ? [78, 138, 42] : k < 0.3 ? [112, 178, 64] : vary([94, 158, 52], r, 18));
    }
    // short blades catching the light
    for (let n = 0; n < 6; n++) { const x = (r() * 16) | 0, y = (r() * 15) | 0; p.set(x, y, [132, 196, 78]); p.set(x, y + 1, [104, 168, 58]); }
  },
  dirt(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      p.set(x, y, k < 0.12 ? [102, 72, 48] : k < 0.2 ? [156, 116, 84] : vary([134, 96, 67], r, 16));
    }
  },
  grass_side(p, r) {
    DRAW.dirt(p, r);
    for (let x = 0; x < 16; x++) {
      const depth = 3 + (r() < 0.4 ? 1 : 0) + (r() < 0.15 ? 1 : 0);
      for (let y = 0; y < depth; y++) p.set(x, y, vary([94, 158, 52], r, 22));
    }
  },
  stone(p, r) {
    noiseFill(p, r, [128, 128, 128], 20);
    for (let n = 0; n < 7; n++) {
      const cx = (r() * 16) | 0, cy = (r() * 16) | 0, len = 2 + (r() * 3 | 0);
      for (let i = 0; i < len; i++) p.set(cx + i, cy, [100, 100, 100]);
      p.set(cx, cy - 1, [150, 150, 150]);
    }
  },
  sand(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      p.set(x, y, k < 0.1 ? [200, 188, 140] : vary([222, 210, 166], r, 14));
    }
  },
  water(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const wave = Math.sin((x + y * 0.5) * 0.8) * 10;
      p.set(x, y, vary([46 + wave, 98 + wave, 206], r, 12), 255);
    }
  },
  log_side(p, r) {
    for (let x = 0; x < 16; x++) {
      const col = r() < 0.3 ? [78, 60, 36] : [104, 82, 50];
      for (let y = 0; y < 16; y++) p.set(x, y, vary(col, r, 14));
    }
  },
  log_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) p.set(x, y, vary([92, 72, 44], r, 12));
      else p.set(x, y, vary(((d | 0) % 2) ? [170, 136, 82] : [146, 112, 66], r, 10));
    }
  },
  leaves(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      if (k < 0.12) p.set(x, y, [0, 0, 0], 0);
      else p.set(x, y, k < 0.35 ? [44, 106, 30] : vary([64, 138, 42], r, 24));
    }
  },
  pine_leaves(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      if (k < 0.1) p.set(x, y, [0, 0, 0], 0);
      else p.set(x, y, k < 0.35 ? [34, 80, 46] : vary([48, 100, 58], r, 20));
    }
  },
  wood_build(p, r) {
    // Light vertical boards with a dark frame and diagonal brace, like a quick build piece.
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const seam = x % 4 === 0;
      p.set(x, y, seam ? [150, 108, 62] : vary([200, 156, 98], r, 16));
    }
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [120, 84, 46]); p.set(i, 15, [120, 84, 46]);
      p.set(0, i, [120, 84, 46]); p.set(15, i, [120, 84, 46]);
      p.set(i, i, [138, 96, 54]); p.set(i, Math.min(15, i + 1), [138, 96, 54]);
    }
  },
  brick_build(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = (y / 4) | 0;
      const off = row % 2 ? 4 : 0;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      p.set(x, y, mortar ? vary([196, 188, 176], r, 10) : vary([170, 86, 64], r, 22));
    }
  },
  metal_build(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const sheen = (x + y) % 11 < 2 ? 18 : 0;
      p.set(x, y, vary([150 + sheen, 160 + sheen, 172 + sheen], r, 8));
    }
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [96, 104, 114]); p.set(i, 15, [96, 104, 114]);
      p.set(0, i, [96, 104, 114]); p.set(15, i, [96, 104, 114]);
      p.set(i, 7, [118, 126, 136]);
    }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13], [2, 9], [13, 9], [2, 5], [13, 5]]) p.set(x, y, [210, 214, 220]);
  },
  cobble(p, r) {
    const pts = Array.from({ length: 9 }, () => [r() * 16, r() * 16, 100 + r() * 50]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let d1 = 1e9, d2 = 1e9, c = 0;
      for (const q of pts) {
        for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) {
          const d = (x - q[0] - ox) ** 2 + (y - q[1] - oy) ** 2;
          if (d < d1) { d2 = d1; d1 = d; c = q[2]; } else if (d < d2) d2 = d;
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1) < 1.1;
      p.set(x, y, edge ? [70, 70, 70] : vary([c, c, c], r, 14));
    }
  },
  planks(p, r) {
    for (let y = 0; y < 16; y++) {
      const row = (y / 4) | 0;
      const seamX = (row * 7 + 3) % 16;
      for (let x = 0; x < 16; x++) {
        const line = y % 4 === 3 || x === seamX;
        p.set(x, y, line ? [104, 76, 42] : vary([162, 124, 74], r, 14));
      }
      if (y % 4 === 1) { p.set((seamX + 2) % 16, y, [90, 70, 50]); p.set((seamX + 13) % 16, y, [90, 70, 50]); }
    }
  },
  glass(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const glint = (x - y === 4 || x - y === 5) && x > 3 && x < 11;
      if (border) p.set(x, y, [214, 236, 240]);
      else if (glint) p.set(x, y, [255, 255, 255]);
      else p.set(x, y, [0, 0, 0], 0);
    }
  },
  roof(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const off = ((y / 4) | 0) % 2 ? 2 : 0;
      const edge = y % 4 === 3 || (x + off) % 4 === 0;
      p.set(x, y, edge ? [96, 34, 28] : vary([150, 56, 44], r, 16));
    }
  },
  snow(p, r) { noiseFill(p, r, [240, 246, 252], 10); },
  snow_side(p, r) {
    DRAW.dirt(p, r);
    for (let x = 0; x < 16; x++) {
      const depth = 3 + (r() < 0.5 ? 1 : 0);
      for (let y = 0; y < depth; y++) p.set(x, y, vary([240, 246, 252], r, 8));
    }
  },
  chest_side(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const band = y === 5 || y === 6;
      const rim = x === 0 || x === 15 || y === 0 || y === 15;
      p.set(x, y, rim ? [150, 100, 20] : band ? [180, 120, 24] : vary([236, 186, 52], r, 18));
    }
    for (let y = 4; y < 9; y++) for (let x = 6; x < 10; x++) p.set(x, y, (y === 4 || y === 8 || x === 6 || x === 9) ? [60, 50, 40] : [250, 240, 200]);
  },
  chest_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const rim = x === 0 || x === 15 || y === 0 || y === 15;
      p.set(x, y, rim ? [150, 100, 20] : vary([240, 196, 64], r, 18));
    }
  },
  bedrock(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      p.set(x, y, k < 0.3 ? [30, 30, 30] : k < 0.6 ? [80, 80, 80] : [55, 55, 55]);
    }
  },
  gravel(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      p.set(x, y, k < 0.25 ? [100, 92, 90] : k < 0.5 ? [150, 140, 136] : vary([126, 120, 118], r, 18));
    }
  },
  house_brick(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const off = ((y / 4) | 0) % 2 ? 4 : 0;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      p.set(x, y, mortar ? [168, 160, 150] : vary([150, 64, 48], r, 20));
    }
  },
  concrete(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const panel = x === 15 || y === 15;
      p.set(x, y, panel ? [160, 160, 156] : vary([196, 196, 190], r, 8));
    }
  },
  sandstone_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, vary([222, 204, 150], r, 12));
    for (let i = 0; i < 16; i++) { p.set(i, 0, [196, 176, 120]); p.set(0, i, [196, 176, 120]); }
  },
  sandstone_side(p, r) {
    for (let y = 0; y < 16; y++) {
      const band = y < 3 ? [230, 214, 162] : y > 12 ? [196, 176, 120] : y % 4 === 0 ? [204, 186, 132] : [218, 200, 146];
      for (let x = 0; x < 16; x++) p.set(x, y, vary(band, r, 10));
    }
  },
  cactus_side(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const rib = x % 4 === 1;
      p.set(x, y, rib ? [44, 112, 46] : vary([70, 150, 64], r, 14));
    }
    for (let n = 0; n < 8; n++) p.set(((r() * 4) | 0) * 4 + 2, (r() * 16) | 0, [230, 230, 190]);
  },
  cactus_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 6;
      p.set(x, y, ring ? [44, 112, 46] : vary([96, 170, 80], r, 12));
    }
  },
  dead_bush(p, r) {
    clearTile(p);
    const c = [130, 92, 48];
    for (let y = 8; y < 16; y++) p.set(8, y, c);
    for (let i = 0; i < 6; i++) { p.set(8 - i, 9 - i, c); p.set(8 + i, 10 - i, c); }
    for (let i = 0; i < 3; i++) { p.set(5 - i, 4 + i, c); p.set(11 + i, 6 - i, c); }
  },
  tall_grass(p, r) {
    clearTile(p);
    for (let n = 0; n < 9; n++) {
      const x = 2 + ((r() * 12) | 0), h = 5 + ((r() * 9) | 0), lean = r() < 0.5 ? -1 : 1;
      for (let i = 0; i < h; i++) p.set(x + (i > h * 0.6 ? lean : 0), 15 - i, vary(i > h - 3 ? [120, 184, 70] : [78, 148, 48], r, 14));
    }
  },
  fern(p, r) {
    clearTile(p);
    for (let y = 2; y < 16; y++) p.set(8, y, [50, 112, 40]);
    for (let y = 3; y < 15; y += 2) {
      const w = Math.min(6, (16 - y) >> 1);
      for (let i = 1; i <= w; i++) { p.set(8 - i, y + (i >> 1), vary([66, 136, 52], r, 18)); p.set(8 + i, y + (i >> 1), vary([66, 136, 52], r, 18)); }
    }
  },
  flower_red(p, r) { flower(p, r, [216, 46, 46], [250, 220, 80]); },
  flower_yellow(p, r) { flower(p, r, [250, 214, 50], [200, 120, 30]); },
  flower_blue(p, r) { flower(p, r, [90, 140, 240], [250, 250, 250]); },
  birch_side(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, vary([226, 224, 214], r, 10));
    for (let n = 0; n < 7; n++) {
      const y = (r() * 16) | 0, x = (r() * 12) | 0, len = 2 + ((r() * 4) | 0);
      for (let i = 0; i < len; i++) p.set(x + i, y, [44, 42, 40]);
    }
  },
  birch_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      p.set(x, y, d > 6.5 ? [226, 224, 214] : vary(((d | 0) % 2) ? [200, 178, 130] : [184, 160, 112], r, 8));
    }
  },
  birch_leaves(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      if (k < 0.12) p.set(x, y, [0, 0, 0], 0);
      else p.set(x, y, k < 0.35 ? [96, 150, 56] : vary([128, 178, 74], r, 22));
    }
  },
  dark_log_side(p, r) {
    for (let x = 0; x < 16; x++) {
      const col = r() < 0.35 ? [44, 34, 22] : [66, 50, 32];
      for (let y = 0; y < 16; y++) p.set(x, y, vary(col, r, 10));
    }
  },
  dark_log_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      p.set(x, y, d > 6.5 ? [50, 38, 24] : vary(((d | 0) % 2) ? [106, 82, 52] : [88, 66, 40], r, 8));
    }
  },
  dark_leaves(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      if (k < 0.1) p.set(x, y, [0, 0, 0], 0);
      else p.set(x, y, k < 0.35 ? [36, 82, 26] : vary([50, 104, 34], r, 18));
    }
  },
  mossy_cobble(p, r) {
    DRAW.cobble(p, r);
    for (let n = 0; n < 40; n++) {
      const x = (r() * 16) | 0, y = (r() * 16) | 0;
      p.set(x, y, vary([82, 128, 56], r, 24));
    }
  },
  ice(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, vary([170, 206, 246], r, 10));
    for (let n = 0; n < 4; n++) {
      let x = (r() * 16) | 0, y = (r() * 16) | 0;
      for (let i = 0; i < 6; i++) { p.set(x, y, [226, 242, 255]); x += r() < 0.5 ? 1 : 0; y += 1; }
    }
  },
  coal_ore(p, r) { ore(p, r, [40, 40, 40], [20, 20, 20]); },
  iron_ore(p, r) { ore(p, r, [214, 170, 136], [240, 204, 170]); },
  gold_ore(p, r) { ore(p, r, [246, 208, 60], [255, 240, 140]); },
  diamond_ore(p, r) { ore(p, r, [90, 226, 230], [200, 255, 255]); },
  stone_brick(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const off = ((y / 8) | 0) % 2 ? 8 : 0;
      const mortar = y % 8 === 7 || (x + off) % 16 === 15;
      p.set(x, y, mortar ? [86, 86, 86] : vary([136, 136, 136], r, 14));
    }
  },
  lamp(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const frame = x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7;
      p.set(x, y, frame ? [120, 84, 40] : vary([255, 226, 140], r, 18));
    }
  },
  path_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      p.set(x, y, k < 0.15 ? [150, 122, 76] : k < 0.25 ? [128, 120, 110] : vary([172, 142, 94], r, 14));
    }
  },
  path_side(p, r) {
    DRAW.dirt(p, r);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) p.set(x, y, vary([172, 142, 94], r, 14));
  },
  wool_red(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, vary((x + y) % 4 === 0 ? [176, 40, 36] : [204, 56, 48], r, 12));
  },
  wool_white(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, vary((x + y) % 4 === 0 ? [214, 214, 210] : [238, 238, 234], r, 8));
  },
  mud(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = r();
      p.set(x, y, k < 0.15 ? [74, 60, 44] : k < 0.25 ? [96, 110, 60] : vary([92, 74, 54], r, 12));
    }
  },
  crate(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const frame = x < 2 || y < 2 || x > 13 || y > 13;
      const diag = Math.abs(x - y) < 2;
      p.set(x, y, frame || diag ? vary([120, 86, 46], r, 10) : vary([176, 132, 76], r, 14));
    }
  },
  // Rail track seen from above: two iron rails running along v, wooden sleepers across.
  rail(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, [0, 0, 0], 0);
    for (let y = 1; y < 16; y += 4) for (let x = 1; x < 15; x++) { p.set(x, y, vary([110, 78, 46], r, 14)); p.set(x, y + 1, vary([92, 64, 38], r, 10)); }
    for (let y = 0; y < 16; y++) for (const x of [3, 12]) { p.set(x, y, vary([150, 156, 164], r, 10)); p.set(x + 1, y, vary([108, 112, 120], r, 8)); }
  },
  // Vending machine: lower body with coin slot and dispenser, upper glass display.
  vend_low(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const rim = x === 0 || x === 15;
      p.set(x, y, rim ? [30, 30, 40] : vary([200, 40, 60], r, 12));
    }
    for (let y = 9; y < 14; y++) for (let x = 3; x < 13; x++) p.set(x, y, (y === 9 || y === 13 || x === 3 || x === 12) ? [40, 40, 50] : [14, 14, 20]);
    for (let y = 2; y < 7; y++) for (let x = 10; x < 13; x++) p.set(x, y, [230, 230, 240]);
    p.set(11, 4, [20, 20, 20]); p.set(11, 3, [20, 20, 20]);
    for (let x = 3; x < 8; x++) p.set(x, 3, [255, 220, 90]);
  },
  vend_high(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const rim = x === 0 || x === 15 || y === 0;
      p.set(x, y, rim ? [30, 30, 40] : vary([200, 40, 60], r, 12));
    }
    for (let y = 3; y < 15; y++) for (let x = 2; x < 14; x++) {
      const shelf = (y - 3) % 4 === 3;
      const glint = x - y === -3;
      p.set(x, y, shelf ? [90, 90, 100] : glint ? [220, 240, 255] : vary([120, 200, 230], r, 18));
    }
    for (let y = 4; y < 14; y += 4) for (let x = 3; x < 13; x += 3) { p.set(x, y, [255, 200, 60]); p.set(x + 1, y, [80, 220, 120]); }
    for (let x = 2; x < 14; x++) p.set(x, 1, [255, 240, 140]);
  },
  vend_top(p, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x === 0 || y === 0 || x === 15 || y === 15) ? [30, 30, 40] : vary([170, 34, 52], r, 10));
  },
};

export function createAtlas() {
  const rows = Math.ceil(NAMES.length / COLS);
  const w = COLS * TILE, h = rows * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const avg = [];
  NAMES.forEach((name, i) => {
    const tx = i % COLS, ty = (i / COLS) | 0;
    const p = painter(img, tx, ty, w);
    DRAW[name](p, mulberry32(1234 + i * 977));
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const c = p.get(x, y);
      if (c[3] > 0) { sr += c[0]; sg += c[1]; sb += c[2]; n++; }
    }
    avg.push([sr / n / 255, sg / n / 255, sb / n / 255]);
  });
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const eu = 0.02 / w, ev = 0.02 / h;
  const uvs = NAMES.map((_, i) => {
    const c = i % COLS, r = (i / COLS) | 0;
    return [c / COLS + eu, 1 - (r + 1) / rows + ev, (c + 1) / COLS - eu, 1 - r / rows - ev];
  });
  return { texture, canvas, uvs, avg };
}

// Small pixel textures for character skins.
export function pixelTexture(size, drawFn) {
  const c = document.createElement('canvas');
  c.width = size[0]; c.height = size[1];
  const ctx = c.getContext('2d');
  drawFn(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
