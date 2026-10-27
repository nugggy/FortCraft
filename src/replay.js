// Kill cam and match replay. Records a rolling buffer of every actor's state plus shots,
// explosions and broken blocks, then plays it back with lightweight ghost models so the
// real actors (and the live simulation) are never touched.
import * as THREE from '../vendor/three.module.min.js';
import { makeCharacter, setHeld } from './models.js';
import { WEAPONS } from './items.js';

export const REC_RATE = 20;          // frames per second
export const REC_KEEP = 60;          // seconds kept for "Watch replay"
const KILLCAM_BEFORE = 5, KILLCAM_AFTER = 0.6, KILLCAM_DELAY = 1.0;

// Frame actor entry layout (arrays keep the buffer small):
// [id, x, y, z, yaw, pitch, state, heldKey, alive, hp, shield, swing, speed]
const I = { id: 0, x: 1, y: 2, z: 3, yaw: 4, pitch: 5, state: 6, held: 7, alive: 8, hp: 9, shield: 10, sw: 11, hs: 12 };

const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// ---------------------------------------------------------------- pure buffer (tested headlessly)
export class ReplayBuffer {
  constructor(keep = REC_KEEP) { this.keep = keep; this.frames = []; this.events = []; }
  clear() { this.frames.length = 0; this.events.length = 0; }
  push(frame) {
    this.frames.push(frame);
    const cut = frame.t - this.keep;
    while (this.frames.length && this.frames[0].t < cut) this.frames.shift();
    while (this.events.length && this.events[0].t < cut) this.events.shift();
  }
  event(e) { this.events.push(e); }
  get t0() { return this.frames.length ? this.frames[0].t : 0; }
  get t1() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }
  // Index of the last frame at or before t (binary search).
  indexAt(t) {
    const f = this.frames;
    let lo = 0, hi = f.length - 1;
    if (!f.length || t <= f[0].t) return 0;
    if (t >= f[hi].t) return hi;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (f[mid].t <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  // Interpolated actor states at time t: Map id -> entry (a fresh array).
  sample(t) {
    const out = new Map();
    const f = this.frames;
    if (!f.length) return out;
    const i = this.indexAt(t), a = f[i], b = f[Math.min(i + 1, f.length - 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    const nb = new Map(b.a.map(e => [e[I.id], e]));
    for (const ea of a.a) {
      const eb = nb.get(ea[I.id]);
      const e = ea.slice();
      if (eb && ea[I.state] === eb[I.state]) {
        for (const j of [I.x, I.y, I.z, I.pitch, I.hp, I.shield, I.hs]) e[j] = ea[j] + (eb[j] - ea[j]) * k;
        e[I.yaw] = angLerp(ea[I.yaw], eb[I.yaw], k);
      }
      out.set(e[I.id], e);
    }
    return out;
  }
  // Events in the half-open window (from, to].
  eventsBetween(from, to) { return this.events.filter(e => e.t > from && e.t <= to); }
  // Detached copy of the window [from, to] for the viewer.
  snapshot(from = this.t0, to = this.t1) {
    const b = new ReplayBuffer(Infinity);
    b.frames = this.frames.filter(f => f.t >= from - 0.1 && f.t <= to + 0.1);
    b.events = this.events.filter(e => e.t >= from && e.t <= to);
    return b;
  }
}

export function heldKey(h) {
  if (!h) return '';
  return `${h.kind}|${h.id || h.ammo || h.mat || ''}|${h.rarity || 0}|${h.skin || ''}`;
}
function heldFromKey(k) {
  if (!k) return null;
  const [kind, id, rarity, skin] = k.split('|');
  return { kind, id, rarity: +rarity || 0, skin: skin || undefined };
}

// ---------------------------------------------------------------- recorder, kill cam, viewer
export class Replay {
  constructor(game) {
    this.game = game;
    this.buf = new ReplayBuffer();
    this.meta = new Map();
    this.acc = 0;
    this.active = false; this.mode = null;
    this.ghosts = new Map();
    this.group = new THREE.Group();
    this.suppress = false;
    this.pendingDeath = null; this.deathResult = null; this.killcamAt = 0;
    this.camState = { yaw: 0, pitch: 0, pos: new THREE.Vector3() };
    this.free = { keys: new Set(), drag: false, speed: 14 };
    this.wrapEffects();
    this.buildDom();
    this.bindInput();
  }

  // ---------------------------------------------------------------- recording
  start() {
    this.stop(false);
    this.buf.clear(); this.meta.clear(); this.acc = 0;
    this.pendingDeath = null; this.deathResult = null; this.lastDeath = null;
    this.wrapWorld();
  }

  reset() { this.stop(false); this.buf.clear(); this.meta.clear(); this.pendingDeath = null; this.deathResult = null; this.watchBtn && (this.watchBtn.style.display = 'none'); }

  metaFor(a) {
    let m = this.meta.get(a.id);
    if (!m) {
      m = { name: a.name, outfit: a.outfit, glider: a.gliderId, boss: a.boss, scale: a.scale, isPlayer: a.isPlayer };
      this.meta.set(a.id, m);
    }
    return m;
  }

  record() {
    const g = this.game;
    const a = [];
    for (const ac of g.actors) {
      if (ac.dormant) continue;
      this.metaFor(ac);
      a.push([ac.id, +ac.pos.x.toFixed(2), +(ac.pos.y - (ac.stepOffset || 0)).toFixed(2), +ac.pos.z.toFixed(2), +ac.yaw.toFixed(3), +ac.pitch.toFixed(3),
        ac.state, heldKey(ac.held()), ac.alive ? 1 : 0, Math.round(ac.hp), Math.round(ac.shield), +(ac.swingT || 0).toFixed(2), +Math.hypot(ac.vel.x, ac.vel.z).toFixed(1)]);
    }
    this.buf.push({ t: g.time, a });
  }

  // Shots, explosions and block breaks feed the event list (but not while we are replaying them).
  wrapEffects() {
    const fx = this.game.effects, self = this;
    const tracer = fx.tracer.bind(fx), explosion = fx.explosion.bind(fx);
    fx.tracer = function (from, to, color) {
      if (!self.suppress && self.game.inMatch()) self.buf.event({ t: self.game.time, type: 'tracer', a: [from.x, from.y, from.z], b: [to.x, to.y, to.z], c: color });
      return tracer(from, to, color);
    };
    fx.explosion = function (x, y, z, r) {
      if (!self.suppress && self.game.inMatch()) self.buf.event({ t: self.game.time, type: 'boom', p: [x, y, z], r });
      return explosion(x, y, z, r);
    };
  }

  wrapWorld() {
    const w = this.game.world, self = this;
    if (!w || w.replayWrapped) return;
    w.replayWrapped = true;
    const set = w.set.bind(w);
    w.set = function (x, y, z, id) {
      if (!self.suppress && id === 0 && self.game.inMatch()) {
        const prev = w.get(x, y, z);
        if (prev && prev !== 5) self.buf.event({ t: self.game.time, type: 'break', p: [x + 0.5, y + 0.5, z + 0.5], c: self.game.blockColor(prev) });
      }
      return set(x, y, z, id);
    };
  }

  update(dt) {
    const g = this.game;
    if (!g.inMatch()) return;
    this.acc += dt;
    if (this.acc >= 1 / REC_RATE) { this.acc = 0; this.record(); }
    if (this.pendingDeath && !this.active && g.time >= this.killcamAt) this.startKillcam();
    if (this.active) this.tick(dt);
    if (this.watchBtn) this.watchBtn.style.display = this.buf.frames.length > REC_RATE * 3 ? '' : 'none';
  }

  // Called (through the wrapped game.onDeath) when the local player is eliminated.
  onLocalDeath(msg) {
    const g = this.game;
    if (g.settings.killCam === false || g.creative) return;
    const killer = msg.killer && msg.killer !== msg.id ? g.actorById(msg.killer) : null;
    if (!killer || !this.buf.frames.length) return;
    this.pendingDeath = { killerId: killer.id, killerName: killer.name, weapon: msg.w, t: g.time };
    this.killcamAt = g.time + KILLCAM_DELAY;
  }

  // main.js asks before showing the death screen; we hold it until the kill cam finishes.
  interceptDeath(r) {
    if (!this.pendingDeath && !(this.active && this.mode === 'killcam')) return false;
    this.deathResult = r;
    return true;
  }

  // ---------------------------------------------------------------- playback
  startKillcam() {
    const d = this.pendingDeath;
    this.pendingDeath = null;
    const from = Math.max(this.buf.t0, d.t - KILLCAM_BEFORE), to = Math.min(this.buf.t1, d.t + KILLCAM_AFTER);
    if (to - from < 1) { this.finishKillcam(); return; }
    this.play('killcam', this.buf.snapshot(from, to), { follow: d.killerId, info: d });
    this.game.ui.unlockPointer();
  }

  play(mode, buf, opts = {}) {
    const g = this.game;
    this.stop(false);
    this.mode = mode; this.active = true;
    this.pb = buf; this.t = buf.t0; this.speed = 1; this.paused = false;
    this.follow = opts.follow || null; this.info = opts.info || null;
    this.camMode = mode === 'killcam' ? 'follow' : (opts.camMode || 'follow');
    this.lastEventT = this.t;
    g.scene.add(this.group);
    document.body.classList.add('replaying');
    if (mode === 'killcam') this.showKillcamUi(); else this.showViewerUi();
  }

  stop(continueFlow = true) {
    if (!this.active) return;
    const mode = this.mode;
    this.active = false; this.mode = null;
    this.game.scene.remove(this.group);
    for (const gh of this.ghosts.values()) this.group.remove(gh.model.root);
    this.ghosts.clear();
    document.body.classList.remove('replaying');
    this.kc.classList.remove('show');
    this.viewer.classList.remove('show');
    if (this.game.ui?.screen === 'replay') {
      this.game.ui.showScreen('end');
      document.getElementById('end').classList.toggle('won', !!this.endWon);
    }
    if (continueFlow && mode === 'killcam') this.finishKillcam();
  }

  finishKillcam() {
    const r = this.deathResult;
    this.deathResult = null;
    const g = this.game;
    if (r && (g.phase === 'play' || g.phase === 'bus') && g.ui.screen !== 'end') g.ui.showDeath(r);
  }

  skip() { if (this.active && this.mode === 'killcam') this.stop(true); }

  tick(dt) {
    const g = this.game;
    // the match ended underneath the kill cam: drop it, the end screen takes over
    if (this.mode === 'killcam' && g.ui.screen === 'end') { this.deathResult = null; this.stop(false); return; }
    if (!this.paused) this.t += dt * this.speed;
    const pb = this.pb;
    if (this.t >= pb.t1) {
      if (this.mode === 'killcam') { this.stop(true); return; }
      this.t = pb.t1; this.paused = true;
    }
    // replay effects that happened since the last tick (only when moving forwards at normal pace)
    if (this.t > this.lastEventT && this.t - this.lastEventT < 0.5) {
      this.suppress = true;
      for (const e of pb.eventsBetween(this.lastEventT, this.t)) this.fireEvent(e);
      this.suppress = false;
    }
    this.lastEventT = this.t;
    this.state = pb.sample(this.t);
    this.poseGhosts(dt);
    this.updateUi();
  }

  fireEvent(e) {
    const g = this.game, fx = g.effects;
    if (e.type === 'tracer') {
      fx.tracer(new THREE.Vector3(...e.a), new THREE.Vector3(...e.b), e.c);
      if (Math.random() < 0.5) g.audio.play('ar', { pos: { x: e.a[0], y: e.a[1], z: e.a[2] }, vol: 0.35 });
    } else if (e.type === 'boom') {
      fx.explosion(e.p[0], e.p[1], e.p[2], e.r);
      g.audio.play('explosion', { pos: { x: e.p[0], y: e.p[1], z: e.p[2] }, vol: 0.6 });
    } else if (e.type === 'break') fx.burst(e.p[0], e.p[1], e.p[2], e.c, 4, 3);
  }

  ghost(id) {
    let gh = this.ghosts.get(id);
    if (!gh) {
      const m = this.meta.get(id) || { outfit: 0, scale: 1 };
      const model = makeCharacter(m.outfit || 0, { glider: m.glider });
      model.root.scale.setScalar(m.scale || 1);
      gh = { model, phase: 0 };
      this.ghosts.set(id, gh);
      this.group.add(model.root);
    }
    return gh;
  }

  poseGhosts(dt) {
    const seen = new Set();
    for (const [id, e] of this.state) {
      seen.add(id);
      const gh = this.ghost(id), m = gh.model;
      const state = e[I.state];
      m.root.visible = !!e[I.alive] && state !== 'bus' && state !== 'dead';
      if (!m.root.visible) continue;
      m.root.position.set(e[I.x], e[I.y], e[I.z]);
      m.root.rotation.y = e[I.yaw];
      const held = heldFromKey(e[I.held]);
      setHeld(m, held);
      m.glider.visible = state === 'glide';
      const hs = e[I.hs] || 0, pitch = e[I.pitch];
      m.armL.rotation.set(0, 0, 0); m.armR.rotation.set(0, 0, 0);
      if (state === 'dive') {
        m.pose.rotation.x = -1.25; m.armL.rotation.z = -1.3; m.armR.rotation.z = 1.3; m.head.rotation.x = 0.9;
        continue;
      }
      if (state === 'glide') {
        m.pose.rotation.x = -0.15; m.armL.rotation.set(Math.PI - 0.3, 0, 0.3); m.armR.rotation.set(Math.PI - 0.3, 0, -0.3);
        continue;
      }
      m.pose.rotation.x = 0;
      gh.phase += dt * this.speed * hs * 1.9;
      const swing = hs > 0.5 ? Math.sin(gh.phase) * Math.min(1, hs / 5) * 0.8 : 0;
      m.legL.rotation.x = swing; m.legR.rotation.x = -swing;
      m.head.rotation.x = Math.max(-0.8, Math.min(0.8, pitch));
      if (held && held.id === 'pickaxe') {
        const sw = e[I.sw] || 0;
        m.armR.rotation.x = sw > 0 ? 2.8 - Math.sin(Math.min(1, 1 - sw / 0.45) * Math.PI * 0.5) * 2.4 : 0.4 - swing * 0.5;
        m.armL.rotation.x = swing * 0.8;
      } else if (held && held.kind === 'weapon') {
        m.armR.rotation.x = Math.PI / 2 + pitch; m.armL.rotation.x = Math.PI / 2 + pitch - 0.05; m.armL.rotation.y = -0.45;
      } else { m.armR.rotation.x = -swing; m.armL.rotation.x = swing; }
    }
    for (const [id, gh] of this.ghosts) if (!seen.has(id)) gh.model.root.visible = false;
  }

  // Camera provider: positions the camera from the replay (returns true while active).
  updateCamera(dt) {
    if (!this.active || !this.state) return false;
    const g = this.game, cam = g.camera;
    for (const a of g.actors) a.model.root.visible = false;   // only ghosts are shown during playback
    if (this.camMode === 'free') {
      this.moveFree(dt);
      cam.position.copy(this.camState.pos);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(this.camState.pitch, this.camState.yaw, 0);
    } else {
      const e = this.state.get(this.follow) || this.state.values().next().value;
      if (!e) return true;
      const m = this.meta.get(e[I.id]) || { scale: 1 };
      const sc = m.scale || 1;
      const yaw = e[I.yaw], pitch = Math.max(-0.9, Math.min(0.9, e[I.pitch]));
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const pivot = new THREE.Vector3(e[I.x], e[I.y] + 1.6 * sc, e[I.z]);
      const glide = e[I.state] === 'glide' || e[I.state] === 'dive';
      const back = glide ? 6.5 : 3.4 * sc;
      const off = right.multiplyScalar(glide ? 0 : 0.75).addScaledVector(dir, -back);
      off.y += 0.45;
      let dist = off.length();
      const n = off.clone().normalize();
      const hit = g.world.raycast(pivot.x, pivot.y, pivot.z, n.x, n.y, n.z, dist + 0.3);
      if (hit) dist = Math.max(0.3, hit.t - 0.3);
      cam.position.copy(pivot).addScaledVector(n, dist);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(pitch, yaw, 0);
      this.camState.pos.copy(cam.position); this.camState.yaw = yaw; this.camState.pitch = pitch;
    }
    const fov = g.settings.fov || 75;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    return true;
  }

  moveFree(dt) {
    const k = this.free.keys, c = this.camState;
    const sp = this.free.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1) * dt;
    const fwd = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
    const right = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    if (k.has('KeyW')) c.pos.addScaledVector(fwd, sp);
    if (k.has('KeyS')) c.pos.addScaledVector(fwd, -sp);
    if (k.has('KeyA')) c.pos.addScaledVector(right, -sp);
    if (k.has('KeyD')) c.pos.addScaledVector(right, sp);
    if (k.has('KeyE') || k.has('Space')) c.pos.y += sp;
    if (k.has('KeyQ') || k.has('KeyC')) c.pos.y -= sp;
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (this.mode === 'killcam' && ['Space', 'Enter', 'Escape', 'KeyF'].includes(e.code)) { e.preventDefault(); this.skip(); return; }
      if (this.mode === 'viewer') {
        if (e.code === 'Escape') { this.stop(true); return; }
        if (e.code === 'Space' && this.camMode !== 'free') { e.preventDefault(); this.togglePause(); return; }
        this.free.keys.add(e.code);
      }
    });
    addEventListener('keyup', (e) => this.free.keys.delete(e.code));
    addEventListener('mousedown', (e) => { if (this.active && this.mode === 'viewer' && this.camMode === 'free' && e.target === this.game.renderer.domElement) this.free.drag = true; });
    addEventListener('mouseup', () => { this.free.drag = false; });
    addEventListener('mousemove', (e) => {
      if (!this.free.drag || !this.active) return;
      this.camState.yaw -= e.movementX * 0.004;
      this.camState.pitch = Math.max(-1.5, Math.min(1.5, this.camState.pitch - e.movementY * 0.004));
    });
    addEventListener('wheel', (e) => { if (this.active && this.camMode === 'free') this.free.speed = Math.max(3, Math.min(60, this.free.speed * (e.deltaY > 0 ? 0.85 : 1.18))); }, { passive: true });
  }

  togglePause() {
    if (this.t >= this.pb.t1 - 0.01) { this.t = this.pb.t0; this.lastEventT = this.t; }
    this.paused = !this.paused;
    this.updateUi();
  }

  // ---------------------------------------------------------------- UI
  buildDom() {
    const kc = document.createElement('div');
    kc.id = 'killcam';
    kc.innerHTML = `<div class="kc-top"><span class="kc-rec"><i></i>REPLAY</span><span class="kc-title">KILL CAM</span></div>
      <div class="kc-card"><div class="kc-label">Eliminated by</div><div class="kc-name" id="kcName"></div><div class="kc-weapon" id="kcWeapon"></div>
        <div class="kc-bars"><div class="kc-bar sh"><i id="kcShield"></i></div><div class="kc-bar hp"><i id="kcHealth"></i></div><span id="kcHp"></span></div></div>
      <div class="kc-bottom"><div class="kc-timeline"><i id="kcFill"></i><b id="kcMark"></b></div><button id="kcSkip" class="ghost">Skip <kbd>Space</kbd></button></div>`;
    document.body.appendChild(kc);
    this.kc = kc;
    kc.querySelector('#kcSkip').onclick = () => this.skip();

    // full replay viewer is a .screen so the rest of the UI treats it as a menu (no pointer lock)
    const v = document.createElement('div');
    v.id = 'replay'; v.className = 'screen';
    v.innerHTML = `<div class="rv-top"><span class="kc-rec"><i></i>REPLAY</span><span class="rv-help" id="rvHelp"></span></div>
      <div class="rv-bar">
        <button id="rvPlay" class="rv-btn">Pause</button>
        <span id="rvTime" class="rv-time"></span>
        <input type="range" id="rvScrub" min="0" max="1000" value="0">
        <select id="rvSpeed"><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select>
        <select id="rvCam"></select>
        <button id="rvClose" class="ghost">Close</button>
      </div>`;
    document.body.appendChild(v);
    this.viewer = v;
    v.querySelector('#rvPlay').onclick = () => this.togglePause();
    v.querySelector('#rvClose').onclick = () => this.stop(true);
    v.querySelector('#rvSpeed').onchange = (e) => { this.speed = +e.target.value; };
    const scrub = v.querySelector('#rvScrub');
    scrub.oninput = () => { this.t = this.pb.t0 + (this.pb.t1 - this.pb.t0) * (+scrub.value / 1000); this.lastEventT = this.t; this.scrubbing = true; };
    scrub.onchange = () => { this.scrubbing = false; };
    v.querySelector('#rvCam').onchange = (e) => {
      if (e.target.value === '__free') { this.camMode = 'free'; } else { this.camMode = 'follow'; this.follow = e.target.value; }
      this.updateUi();
    };

    // "Watch replay" button on the end screen
    const endBtns = document.querySelector('#end .endbtns');
    if (endBtns) {
      const b = document.createElement('button');
      b.id = 'btnWatchReplay'; b.className = 'ghost'; b.textContent = 'Watch replay';
      b.style.display = 'none';
      b.onclick = () => this.openViewer();
      endBtns.appendChild(b);
      this.watchBtn = b;
    }
  }

  openViewer() {
    const g = this.game;
    if (this.buf.frames.length < 2) return;
    const pb = this.buf.snapshot();
    const lastDeath = this.lastDeath;
    this.endWon = document.getElementById('end').classList.contains('won');
    this.play('viewer', pb, { follow: g.player ? g.player.id : null });
    if (lastDeath && lastDeath.t > pb.t0) this.t = Math.max(pb.t0, lastDeath.t - 8);
    this.lastEventT = this.t;
    const opts = [...this.meta.entries()].sort((a, b) => (b[1].isPlayer - a[1].isPlayer) || a[1].name.localeCompare(b[1].name));
    this.viewer.querySelector('#rvCam').innerHTML = opts.map(([id, m]) => `<option value="${id}">Follow: ${escape(m.name)}${g.player && id === g.player.id ? ' (you)' : ''}</option>`).join('') + '<option value="__free">Free camera</option>';
    this.viewer.querySelector('#rvCam').value = this.follow || '__free';
    g.ui.showScreen('replay');
  }

  showKillcamUi() {
    const d = this.info, w = d.weapon && WEAPONS[d.weapon] ? WEAPONS[d.weapon].name : d.weapon === 'explosion' ? 'Explosives' : d.weapon === 'pickaxe' ? 'Pickaxe' : '';
    this.kc.querySelector('#kcName').textContent = d.killerName;
    this.kc.querySelector('#kcWeapon').textContent = w ? `with ${w}` : '';
    this.kc.querySelector('#kcMark').style.left = `${(d.t - this.pb.t0) / Math.max(0.01, this.pb.t1 - this.pb.t0) * 100}%`;
    this.kc.classList.add('show');
  }

  showViewerUi() { this.viewer.classList.add('show'); }

  updateUi() {
    if (!this.pb) return;
    const frac = (this.t - this.pb.t0) / Math.max(0.01, this.pb.t1 - this.pb.t0);
    if (this.mode === 'killcam') {
      this.kc.querySelector('#kcFill').style.width = `${Math.min(100, frac * 100)}%`;
      const e = this.state && this.state.get(this.follow);
      if (e) {
        const m = this.meta.get(this.follow) || {};
        const maxHp = m.boss ? 400 : 100, maxSh = m.boss ? 200 : 100;
        this.kc.querySelector('#kcHealth').style.width = `${Math.max(0, e[I.hp] / maxHp * 100)}%`;
        this.kc.querySelector('#kcShield').style.width = `${Math.max(0, e[I.shield] / maxSh * 100)}%`;
        this.kc.querySelector('#kcHp').textContent = `${Math.round(e[I.hp])} HP${e[I.shield] > 0.5 ? ` · ${Math.round(e[I.shield])} shield` : ''}`;
      }
    } else if (this.mode === 'viewer') {
      const v = this.viewer;
      if (!this.scrubbing) v.querySelector('#rvScrub').value = Math.round(frac * 1000);
      const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      v.querySelector('#rvTime').textContent = `${fmt(this.t - this.pb.t0)} / ${fmt(this.pb.t1 - this.pb.t0)}`;
      v.querySelector('#rvPlay').textContent = this.paused ? 'Play' : 'Pause';
      v.querySelector('#rvHelp').textContent = this.camMode === 'free'
        ? 'Free camera: drag to look, WASD to move, E and Q up and down, Shift to speed up, wheel changes speed. Esc closes.'
        : 'Space plays or pauses. Pick a player or the free camera on the right. Esc closes.';
    }
  }
}

const escape = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function installReplay(game) {
  const r = new Replay(game);
  game.replay = r;
  game.addSystem({ start: () => r.start(), update: (dt) => r.update(dt), reset: () => r.reset() });
  game.cameraProviders.unshift((dt) => r.updateCamera(dt));   // kill cam outranks spectator cameras
  // Learn who eliminated the local player (and with what) as the death is processed.
  const onDeath = game.onDeath.bind(game);
  game.onDeath = (msg) => {
    const me = game.player;
    if (me && msg.id === me.id && me.alive) { r.lastDeath = { t: game.time, killer: msg.killer }; r.onLocalDeath(msg); }
    return onDeath(msg);
  };
  return r;
}
