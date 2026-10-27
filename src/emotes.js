// Emote wheel: hold the emote input (B / gamepad d-pad up), point at an emote, release to play.
// Emotes lock movement until you move, jump or fire. Synced with the 'emote' message and snapshot field 'em'.

export const EMOTES = [
  { id: 'wave', name: 'Wave', icon: '\u{1F44B}' },
  { id: 'bop', name: 'Block Bop', icon: '\u{1F57A}', dance: true },
  { id: 'swing', name: 'Pixel Swing', icon: '\u{1F483}', dance: true },
  { id: 'laugh', name: 'Laugh', icon: '\u{1F602}' },
  { id: 'salute', name: 'Salute', icon: '\u{1FAE1}' },
  { id: 'sit', name: 'Take a Seat', icon: '\u{1FA91}' },
];

const CSS = `
#emoteWheel { position: fixed; left: 50%; top: 50%; width: 380px; height: 380px; margin: -190px 0 0 -190px; border-radius: 50%; z-index: 9;
  background: radial-gradient(circle, rgba(10,16,40,.35) 0 22%, rgba(10,16,40,.82) 23% 70%, rgba(10,16,40,0) 71%); pointer-events: none;
  opacity: 0; transform: scale(.85); transition: opacity .12s, transform .12s; }
#emoteWheel.show { opacity: 1; transform: scale(1); }
#emoteWheel .ew { position: absolute; width: 96px; height: 76px; margin: -38px 0 0 -48px; text-align: center; border-radius: 14px; color: #fff;
  font: 700 12px var(--font-body, sans-serif); text-shadow: 0 2px 0 #000; transition: transform .1s, background .1s; }
#emoteWheel .ew b { display: block; font-size: 34px; line-height: 46px; text-shadow: none; }
#emoteWheel .ew.sel { background: rgba(255, 216, 74, .9); color: #1a1200; transform: scale(1.12); text-shadow: none; }
#emoteWheel .ec { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: #ffd84a; font: 900 16px var(--font-display, sans-serif); letter-spacing: 1px; text-shadow: 0 2px 0 #000; }
`;

export class Emotes {
  constructor(game) {
    this.game = game;
    this.open = false; this.sel = -1; this.vx = 0; this.vy = 0;
    this.sparkT = 0; this.locked = false;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'emoteWheel';
    el.innerHTML = EMOTES.map((e, i) => {
      const a = (i / EMOTES.length) * Math.PI * 2;
      return `<div class="ew" data-i="${i}" style="left:${190 + Math.sin(a) * 128}px;top:${190 - Math.cos(a) * 128}px"><b>${e.icon}</b>${e.name}</div>`;
    }).join('') + '<div class="ec">EMOTES</div>';
    document.body.appendChild(el);
    this.el = el;
    addEventListener('mousemove', (e) => {
      if (!this.open || document.pointerLockElement !== game.renderer.domElement) return;
      this.vx += e.movementX; this.vy += e.movementY;
      const m = Math.hypot(this.vx, this.vy);
      if (m > 120) { this.vx *= 120 / m; this.vy *= 120 / m; }
    });
    game.net.on('emote', (m) => {
      const a = game.actorById(m.id);
      if (!a || !a.remote) return;
      a.emote = m.e ? { id: m.e, t: 0 } : null;
      const def = EMOTES.find(x => x.id === m.e);
      if (def && def.dance) game.audio.play('emote_sting', { pos: a.pos, range: 40 });
    });
  }

  setLock(on) {
    const p = this.game.player;
    if (!p) return;
    if (on && !p.inputLocked) { p.inputLocked = true; this.locked = true; }
    if (!on && this.locked) { p.inputLocked = false; this.locked = false; }
  }

  openWheel() { this.open = true; this.vx = this.vy = 0; this.sel = -1; this.el.classList.add('show'); this.setLock(true); }

  closeWheel(play) {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    if (play && this.sel >= 0) this.play(EMOTES[this.sel].id);
    else if (!this.game.player?.emote) this.setLock(false);
  }

  play(id) {
    const g = this.game, p = g.player;
    if (!p || !p.alive || p.state !== 'ground' || p.downed) { this.setLock(false); return; }
    p.emote = { id, t: 0 };
    p.ads = false; p.reloading = 0; p.using = null;
    this.setLock(true);
    g.net.send({ t: 'emote', id: p.id, e: id });
    const def = EMOTES.find(e => e.id === id);
    if (def && def.dance) g.audio.play('emote_sting', { vol: 0.8 });
    g.cutscene?.startEmote();
  }

  stop() {
    const g = this.game, p = g.player;
    if (p && p.emote) { p.emote = null; g.net.send({ t: 'emote', id: p.id, e: null }); }
    this.setLock(false);
    g.cutscene?.stopEmote();
  }

  update(dt) {
    const g = this.game, p = g.player, C = g.controller.controls;
    if (!p) return;
    const able = p.alive && p.state === 'ground' && !p.downed && !g.paused && !(g.cutscene && g.cutscene.mode && g.cutscene.mode !== 'emote');
    if (!able) { if (this.open) this.closeWheel(false); if (p.emote) this.stop(); return; }

    if (C.down('emote')) {
      if (!this.open) this.openWheel();
      // gamepad right stick points at an emote too
      if (C.padLook && (Math.abs(C.padLook.x) > 0.3 || Math.abs(C.padLook.y) > 0.3)) { this.vx = C.padLook.x * 120; this.vy = C.padLook.y * 120; }
      const m = Math.hypot(this.vx, this.vy);
      let sel = -1;
      if (m > 35) {
        const a = (Math.atan2(this.vx, -this.vy) + Math.PI * 2) % (Math.PI * 2);
        sel = Math.round(a / (Math.PI * 2 / EMOTES.length)) % EMOTES.length;
      }
      if (sel !== this.sel) {
        this.sel = sel;
        for (const c of this.el.querySelectorAll('.ew')) c.classList.toggle('sel', +c.dataset.i === sel);
        this.el.querySelector('.ec').textContent = sel >= 0 ? EMOTES[sel].name.toUpperCase() : 'EMOTES';
      }
      return;
    }
    if (this.open) this.closeWheel(true);

    if (p.emote) {
      const mv = C.move();
      if (Math.hypot(mv.x, mv.z) > 0.2 || C.down('fire') || C.down('jump') || C.down('ads') || C.down('crouch')) { this.stop(); return; }
      const def = EMOTES.find(e => e.id === p.emote.id);
      if (def && def.dance) {
        this.sparkT -= dt;
        if (this.sparkT <= 0) {
          this.sparkT = 0.25;
          const cols = [[1, 0.4, 0.8], [0.4, 0.9, 1], [1, 0.85, 0.3], [0.5, 1, 0.5]];
          g.effects.sparkle(p.pos.x, p.pos.y + 2.1, p.pos.z, cols[Math.floor(Math.random() * cols.length)], 2);
        }
      }
    }
  }

  reset() {
    if (this.open) { this.open = false; this.el.classList.remove('show'); }
    this.locked = false;
  }
}

export function installEmotes(game) {
  const e = new Emotes(game);
  game.emotes = e;
  game.addSystem(e);
  return e;
}
