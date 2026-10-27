// Block definitions.
import { TILES as T } from './textures.js';

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7,
  WOOD: 8, BRICK: 9, METAL: 10, COBBLE: 11, PLANKS: 12, GLASS: 13, ROOF: 14, SNOW: 15,
  CHEST: 16, BEDROCK: 17, GRAVEL: 18, HOUSE_BRICK: 19, CONCRETE: 20, PINE_LEAVES: 21, CRATE: 22,
  SANDSTONE: 23, CACTUS: 24, DEAD_BUSH: 25, TALL_GRASS: 26, FLOWER_RED: 27, FLOWER_YELLOW: 28, FLOWER_BLUE: 29,
  BIRCH_LOG: 30, BIRCH_LEAVES: 31, MOSSY_COBBLE: 32, ICE: 33, COAL_ORE: 34, IRON_ORE: 35, GOLD_ORE: 36,
  DIAMOND_ORE: 37, STONE_BRICK: 38, LAMP: 39, PATH: 40, RED_WOOL: 41, WHITE_WOOL: 42, DARK_LOG: 43,
  DARK_LEAVES: 44, MUD: 45, FERN: 46,
  RAIL: 47, VEND_LOW: 48, VEND_HIGH: 49,
};

export const BLOCKS = [];
function def(id, name, o) {
  const top = o.top ?? o.all, side = o.side ?? o.all ?? top;
  BLOCKS[id] = {
    id, name,
    top, side, bottom: o.bottom ?? o.all ?? top,
    solid: o.solid ?? true,
    cutout: o.cutout ?? false,     // alpha-tested, neighbours still drawn
    liquid: o.liquid ?? false,
    plant: o.plant ?? false,       // crossed-quad decoration: not solid, bullets pass through
    flat: o.flat ?? false,         // drawn as a single flat quad on the floor (rails)
    hp: o.hp ?? 50,
    mat: o.mat ?? null,           // harvested material: wood | brick | metal
    harvest: o.harvest ?? 0,
    bulletproof: o.bulletproof ?? false, // terrain: guns don't dig it, pickaxe/rockets do
  };
}
const plant = (tile, name) => ({ all: tile, solid: false, plant: true, hp: 1 });

