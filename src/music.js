// Procedural music: a small WebAudio step sequencer with three original tracks
// (lobby, exploration and final-circle), crossfaded by game state.
import { saveSettings } from './game.js';

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// chords: [root midi note, intervals]; patterns are 16 steps per bar.
// lead: semitones above the chord root plus an octave, -1 is a rest (32 steps = two bars).
const TRACKS = {
  lobby: {
    bpm: 116,
    chords: [[48, [0, 4, 7, 11]], [55, [0, 4, 7, 9]], [57, [0, 3, 7, 10]], [53, [0, 4, 7, 11]]],
    bass: 'x..x..x.x..x..x.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    lead: [12, -1, 16, -1, 19, -1, 16, 14, 12, -1, -1, 7, 9, -1, 11, -1, 12, -1, 16, 19, 24, -1, 23, 21, 19, -1, 16, -1, 14, -1, -1, -1],
    pad: 0.045, padCut: 1700, leadVol: 0.05, leadWave: 'square', bassVol: 0.13, bassWave: 'triangle', drums: 0.7,
  },
  explore: {
    bpm: 78,
    chords: [[45, [0, 3, 7, 10]], [41, [0, 4, 7, 11]], [48, [0, 4, 7, 9]], [43, [0, 4, 7, 10]]],
    bass: 'x.......x.......', kick: 'x.........x.....', snare: '', hat: '....x.......x...',
    lead: [24, -1, -1, -1, -1, -1, 19, -1, -1, -1, 22, -1, -1, -1, -1, -1, 19, -1, -1, -1, 17, -1, -1, -1, 15, -1, -1, -1, -1, -1, -1, -1],
    pad: 0.06, padCut: 1000, leadVol: 0.035, leadWave: 'triangle', bassVol: 0.1, bassWave: 'sine', drums: 0.32,
  },
  intense: {
    bpm: 148,
    chords: [[50, [0, 3, 7]], [46, [0, 4, 7]], [48, [0, 4, 7]], [45, [0, 4, 7]]],
    bass: 'x.xxx.x.x.xxx.x.', kick: 'x...x...x...x.x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
    lead: [12, 15, 19, 24, 19, 15, 12, 15, 12, 15, 19, 22, 24, 22, 19, 15, 12, 15, 19, 24, 27, 24, 19, 15, 24, 22, 19, 15, 12, -1, 12, -1],
    pad: 0.035, padCut: 2400, leadVol: 0.032, leadWave: 'sawtooth', bassVol: 0.15, bassWave: 'square', drums: 1.0,
  },
};

export class Music {
  constructor(game) {
    this.game = game; this.audio = game.audio;
    this.ready = false; this.tracks = []; this.name = null;
    this.duckK = 1; this.overAt = 0;
  }

  ensure() {
    if (this.ready) return true;
    const ctx = this.audio.ctx;
    if (!ctx || !this.audio.master) return false;
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.out.connect(this.audio.master);
    const n = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.ready = true;
    setInterval(() => this.schedule(), 40);
    return true;
  }

  duck(on) { this.duckK = on ? 0.3 : 1; }

