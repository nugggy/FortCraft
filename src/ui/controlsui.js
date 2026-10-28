// Settings: key rebinding, controller options and accessibility (colour-blind mode, kill cam).
import { saveSettings } from '../game.js';
import { ACTION_LABELS, PAD_LAYOUT, keyLabel } from '../controls.js';
import { applyColourBlind, RARITY, RARITY_LETTERS } from '../items.js';

const GROUPS = [
  ['Movement', ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'crouch']],
  ['Combat', ['fire', 'ads', 'reload', 'interact', 'pickaxe', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'nextItem', 'prevItem']],
  ['Building', ['wall', 'floor', 'ramp', 'cone', 'buildToggle', 'cycleMat', 'edit']],
  ['Other', ['map', 'ping', 'emote', 'scoreboard']],
];
// Bindings that may share a key on purpose (R reloads, or swaps material in build mode).
const SHARED_OK = [['reload', 'cycleMat']];
const CB_MODES = [['off', 'Off'], ['deuteranopia', 'Deuteranopia (green-weak)'], ['protanopia', 'Protanopia (red-weak)'], ['tritanopia', 'Tritanopia (blue-weak)']];

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export function installControlsUI(game) {
  const s = game.settings;
  const C = () => game.controller.controls;

  // ---------------------------------------------------------------- colour-blind mode
  const applyCb = () => {
    const mode = s.colourBlind || 'off';
    applyColourBlind(mode);
    document.body.dataset.cb = mode;
    game.hud?.refreshPalette?.();
  };
  applyCb();

  const panel = document.getElementById('settingsPanel');
  if (!panel) return;

  // ---------------------------------------------------------------- key bindings card
  const bindCard = el('div', 'card bindcard');
  bindCard.innerHTML = '<div class="cardhead"><h3>Key bindings</h3><button class="ghost small" id="bindReset">Reset to defaults</button></div><p class="hint" id="bindHint">Click a binding, then press a key or mouse button. Esc cancels, Backspace clears.</p><div id="bindList"></div>';
  panel.appendChild(bindCard);

  let listening = null;
  const conflicts = () => {
    const byCode = new Map();
    for (const a in C().binds) for (const c of C().binds[a]) { if (!byCode.has(c)) byCode.set(c, []); byCode.get(c).push(a); }
    const bad = new Set();
    for (const [, acts] of byCode) {
      if (acts.length < 2) continue;
      const ok = SHARED_OK.some(pair => acts.every(a => pair.includes(a)));
      if (!ok) acts.forEach(a => bad.add(a));
    }
    return bad;
  };

  const renderBinds = () => {
    const binds = C().binds;
    const bad = conflicts();
    const grouped = new Set(GROUPS.flatMap(g => g[1]));
    const extra = Object.keys(ACTION_LABELS).filter(a => !grouped.has(a));
    const groups = extra.length ? [...GROUPS.slice(0, 3), ['Other', [...GROUPS[3][1], ...extra]]] : GROUPS;
    const list = document.getElementById('bindList');
    list.innerHTML = groups.map(([title, acts]) => `<div class="bindgroup"><h4>${title}</h4>${acts.filter(a => ACTION_LABELS[a]).map(a => {
      const b = binds[a] || [];
      const btn = (slot) => {
        const isListen = listening && listening.a === a && listening.slot === slot;
        const txt = isListen ? 'Press a key...' : b[slot] ? keyLabel(b[slot]) : (slot ? '+' : 'Unbound');
        return `<button class="bindkey ${isListen ? 'listening' : ''} ${!b[slot] ? 'empty' : ''}" data-a="${a}" data-slot="${slot}">${txt}</button>`;
      };
      return `<div class="bindrow ${bad.has(a) ? 'conflict' : ''}" title="${bad.has(a) ? 'This key is also used by another action' : ''}"><span>${ACTION_LABELS[a]}</span>${btn(0)}${btn(1)}</div>`;
    }).join('')}</div>`).join('');
    document.getElementById('bindHint').textContent = bad.size
      ? 'Some keys are bound to more than one action (highlighted). Click to change them.'
      : 'Click a binding, then press a key or mouse button. Esc cancels, Backspace clears.';
    document.getElementById('bindHint').classList.toggle('warn', bad.size > 0);
    list.querySelectorAll('.bindkey').forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      listening = { a: btn.dataset.a, slot: +btn.dataset.slot };
      renderBinds();
      // Capture on the next input, after this click finishes.
      setTimeout(() => {
        C().capture = (code) => {
          const l = listening; listening = null;
          if (!l) return;
          if (code === 'Escape') { renderBinds(); return; }
          C().rebind(l.a, code === 'Backspace' || code === 'Delete' ? null : code, l.slot);
          saveSettings(s);
          game.hud?.refreshKeyLabels?.();
          renderBinds();
        };
      }, 0);
    });
  };
  addEventListener('keydown', (e) => {
    if (listening && e.code === 'Escape') { listening = null; C().capture = null; renderBinds(); }
  });
  bindCard.querySelector('#bindReset').onclick = () => {
    listening = null; C().capture = null;
    C().resetBinds();
    saveSettings(s);
    game.hud?.refreshKeyLabels?.();
    renderBinds();
  };
  renderBinds();

  // ---------------------------------------------------------------- controller card
  const padCard = el('div', 'card padcard');
  if (s.padSens === undefined) s.padSens = 1;
  padCard.innerHTML = `<h3>Controller</h3>
    <div class="padstatus" id="padStatus"></div>
    <label class="field">Look sensitivity <input type="range" id="setPadSens" min="0.3" max="3" step="0.05"> <b id="setPadSensVal"></b></label>
    <label class="check"><input type="checkbox" id="setPadInvert"> Invert controller look</label>
    <div class="padmap" id="padMap"></div>`;
  panel.appendChild(padCard);
  const padSens = padCard.querySelector('#setPadSens'), padSensVal = padCard.querySelector('#setPadSensVal'), padInv = padCard.querySelector('#setPadInvert');
  const syncPad = () => { padSens.value = s.padSens; padSensVal.textContent = (+s.padSens).toFixed(2); padInv.checked = !!s.padInvert; };
  padSens.oninput = () => { s.padSens = +padSens.value; padSensVal.textContent = s.padSens.toFixed(2); saveSettings(s); };
  padInv.onchange = () => { s.padInvert = padInv.checked; saveSettings(s); };
  padCard.querySelector('#padMap').innerHTML = '<div class="padrow"><b>Layout</b><span>Builder Pro (like Fortnite)</span></div>' +
    PAD_LAYOUT.map(([b, combat, build]) =>
      `<div class="padrow"><b>${b}</b><span>${combat}${build && build !== combat ? ` <small>(build: ${build.toLowerCase()})</small>` : ''}</span></div>`).join('') +
    '<div class="padrow"><b>Left stick</b><span>Move</span></div><div class="padrow"><b>Right stick</b><span>Look</span></div>' +
    '<div class="padrow"><b>Menus</b><span>D-pad or left stick to move, A select, B back, LB / RB switch tabs</span></div>';
  const padStatus = () => {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : [];
    const st = padCard.querySelector('#padStatus');
    st.className = 'padstatus' + (pads.length ? ' on' : '');
    st.innerHTML = pads.length ? `<i></i>Connected: ${pads[0].id.replace(/\(.*?\)/g, '').trim().slice(0, 48) || 'Gamepad'}` : '<i></i>No controller detected. Plug one in and press any button.';
  };
  addEventListener('gamepadconnected', padStatus);
  addEventListener('gamepaddisconnected', padStatus);
  setInterval(() => { if (panel.offsetParent) padStatus(); }, 1500);
  padStatus(); syncPad();

  // ---------------------------------------------------------------- accessibility card
  const a11y = el('div', 'card a11ycard');
  if (s.killCam === undefined) s.killCam = true;
  a11y.innerHTML = `<h3>Accessibility</h3>
    <label class="field">Colour-blind mode <select id="setColourBlind">${CB_MODES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
    <div class="rarityswatch" id="raritySwatch"></div>
    <p class="hint">Rarity letters (C, U, R, E, L) always show on the hotbar so colour is never the only cue.</p>
    <label class="check"><input type="checkbox" id="setKillCam"> Show kill cam when eliminated</label>`;
  panel.appendChild(a11y);
  const cbSel = a11y.querySelector('#setColourBlind'), kc = a11y.querySelector('#setKillCam');
  const swatch = () => {
    a11y.querySelector('#raritySwatch').innerHTML = RARITY.map((r, i) => `<span style="--c:${r.color}"><b>${RARITY_LETTERS[i]}</b>${r.name}</span>`).join('');
  };
  cbSel.onchange = () => { s.colourBlind = cbSel.value; saveSettings(s); applyCb(); swatch(); };
  kc.onchange = () => { s.killCam = kc.checked; saveSettings(s); };
  const syncA11y = () => { cbSel.value = s.colourBlind || 'off'; kc.checked = s.killCam !== false; swatch(); };
  syncA11y();

  // Re-sync whenever the settings panel is shown (it moves between the tab and the pause modal).
  const observer = new MutationObserver(() => { if (panel.offsetParent) { renderBinds(); syncPad(); syncA11y(); padStatus(); } });
  observer.observe(document.getElementById('settingsHomeTab'), { childList: true });
  observer.observe(document.getElementById('settingsHomeModal'), { childList: true });
}
