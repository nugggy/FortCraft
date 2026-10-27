// Game orchestrator: world, actors, match flow, networking, render loop.
import * as THREE from '../vendor/three.module.min.js';
import { createAtlas } from './textures.js';
import { Graphics, TIME_KEYS, TIMES } from './graphics.js';
import { World, SX, SZ } from './world.js';
import { ChunkMesher } from './mesher.js';
import { B, BLOCKS } from './blocks.js';
import { Actor } from './actor.js';
import { BotBrain } from './bot.js';
import { PlayerController } from './player.js';
import { Combat } from './combat.js';
import { BuildSystem } from './building.js';
import { LootSystem } from './loot.js';
import { Storm } from './storm.js';
import { Effects } from './effects.js';
import { Hud, escapeHtml } from './hud.js';
import { Story } from './story.js';
import { audio } from './audio.js';
import { Net } from './net.js';
import { makeBus, makeCharacter, OUTFITS } from './models.js';
import { mulberry32 } from './noise.js';
import { makeWeapon, WEAPONS } from './items.js';
import { assignTeams } from './teams.js';

const BOT_NAMES = ['Blockhead', 'NoobMaster', 'CubeCrusher', 'Pixelita', 'SirLoots', 'DiamondDave', 'RampRat', 'TurtleKing', 'Sneaky_Sam', 'BoxBoxer', 'Lag_Larry', 'CrankItCarl',
  'SweatyBetty', 'JumpyJo', 'MossyMax', 'CobbleKate', 'ShieldSally', 'BushBob', 'GlideGus', 'LuckyLou', 'Snipezilla', 'Wobbles', 'BuildBuddy', 'Clanky',
  'TinyTim', 'MegaMel', 'Stormy', 'Chunky', 'NoScopeNed', 'Bricky', 'OakOllie', 'Sandy', 'Frosty', 'Waddles', 'PebblePete', 'Dusty', 'Gravelina', 'Zappy', 'Bonk', 'Echo-7'];

const SKY = new THREE.Color(0x8ec9ff), STORM_SKY = new THREE.Color(0x6a3a9a);

class Emitter {
  constructor() { this.subs = []; }
  on(fn) { this.subs.push(fn); }
  emit(ev, ...args) { for (const f of this.subs) f(ev, ...args); }
}