  setTrack(name) {
    if (!this.ready || name === this.name) return;
    const now = this.ctx.currentTime;
    for (const tr of this.tracks) if (!tr.stopAt) {
      tr.gain.gain.cancelScheduledValues(now);
      tr.gain.gain.setValueAtTime(tr.gain.gain.value, now);
      tr.gain.gain.linearRampToValueAtTime(0, now + 2.5);
      tr.stopAt = now + 2.6;
    }
    this.name = name;
    if (!name) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + 2.5);
    g.connect(this.out);
    this.tracks.push({ def: TRACKS[name], gain: g, step: 0, next: now + 0.1, stopAt: 0 });
  }

  schedule() {
    const ctx = this.ctx, now = ctx.currentTime;
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      if (tr.stopAt && now > tr.stopAt) { tr.gain.disconnect(); this.tracks.splice(i, 1); continue; }
      const stepLen = 60 / tr.def.bpm / 4;
      if (tr.next < now - 0.5) tr.next = now + 0.05; // tab was asleep; don't burst-play the backlog
      while (tr.next < now + 0.2) { this.playStep(tr, tr.step, tr.next, stepLen); tr.next += stepLen; tr.step++; }
    }
    const target = (this.game.settings.music ?? 0.5) * 0.6 * this.duckK;
    this.out.gain.setTargetAtTime(target, now, 0.25);
  }

  playStep(tr, step, time, stepLen) {
    const d = tr.def, s = step % 16, bar = Math.floor(step / 16) % d.chords.length;
    const [root, ivs] = d.chords[bar];
    const dest = tr.gain;
    if (s === 0) for (const iv of ivs) this.pad(hz(root + iv), time, stepLen * 16, d.pad, d.padCut, dest);
    if (d.bass[s] === 'x') this.tone(d.bassWave, hz(root - 12), time, stepLen * 1.8, d.bassVol, dest, 900);
    if (d.kick[s] === 'x') this.kick(time, 0.5 * d.drums, dest);
    if (d.snare && d.snare[s] === 'x') this.snare(time, 0.22 * d.drums, dest);
    if (d.hat[s] === 'x') this.hat(time, (s % 4 === 2 ? 0.08 : 0.05) * d.drums, dest);
    const n = d.lead[step % d.lead.length];
    if (n >= 0) this.tone(d.leadWave, hz(root + 12 + n), time, stepLen * 1.6, d.leadVol, dest, 3200);
  }

  // ---- instruments
  tone(type, freq, time, dur, vol, dest, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(time); o.stop(time + dur + 0.05);
  }

  pad(freq, time, dur, vol, cutoff, dest) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(vol, time + dur * 0.75);
    g.gain.linearRampToValueAtTime(0, time + dur);
    f.connect(g).connect(dest);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(f); o.start(time); o.stop(time + dur + 0.05);
    }
  }

  kick(time, vol, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, time); o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    o.connect(g).connect(dest); o.start(time); o.stop(time + 0.32);
  }

  snare(time, vol, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    src.connect(f).connect(g).connect(dest); src.start(time); src.stop(time + 0.18);
    this.tone('triangle', 190, time, 0.08, vol * 0.5, dest, 2000);
  }

  hat(time, vol, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    src.connect(f).connect(g).connect(dest); src.start(time, Math.random() * 0.3); src.stop(time + 0.05);
  }

  // Pick the track for the current game state.
  choose() {
    if (!this.ensure()) return;
    const g = this.game;
    let want = 'lobby';
    if (g.phase === 'loading') want = this.name;
    else if (g.phase === 'play') {
      const boss = g.boss && !g.boss.dormant && g.boss.alive;
      const late = (g.storm && g.storm.phase >= 3) || boss || g.aliveCount() <= 5;
      want = late ? 'intense' : 'explore';
      if (g.cutscene?.mode === 'boss') want = 'intense';
    } else if (g.phase === 'over') {
      if (!this.overAt) this.overAt = performance.now();
      want = performance.now() - this.overAt < 6000 ? null : 'lobby';
      if (g.cutscene?.mode === 'ending') want = 'explore';
    }
    if (g.phase !== 'over') this.overAt = 0;
    this.setTrack(want);
  }
}

export function installMusic(game) {
  const music = new Music(game);
  game.music = music;
  setInterval(() => music.choose(), 500);
  // the audio context needs a user gesture; start it on the first interaction so the lobby has music
  const kick = () => { game.audio.init(); removeEventListener('pointerdown', kick); removeEventListener('keydown', kick); };
  addEventListener('pointerdown', kick); addEventListener('keydown', kick);

  // settings: Music volume and Voiced radio lines (elements live in the settings panel in index.html)
  const s = game.settings;
  const vol = document.getElementById('setMusic'), val = document.getElementById('setMusicVal'), voice = document.getElementById('setVoice');
  if (vol) {
    vol.value = s.music ?? 0.5; val.textContent = Math.round((s.music ?? 0.5) * 100) + '%';
    vol.addEventListener('input', () => { s.music = +vol.value; val.textContent = Math.round(s.music * 100) + '%'; saveSettings(s); });
  }
  if (voice) {
    voice.checked = s.voice !== false;
    voice.addEventListener('change', () => { s.voice = voice.checked; saveSettings(s); if (!s.voice) game.voice?.cancel(); });
  }
  return music;
}
