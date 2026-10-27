// Presentation-side sound layer: surface-aware footsteps, material pickaxe hits and
// build sounds, weapon reload sequences, storm rumble, and gun kick for animation.
import { B, BLOCKS } from './blocks.js';

const SURFACE = {};
const set = (names, surf) => { for (const n of names) if (B[n] !== undefined) SURFACE[B[n]] = surf; };
set(['GRASS', 'LEAVES', 'PINE_LEAVES', 'BIRCH_LEAVES', 'DARK_LEAVES'], 'grass');
set(['DIRT', 'MUD', 'PATH'], 'dirt');
set(['SAND', 'GRAVEL'], 'sand');
set(['SNOW', 'ICE'], 'snow');
set(['PLANKS', 'WOOD', 'LOG', 'BIRCH_LOG', 'DARK_LOG', 'CRATE', 'CHEST', 'RED_WOOL', 'WHITE_WOOL', 'CACTUS'], 'wood');
set(['METAL'], 'metal');

function hitSound(id) {
  if (id === B.METAL) return 'hit_metal';
  if (id === B.LEAVES || id === B.PINE_LEAVES || (B.BIRCH_LEAVES !== undefined && (id === B.BIRCH_LEAVES || id === B.DARK_LEAVES))) return 'hit_leaves';
  const surf = SURFACE[id];
  if (surf === 'wood') return 'hit_wood';
  if (surf === 'grass' || surf === 'dirt' || surf === 'sand' || surf === 'snow') return 'hit_dirt';
  return 'hit_stone';
}

// Reload sound timings as fractions of the reload duration.
function reloadSteps(id, T, shells) {
  switch (id) {
    case 'shotgun': {
      const n = Math.max(1, Math.min(6, shells));
      const out = [];
      for (let i = 0; i < n; i++) out.push(['shell_in', T * (0.12 + 0.7 * (i / n))]);
      out.push(['pump', T * 0.9]);
      return out;
    }
    case 'sniper': return [['bolt', T * 0.05], ['shell_in', T * 0.5], ['bolt', T * 0.78]];
    case 'rocket': return [['rocket_load', T * 0.35]];
    case 'pistol': return [['mag_out', T * 0.1], ['mag_in', T * 0.55], ['slide', T * 0.8]];
    default: return [['mag_out', T * 0.12], ['mag_in', T * 0.6], ['slide', T * 0.85]];
  }
}

export function installSfx(game) {
  const audio = game.audio;

  audio.surfaceAt = (pos) => {
    const w = game.world;
    if (!w) return 'dirt';
    const x = Math.floor(pos.x), z = Math.floor(pos.z);
    if (w.get(x, Math.floor(pos.y + 0.2), z) === B.WATER) return 'water';
    let id = w.get(x, Math.floor(pos.y - 0.3), z);
    if (!id) id = w.get(x, Math.floor(pos.y - 1.1), z);
    return SURFACE[id] || 'stone';
  };

  // pickaxe hits by material (wraps the game's block damage)
  const damageBlock = game.damageBlock;
  game.damageBlock = function (x, y, z, dmg, source, pickaxe) {
    if (pickaxe && game.world) {
      const id = game.world.get(x, y, z);
      if (id && BLOCKS[id] && !BLOCKS[id].liquid) audio.play(hitSound(id), { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, vol: 0.75, rate: 0.92 + Math.random() * 0.16 });
    }
    return damageBlock.apply(game, arguments);
  };

  // build placement by material
  const place = game.build.place.bind(game.build);
  game.build.place = (actor, type, mat) => {
    const ok = place(actor, type, mat);
    if (ok) audio.play('build_' + mat, { pos: actor.pos, vol: 0.7, rate: 0.95 + Math.random() * 0.1 });
    return ok;
  };

  // gun kick: every muzzle flash kicks the nearest actor's weapon (local and remote)
  const prevFlash = game.effects.onFlash;
  game.effects.onFlash = (p) => {
    if (prevFlash) prevFlash(p);
    let best = null, bd = 2.6;
    for (const a of game.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.y + a.eye * 0.85 - p.y, a.pos.z - p.z);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) best.kickT = 0.14;
  };

  let stepT = 0;
  game.addSystem({
    reset() { audio.loop('rumble', 0); stepT = 0; },
    update(dt) {
      const me = game.player;
      // local player footsteps (others are handled by the game's ambient sounds)
      if (me && me.alive && me.state === 'ground' && (me.onGround || me.inWater) && !me.emote) {
        const hs = Math.hypot(me.vel.x, me.vel.z);
        if (hs > 1.5 && !me.sliding) {
          stepT -= dt;
          if (stepT <= 0) {
            stepT = me.sprinting ? 0.27 : me.crouching ? 0.5 : 0.36;
            audio.play('step', { pos: me.pos, vol: me.crouching ? 0.18 : 0.4, range: 30, rate: 0.9 + Math.random() * 0.2 });
          }
        } else stepT = 0.05;
      }
      // reload sequences for locally simulated actors
      for (const a of game.actors) {
        if (a.remote || !a.alive) continue;
        const r = a.reloading > 0;
        if (r && !a._sfxReload) {
          const h = a.heldWeapon && a.heldWeapon();
          if (h && h.id !== 'pickaxe') {
            const steps = reloadSteps(h.id, a.reloadTotal || a.reloading, (h.id === 'shotgun' ? 5 - (h.mag || 0) : 1));
            audio.sequence(steps, a === me ? { vol: 0.75 } : { pos: a.pos, vol: 0.8, range: 40 });
          }
        }
        a._sfxReload = r;
      }
      // storm rumble grows with the phase and with closeness to the wall
      const va = game.viewActor();
      const st = game.storm;
      if (va && st && game.phase === 'play') {
        const d = Math.abs(Math.hypot(va.pos.x - st.cur.x, va.pos.z - st.cur.z) - st.cur.r);
        const phaseK = Math.min(1, (st.phase + 1) / 6);
        audio.loop('rumble', Math.max(0, 1 - d / 55) * (0.15 + 0.45 * phaseK));
      } else audio.loop('rumble', 0);
    },
  });
}
