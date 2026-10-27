// Where the game is running: the Android app (Capacitor), GitHub Pages, or a FortCraft server.
import { saveSettings } from './game.js';

export const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const ON_PAGES = /\.github\.io$/i.test(location.hostname);

// Ask for the LAN server address (the app isn't served by the server, so it can't guess).
export function askServerAddress(settings) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:rgba(4,6,16,.75);font-family:Rubik,sans-serif';
    wrap.innerHTML = `<div style="background:#141a33;border:2px solid #3b4a7a;border-radius:14px;padding:18px 20px;width:min(420px,90vw);color:#fff">
      <div style="font:400 26px Lucky,sans-serif;color:#ffd84a;margin-bottom:6px">Join a LAN server</div>
      <p style="margin:0 0 12px;color:#c9d1e8;font-size:14px">Enter the address shown in the server window on your PC or NAS, for example 192.168.1.20:8080.</p>
      <input id="srvAddr" inputmode="url" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box;font:600 18px Rubik,sans-serif;padding:10px 12px;border-radius:8px;border:2px solid #3b4a7a;background:#0b1022;color:#fff">
      <div id="srvErr" style="color:#ff8a8a;font-size:13px;min-height:18px;margin-top:6px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button id="srvCancel" style="font:700 15px Rubik;padding:10px 16px;border-radius:8px;border:0;background:#2b3555;color:#fff">Cancel</button>
        <button id="srvGo" style="font:700 15px Rubik;padding:10px 18px;border-radius:8px;border:0;background:#ffd84a;color:#1a1200">Connect</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('#srvAddr');
    input.value = settings.lanServer || '';
    input.placeholder = '192.168.1.20:8080';
    setTimeout(() => input.focus(), 50);
    const done = (v) => { wrap.remove(); resolve(v); };
    const go = () => {
      let v = input.value.trim().replace(/^(https?|wss?):\/\//i, '').replace(/\/.*$/, '');
      if (!v) { wrap.querySelector('#srvErr').textContent = 'Type the server address first.'; return; }
      if (!/:\d+$/.test(v)) v += ':8080';
      settings.lanServer = v; saveSettings(settings);
      done(v);
    };
    wrap.querySelector('#srvGo').onclick = go;
    wrap.querySelector('#srvCancel').onclick = () => done(null);
    input.onkeydown = (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') done(null); };
  });
}

// Android back button: pause during a match, otherwise go back a screen.
export function installPlatform(game) {
  game.native = NATIVE;
  if (!NATIVE) return;
  document.body.classList.add('native');
  const App = window.Capacitor?.Plugins?.App;
  if (App?.addListener) {
    App.addListener('backButton', () => {
      if (game.inMatch() && game.ui.screen === null) game.ui.showPause();
      else if (game.ui.screen === 'pause') { game.paused = false; game.ui.showScreen(null); }
      else if (game.bigMapOpen) game.toggleBigMap();
    });
  }
}
