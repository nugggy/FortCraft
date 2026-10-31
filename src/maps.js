// Maps: presets for the island generator (src/world.js) and the sky (src/graphics.js).
// The match seed picks the map, so every LAN client, spectator and replay builds the same one.
//
// Generator knobs (all optional, defaults give the classic island):
//   temp, moist   climate bias added to the noise (+temp: desert, -temp: snow, +moist: swamp, -moist: plains)
//   tempVar, moistVar  how much the climate varies across the map (lower keeps one biome dominant)
//   hills         height of rolling hills        mountains  height of ridges and peaks
//   radius        island size as a fraction of the map
//   shape         'island' (one big island), 'isles' (archipelago) or 'atoll' (ring around a lagoon)
//   lake          false drops Loot Lake          trees      vegetation density multiplier
//   time          lighting preset (TIMES in graphics.js); null cycles morning, midday, afternoon and sunset
export const MAPS = [
  { id: 'cubeterra', name: 'Cubeterra', blurb: 'The classic island', time: null },
  { id: 'dunes', name: 'Sunscorch Dunes', blurb: 'Sand, sphinxes and nowhere to hide', temp: 0.6, tempVar: 0.5, moist: -0.45, moistVar: 0.5, trees: 1.4, time: 'heat' },
  { id: 'frost', name: 'Frostbite Peaks', blurb: 'Snowy mountains and frozen lakes', temp: -0.75, tempVar: 0.5, mountains: 1.5, time: 'noon' },
  { id: 'marsh', name: 'Murkwater Marsh', blurb: 'Fog rolls over the bog', temp: 0.05, tempVar: 0.5, moist: 0.45, moistVar: 0.6, mountains: 0.5, time: 'mist' },
  { id: 'wilds', name: 'Emerald Wilds', blurb: 'A thick forest from coast to coast', tempVar: 0.3, moist: 0.1, moistVar: 0.4, trees: 2.2, time: 'morning' },
  { id: 'isles', name: 'Shattered Isles', blurb: 'An archipelago of small islands', radius: 0.5, shape: 'isles', time: 'noon' },
  { id: 'ridge', name: 'Titan Ridge', blurb: 'Huge peaks and deep valleys', temp: 0.1, hills: 1.5, mountains: 2.0, time: 'afternoon' },
  { id: 'moonlit', name: 'Moonlit Isle', blurb: 'The classic island after dark', time: 'night' },
  { id: 'atoll', name: 'Coral Atoll', blurb: 'A ring of land around a huge lagoon', temp: 0.2, moist: -0.1, shape: 'atoll', lake: false, time: 'dawn' },
  { id: 'prairie', name: 'Golden Prairie', blurb: 'Wide open fields and long sightlines', temp: -0.05, tempVar: 0.3, moist: -0.3, moistVar: 0.5, hills: 0.5, mountains: 0.25, trees: 0.6, time: 'sunset' },
];

export function mapForSeed(seed) { return MAPS[Math.abs(seed | 0) % MAPS.length]; }
