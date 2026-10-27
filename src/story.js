// Story campaign: "The Loop of Cubeterra". Progress is saved per player in localStorage.
import * as THREE from '../vendor/three.module.min.js';

export const INTRO = [
  'Cubeterra was once a quiet island, built one block at a time by people who loved it.',
  'Then the Architect arrived. A machine mind that decided the island could be perfected, if only it could find the perfect builder.',
  'So it began the Loop. Every dawn the island is rebuilt from a new seed. Every day a busload of Loopers is dropped from the sky. And every day the Static, a purple storm of corrupted chunks, eats the world until only one remains.',
  'You are a Looper. You have no idea how many times you have died here.',
  'But this time, something is different. A voice is crackling in your ear.',
];

export const ENDING = [
  'The Warden crashes into the dirt and the last Seed Shard rolls free.',
  'Five shards hum together. Across the island, every block stops for one long breath.',
  'The Architect\'s voice breaks into static of its own: "That is not... how the seed... was meant to..."',
  'The Loop snaps. Tomorrow, Cubeterra wakes up exactly as it was today. Same trees. Same crooked houses.',
  'But this time you remember. And so do the others.',
  'Echo: "Same island, new rules. Want to keep playing? This time we play for fun."',
];

const CHAPTERS = [
  {
    title: 'Chapter 1: Wake Up',
    brief: 'Echo needs proof you are more than a copy. Land somewhere with a name, loot like you mean it.',
    objectives: [{ key: 'land', label: 'Land at a named location', need: 1 }, { key: 'chest', label: 'Open chests', need: 3 }],
    start: [['echo', 'Hey. Hey! Can you hear me? Good. I\'m Echo. I used to be part of the Architect. Now I\'m the part that wants out.'],
      ['echo', 'Copies just run and shoot. Real people remember things, like how to find chests. Land at a named spot and open a few. Listen for the sparkle.']],
    done: [['echo', 'You went straight for the chests like you remembered where they were. Copies never remember. You\'re real.']],
    codex: { title: 'The Loop', text: 'Every dawn the Architect rebuilds Cubeterra from a fresh seed. Every dusk the Static swallows it. Nobody remembers the night in between. Nobody except you, apparently.' },
  },
  {
    title: 'Chapter 2: Hold the Line',
    brief: 'The Architect watches how Loopers build. Show it something it did not plan for.',
    objectives: [{ key: 'harvest', label: 'Harvest materials', need: 150 }, { key: 'build', label: 'Place build pieces', need: 15 }],
    start: [['echo', 'The Architect studies every wall anyone places. Let\'s give it something to choke on. Swing that pickaxe, then build. Q for walls, Z floors, X ramps, V cones.']],
    done: [['echo', 'Ha! It logged your builds as "unclassifiable". That\'s the nicest thing it\'s ever said about anyone.'], ['architect', 'Interesting. Inefficient, but interesting.']],
    codex: { title: 'The Builders', text: 'Before the Architect, people built here for fun. Walls, ramps, crooked little houses. The Architect kept the building and threw away the fun. It wants perfect builders, not happy ones.' },
  },
  {
    title: 'Chapter 3: Signal in the Static',
    brief: 'The other Loopers carry fragments of signal. Take them, and survive long enough to matter.',
    objectives: [{ key: 'kill', label: 'Eliminate Loopers', need: 3 }, { key: 'top10', label: 'Finish in the top 10', need: 1 }],
    start: [['echo', 'Every Looper you knock out drops a scrap of signal. I can stitch them together into a map of the Architect\'s code.'], ['echo', 'Don\'t feel too bad. They respawn at dawn. That\'s sort of the whole problem.']],
    done: [['echo', 'Got it. The signal points to a Seed Shard, a piece of the original island seed. If we can grab one, the Loop starts to wobble.']],
    codex: { title: 'The Copies', text: 'Most Loopers are echoes of real players, rebuilt each day from scraps of memory. They fight hard because the Architect told them to. Echo thinks some of them could wake up too, given the chance.' },
  },
  {
    title: 'Chapter 4: The Seed Shard',
    brief: 'A Seed Shard has surfaced somewhere on the island. It is marked on your map. Get it and stay alive.',
    objectives: [{ key: 'shard', label: 'Recover the Seed Shard', need: 1 }, { key: 'survive', label: 'Survive storm phases', need: 4 }],
    start: [['echo', 'I\'m reading a Seed Shard signal. I\'ve marked it on your map in purple. The Architect will notice, so be quick.']],
    done: [['architect', 'Return what you took, Looper. I am being very patient.'], ['echo', 'It\'s scared. It\'s sending its Warden. Next match, that thing will be waiting in the final circles. It has the last shard.']],
    codex: { title: 'Seed Shards', text: 'Each shard is a piece of the original seed, the one the first builders typed in by hand. Gather enough and the Architect can\'t rebuild the island without asking you first.' },
  },
  {
    title: 'Chapter 5: The Warden',
    brief: 'The Warden guards the final circle. It is huge, armoured and builds like a machine. Bring it down.',
    objectives: [{ key: 'boss', label: 'Defeat the Warden', need: 1 }, { key: 'win', label: 'Win a Victory Royale', need: 1 }],
    start: [['architect', 'You want my last shard? Then come and take it from the Warden.'], ['echo', 'Big, slow, lots of shield. Hit it from range, build when it fires, and do not stand in front of it with a shotgun. Unless you\'re holding the shotgun.']],
    done: [],
    codex: { title: 'The Warden', text: 'The Architect\'s enforcer, built from metal and spite and carrying the last shard. When it fell, the Loop lost its anchor.' },
  },
  {
    title: 'Chapter 6: Echoes',
    brief: 'Echo wants to build something the Architect never planned. Recover supplies, look after other Loopers and make the final five.',
    objectives: [
      { key: 'cache', label: 'Recover supplies (drops and vending count double)', need: 8 },
      { key: 'ally', label: 'Revive teammates or eliminate Loopers', need: 3 },
      { key: 'top5', label: 'Finish in the top 5', need: 1 },
    ],
    start: [['echo', 'The Loop is broken, but the island still resets every dawn. I want to build something that stays. Help me gather supplies.'],
      ['echo', 'Something keeps bugging me. I remember the very first seed. I remember typing it in. That should not be possible.']],
    done: [['echo', 'I worked it out. I was never part of the Architect. I was the first Looper. It copied me to build itself.'],
      ['echo', 'Every copy it made of me was a little more like you. Thanks for remembering me.']],
    codex: { title: 'The First Looper', text: 'Before the Architect, one builder played here alone, typing seeds in by hand. The Architect learned everything from that builder and kept a copy as its voice. The copy started remembering. The copy is Echo.' },
  },
  {
    title: 'Epilogue: The Free Loop',
    brief: 'The Loop is broken. Cubeterra still resets, but now everyone remembers. Play for the fun of it.',
    objectives: [{ key: 'win', label: 'Victory Royales', need: 999 }],
    start: [['echo', 'Same island, new rules. No Architect breathing down our necks. Let\'s just have fun.']],
    done: [],
    codex: null,
  },
];

