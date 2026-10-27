// Synthesised sound effects (no audio files). Positional via distance + stereo pan.

// Guns are played as layered sounds (body + crack + tail), or a muffled far variant at range.
const GUNS = {
  ar: { body: [0.2, 26, 0.32, 95], crack: [0.05, 1900], tail: 0.5, far: 0.6 },
  burst: { body: [0.18, 28, 0.34, 105], crack: [0.05, 2100], tail: 0.45, far: 0.55 },
  smg: { body: [0.12, 38, 0.42, 130], crack: [0.035, 2600], tail: 0.3, far: 0.45 },
  pistol: { body: [0.16, 30, 0.38, 150], crack: [0.04, 2300], tail: 0.35, far: 0.45 },
  shotgun: { body: [0.5, 9, 0.2, 58], crack: [0.07, 1200], tail: 0.9, far: 0.9 },
  sniper: { body: [0.4, 10, 0.26, 70], crack: [0.09, 3200], tail: 1.4, far: 1.2 },
};
const FAR = 50;

export class Audio {
  constructor() { this.ctx = null; this.buffers = {}; this.listener = { x: 0, y: 0, z: 0, yaw: 0 }; this.volume = 0.6; this.loops = {}; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.build();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  buf(len, fn) {
    const sr = this.ctx.sampleRate, n = Math.floor(len * sr);
    const b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let state = { lp: 0, lp2: 0 };
    for (let i = 0; i < n; i++) d[i] = fn(i / sr, i, state);
    return b;
  }

  build() {
    const R = Math.random, sin = Math.sin, PI2 = Math.PI * 2;
    const exp = (t, k) => Math.exp(-t * k);
    const gun = (len, decay, cutoff, thump) => this.buf(len, (t, i, s) => {
      const n = R() * 2 - 1;
      s.lp += (n - s.lp) * cutoff;
      return (s.lp * 1.6 * exp(t, decay) + sin(PI2 * thump * t) * exp(t, 30) * 0.8) * (t < 0.002 ? t / 0.002 : 1);
    });
    this.buffers.ar = gun(0.22, 22, 0.35, 90);
    this.buffers.smg = gun(0.14, 34, 0.45, 120);
    this.buffers.pistol = gun(0.18, 26, 0.4, 140);
    this.buffers.shotgun = gun(0.55, 9, 0.22, 60);
    this.buffers.sniper = this.buf(1.2, (t, i, s) => {
      const n = R() * 2 - 1; s.lp += (n - s.lp) * (t < 0.02 ? 0.9 : 0.15);
      return s.lp * 1.8 * exp(t, 5) + sin(PI2 * 70 * t) * exp(t, 12);
    });
    this.buffers.rocket = this.buf(0.7, (t, i, s) => { const n = R() * 2 - 1; s.lp += (n - s.lp) * 0.08; return s.lp * 3 * exp(t, 4) * Math.min(1, t * 30); });
    this.buffers.explosion = this.buf(1.6, (t, i, s) => {
      const n = R() * 2 - 1; s.lp += (n - s.lp) * 0.04; s.lp2 += (s.lp - s.lp2) * 0.2;
      return (s.lp2 * 6 + sin(PI2 * (50 - t * 20) * t) * 0.6) * exp(t, 2.6);
    });
    this.buffers.pickaxe = this.buf(0.15, (t) => (sin(PI2 * 320 * t) * 0.6 + (R() - 0.5) * 0.6) * exp(t, 40));
    this.buffers.swing = this.buf(0.18, (t, i, s) => { s.lp += ((R() - 0.5) - s.lp) * 0.1; return s.lp * 2 * sin(Math.PI * t / 0.18); });
    this.buffers.build = this.buf(0.2, (t) => (sin(PI2 * 180 * t) + sin(PI2 * 240 * t) * 0.5 + (R() - 0.5) * 0.4) * exp(t, 22));
    this.buffers.break = this.buf(0.35, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.3; return s.lp * 1.6 * exp(t, 10); });
    this.buffers.hit = this.buf(0.08, (t) => sin(PI2 * 1300 * t) * exp(t, 50) * 0.5);
    this.buffers.headshot = this.buf(0.3, (t) => (sin(PI2 * 1800 * t) + sin(PI2 * 2700 * t) * 0.6) * exp(t, 12) * 0.45);
    this.buffers.shieldhit = this.buf(0.12, (t) => (sin(PI2 * 900 * t) * 0.5 + (R() - 0.5) * 0.3) * exp(t, 30));
    this.buffers.shieldbreak = this.buf(0.6, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.7; return (s.lp * 0.8 + sin(PI2 * (1600 - t * 1200) * t) * 0.4) * exp(t, 6); });
    this.buffers.pickup = this.buf(0.18, (t) => sin(PI2 * (t < 0.08 ? 660 : 990) * t) * exp(t, 14) * 0.4);
    this.buffers.chest = this.buf(1.0, (t) => {
      const notes = [1568, 1976, 2349, 2637, 3136];
      const k = Math.floor(t / 0.12) % notes.length;
      return sin(PI2 * notes[k] * t) * exp(t % 0.12, 18) * 0.2 * exp(t, 1.5);
    });
    this.buffers.chestopen = this.buf(0.8, (t) => {
      const notes = [523, 659, 784, 1046, 1318];
      const k = Math.min(notes.length - 1, Math.floor(t / 0.09));
      return (sin(PI2 * notes[k] * t) * 0.35 + sin(PI2 * notes[k] * 2 * t) * 0.1) * exp(t, 3);
    });
    this.buffers.reload = this.buf(0.35, (t) => ((t < 0.05 || (t > 0.22 && t < 0.27)) ? (R() - 0.5) * 1.2 * Math.cos((t % 0.05) * 30) : 0));
    this.buffers.empty = this.buf(0.05, (t) => (R() - 0.5) * exp(t, 80));
    this.buffers.heal = this.buf(0.6, (t) => sin(PI2 * (400 + t * 600) * t) * 0.25 * Math.sin(Math.PI * t / 0.6));
    this.buffers.step = this.buf(0.08, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.15; return s.lp * exp(t, 40) * 1.2; });
    this.buffers.land = this.buf(0.25, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.08; return s.lp * 2.5 * exp(t, 14); });
    this.buffers.elim = this.buf(0.9, (t) => {
      const ch = [523, 659, 784];
      return ch.reduce((a, f) => a + sin(PI2 * f * t), 0) * 0.15 * exp(t, 3);
    });
    this.buffers.victory = this.buf(3.2, (t) => {
      const mel = [[0, 523], [0.2, 659], [0.4, 784], [0.6, 1046], [1.0, 784], [1.2, 1046], [1.5, 1318]];
      let v = 0;
      for (const [st, f] of mel) if (t >= st) v += (sin(PI2 * f * t) + 0.3 * sin(PI2 * f * 2 * t)) * exp(t - st, 2.2) * 0.12;
      return v;
    });
    this.buffers.horn = this.buf(0.9, (t) => (Math.sign(sin(PI2 * 220 * t)) * 0.15 + Math.sign(sin(PI2 * 277 * t)) * 0.12) * Math.min(1, t * 20) * Math.min(1, (0.9 - t) * 10));
    this.buffers.radio = this.buf(0.25, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.6; return (s.lp * 0.4 + sin(PI2 * 1200 * t) * 0.15) * exp(t, 12); });
    this.buffers.warning = this.buf(1.2, (t) => sin(PI2 * (t % 0.4 < 0.2 ? 440 : 330) * t) * 0.25 * Math.min(1, (1.2 - t) * 4));
    this.buffers.wind = this.buf(2.0, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.05; return s.lp * 2.5; });
    this.buffers.storm = this.buf(2.0, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.02; return s.lp * 5 * (0.7 + 0.3 * sin(PI2 * 0.5 * t)); });
    this.buffers.engine = this.buf(1.0, (t) => (sin(PI2 * 55 * t) * 0.5 + sin(PI2 * 110 * t) * 0.2) * (0.8 + 0.2 * sin(PI2 * 6 * t)));
    this.buildLayers();
    this.buffers.shard = this.buf(1.5, (t) => (sin(PI2 * 880 * t) + sin(PI2 * 1320 * t) + sin(PI2 * 1760 * t)) * 0.12 * exp(t, 1.8));
  }

  // Extra layered buffers: gun layers, surfaces, reload parts, materials, ambience.
  buildLayers() {
    const R = Math.random, sin = Math.sin, PI2 = Math.PI * 2, B = this.buffers;
    const exp = (t, k) => Math.exp(-t * k);
    const noise = (len, cutoff, decay, gain = 1, attack = 0.002) => this.buf(len, (t, i, s) => {
      s.lp += ((R() * 2 - 1) - s.lp) * cutoff;
      return s.lp * gain * exp(t, decay) * Math.min(1, t / attack);
    });
    for (const [id, g] of Object.entries(GUNS)) {
      const [len, decay, cutoff, thump] = g.body;
      B[id + '_body'] = this.buf(len, (t, i, s) => {
        s.lp += ((R() * 2 - 1) - s.lp) * cutoff;
        return (s.lp * 1.5 * exp(t, decay) + sin(PI2 * thump * t * (1 - t * 0.8)) * exp(t, 22) * 0.9) * Math.min(1, t / 0.0015);
      });
      const [clen, freq] = g.crack;
      B[id + '_crack'] = this.buf(clen, (t, i, s) => {
        const n = R() * 2 - 1; s.lp2 = n - s.lp; s.lp = n; // crude high-pass
        return (s.lp2 * 0.6 + sin(PI2 * freq * t) * 0.25) * exp(t, 70);
      });
      B[id + '_tail'] = this.buf(g.tail, (t, i, s) => {
        s.lp += ((R() * 2 - 1) - s.lp) * 0.06; s.lp2 += (s.lp - s.lp2) * 0.3;
        return s.lp2 * 2.2 * exp(t, 4 / g.tail) * Math.min(1, t / 0.03);
      });
      B[id + '_far'] = this.buf(g.far, (t, i, s) => {
        s.lp += ((R() * 2 - 1) - s.lp) * 0.035; s.lp2 += (s.lp - s.lp2) * 0.15;
        return (s.lp2 * 5 + sin(PI2 * 55 * t) * 0.3 * exp(t, 14)) * exp(t, 5 / g.far) * Math.min(1, t / 0.01);
      });
    }
    // footsteps by surface
    B.step_grass = noise(0.09, 0.12, 45, 1.1);
    B.step_dirt = noise(0.09, 0.1, 42, 1.2);
    B.step_sand = this.buf(0.14, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.5; return s.lp * 0.7 * exp(t, 24) * (0.6 + 0.4 * R()); });
    B.step_snow = this.buf(0.16, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.3; return s.lp * 0.8 * exp(t, 18) * (R() < 0.5 ? 1 : 0.4); });
    B.step_stone = this.buf(0.07, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.45; return (s.lp * 0.9 + sin(PI2 * 900 * t) * 0.15) * exp(t, 60); });
    B.step_wood = this.buf(0.1, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.2; return (s.lp * 0.8 + sin(PI2 * 210 * t) * 0.5) * exp(t, 38); });
    B.step_metal = this.buf(0.12, (t) => (sin(PI2 * 620 * t) * 0.3 + sin(PI2 * 1340 * t) * 0.2 + (R() - 0.5) * 0.3) * exp(t, 30));
    B.step_water = this.buf(0.2, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.25; return s.lp * 1.1 * sin(Math.PI * t / 0.2) * (0.5 + 0.5 * sin(PI2 * 30 * t)); });
    // reload parts
    const click = (f, len = 0.05) => this.buf(len, (t) => ((R() - 0.5) * 1.2 + sin(PI2 * f * t) * 0.5) * exp(t, 90));
    B.mag_out = this.buf(0.18, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.3; return (t < 0.03 ? (R() - 0.5) * 1.4 : s.lp * 0.5) * exp(t, 16); });
    B.mag_in = click(1400, 0.08);
    B.slide = this.buf(0.16, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.6; return (t < 0.09 ? s.lp * 0.5 : (R() - 0.5) * 1.3 * exp(t - 0.09, 60)); });
    B.pump = this.buf(0.28, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.4; return ((t < 0.04 || (t > 0.16 && t < 0.2)) ? (R() - 0.5) * 1.3 : s.lp * 0.25) * exp(t, 6); });
    B.shell_in = click(900, 0.07);
    B.bolt = this.buf(0.4, (t) => ((t < 0.04 || (t > 0.18 && t < 0.22) || (t > 0.32 && t < 0.35)) ? (R() - 0.5) * 1.2 : 0) * exp(t, 3));
    B.rocket_load = this.buf(0.5, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.08; return s.lp * 1.5 * sin(Math.PI * t / 0.5) + (t > 0.42 ? (R() - 0.5) * 1.5 * exp(t - 0.42, 50) : 0); });
    // pickaxe hits and build placement by material
    B.hit_wood = this.buf(0.18, (t) => (sin(PI2 * 240 * t) * 0.7 + (R() - 0.5) * 0.5) * exp(t, 28));
    B.hit_stone = this.buf(0.14, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.7; return (s.lp * 0.8 + sin(PI2 * 1100 * t) * 0.25) * exp(t, 40); });
    B.hit_metal = this.buf(0.4, (t) => (sin(PI2 * 880 * t) * 0.35 + sin(PI2 * 1320 * t) * 0.25 + sin(PI2 * 2210 * t) * 0.12) * exp(t, 9));
    B.hit_dirt = noise(0.14, 0.08, 30, 1.6);
    B.hit_leaves = this.buf(0.2, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.5; return s.lp * 0.6 * exp(t, 14) * (R() < 0.6 ? 1 : 0.3); });
    B.build_wood = this.buf(0.22, (t) => (sin(PI2 * 170 * t) + sin(PI2 * 260 * t) * 0.5 + (R() - 0.5) * 0.35) * exp(t, 20));
    B.build_brick = this.buf(0.26, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.25; return (s.lp * 1.2 + sin(PI2 * 120 * t) * 0.6) * exp(t, 16); });
    B.build_metal = this.buf(0.5, (t) => (sin(PI2 * 330 * t) * 0.45 + sin(PI2 * 495 * t) * 0.3 + sin(PI2 * 1210 * t) * 0.1 + (R() - 0.5) * 0.3 * exp(t, 40)) * exp(t, 8));
    // ambience
    B.wind = this.buf(3.0, (t, i, s) => {
      s.lp += ((R() * 2 - 1) - s.lp) * (0.03 + 0.03 * (0.5 + 0.5 * sin(PI2 * 0.7 * t)));
      return s.lp * 3 * (0.75 + 0.25 * sin(PI2 * 0.33 * t));
    });
    B.rumble = this.buf(3.0, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.008; s.lp2 += (s.lp - s.lp2) * 0.05; return s.lp2 * 14 * (0.7 + 0.3 * sin(PI2 * 0.5 * t)) + sin(PI2 * 38 * t) * 0.15; });
    B.emote_sting = this.buf(1.2, (t) => {
      const notes = [523, 659, 784, 988, 1175];
      const k = Math.min(notes.length - 1, Math.floor(t / 0.11));
      return (Math.sign(sin(PI2 * notes[k] * t)) * 0.08 + sin(PI2 * notes[k] * 2 * t) * 0.06) * exp(t - k * 0.11, 6) * exp(t, 1.5);
    });
    B.whoosh = this.buf(0.6, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * (0.02 + t * 0.3); return s.lp * 3 * sin(Math.PI * t / 0.6); });
    B.impact = this.buf(1.0, (t, i, s) => { s.lp += ((R() * 2 - 1) - s.lp) * 0.03; return (s.lp * 6 + sin(PI2 * (60 - t * 30) * t) * 0.9) * exp(t, 3.5); });
  }

  // Distance attenuation and stereo pan for a world position.
  spatial(opts) {
    let vol = opts.vol ?? 1, pan = 0, d = 0;
    if (opts.pos) {
      const L = this.listener;
      const dx = opts.pos.x - L.x, dy = opts.pos.y - L.y, dz = opts.pos.z - L.z;
      d = Math.hypot(dx, dy, dz);
      const range = opts.range ?? 90;
      if (d > range) return null;
      vol *= Math.max(0, 1 - d / range) ** 1.6;
      const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
      pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
    }
    return { vol, pan, d };
  }

  source(buffer, vol, pan, rate = 1, when = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g).connect(p).connect(this.master);
    src.start(this.ctx.currentTime + when);
    return src;
  }

  playGun(id, opts) {
    const sp = this.spatial({ ...opts, range: opts.range ?? (id === 'sniper' ? 220 : 140) });
    if (!sp || sp.vol < 0.005) return;
    const B = this.buffers, r = () => 0.94 + Math.random() * 0.12;
    if (opts.pos && sp.d > FAR) {
      // distant: a muffled boom, delayed a touch by distance
      this.source(B[id + '_far'], Math.min(1, sp.vol * 3.2), sp.pan, r(), Math.min(0.25, sp.d / 340));
      return;
    }
    this.source(B[id + '_body'], sp.vol, sp.pan, r());
    this.source(B[id + '_crack'], sp.vol * 0.7, sp.pan, r());
    this.source(B[id + '_tail'], sp.vol * 0.45, sp.pan * 0.6, r());
  }

  // Play a short sequence of [name, delaySeconds] (used for reload animations).
  sequence(steps, opts = {}) {
    if (!this.ctx) return;
    const sp = this.spatial(opts);
    if (!sp) return;
    for (const [name, at] of steps) if (this.buffers[name]) this.source(this.buffers[name], sp.vol, sp.pan, 1, at);
  }

  // pos: optional {x,y,z}; positional sounds attenuate and pan.
  play(name, opts = {}) {
    if (!this.ctx) return;
    if (GUNS[name]) return this.playGun(name, opts);
    if (name === 'step' && opts.pos && this.surfaceAt) name = 'step_' + this.surfaceAt(opts.pos);
    if (!this.buffers[name]) return;
    let vol = opts.vol ?? 1, pan = 0;
    if (opts.pos) {
      const L = this.listener;
      const dx = opts.pos.x - L.x, dy = opts.pos.y - L.y, dz = opts.pos.z - L.z;
      const d = Math.hypot(dx, dy, dz);
      const range = opts.range ?? 90;
      if (d > range) return;
      vol *= Math.max(0, 1 - d / range) ** 1.6;
      // right vector of listener facing yaw: forward (-sin, -cos) -> right (cos, -sin)
      const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
      pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
    }
    if (vol < 0.01) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g).connect(p).connect(this.master);
    src.start();
  }

  loop(name, vol) {
    if (!this.ctx) return;
    let l = this.loops[name];
    if (!l) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name]; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g).connect(this.master); src.start();
      l = this.loops[name] = { src, g, v: 0 };
    }
    l.v += (vol - l.v) * 0.08;
    l.g.gain.value = l.v;
  }

  stopLoops() { for (const k in this.loops) this.loop(k, 0); for (const k in this.loops) { this.loops[k].g.gain.value = 0; this.loops[k].v = 0; } }
}

export const audio = new Audio();
