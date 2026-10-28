// Xbox-style controller support outside of play: menu navigation (d-pad or left stick moves,
// A selects, B goes back, LB/RB switch tabs, Start resumes), hiding the touch overlay while a
// controller is in use, and rumble when the player takes damage. In-match input lives in controls.js.

const NAV_DEAD = 0.5, REPEAT_FIRST = 0.38, REPEAT_NEXT = 0.12;
const FOCUSABLE = 'button, input, select, textarea, a[href]';
const PREFERRED = { menu: '#btnPlay', pause: '#btnResume', end: '#btnAgain', lobby: '#btnLobbyStart', crawl: '#btnCrawl' };

const CSS = `
.padfocus { outline: 3px solid #ffd84a !important; outline-offset: 3px; box-shadow: 0 0 0 6px rgba(255, 216, 74, .25) !important; }
body.touch.pad #touchUI { display: none !important; }
`;

const visible = (el) => {
  if (el.disabled || el.type === 'hidden') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
};
const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

class MenuPad {
  constructor(game) {
    this.game = game;
    this.C = game.controller.controls;
    this.prev = [];          // button pressed state last frame (always tracked, so edges are true presses)
    this.dir = null; this.repeatT = 0;
    this.focus = null;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    // any touch or mouse use hands the screen back to the on-screen controls and pointer
    addEventListener('pointerdown', (e) => { if (e.isTrusted) this.release(); }, true);
    addEventListener('keydown', () => this.release(), true);
    let last = performance.now();
    const loop = (t) => { this.update(Math.min(0.1, (t - last) / 1000)); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    // in-match damage rumble
    const hurt = document.getElementById('hurt');
    if (hurt) new MutationObserver(() => { if (hurt.style.opacity === '0.8') this.rumble(0.6, 0.3, 160); }).observe(hurt, { attributes: true, attributeFilter: ['style'] });
  }

  // True if B was pressed in the last moment (Android can also report it as the system back button).
  recentB() { return performance.now() - (this.lastB || 0) < 400; }

  release() {
    this.C.usingPad = false;
    document.body.classList.remove('pad');
    this.setFocus(null);
  }

  rumble(strong, weak, ms) {
    if (!this.C.usingPad) return;
    const pad = this.pad();
    try { pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* rumble unsupported */ }
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return [...pads].find(p => p && p.connected) || null;
  }

  // The layer the controller drives: a modal overlay, the creative menu, or the current screen.
  layer() {
    const g = this.game;
    const modal = [...document.querySelectorAll('.padlayer')].pop();
    if (modal) return modal;
    const cm = document.getElementById('creativeMenu');
    if (g.creativeMenuOpen && cm) return cm;
    const name = g.ui?.screen;
    if (!name || name === 'loading') return null;
    return document.getElementById(name);
  }

  candidates(root) { return [...root.querySelectorAll(FOCUSABLE)].filter(visible); }

  setFocus(el) {
    if (this.focus === el) return;
    if (this.focus) this.focus.classList.remove('padfocus');
    this.focus = el;
    if (!el) return;
    el.classList.add('padfocus');
    try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // Closest candidate in a direction, favouring ones lined up with the current element.
  move(dx, dy, list) {
    const cur = this.focus;
    if (!cur) return this.setFocus(list[0]);
    const a = centre(cur);
    // first look in a cone around the direction; only if that's empty take anything on that side
    for (const cone of [1, 0.15]) {
      let best = null, bestScore = Infinity;
      for (const el of list) {
        if (el === cur) continue;
        const b = centre(el), ox = b.x - a.x, oy = b.y - a.y;
        const along = ox * dx + oy * dy;
        const across = Math.abs(ox * dy - oy * dx);
        if (along <= 4 || along < across * cone) continue;
        const score = along + across * 2.5;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) return this.setFocus(best);
    }
  }

  // Left and right change sliders and drop-downs in place instead of moving focus.
  adjust(el, dx) {
    if (el.tagName === 'INPUT' && el.type === 'range') {
      const step = +el.step || 1, min = +el.min, max = +el.max;
      const v = Math.max(min, Math.min(max, +el.value + dx * step * (max - min > 20 * step ? 5 : 1)));
      if (v === +el.value) return true;
      el.value = v;
    } else if (el.tagName === 'SELECT') {
      const i = el.selectedIndex + dx;
      if (i < 0 || i >= el.options.length) return true;
      el.selectedIndex = i;
    } else return false;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  activate(el) {
    if (el.tagName === 'SELECT') return this.adjust(el, el.selectedIndex + 1 < el.options.length ? 1 : -el.selectedIndex);
    if (el.tagName === 'INPUT' && el.type === 'range') return;
    if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio') { el.focus(); return; }
    this.suppressAfter();
    el.click();
  }

  back(root) {
    const ui = this.game.ui;
    if (root.classList.contains('padlayer') || root.id === 'creativeMenu') {
      const close = root.querySelector('[data-act="close"], #srvCancel, .back');
      if (close) { this.suppressAfter(); close.click(); }
      return;
    }
    if (ui.screen === 'pause') { this.suppressAfter(); document.getElementById('btnResume')?.click(); return; }
    if (ui.screen === 'menu') { if (ui.tab !== 'play') ui.setTab('play'); this.setFocus(null); return; }
    const back = [...root.querySelectorAll('.back, #btnLobbyLeave, #btnEndMenu, #btnCrawlSkip')].find(visible);
    if (back) { this.suppressAfter(); back.click(); }
  }

  switchTab(d) {
    const ui = this.game.ui;
    const tabs = [...document.querySelectorAll('#tabs .tab')].filter(visible);
    const i = tabs.findIndex(t => t.dataset.tab === ui.tab);
    const next = tabs[(i + d + tabs.length) % tabs.length];
    if (next) { next.click(); this.setFocus(next); }
  }

  // Buttons still held when a menu closes shouldn't also act in the match (A would jump, B crouch).
  suppressAfter() { this.C.padSuppress = new Set(this.prev.map((p, i) => p ? i : -1).filter(i => i >= 0)); }

  update(dt) {
    const pad = this.pad();
    if (!pad) { this.prev = []; if (this.focus) this.setFocus(null); return; }
    const now = pad.buttons.map(b => b.pressed || b.value > 0.5);
    const edge = (i) => now[i] && !this.prev[i];
    if (now[1]) this.lastB = performance.now();
    const anyInput = now.some(Boolean) || pad.axes.some(v => Math.abs(v) > NAV_DEAD);
    if (anyInput) this.C.usingPad = true;
    document.body.classList.toggle('pad', !!this.C.usingPad);

    const root = this.layer();
    // a press that opened or closed a menu belongs to whatever handled it, not to the new layer
    if (root !== this.root) { this.root = root; this.prev = now; this.dir = null; this.setFocus(null); return; }
    if (!root) { this.prev = now; return; }
    const list = this.candidates(root);
    if (this.focus && (!list.includes(this.focus))) this.setFocus(null);
    if (!this.focus && this.C.usingPad && list.length) {
      const pref = PREFERRED[this.game.ui?.screen];
      this.setFocus((pref && list.find(el => el.matches(pref))) || list[0]);
    }

    // direction from d-pad or left stick, with key-repeat while held
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    let dx = (now[15] ? 1 : 0) - (now[14] ? 1 : 0), dy = (now[13] ? 1 : 0) - (now[12] ? 1 : 0);
    if (!dx && !dy) {
      if (Math.abs(ax) > NAV_DEAD && Math.abs(ax) >= Math.abs(ay)) dx = Math.sign(ax);
      else if (Math.abs(ay) > NAV_DEAD) dy = Math.sign(ay);
    }
    const key = dx || dy ? `${dx},${dy}` : null;
    let fire = false;
    if (key !== this.dir) { this.dir = key; this.repeatT = REPEAT_FIRST; fire = !!key; }
    else if (key) { this.repeatT -= dt; if (this.repeatT <= 0) { this.repeatT = REPEAT_NEXT; fire = true; } }
    if (fire && this.focus) {
      if (!(dx && !dy && this.adjust(this.focus, dx))) this.move(dx, dy, list);
    } else if (fire) this.move(dx, dy, list);

    if (edge(0) && this.focus) this.activate(this.focus);
    if (edge(1)) this.back(root);
    if (edge(4) && this.game.ui?.screen === 'menu') this.switchTab(-1);
    if (edge(5) && this.game.ui?.screen === 'menu') this.switchTab(1);
    if (edge(9) && this.game.ui?.screen === 'pause') { this.suppressAfter(); document.getElementById('btnResume')?.click(); }
    this.prev = now;
  }
}

export function installGamepad(game) {
  game.menuPad = new MenuPad(game);
}
