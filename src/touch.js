// Mobile and tablet support: on-screen touch controls, mobile-friendly defaults,
// fullscreen landscape play and light aim assist for touch players (cross-play friendly).
import { saveSettings } from './game.js';

export function isTouchDevice() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const fine = matchMedia('(any-pointer: fine)').matches;
  return coarse || (navigator.maxTouchPoints > 0 && !fine);
}

const CSS = `
#touchUI { position: fixed; inset: 0; z-index: 6; pointer-events: none; display: none; touch-action: none; user-select: none; -webkit-user-select: none; }
body.touch.in-match-play #touchUI { display: block; }
#touchUI .zone { position: absolute; top: 0; bottom: 0; pointer-events: auto; touch-action: none; }
#tMoveZone { left: 0; width: 42%; }
#tLookZone { right: 0; width: 58%; }
#tStick { position: absolute; width: 132px; height: 132px; margin: -66px 0 0 -66px; border-radius: 50%; border: 3px solid rgba(255,255,255,.45);
  background: radial-gradient(circle, rgba(255,255,255,.08), rgba(0,0,0,.25)); display: none; pointer-events: none; }
#tStick i { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%; background: rgba(255,255,255,.75); box-shadow: 0 2px 10px rgba(0,0,0,.5); }
#tStick.sprint { border-color: #ffd84a; }
#tStickHint { position: absolute; left: 16%; bottom: 26%; width: 110px; height: 110px; margin-left: -55px; border-radius: 50%; border: 2px dashed rgba(255,255,255,.25); pointer-events: none; }
.tbtn { position: absolute; pointer-events: auto; touch-action: none; display: grid; place-items: center; border-radius: 50%;
  background: rgba(10, 16, 34, .55); border: 2px solid rgba(255,255,255,.55); color: #fff; font: 800 12px Rubik, sans-serif; text-transform: uppercase;
  letter-spacing: .5px; box-shadow: 0 3px 10px rgba(0,0,0,.4); }
.tbtn.on, .tbtn:active { background: rgba(255, 216, 74, .85); color: #1a1200; border-color: #fff; }
.tbtn svg { width: 55%; height: 55%; fill: currentColor; }
#tFire { right: 15%; bottom: 26%; width: 92px; height: 92px; background: rgba(220, 60, 50, .55); }
#tFireL { left: 3%; top: 42%; width: 60px; height: 60px; background: rgba(220, 60, 50, .45); }
#tJump { right: 3%; bottom: 7%; width: 70px; height: 70px; }
#tCrouch { right: 16%; bottom: 4%; width: 52px; height: 52px; }
#tAds { right: 3%; bottom: 33%; width: 56px; height: 56px; }
#tReload { right: 29%; bottom: 20%; width: 48px; height: 48px; }
#tBuild { right: 3%; bottom: 48%; width: 50px; height: 50px; }
#tUse { right: 30%; bottom: 44%; width: 70px; height: 70px; border-radius: 18px; background: rgba(60, 170, 90, .7); display: none; }
#tUse.show { display: grid; }
#tEmote { left: 3%; top: 62%; width: 44px; height: 44px; }
#tPause { left: 50%; top: 6px; width: 40px; height: 40px; margin-left: -20px; border-radius: 10px; }
#tPieces { position: absolute; right: 12%; top: 24%; display: none; gap: 6px; pointer-events: none; }
body.touch.build-mode #tPieces { display: flex; }
#tPieces .tbtn { position: static; width: 54px; height: 54px; border-radius: 12px; font-size: 10px; }
#tPieces .tbtn.sel { background: rgba(40,140,230,.85); }
#rotateHint { position: fixed; inset: 0; z-index: 50; display: none; place-items: center; text-align: center; background: #0b1022; color: #fff;
  font: 800 22px Rubik, sans-serif; padding: 24px; }
#rotateHint b { display: block; font-size: 64px; margin-bottom: 12px; }
@media (orientation: portrait) { body.touch.in-match #rotateHint { display: grid; } }
/* HUD adjustments on small touch screens */
body.touch #hud #hotbar, body.touch #hud #hotbar .slot, body.touch #hud #minimap, body.touch #hud #bigmap { pointer-events: auto; }
@media (max-height: 520px) {
  body.touch #hud #objectives, body.touch #hud #teamPanel { transform: scale(.6); transform-origin: top left; }
  body.touch #hud #topright { transform: scale(.5); transform-origin: top right; }
  body.touch #hud #bottomright { transform: translateX(-50%) scale(.58); transform-origin: bottom center; left: 50% !important; right: auto !important; bottom: 4px !important; align-items: center; }
  body.touch #hud #heldCard { min-width: 0; }
  body.touch #hud #vitals { transform: scale(.6); transform-origin: bottom left; bottom: 4px; }
  body.touch #hud #prompt { top: auto; bottom: 34%; }
  body.touch #hud #mats { display: none; }
  body.touch #hud #radio { transform: scale(.55); transform-origin: top left; top: 84px; bottom: auto; }
  body.touch #hud #killfeed { transform: scale(.75); transform-origin: top left; }
  body.touch #hud #compass, body.touch #hud #compassStrip { transform: scale(.75); transform-origin: top center; }
}
`;