def(B.AIR, 'air', { all: 0, solid: false });
def(B.GRASS, 'grass', { top: T.grass_top, side: T.grass_side, bottom: T.dirt, hp: 40, mat: 'brick', harvest: 1, bulletproof: true });
def(B.DIRT, 'dirt', { all: T.dirt, hp: 40, mat: 'brick', harvest: 1, bulletproof: true });
def(B.STONE, 'stone', { all: T.stone, hp: 80, mat: 'brick', harvest: 4, bulletproof: true });
def(B.SAND, 'sand', { all: T.sand, hp: 30, bulletproof: true });
def(B.WATER, 'water', { all: T.water, solid: false, liquid: true });
def(B.LOG, 'log', { top: T.log_top, side: T.log_side, hp: 50, mat: 'wood', harvest: 6 });
def(B.LEAVES, 'leaves', { all: T.leaves, cutout: true, hp: 10, mat: 'wood', harvest: 1 });
def(B.PINE_LEAVES, 'pine leaves', { all: T.pine_leaves, cutout: true, hp: 10, mat: 'wood', harvest: 1 });
def(B.WOOD, 'wood build', { all: T.wood_build, hp: 999, mat: 'wood', harvest: 0 });
def(B.BRICK, 'brick build', { all: T.brick_build, hp: 999, mat: 'brick', harvest: 0 });
def(B.METAL, 'metal build', { all: T.metal_build, hp: 999, mat: 'metal', harvest: 0 });
def(B.COBBLE, 'cobblestone', { all: T.cobble, hp: 80, mat: 'brick', harvest: 4 });
def(B.PLANKS, 'planks', { all: T.planks, hp: 50, mat: 'wood', harvest: 5 });
def(B.GLASS, 'glass', { all: T.glass, cutout: true, hp: 8 });
def(B.ROOF, 'roof tiles', { all: T.roof, hp: 60, mat: 'brick', harvest: 3 });
def(B.SNOW, 'snow', { top: T.snow, side: T.snow_side, bottom: T.dirt, hp: 40, bulletproof: true });
def(B.CHEST, 'chest', { top: T.chest_top, side: T.chest_side, bottom: T.chest_top, hp: 9999 });
def(B.BEDROCK, 'bedrock', { all: T.bedrock, hp: Infinity, bulletproof: true });
def(B.GRAVEL, 'gravel', { all: T.gravel, hp: 40, mat: 'brick', harvest: 2, bulletproof: true });
def(B.HOUSE_BRICK, 'brick', { all: T.house_brick, hp: 90, mat: 'brick', harvest: 5 });
def(B.CONCRETE, 'concrete', { all: T.concrete, hp: 110, mat: 'metal', harvest: 5 });
def(B.CRATE, 'crate', { all: T.crate, hp: 40, mat: 'wood', harvest: 8 });
def(B.SANDSTONE, 'sandstone', { top: T.sandstone_top, side: T.sandstone_side, bottom: T.sandstone_top, hp: 70, mat: 'brick', harvest: 4 });
def(B.CACTUS, 'cactus', { top: T.cactus_top, side: T.cactus_side, bottom: T.cactus_top, hp: 20, mat: 'wood', harvest: 2 });
def(B.DEAD_BUSH, 'dead bush', plant(T.dead_bush));
def(B.TALL_GRASS, 'tall grass', plant(T.tall_grass));
def(B.FERN, 'fern', plant(T.fern));
def(B.FLOWER_RED, 'red flower', plant(T.flower_red));
def(B.FLOWER_YELLOW, 'yellow flower', plant(T.flower_yellow));
def(B.FLOWER_BLUE, 'blue flower', plant(T.flower_blue));
def(B.BIRCH_LOG, 'birch log', { top: T.birch_top, side: T.birch_side, hp: 50, mat: 'wood', harvest: 6 });
def(B.BIRCH_LEAVES, 'birch leaves', { all: T.birch_leaves, cutout: true, hp: 10, mat: 'wood', harvest: 1 });
def(B.DARK_LOG, 'dark log', { top: T.dark_log_top, side: T.dark_log_side, hp: 60, mat: 'wood', harvest: 7 });
def(B.DARK_LEAVES, 'dark leaves', { all: T.dark_leaves, cutout: true, hp: 10, mat: 'wood', harvest: 1 });
def(B.MOSSY_COBBLE, 'mossy cobblestone', { all: T.mossy_cobble, hp: 80, mat: 'brick', harvest: 4 });
def(B.ICE, 'ice', { all: T.ice, hp: 30 });
def(B.COAL_ORE, 'coal ore', { all: T.coal_ore, hp: 90, mat: 'brick', harvest: 5, bulletproof: true });
def(B.IRON_ORE, 'iron ore', { all: T.iron_ore, hp: 100, mat: 'metal', harvest: 6, bulletproof: true });
def(B.GOLD_ORE, 'gold ore', { all: T.gold_ore, hp: 100, mat: 'metal', harvest: 8, bulletproof: true });
def(B.DIAMOND_ORE, 'diamond ore', { all: T.diamond_ore, hp: 120, mat: 'metal', harvest: 12, bulletproof: true });
def(B.STONE_BRICK, 'stone bricks', { all: T.stone_brick, hp: 120, mat: 'brick', harvest: 5 });
def(B.LAMP, 'lamp', { all: T.lamp, hp: 30 });
def(B.PATH, 'path', { top: T.path_top, side: T.path_side, bottom: T.dirt, hp: 40, mat: 'brick', harvest: 1, bulletproof: true });
def(B.RED_WOOL, 'red panel', { all: T.wool_red, hp: 70, mat: 'brick', harvest: 3 });
def(B.WHITE_WOOL, 'white panel', { all: T.wool_white, hp: 70, mat: 'brick', harvest: 3 });
def(B.RAIL, 'rail', { all: T.rail, solid: false, plant: true, flat: true, hp: Infinity });
def(B.VEND_LOW, 'vending machine', { top: T.vend_top, side: T.vend_low, bottom: T.vend_top, hp: Infinity, bulletproof: true });
def(B.VEND_HIGH, 'vending machine', { top: T.vend_top, side: T.vend_high, bottom: T.vend_top, hp: Infinity, bulletproof: true });
def(B.MUD, 'mud', { top: T.mud, side: T.mud, bottom: T.dirt, hp: 35, mat: 'brick', harvest: 1, bulletproof: true });

export const SOLID = new Uint8Array(256);
export const OCCLUDES = new Uint8Array(256);
export const PASS = new Uint8Array(256); // rays and bullets pass through (liquids, plants)
for (const b of BLOCKS) {
  if (!b) continue;
  SOLID[b.id] = b.solid ? 1 : 0;
  OCCLUDES[b.id] = b.solid && !b.cutout ? 1 : 0;
  PASS[b.id] = b.liquid || b.plant ? 1 : 0;
}

export const BUILD_BLOCK = { wood: B.WOOD, brick: B.BRICK, metal: B.METAL };