export class Game {
  constructor() {
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.clone(), 70, 180);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.1, 800);
    this.gfx = new Graphics(this.renderer, this.scene, this.camera);
    this.gfx.setTime('afternoon');
    this.gfx.setQuality(this.settings.quality || 'high');
    this.previewScreenPos = { x: 0.68, y: 0.55, size: 1 };

    this.atlas = createAtlas();
    this.audio = audio;
    audio.setVolume(this.settings.volume);
    this.net = new Net();
    this.events = new Emitter();
    this.effects = new Effects(this.scene);
    this.effects.onFlash = (p) => this.gfx.muzzle(p);
    this.combat = new Combat(this);
    this.build = new BuildSystem(this);
    this.loot = new LootSystem(this);
    this.storm = new Storm(this);
    this.story = new Story(this);
    this.hud = new Hud(this);
    this.controller = new PlayerController(this);
    this.events.on((ev, ...a) => this.story.on(ev, ...a));

    // Plug-in points for feature modules (see docs/CONTRACT.md):
    // systems: { start?(msg), update?(dt), reset?() }, interactProviders: (actor, controls, dt) => html|''.
    this.systems = [];
    this.interactProviders = [];
    // cameraProviders: (dt) => true when the provider positioned the camera this frame (spectator free cam, kill cam, cutscenes).
    this.cameraProviders = [];
    this.extraMarkers = [];   // HUD markers from feature modules: { x, z, color, shape: 'diamond' | 'dot' }
    this.mode = 'solo'; this.teamMode = false; this.creative = false;
    this.sameTeam = (a, b) => false;  // replaced by teams.js
    this.interactPrompt = (a, C, dt) => { for (const p of this.interactProviders) { const r = p(a, C, dt); if (r) return r; } return ''; };
    this.actors = []; this.brains = [];
    this.player = null;
    this.phase = 'menu';
    this.time = 0;
    this.paused = false;
    this.buildMode = false; this.buildPiece = 'wall'; this.buildMat = 'wood';
    this.bus = makeBus(); this.bus.visible = false; this.scene.add(this.bus);
    this.blockOut = [];
    this.netT = 0; this.botNetT = 0; this.syncT = 0; this.stormTickT = 1;
    this.bigMapOpen = false;
    this.spectate = null;
    this.menuT = 0;
    this.preview = null;

    this.setupNet();
    addEventListener('resize', () => {
      this.gfx.resize();
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    });
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => {
      try { this.frame(); } catch (e) { if (!this.lastErr || performance.now() - this.lastErr > 2000) { console.error(e); this.lastErr = performance.now(); } }
    });
  }

  addSystem(sys) { this.systems.push(sys); return sys; }

  // ---------------------------------------------------------------- graphics
  applyQuality() { this.gfx.setQuality(this.settings.quality || 'high'); }

  updateSky(dt) {
    const me = this.viewActor();
    const inStorm = this.inMatch() && me && me.alive && me.state !== 'bus' && this.storm.outside(me.pos);
    const focus = this.inMatch() && me ? me.pos : this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(60));
    this.gfx.fogScale = this.inMatch() ? 1 : 1.9;
    this.gfx.update(dt, focus, inStorm);
  }

  // ---------------------------------------------------------------- world
  async loadWorld(seed, progress) {
    if (this.mesher) this.mesher.dispose();
    this.world = new World(seed);
    progress?.('Generating island', 0.05);
    await nextFrame();
    this.world.generate();
    this.mesher = new ChunkMesher(this.world, this.scene, this.atlas);
    this.mesher.waterMat = this.gfx.waterMat;
    this.timeKey = TIME_KEYS[Math.abs(seed) % TIME_KEYS.length];
    this.gfx.setTime(this.timeKey);
    this.gfx.makeClouds(seed);
    const total = this.world.dirty.size;
    while (this.world.dirty.size) {
      this.mesher.update(12);
      progress?.('Placing blocks', 0.1 + 0.9 * (1 - this.world.dirty.size / total));
      await nextFrame();
    }
  }

  inMatch() { return this.phase === 'bus' || this.phase === 'play' || this.phase === 'over'; }
  actorById(id) { return this.actors.find(a => a.id === id); }
  localActors() { return this.actors.filter(a => !a.remote); }
  aliveCount() { return this.actors.filter(a => a.alive && !a.dormant).length; }
  viewActor() { return this.player && !this.player.alive && this.spectate && this.spectate.alive ? this.spectate : this.player; }
  blockColor(id) { return this.atlas.avg[BLOCKS[id]?.side ?? 0] || [0.5, 0.5, 0.5]; }

  // ---------------------------------------------------------------- menu backdrop
  async showMenuWorld(progress) {
    await this.loadWorld((Math.random() * 1e9) | 0, progress);
    this.phase = 'menu';
    this.updatePreview();
  }

  updatePreview() {
    if (this.preview) this.scene.remove(this.preview.root);
    this.preview = makeCharacter(this.settings.outfit);
    this.scene.add(this.preview.root);
  }

  menuFrame(dt) {
    this.menuT += dt * 0.05;
    const r = SX * 0.55;
    const cx = SX / 2 + Math.cos(this.menuT) * r, cz = SZ / 2 + Math.sin(this.menuT) * r;
    this.camera.position.set(cx, 82, cz);
    this.camera.lookAt(SX / 2, 24, SZ / 2);
    if (this.camera.fov !== 60) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
    if (this.preview) {
      const p = this.preview.root;
      const sp = this.previewScreenPos;
      p.visible = !!sp && this.phase === 'menu' && this.ui?.screen !== 'loading';
      if (sp) {
        // place the character at a normalised screen position, 6 blocks in front of the camera
        this.camera.updateMatrixWorld();
        const ndc = new THREE.Vector3(sp.x * 2 - 1, -(sp.y * 2 - 1), 0.5).unproject(this.camera);
        const dir = ndc.sub(this.camera.position).normalize();
        const size = sp.size || 1;
        p.scale.setScalar(size);
        p.position.copy(this.camera.position).addScaledVector(dir, 6);
        p.position.y -= 0.95 * size;
        const fwd = this.camera.getWorldDirection(new THREE.Vector3());
        p.rotation.y = Math.atan2(-fwd.x, -fwd.z) + Math.PI + Math.sin(performance.now() / 1400) * 0.5;
      }
      this.preview.armR.rotation.x = Math.sin(performance.now() / 300) * 0.3;
      this.preview.armL.rotation.x = -Math.sin(performance.now() / 300) * 0.3;
    }
  }

  // ---------------------------------------------------------------- match setup
  // Host: build the match description and start it.
  hostStart() {
    const rand = Math.random;
    const humans = this.net.online ? this.net.lobby.map(p => ({ id: p.id, name: p.name, outfit: p.outfit, glider: p.glider, pickaxe: p.pickaxe })) : [{ id: 0, name: this.settings.name, outfit: this.settings.outfit, glider: this.settings.glider, pickaxe: this.settings.pickaxeSkin }];
    const mode = ['solo', 'duos', 'squads', 'creative'].includes(this.settings.mode) ? this.settings.mode : 'solo';
    const botCount = mode === 'creative' ? 0 : Math.max(0, Math.min(60, this.settings.bots));
    const names = BOT_NAMES.slice().sort(() => rand() - 0.5);
    const bots = [];
    for (let i = 0; i < botCount; i++) bots.push({ id: 'b' + i, name: names[i % names.length] + (i >= names.length ? i : ''), outfit: (rand() * OUTFITS.length) | 0 });
    const ang = rand() * Math.PI * 2;
    const off = (rand() - 0.5) * 80;
    const cx = SX / 2 + Math.cos(ang + Math.PI / 2) * off, cz = SZ / 2 + Math.sin(ang + Math.PI / 2) * off;
    const msg = {
      t: 'start', seed: (rand() * 1e9) | 0,
      players: humans.map(h => h.id), humans, bots,
      bus: { a: [cx - Math.cos(ang) * SX * 0.75, cz - Math.sin(ang) * SX * 0.75], b: [cx + Math.cos(ang) * SX * 0.75, cz + Math.sin(ang) * SX * 0.75] },
      boss: mode !== 'creative' && this.story.wantsBoss(), diff: this.settings.difficulty, noBuild: mode !== 'creative' && !!this.settings.noBuild,
      mode,
    };
    msg.teams = assignTeams(mode, humans, bots);
    this.net.send(msg);
    return this.beginMatch(msg);
  }

  async beginMatch(msg) {
    this.phase = 'loading';
    this.ui.showScreen('loading');
    this.clearMatch();
    this.matchMsg = msg;
    await this.loadWorld(msg.seed, (t, p) => this.ui.loading(t, p));
    if (this.preview) this.preview.root.visible = false;
    const myId = this.net.myId, hostId = this.net.online ? this.net.hostId : 0;
    for (const h of msg.humans) {
      const local = h.id === myId;
      const a = new Actor(this, { id: 'p' + h.id, name: h.name, outfit: h.outfit, glider: h.glider, pickaxe: h.pickaxe, owner: h.id, isPlayer: true, remote: !local, nameTag: !local, tagColor: '#ffd84a' });
      this.actors.push(a);
      if (local) this.player = a;
    }
    const rand = mulberry32(msg.seed ^ 0x5bd1e995);
    const pois = this.world.pois;
    for (const b of msg.bots) {
      const a = new Actor(this, { id: b.id, name: b.name, outfit: b.outfit, owner: hostId, isBot: true, remote: !this.net.isHost });
      this.actors.push(a);
      if (this.net.isHost) {
        const brain = new BotBrain(this, a, msg.diff, Math.random);
        const poi = rand() < 0.65 && pois.length ? pois[(rand() * pois.length) | 0] : null;
        brain.dropTarget = poi ? { x: poi.x + (rand() - 0.5) * 30, z: poi.z + (rand() - 0.5) * 30 } : { x: 30 + rand() * 196, z: 30 + rand() * 196 };
        this.brains.push(brain);
        a.brain = brain;
      }
    }
    if (msg.boss) {
      const a = new Actor(this, { id: 'boss', name: 'THE WARDEN', outfit: 2, owner: hostId, isBot: true, boss: true, remote: !this.net.isHost, nameTag: true, tagColor: '#ff4a4a' });
      a.dormant = true;
      this.actors.push(a);
      if (this.net.isHost) { const brain = new BotBrain(this, a, 'hard', Math.random); this.brains.push(brain); a.brain = brain; }
      this.boss = a;
    }
    // bus
    this.busFrom = { x: msg.bus.a[0], z: msg.bus.a[1] }; this.busTo = { x: msg.bus.b[0], z: msg.bus.b[1] };
    this.busLen = Math.hypot(this.busTo.x - this.busFrom.x, this.busTo.z - this.busFrom.z);
    this.busSpeed = 24; this.busDuration = this.busLen / this.busSpeed; this.busT = 0;
    this.bus.visible = true;
    const dx = (this.busTo.x - this.busFrom.x) / this.busLen, dz = (this.busTo.z - this.busFrom.z) / this.busLen;
    this.busDir = new THREE.Vector3(dx, 0, dz);
    this.bus.rotation.y = Math.atan2(-dx, -dz);
    for (const br of this.brains) {
      if (br.a.dormant) continue;
      const t = br.dropTarget;
      const along = (t.x - this.busFrom.x) * dx + (t.z - this.busFrom.z) * dz;
      br.jumpTime = Math.max(this.busJumpStart(), Math.min(this.busDuration - 1, along / this.busSpeed - 2 + Math.random() * 2));
    }
    for (const a of this.actors) { a.state = 'bus'; a.pitch = -0.3; }
    this.player.yaw = this.bus.rotation.y;
    this.noBuild = !!msg.noBuild;
    for (const a of this.actors) { a.maxOver = this.noBuild ? 50 : 0; a.over = a.maxOver; }
    document.getElementById('hud').classList.toggle('nobuild', this.noBuild);
    document.getElementById('modeTag').textContent = this.noBuild ? 'NO BUILDS' : '';
    this.pings = []; this.stepT = new Map();
    this.storm.reset();
    if (this.net.isHost) this.loot.spawnInitial();
    this.time = 0; this.phase = 'bus';
    this.buildMode = false; this.spectate = null; this.result = null;
    this.hud.prepareMap();
    this.hud.clearTransient();
    this.ui.showScreen(null);
    this.hud.show(true);
    this.story.onMatchStart();
    for (const sys of this.systems) sys.start?.(msg);
    this.audio.play('horn');
    this.ui.lockPointer();
  }

  clearMatch() {
    for (const a of this.actors) a.dispose();
    this.actors = []; this.brains = []; this.player = null; this.boss = null;
    this.loot.reset(); this.build.reset(); this.combat.reset(); this.effects.clear();
    this.story.removeShard();
    for (const sys of this.systems) sys.reset?.();
    this.bus.visible = false;
    this.audio.stopLoops();
  }

  busJumpStart() {
    // first moment the bus is over the island
    for (let t = 0; t < this.busDuration; t += 0.25) {
      const p = this.busPosAt(t);
      if (p.x > 12 && p.z > 12 && p.x < SX - 12 && p.z < SZ - 12) return t;
    }
    return 2;
  }
  busPosAt(t) {
    const k = Math.min(1, t / this.busDuration);
    return new THREE.Vector3(this.busFrom.x + (this.busTo.x - this.busFrom.x) * k, 88, this.busFrom.z + (this.busTo.z - this.busFrom.z) * k);
  }
  busCanJump() { return this.busT >= this.busJumpStart(); }
  busLeft() { return Math.max(0, Math.ceil(this.busDuration - this.busT)); }

  jumpFromBus(a) {
    if (a.state !== 'bus') return;
    a.state = 'dive';
    a.pos.copy(this.bus.position); a.pos.y -= 3;
    a.vel.copy(this.busDir).multiplyScalar(10);
    if (a === this.player) { this.audio.play('swing'); this.ui.showBusHint(false); }
  }

  onLanded(a) {
    const gid = this.world.get(Math.floor(a.pos.x), Math.floor(a.pos.y - 0.5), Math.floor(a.pos.z));
    this.effects.dust(a.pos, this.blockColor(gid || B.DIRT));
    this.events.emit('landed', a); if (a === this.player) this.audio.play('land'); }

  // ---------------------------------------------------------------- damage
  damage(target, amount, source, head, weapon, point) {
    if (!target || !target.alive || amount <= 0 || target.dormant) return;
    if (source && source !== target && (source.downed || this.sameTeam(source, target))) return; // no friendly fire, downed can't hurt
    if (source && source === this.player && target !== this.player) {
      this.hud.hitmarker(head);
      this.hud.damageNumber(point || target.center, amount, head ? 'head' : target.shield > 0 || target.over > 0 ? 'shield' : 'hp');
      this.audio.play(head ? 'headshot' : target.shield > 0 ? 'shieldhit' : 'hit', { vol: 0.8 });
    }
    if (!target.remote) this.applyDamage(target, amount, source ? source.id : null, head, weapon);
    else this.net.sendTo(target.owner, { t: 'hit', target: target.id, dmg: amount, src: source ? source.id : null, head, w: weapon });
  }

  applyDamage(t, amount, srcId, head, weapon) {
    if (!t.alive) return;
    if (t.downed) {
      // knocked actors lose down health; whoever finishes them gets the elimination
      t.downHp -= amount;
      t.lastDamagedAt = this.time;
      if (t.downHp <= 0) { t.downed = false; this.kill(t, srcId || t.knockedBy, weapon); }
      return;
    }
    const hadShield = t.shield > 0;
    const bypass = weapon === 'storm' || weapon === 'fall';
    if (!bypass && t.over > 0) { const od = Math.min(t.over, amount); t.over -= od; amount -= od; }
    const sd = bypass ? 0 : Math.min(t.shield, amount);
    t.shield -= sd;
    t.hp -= amount - sd;
    if (srcId) { t.lastHitBy = srcId; t.lastHitTime = this.time; }
    t.lastDamagedAt = this.time;
    if (t.using) t.using = null;
    if (t === this.player) {
      if (hadShield && t.shield <= 0) this.audio.play('shieldbreak');
      const src = srcId && this.actorById(srcId);
      if (src) {
        const ang = Math.atan2(src.pos.x - t.pos.x, src.pos.z - t.pos.z);
        this.hud.damageFrom(-(ang - Math.atan2(-Math.sin(t.yaw), -Math.cos(t.yaw))) + Math.PI);
      }
      if (t.hp < 35 && t.hp > 0) this.events.emit('lowHealth');
      document.getElementById('hurt').style.opacity = '0.8';
    }
    if (t.hp <= 0) {
      const killer = srcId || (this.time - t.lastHitTime < 10 ? t.lastHitBy : null);
      t.lastWeapon = weapon;
      if (this.teams && this.teams.tryDown(t, killer, weapon)) return;
      this.kill(t, killer, weapon);
    }
  }

  kill(t, killerId, weapon) {
    t.hp = 0; t.downed = false;
    if (!this.creative) this.loot.dropAll(t);
    const msg = { t: 'death', id: t.id, killer: killerId, w: weapon, alive: this.aliveCount() - 1 };
    this.net.send(msg);
    this.onDeath(msg);
  }

  onDeath(msg) {
    const v = this.actorById(msg.id);
    if (!v || !v.alive) return;
    v.alive = false; v.state = 'dead'; v.downed = false;
    v.placement = this.teamMode ? this.aliveTeams().size + (this.aliveTeams().has(v.team) ? 0 : 1) : this.aliveCount() + 1;
    const k = msg.killer && this.actorById(msg.killer);
    this.effects.burst(v.pos.x, v.pos.y + 1, v.pos.z, [0.9, 0.9, 1], 24, 6, 0.18, 1.0);
    const wname = msg.w && WEAPONS[msg.w] ? WEAPONS[msg.w].name : msg.w === 'storm' ? 'the Static' : msg.w === 'fall' ? 'gravity' : msg.w === 'explosion' ? 'explosives' : '';
    const nm = (a) => `<b class="${a === this.player ? 'me' : ''}">${escapeHtml(a.name)}</b>`;
    if (k && k !== v && this.sameTeam(k, v)) this.hud.killfeed(`${nm(v)} was eliminated`);
    else if (k && k !== v) this.hud.killfeed(`${nm(k)} eliminated ${nm(v)}${wname ? ` <i>(${wname})</i>` : ''}`);
    else this.hud.killfeed(`${nm(v)} was eliminated${wname ? ` by ${wname}` : ''}`);
    if (k && !k.remote && k !== v) k.kills++;
    if (k === this.player && v !== this.player) { this.hud.elim(v.name); this.audio.play('elim'); this.events.emit('kill', this.player.id, v); }
    if (v.boss) { this.events.emit('bossDown'); this.hud.banner('THE WARDEN HAS FALLEN', 'The Loop trembles'); }
    if (v === this.player) {
      this.events.emit('death');
      this.buildMode = false; this.build.hideGhost();
      const mate = this.actors.find(a => a !== v && a.alive && this.sameTeam(a, v));
      this.spectate = mate || (k && k.alive ? k : null);
      if (mate && !this.creative) this.hud.notice(`Spectating ${mate.name}`, '#4fc3ff');
    }
    // Show the death screen once the local player's whole team is out (immediately in solo).
    const me = this.player;
    if (me && !me.alive && !this.result && !this.creative && v.team === me.team && !this.actors.some(a => a.alive && this.sameTeam(a, me))) {
      const killer = v === me ? k : (me.lastHitBy && this.actorById(me.lastHitBy));
      this.result = { placement: this.teamMode ? this.aliveTeams().size + 1 : v.placement, kills: me.kills, killer: killer ? killer.name : null };
      setTimeout(() => { if (this.phase === 'play' || this.phase === 'bus') this.ui.showDeath(this.result); }, 1800);
    }
    this.events.emit('alive', this.aliveCount());
    if (this.net.isHost) this.checkEnd();
  }

  // Teams with at least one living member (each actor is its own team in solo).
  aliveTeams() {
    const set = new Set();
    for (const a of this.actors) if (a.alive && !a.dormant) set.add(this.teamMode ? a.team : a.id);
    return set;
  }

  checkEnd() {
    if (this.phase !== 'play' || this.creative) return;
    const alive = this.actors.filter(a => a.alive && !a.dormant);
    if (this.boss && this.boss.dormant && this.boss.alive && alive.length <= 6) { this.spawnBoss(); return; }
    if (this.aliveTeams().size <= 1) {
      const w = alive.find(a => !a.downed) || alive[0];
      const msg = { t: 'end', winner: w ? w.id : null, team: w ? w.team : null };
      setTimeout(() => { this.net.send(msg); this.onEnd(msg); }, 1200);
      this.phase = 'over';
    }
  }

  onEnd(msg) {
    this.phase = 'over';
    const w = msg.winner && this.actorById(msg.winner);
    const won = !!this.player && (w === this.player || (this.teamMode && msg.team !== null && msg.team !== undefined && this.player.team === msg.team));
    if (won) { this.audio.play('victory'); this.events.emit('victory'); }
    this.ui.unlockPointer();
    const winner = !w ? 'Nobody' : this.teamMode ? this.actors.filter(a => a.team === w.team && !a.dormant).map(a => a.name).join(' & ') : w.name;
    const kills = this.teamMode && won ? this.actors.filter(a => this.sameTeam(a, this.player)).reduce((n, a) => n + (a.kills || 0), 0) : this.player.kills;
    setTimeout(() => this.ui.showEnd({ won, winner, placement: won ? 1 : this.player.placement || 2, kills, team: this.teamMode }), won ? 600 : 300);
  }

  spawnBoss() {
    const b = this.boss;
    if (!b || !b.dormant) return;
    b.dormant = false;
    const s = this.storm.next;
    b.pos.set(s.x, this.world.groundY(Math.floor(s.x), Math.floor(s.z)) + 0.1, s.z);
    b.state = 'ground';
    b.slots = [makeWeapon('ar', 4), makeWeapon('shotgun', 3), makeWeapon('rocket', 4), { kind: 'heal', id: 'shield', count: 2 }, null];
    b.ammo = { light: 200, medium: 400, heavy: 30, shells: 60, rockets: 12 };
    b.mats = { wood: 200, brick: 200, metal: 400 };
    b.select(1);
    this.net.send({ t: 'fx', k: 'boss' });
    this.onBossSpawn();
  }

  onBossSpawn() {
    this.hud.banner('THE WARDEN HAS ARRIVED', 'Bring it down');
    this.audio.play('warning');
    this.events.emit('bossSpawn');
  }

  // ---------------------------------------------------------------- blocks
  setBlock(x, y, z, id) {
    const w = this.world;
    this.build.forget(w.idx(x, y, z));
    w.set(x, y, z, id);
    this.blockOut.push([x, y, z, id]);
  }

  damageBlock(x, y, z, dmg, source, pickaxe) {
    const w = this.world;
    const piece = this.build.pieceAt(x, y, z);
    if (piece) {
      this.build.damagePiece(piece, dmg);
      this.net.send({ t: 'pdmg', id: piece.id, d: dmg });
      if (source === this.player) this.pieceHpFlash(piece);
      return;
    }
    const id = w.get(x, y, z);
    const def = BLOCKS[id];
    if (!def || id === B.AIR || id === B.WATER || id === B.CHEST || !isFinite(def.hp)) return;
    if (pickaxe && def.mat && def.harvest && source && !source.remote && !this.noBuild) {
      source.mats[def.mat] = Math.min(999, source.mats[def.mat] + def.harvest);
      if (source === this.player) {
        this.hud.damageNumber(new THREE.Vector3(x + 0.5, y + 0.8, z + 0.5), `+${def.harvest}`, 'mat');
        this.events.emit('harvest', source, def.harvest);
      }
    }
    const i = w.idx(x, y, z);
    const cur = (w.blockDamage.get(i) || 0) + dmg;
    if (cur >= def.hp) {
      this.setBlock(x, y, z, B.AIR);
      this.effects.burst(x + 0.5, y + 0.5, z + 0.5, this.blockColor(id), 10, 4);
      this.audio.play('break', { pos: { x, y, z }, vol: 0.7 });
    } else w.blockDamage.set(i, cur);
  }

  pieceHpFlash(piece) {
    const el = document.getElementById('pieceHp');
    el.style.display = 'block';
    el.querySelector('i').style.width = `${Math.max(0, piece.hp / piece.maxHp * 100)}%`;
    el.querySelector('span').textContent = `${Math.max(0, Math.ceil(piece.hp))} / ${piece.maxHp}`;
    clearTimeout(this.pieceHpTimer);
    this.pieceHpTimer = setTimeout(() => { el.style.display = 'none'; }, 900);
  }

  explode(p, radius, owner, dmg, rid) {
    this.applyExplosion(p, radius);
    this.net.send({ t: 'boom', p: [p.x, p.y, p.z], r: radius, rid });
    const R = radius * 1.6;
    for (const a of this.actors) {
      if (!a.alive || a.state === 'bus' || a.dormant) continue;
      const d = a.center.distanceTo(p);
      if (d < R) this.damage(a, Math.round(dmg * (1 - d / R) * (a === owner ? 0.5 : 1)), owner, false, 'explosion', a.center);
    }
  }

  applyExplosion(p, r) {
    const w = this.world;
    const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z), ri = Math.ceil(r);
    for (let y = cy - ri; y <= cy + ri; y++) for (let z = cz - ri; z <= cz + ri; z++) for (let x = cx - ri; x <= cx + ri; x++) {
      if ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 + (z + 0.5 - p.z) ** 2 > r * r) continue;
      const id = w.get(x, y, z);
      if (id === B.AIR || id === B.WATER || id === B.BEDROCK || id === B.CHEST || y <= 0) continue;
      const piece = this.build.pieceAt(x, y, z);
      if (piece) { this.build.damagePiece(piece, 400); continue; }
      this.build.forget(w.idx(x, y, z));
      w.set(x, y, z, B.AIR);
    }
    this.effects.explosion(p.x, p.y, p.z, r);
    this.soundPing('boom', p, 'boom' + Math.round(p.x) + Math.round(p.z));
    this.audio.play('explosion', { pos: p, range: 160 });
    const me = this.viewActor();
    if (me && me.pos.distanceTo(p) < 25) this.shake = 0.6;
  }

  fxChest(x, y, z, actorId) {
    this.audio.play('chestopen', { pos: { x, y, z } });
    this.effects.burst(x + 0.5, y + 0.5, z + 0.5, [1, 0.8, 0.2], 20, 5, 0.12, 0.9);
    this.events.emit('chest', actorId);
  }

  onStormEvent(stage, phase) {
    if (stage === 'shrink') { this.events.emit('stormShrink', phase); this.hud.notice('The Static is closing in!', '#d08aff'); this.audio.play('warning', { vol: 0.6 }); }
    if (stage === 'wait') { this.events.emit('stormPhase', phase); this.hud.notice('New safe zone marked on the map', '#ffffff'); }
    if (this.net.isHost && stage === 'shrink' && phase >= 2 && this.boss && this.boss.dormant) this.spawnBoss();
  }

  // Directional sound cue for the HUD ring and minimap. key groups repeats from one source.
  soundPing(kind, pos, key) {
    const me = this.viewActor();
    if (!me || !pos) return;
    const d = Math.hypot(pos.x - me.pos.x, pos.z - me.pos.z);
    const range = { step: 24, shot: 90, boom: 120, pickaxe: 30, chest: 22, glide: 60, build: 40 }[kind] || 40;
    if (d > range || d < 1.2) return;
    if (kind === 'shot' || kind === 'boom') this.pings.push({ x: pos.x, z: pos.z, t: 0, kind });
    if (this.settings.soundViz) this.hud.soundViz(kind, pos, key || kind, 1 - d / range);
  }

  // Footsteps, gliders and overshield regeneration.
  ambientSounds(dt) {
    if (!this.pings) return;
    for (let i = this.pings.length - 1; i >= 0; i--) if ((this.pings[i].t += dt) > 2) this.pings.splice(i, 1);
    const me = this.viewActor();
    for (const a of this.actors) {
      if (!a.alive || a === me || a.state === 'bus' || a.dormant) continue;
      if (a.state === 'glide') { this.soundPing('glide', a.pos, a.id + 'g'); continue; }
      const hs = Math.hypot(a.vel.x, a.vel.z);
      if (a.state !== 'ground' || !a.onGround || hs < 2) continue;
      const t = (this.stepT.get(a.id) || 0) - dt;
      if (t > 0) { this.stepT.set(a.id, t); continue; }
      this.stepT.set(a.id, 0.36);
      if (me && a.pos.distanceTo(me.pos) < 24) {
        this.audio.play('step', { pos: a.pos, range: 24, vol: 0.7, rate: 0.9 + Math.random() * 0.2 });
        this.soundPing('step', a.pos, a.id);
      }
    }
    if (this.noBuild) for (const a of this.localActors()) {
      if (a.alive && a.over < a.maxOver && this.time - a.lastDamagedAt > 5) a.over = Math.min(a.maxOver, a.over + 12 * dt);
    }
  }

  toggleBigMap() { this.bigMapOpen = !this.bigMapOpen; document.getElementById('bigmap').classList.toggle('show', this.bigMapOpen); }

  cycleSpectate() {
    const alive = this.actors.filter(a => a.alive && !a.dormant && a.state !== 'bus');
    if (!alive.length) return;
    const i = alive.indexOf(this.spectate);
    this.spectate = alive[(i + 1) % alive.length];
  }

  leaveMatch() {
    this.phase = 'menu';
    this.hud.show(false);
    this.clearMatch();
    this.ui.unlockPointer();
    if (this.bigMapOpen) this.toggleBigMap();
  }

  // ---------------------------------------------------------------- networking
  setupNet() {
    const n = this.net;
    const A = (id) => this.actorById(id);
    n.on('start', (m) => { if (m.players.includes(n.id)) this.beginMatch(m); });
    n.on('st', (m) => { const a = A(m.s.id); if (a && a.remote) a.applySnapshot(m.s); });
    n.on('bots', (m) => { for (const s of m.l) { const a = A(s.id); if (a && a.remote) { a.applySnapshot(s); if (a.boss && a.dormant && s.s === 'ground') a.dormant = false; } } });
    n.on('sync', (m) => { if (!n.isHost) { this.storm.apply(m.storm); this.busT = Math.max(this.busT, m.busT); } });
    n.on('hit', (m) => { const a = A(m.target); if (a && !a.remote) this.applyDamage(a, m.dmg, m.src, m.head, m.w); });
    n.on('death', (m) => this.onDeath(m));
    n.on('end', (m) => this.onEnd(m));
    n.on('loot+', (m) => this.loot.create(m.id, m.item, { x: m.p[0], y: m.p[1], z: m.p[2] }, { x: m.v[0], y: m.v[1], z: m.v[2] }));
    n.on('loot-', (m) => { this.loot.remove(m.id); this.loot.receive(m.who, m.item); });
    n.on('take', (m) => { if (n.isHost) this.loot.hostGrant(m.actor, m.id); });
    n.on('drop', (m) => { if (n.isHost) this.loot.spawn(m.item, { x: m.p[0], y: m.p[1], z: m.p[2] }, { x: m.v[0], y: m.v[1], z: m.v[2] }); });
    n.on('chest', (m) => { if (n.isHost) this.loot.hostOpenChest(m.x, m.y, m.z, m.actor); });
    n.on('piece', (m) => this.build.create(m.id, m.mat, m.blocks));
    n.on('pdmg', (m) => { const p = this.build.pieces.get(m.id); if (p) this.build.damagePiece(p, m.d); });
    n.on('blk', (m) => { for (const [x, y, z, id] of m.b) { this.build.forget(this.world.idx(x, y, z)); this.world.set(x, y, z, id); } });
    n.on('boom', (m) => { this.combat.removeRocket(m.rid); this.applyExplosion(new THREE.Vector3(...m.p), m.r); });
    n.on('fx', (m) => {
      const a = m.a !== undefined && typeof m.a === 'string' ? A(m.a) : null;
      if (m.k === 'swing' && a) this.soundPing('pickaxe', a.pos, a.id);
      if (m.k === 'shot' && a) {
        this.soundPing('shot', a.pos, a.id);
        const from = new THREE.Vector3(...m.p);
        for (const e of m.e) this.effects.tracer(from, new THREE.Vector3(...e));
        this.effects.flash(from);
        this.audio.play(m.w, { pos: a.pos, range: m.w === 'sniper' ? 200 : 120 });
      } else if (m.k === 'swing' && a) { a.swingT = 0.45; this.audio.play('swing', { pos: a.pos, vol: 0.5 }); }
      else if (m.k === 'rocket') {
        const owner = A(m.id.split(':')[0]);
        this.combat.spawnRocket(m.id, owner, new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), 0, 0, false);
        if (owner) this.audio.play('rocket', { pos: owner.pos });
      } else if (m.k === 'chest') this.fxChest(m.p[0], m.p[1], m.p[2], m.a);
      else if (m.k === 'boss') { if (this.boss) this.boss.dormant = false; this.onBossSpawn(); }
    });
    n.on('left', (m) => {
      const a = A('p' + m.id);
      if (a && a.alive && this.inMatch()) { a.alive = false; a.state = 'dead'; this.hud.killfeed(`<b>${escapeHtml(a.name)}</b> left the match`); if (n.isHost) this.checkEnd(); }
    });
    n.on('hostLeft', () => { if (this.inMatch() || this.phase === 'loading') { this.leaveMatch(); this.ui.toLobby('The host left, so the match ended.'); } });
    n.on('disconnected', () => { if (this.inMatch()) this.leaveMatch(); this.ui.toMenu('Disconnected from the LAN server.'); });
    n.on('lobby', () => this.ui.renderLobby());
    n.on('host', () => this.ui.renderLobby());
  }

  netTick(dt) {
    const n = this.net;
    if (!n.online) { this.blockOut.length = 0; return; }
    if (this.blockOut.length) { n.send({ t: 'blk', b: this.blockOut.splice(0) }); }
    this.netT -= dt;
    if (this.netT <= 0 && this.player) { this.netT = 0.05; n.send({ t: 'st', s: this.player.snapshot() }); }
    if (n.isHost) {
      this.botNetT -= dt;
      if (this.botNetT <= 0) {
        this.botNetT = 0.08;
        const l = this.actors.filter(a => a.isBot && (a.alive || a.netSentDead !== true)).map(a => { if (!a.alive) a.netSentDead = true; return a.snapshot(); });
        if (l.length) n.send({ t: 'bots', l });
      }
      this.syncT -= dt;
      if (this.syncT <= 0) { this.syncT = 0.5; n.send({ t: 'sync', storm: this.storm.snapshot(), busT: this.busT }); }
    }
  }

  // ---------------------------------------------------------------- frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.phase === 'menu' || this.phase === 'loading') {
      this.menuFrame(dt);
      if (this.mesher) this.mesher.update(4);
      this.updateSky(dt);
      this.effects.update(dt);
      this.gfx.render();
      return;
    }
    if (this.paused && !this.net.online) {
      this.controller.updateCamera(0);
      this.gfx.render();
      return;
    }
    this.time += dt;

    // bus
    if (this.phase === 'bus') {
      this.busT += dt;
      this.bus.position.copy(this.busPosAt(this.busT));
      this.bus.position.y += Math.sin(this.time * 1.5) * 0.4;
      for (const a of this.actors) if (a.state === 'bus') a.pos.copy(this.bus.position);
      if (this.busT >= this.busDuration) {
        for (const a of this.localActors()) if (a.state === 'bus' && !a.dormant) this.jumpFromBus(a);
      }
      this.ui.showBusHint(this.player.state === 'bus', this.busCanJump());
      if (this.busT > this.busDuration + 0.5) { this.phase = 'play'; this.bus.visible = false; this.ui.showBusHint(false); }
      this.audio.loop('engine', this.player.state === 'bus' ? 0.25 : 0);
    } else this.audio.loop('engine', 0);

    // simulation
    {
      this.controller.update(dt);
      for (const br of this.brains) br.update(dt);
      for (const a of this.actors) if (a.remote) a.interpolate(dt);
      if (this.net.isHost && this.phase === 'play' && !this.creative) this.storm.update(dt);
      this.stormTickT -= dt;
      if (this.stormTickT <= 0) {
        this.stormTickT = 1;
        if (this.phase === 'play' && !this.creative) for (const a of this.localActors()) {
          if (a.alive && a.state === 'ground' && !a.dormant && this.storm.outside(a.pos)) {
            this.damage(a, this.storm.dps, null, false, 'storm');
            if (a === this.player) this.events.emit('inStorm');
          }
        }
      }
      this.combat.update(dt);
      this.loot.update(dt, this.time);
      for (const sys of this.systems) sys.update?.(dt);
    }
    this.effects.update(dt);
    this.story.update(dt);
    for (const a of this.actors) a.updateModel(dt);
    this.ambientSounds(dt);
    if (this.gfx.quality !== 'low') this.effects.ambient(dt, this.world, this.viewActor()?.pos);
    this.netTick(dt);
    this.mesher.update(6);

    // camera, audio, sky
    if (!this.cameraProviders.some(p => p(dt))) this.controller.updateCamera(dt);
    if (this.shake > 0) { this.shake -= dt; this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4; }
    const va = this.viewActor();
    this.audio.listener = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, yaw: va ? va.yaw : 0 };
    const inStorm = va && va.alive && va.state !== 'bus' && this.storm.outside(va.pos);
    this.audio.loop('storm', inStorm ? 0.35 : 0);
    this.audio.loop('wind', va && (va.state === 'dive' || va.state === 'glide') ? (va.state === 'dive' ? 0.35 : 0.15) : 0);
    if (this.phase !== 'bus' && !this.creative) this.storm.render(this.time);
    const hurt = document.getElementById('hurt');
    const ho = parseFloat(hurt.style.opacity || '0');
    if (ho > 0) hurt.style.opacity = String(Math.max(0, ho - dt * 1.5));
    this.updateSky(dt);
    this.hud.update(dt);
    this.gfx.render();
  }
}

function nextFrame() { return new Promise(r => requestAnimationFrame(() => r())); }

const DEFAULTS = { name: 'Looper', outfit: 0, bots: 24, difficulty: 'normal', sens: 1, fov: 75, volume: 0.6, invert: false, noBuild: false, soundViz: true, quality: 'high' };
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('fortcraft.settings')) || {}; } catch { s = {}; }
  return { ...DEFAULTS, ...s };
}
export function saveSettings(s) { try { localStorage.setItem('fortcraft.settings', JSON.stringify(s)); } catch { /* storage unavailable */ } }