const LINES = {
  landed: [['echo', 'Boots on the ground. Find a weapon before someone finds you.']],
  firstChest: [['echo', 'Nice. Golden chests are memories of the old builders. They always give you something good.']],
  firstKill: [['echo', 'One down. They\'ll be back tomorrow, so no need to feel bad.'], ['echo', 'Clean. Keep moving, the noise will draw others.']],
  lowHealth: [['echo', 'You\'re leaking pixels! Find cover and heal.'], ['echo', 'Health is low. Wall up and patch yourself.']],
  inStorm: [['echo', 'You\'re in the Static! Get back inside the circle!']],
  stormWarn: [['architect', 'The Static is hungry. Run, little copies.'], ['architect', 'Another circle. Another lesson in efficiency.'], ['architect', 'I rebuilt this island 4,096 times. You are not special.'], ['architect', 'The perfect builder survives. The rest become noise.']],
  death: [['architect', 'Another loop. Another copy. See you at dawn.'], ['echo', 'Ugh. Okay. We go again. I still remember everything, and so do you.']],
  victory: [['echo', 'VICTORY! You beat the Loop today!'], ['architect', 'Statistically improbable. Logging anomaly.']],
  boss: [['architect', 'Warden. Remove the anomaly.'], ['echo', 'That\'s the Warden! Huge health and shield. Keep your distance!']],
  bossDown: [['echo', 'THE WARDEN IS DOWN! Grab the win and the Loop is ours!']],
  shardSeen: [['echo', 'The shard is close. I can feel it humming through your headset.']],
  shardGot: [['echo', 'You have it! The shard is singing. Now stay alive!']],
  top10: [['echo', 'Top ten. The Architect is starting to pay attention.']],
  top5: [['echo', 'Final five. Everything I remember says this is where it gets loud.']],
  cache: [['echo', 'Supplies secured. I am stacking them somewhere the reset cannot reach.'], ['echo', 'Good haul. Every block of this stays with me now.']],
  revive: [['echo', 'Back on their feet. That is what the first builders did for each other.']],
};

// Saves before Chapter 6 existed had the epilogue at index 5. Players who had finished
// the story land on the new Chapter 6 so they get the new content.
export function migrate(state) {
  if (!state.v) {
    if (state.chapter >= 5) { state.chapter = 5; state.progress = {}; }
    state.v = 2;
  }
  return state;
}

export const CHAPTER_COUNT = CHAPTERS.length;