const ICONS = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M11 1h2v6h-2zM11 17h2v6h-2zM1 11h6v2H1zM17 11h6v2h-6z"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 3l8 9h-5v9H9v-9H4z"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M12 21l-8-9h5V3h6v9h5z"/></svg>',
  ads: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2v3H8v2h3v3h2v-3h3v-2h-3V8z"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M12 4V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>',
  build: '<svg viewBox="0 0 24 24"><path d="M2 4h9v6H2zM13 4h9v6h-9zM2 12h5v6H2zM9 12h6v6H9zM17 12h5v6h-5z"/></svg>',
  emote: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm8 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-9 5h10a5 5 0 0 1-10 0z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
};

class TouchControls {
  constructor(game) {
    this.game = game;
    this.C = game.controller.controls;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root = document.createElement('div'); this.root.id = 'touchUI';
    this.root.innerHTML = `
      <div class="zone" id="tMoveZone"><div id="tStickHint"></div><div id="tStick"><i></i></div></div>
      <div class="zone" id="tLookZone"></div>
      <div class="tbtn" id="tFire">${ICONS.fire}</div><div class="tbtn" id="tFireL">${ICONS.fire}</div>
      <div class="tbtn" id="tJump">${ICONS.jump}</div><div class="tbtn" id="tCrouch">${ICONS.crouch}</div>
      <div class="tbtn" id="tAds">${ICONS.ads}</div><div class="tbtn" id="tReload">${ICONS.reload}</div>
      <div class="tbtn" id="tBuild">${ICONS.build}</div><div class="tbtn" id="tUse">Use</div>
      <div class="tbtn" id="tEmote">${ICONS.emote}</div><div class="tbtn" id="tPause">${ICONS.pause}</div>
      <div id="tPieces"><div class="tbtn" data-p="wall">Wall</div><div class="tbtn" data-p="floor">Floor</div><div class="tbtn" data-p="ramp">Ramp</div><div class="tbtn" data-p="cone">Cone</div><div class="tbtn" data-mat="1">Mat</div></div>`;
    document.body.appendChild(this.root);
    const rot = document.createElement('div'); rot.id = 'rotateHint'; rot.innerHTML = '<div><b>&#8635;</b>Turn your device sideways to play</div>';
    document.body.appendChild(rot);
    this.$ = (id) => this.root.querySelector('#' + id);
    this.stick = null; this.look = null;
    this.bindStick(); this.bindLook();
    this.hold('tFire', 'fire', true); this.hold('tFireL', 'fire', true);
    this.hold('tJump', 'jump'); this.hold('tCrouch', 'crouch'); this.hold('tUse', 'interact');
    this.toggleBtn('tAds', 'ads');
    this.tap('tReload', () => this.C.vTap(game.buildMode ? 'cycleMat' : 'reload'));
    this.tap('tBuild', () => this.C.vTap('buildToggle'));
    this.tap('tEmote', () => { game.emotes?.play?.(['bop', 'swing', 'wave'][Math.random() * 3 | 0]); });
    this.tap('tPause', () => game.ui.showPause());
    for (const b of this.$('tPieces').children) {
      this.tap(b, () => { if (b.dataset.p) this.C.vTap(b.dataset.p); else this.C.vTap('cycleMat'); });
    }
    this.bindHud();
    // show/hide with the match and keep contextual buttons fresh
    setInterval(() => this.refresh(), 120);
  }

  // ---------------------------------------------------------------- helpers
  el(x) { return typeof x === 'string' ? this.$(x) : x; }