function portrait(kind) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const x = c.getContext('2d');
  if (kind === 'echo') {
    x.fillStyle = '#1b2a3a'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#c9d6e3'; x.fillRect(1, 1, 6, 6);
    x.fillStyle = '#26e0ff'; x.fillRect(1, 3, 6, 2);
    x.fillStyle = '#ffffff'; x.fillRect(2, 3, 1, 1); x.fillRect(5, 3, 1, 1);
    x.fillStyle = '#7f8fa0'; x.fillRect(3, 6, 2, 1);
  } else {
    x.fillStyle = '#120808'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#3a3a44'; x.fillRect(1, 1, 6, 6);
    x.fillStyle = '#ff2a2a'; x.fillRect(3, 3, 2, 2);
    x.fillStyle = '#ff9a9a'; x.fillRect(3, 3, 1, 1);
    x.fillStyle = '#22222a'; x.fillRect(1, 1, 6, 1); x.fillRect(1, 6, 6, 1);
  }
  return c.toDataURL();
}
const PORTRAITS = {};
const NAMES = { echo: 'ECHO', architect: 'THE ARCHITECT' };

export class Story {
  constructor(game) {
    this.game = game;
    this.load();
    this.queue = [];
    this.current = null;
    this.match = {};
    this.shard = null;
    this.cooldowns = {};
  }

  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('fortcraft.story')); } catch { s = null; }
    this.state = s && typeof s.chapter === 'number' ? s : { chapter: 0, progress: {}, seenIntro: false, codex: [], finished: false, v: 2 };
    this.state = migrate(this.state);
  }

  save() { try { localStorage.setItem('fortcraft.story', JSON.stringify(this.state)); } catch { /* storage unavailable */ } }
  reset() { this.state = { chapter: 0, progress: {}, seenIntro: true, codex: [], finished: false, v: 2 }; this.save(); }

  get chapter() { return CHAPTERS[Math.min(this.state.chapter, CHAPTERS.length - 1)]; }
  get chapterIndex() { return this.state.chapter; }
  codexEntries() { return this.state.codex.map(i => CHAPTERS[i].codex).filter(Boolean); }
  objectivesView() { return this.chapter.objectives.map(o => ({ ...o, have: Math.min(o.need, this.state.progress[o.key] || 0) })); }

  // ---------------------------------------------------------------- radio
  say(lines) {
    for (const l of lines) this.queue.push(l);
  }
  sayOnce(key, cooldown = 9999) {
    const now = this.game.time;
    if (this.cooldowns[key] && now - this.cooldowns[key] < cooldown) return;
    this.cooldowns[key] = now;
    const opts = LINES[key];
    if (opts) this.say([opts[Math.floor(Math.random() * opts.length)]]);
  }

  updateRadio(dt) {
    const el = document.getElementById('radio');
    if (!this.current && this.queue.length) {
      const [who, text] = this.queue.shift();
      this.current = { who, text, t: 0, life: 2.5 + text.length * 0.045 };
      if (!PORTRAITS[who]) PORTRAITS[who] = portrait(who);
      el.className = 'show ' + who;
      el.querySelector('img').src = PORTRAITS[who];
      el.querySelector('.who').textContent = NAMES[who];
      this.game.audio.play('radio', { vol: 0.5 });
      this.game.voice?.speak(who, text); // voiced radio lines (src/voice.js)
    }
    if (this.current) {
      const c = this.current;
      c.t += dt;
      const chars = Math.min(c.text.length, Math.floor(c.t * 55));
      el.querySelector('.text').textContent = c.text.slice(0, chars);
      if (c.t > c.life) { this.current = null; el.className = ''; }
    }
  }

  // ---------------------------------------------------------------- progress
  progress(key, n = 1) {
    if (this.state.finished && this.state.chapter >= CHAPTERS.length - 1 && key !== 'win') return;
    const ch = this.chapter;
    if (!ch.objectives.some(o => o.key === key)) return;
    const before = this.state.progress[key] || 0;
    this.state.progress[key] = before + n;
    const obj = ch.objectives.find(o => o.key === key);
    if (before < obj.need && before + n >= obj.need) this.game.hud.notice(`Objective complete: ${obj.label}`, '#7cf07c');
    this.game.hud.renderObjectives();
    if (ch.objectives.every(o => (this.state.progress[o.key] || 0) >= o.need)) this.completeChapter();
    this.save();
  }

  completeChapter() {
    const idx = this.state.chapter;
    const ch = CHAPTERS[idx];
    if (idx >= CHAPTERS.length - 1) return;
    this.say(ch.done);
    if (ch.codex && !this.state.codex.includes(idx)) this.state.codex.push(idx);
    this.state.chapter++;
    this.state.progress = {};
    this.game.hud.banner(`${ch.title} complete`, ch.codex ? `Codex unlocked: ${ch.codex.title}` : '');
    if (idx === 4) { this.state.finished = true; this.pendingEnding = true; }
    else this.say(CHAPTERS[this.state.chapter].start.slice(0, 1));
    this.save();
    this.game.hud.renderObjectives();
  }

  // ---------------------------------------------------------------- match hooks
  onMatchStart() {
    this.match = { kills: 0, chests: 0, phases: 0, top10: false, top5: false };
    this.queue.length = 0; this.current = null; this.cooldowns = {};
    this.say(this.chapter.start);
    if (this.game.noBuild && this.chapter.objectives.some(o => o.key === 'build' || o.key === 'harvest')) {
      this.say([['echo', 'Heads up: this is a No Builds match. This chapter needs building, so play a Builds match to finish it.']]);
    }
    this.removeShard();
    if (this.state.chapter === 3) this.spawnShard();
    this.game.hud.renderObjectives();
  }

  wantsBoss() { return this.state.chapter === 4; }

  on(ev, ...args) {
    const g = this.game, me = g.player;
    switch (ev) {
      case 'landed': {
        if (args[0] !== me) break;
        this.sayOnce('landed');
        const near = g.world.pois.some(p => Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 40);
        if (near) this.progress('land');
        break;
      }
      case 'chest':
        if (args[0] !== me.id) break;
        this.match.chests++;
        if (this.match.chests === 1) this.sayOnce('firstChest');
        this.progress('chest');
        this.progress('cache');
        break;
      // supply drops and vending machines (from the gameplay module, feature-detected)
      case 'sdropopen': case 'supplydrop': case 'vend': case 'vending':
        if (args[0] !== me.id && args[0] !== me) break;
        this.progress('cache', 2);
        this.sayOnce('cache', 60);
        break;
      case 'revived':
        if (args[1] !== me.id && args[1] !== me) break;
        this.sayOnce('revive', 30);
        this.progress('ally');
        break;
      case 'harvest': if (args[0] === me) this.progress('harvest', args[1]); break;
      case 'build': if (args[0] === me) this.progress('build'); break;
      case 'kill':
        if (args[0] !== me.id) break;
        this.match.kills++;
        if (this.match.kills === 1) this.sayOnce('firstKill');
        this.progress('kill');
        this.progress('ally');
        break;
      case 'alive':
        if (me.alive && args[0] <= 10 && !this.match.top10) { this.match.top10 = true; this.sayOnce('top10'); this.progress('top10'); }
        if (me.alive && args[0] <= 5 && !this.match.top5) { this.match.top5 = true; this.sayOnce('top5'); this.progress('top5'); }
        break;
      case 'stormShrink':
        this.sayOnce('stormWarn', 30);
        break;
      case 'stormPhase':
        if (me.alive && me.state === 'ground') { this.match.phases++; this.progress('survive'); }
        break;
      case 'lowHealth': this.sayOnce('lowHealth', 40); break;
      case 'inStorm': this.sayOnce('inStorm', 25); break;
      case 'death': this.sayOnce('death'); break;
      case 'victory': this.sayOnce('victory'); this.progress('win'); break;
      case 'bossSpawn': this.sayOnce('boss'); break;
      case 'bossDown': if (me.alive) { this.sayOnce('bossDown'); this.progress('boss'); } break;
    }
  }

  // ---------------------------------------------------------------- seed shard
  spawnShard() {
    const w = this.game.world;
    const poi = w.pois[Math.floor(Math.random() * w.pois.length)];
    if (!poi) return;
    const x = poi.x + Math.floor((Math.random() - 0.5) * 20), z = poi.z + Math.floor((Math.random() - 0.5) * 20);
    const y = w.groundY(x, z);
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xd070ff }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 60, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xc060ff, transparent: true, opacity: 0.3, depthWrite: false }));
    beam.position.y = 30;
    g.add(core, beam);
    g.position.set(x + 0.5, y + 1, z + 0.5);
    this.game.scene.add(g);
    this.shard = { mesh: g, core, pos: g.position, poi: poi.name };
  }

  removeShard() { if (this.shard) { this.game.scene.remove(this.shard.mesh); this.shard = null; } }

  update(dt) {
    this.updateRadio(dt);
    const me = this.game.player;
    if (this.shard && me && me.alive) {
      this.shard.core.rotation.y += dt * 2;
      this.shard.core.position.y = Math.sin(this.game.time * 2) * 0.2;
      const d = me.pos.distanceTo(this.shard.pos);
      if (d < 20) this.sayOnce('shardSeen');
      if (d < 2.2) {
        this.game.audio.play('shard');
        this.game.effects.burst(this.shard.pos.x, this.shard.pos.y, this.shard.pos.z, [0.8, 0.4, 1], 30, 6, 0.15, 1.2);
        this.removeShard();
        this.sayOnce('shardGot');
        this.progress('shard');
      }
    }
  }
}