  tap(id, fn) {
    this.el(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
  }

  // Hold an action while pressed. With look=true, dragging the button also aims (like the classic mobile fire button).
  hold(id, action, look = false) {
    const el = this.el(id);
    let pid = null, lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      pid = e.pointerId; lx = e.clientX; ly = e.clientY;
      try { el.setPointerCapture(pid); } catch { /* synthetic or stale pointer */ } el.classList.add('on');
      this.C.vPress(action);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || !look) return;
      this.C.vLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
    });
    const up = (e) => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('on'); this.C.vRelease(action); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  toggleBtn(id, action) {
    const el = this.el(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.C.vHeld.has(action)) { this.C.vRelease(action); el.classList.remove('on'); }
      else { this.C.vPress(action); el.classList.add('on'); }
    });
  }

  bindStick() {
    const zone = this.$('tMoveZone'), stick = this.$('tStick'), knob = stick.firstElementChild, R = 56;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.hudTap(e.clientX, e.clientY) || this.stick) return;
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
      stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px';
      knob.style.transform = '';
    });
    zone.addEventListener('pointermove', (e) => {
      const s = this.stick; if (!s || e.pointerId !== s.id) return;
      let dx = e.clientX - s.x, dy = e.clientY - s.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, d / R);
      this.C.vMove.x = (dx / R); this.C.vMove.z = (dy / R);
      // push the stick all the way forward to sprint
      const sprint = k > 0.92 && dy < -R * 0.7;
      if (sprint) this.C.vPress('sprint'); else this.C.vRelease('sprint');
      stick.classList.toggle('sprint', sprint);
    });
    const end = (e) => {
      const s = this.stick; if (!s || e.pointerId !== s.id) return;
      this.stick = null; stick.style.display = 'none';
      this.C.vMove.x = this.C.vMove.z = 0; this.C.vRelease('sprint');
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  bindLook() {
    const zone = this.$('tLookZone');
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.hudTap(e.clientX, e.clientY) || this.look) return;
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY };
      try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    });
    zone.addEventListener('pointermove', (e) => {
      const l = this.look; if (!l || e.pointerId !== l.id) return;
      this.C.vLook(e.clientX - l.x, e.clientY - l.y); l.x = e.clientX; l.y = e.clientY;
    });
    const end = (e) => {
      const l = this.look; if (!l || e.pointerId !== l.id) return;
      // a quick tap on the look pad while dead or spectating cycles the camera
      if (performance.now() - l.t < 200 && Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 12 && !this.game.player?.alive) this.C.vTap('fire');
      this.look = null;
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  // The joystick and look pad cover the whole screen above the HUD, so a touch that starts
  // on a loadout slot or the minimap is routed here first. Returns true if it was handled.
  hudTap(x, y) {
    const inside = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    const slots = document.querySelectorAll('#hotbar .slot');
    for (let i = 0; i < slots.length; i++) {
      if (inside(slots[i])) { this.C.vTap(['pickaxe', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'][i]); return true; }
    }
    if (inside(document.getElementById('minimap'))) { this.game.toggleBigMap(); return true; }
    return false;
  }

  // Tap hotbar slots to equip and the minimap to open the full map (used when they're on top).
  bindHud() {
    const hb = document.getElementById('hotbar');
    if (hb) hb.addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('.slot'); if (!slot) return;
      const i = [...hb.children].indexOf(slot);
      if (i >= 0) { e.preventDefault(); this.C.vTap(['pickaxe', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'][i]); }
    });
    const mm = document.getElementById('minimap');
    if (mm) mm.addEventListener('pointerdown', (e) => { e.preventDefault(); this.game.toggleBigMap(); });
  }

  refresh() {
    const g = this.game;
    const playing = g.inMatch() && g.ui.screen === null && !g.bigMapOpen && !g.replay?.active;
    document.body.classList.toggle('in-match-play', playing);
    document.body.classList.toggle('in-match', g.inMatch());
    document.body.classList.toggle('build-mode', !!g.buildMode);
    if (!playing) { this.C.vHeld.clear(); this.C.vMove.x = this.C.vMove.z = 0; this.root.querySelectorAll('.on').forEach(b => b.classList.remove('on')); }
    const prompt = document.getElementById('prompt');
    const text = prompt ? prompt.textContent.trim() : '';
    const use = this.$('tUse');
    use.classList.toggle('show', !!text);
    if (text) use.textContent = /search/i.test(text) ? 'Open' : /buy/i.test(text) ? 'Buy' : /ride/i.test(text) ? 'Ride' : /revive/i.test(text) ? 'Revive' : 'Pick up';
    this.$('tBuild').style.display = g.noBuild ? 'none' : '';
    for (const b of this.$('tPieces').children) b.classList.toggle('sel', b.dataset.p === g.buildPiece);
  }
}

// Light aim assist for touch and controller players: slows the crosshair over an enemy
// and gently pulls toward them while aiming. Keyboard and mouse never get assist.
function aimAssist(game, dt) {
  const C = game.controller.controls, p = game.player;
  if (!p || !p.alive || p.state !== 'ground' || game.settings.aimAssist === false) return;
  if (!(C.usingTouch || C.usingPad)) return;
  const held = p.held();
  if (!held || held.kind !== 'weapon' || held.id === 'pickaxe') return;
  const eye = p.eyePos, look = p.lookDir();
  let best = null, bestAng = p.ads ? 0.09 : 0.06;
  for (const a of game.actors) {
    if (a === p || !a.alive || a.state === 'bus' || a.dormant || game.sameTeam?.(a, p)) continue;
    const c = a.center, d = c.clone().sub(eye), dist = d.length();
    if (dist > 70) continue;
    d.divideScalar(dist);
    const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(look))));
    if (ang < bestAng && game.world.los(eye, c)) { bestAng = ang; best = d; }
  }
  if (!best) return;
  const k = Math.min(1, dt * (p.ads ? 6 : 3));
  const yaw = Math.atan2(-best.x, -best.z), pitch = Math.asin(best.y);
  let dy = yaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  p.yaw += dy * k * 0.5; p.pitch += (pitch - p.pitch) * k * 0.5;
}

export function installTouch(game) {
  const s = game.settings;
  const mode = s.touchControls || 'auto';
  const enabled = mode === 'on' || (mode === 'auto' && isTouchDevice());
  game.platform = enabled ? 'mobile' : 'desktop';
  game.net.platform = game.platform;
  game.addSystem({ update: (dt) => aimAssist(game, dt) });
  addSettingsCard(game, enabled);
  // installable app + offline fallback (service workers need https or localhost)
  if (!game.native && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!enabled) return;
  document.body.classList.add('touch');
  // lighter defaults on first launch on a phone or tablet
  if (!s.mobileDefaults) {
    s.mobileDefaults = true; s.quality = 'low'; s.bots = Math.min(s.bots ?? 10, 10);
    saveSettings(s); game.applyQuality?.(); game.ui?.renderPlayOptions?.();
  }
  // stop the page scrolling, zooming or long-press selecting during play
  document.addEventListener('touchmove', (e) => { if (game.inMatch()) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  game.touch = new TouchControls(game);
}

function addSettingsCard(game, enabled) {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  const s = game.settings;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="cardhead"><h3>Touch and mobile</h3></div>
    <label>Touch controls <select id="setTouch"><option value="auto">Automatic</option><option value="on">Always on</option><option value="off">Off</option></select></label>
    <label>Touch look sensitivity <input type="range" id="setTouchSens" min="0.3" max="3" step="0.05"> <b id="setTouchSensVal"></b></label>
    <label class="check"><input type="checkbox" id="setAimAssist"> Aim assist (touch and controller only)</label>
    <p class="hint">${enabled ? 'Touch controls are active on this device.' : 'Touch controls are off on this device.'} Changing the touch controls option takes effect after a reload.</p>`;
  panel.appendChild(card);
  const sel = card.querySelector('#setTouch'), sens = card.querySelector('#setTouchSens'), val = card.querySelector('#setTouchSensVal'), aa = card.querySelector('#setAimAssist');
  sel.value = s.touchControls || 'auto';
  sens.value = s.touchSens ?? 1; val.textContent = (+sens.value).toFixed(2);
  aa.checked = s.aimAssist !== false;
  sel.onchange = () => { s.touchControls = sel.value; saveSettings(s); };
  sens.oninput = () => { s.touchSens = +sens.value; val.textContent = s.touchSens.toFixed(2); saveSettings(s); };
  aa.onchange = () => { s.aimAssist = aa.checked; saveSettings(s); };
}

// Called when a match starts or resumes on a touch device: no pointer lock, try fullscreen landscape.
export async function enterTouchPlay() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* not supported (iOS Safari) or refused; play continues */ }
}
