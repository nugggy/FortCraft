// Share button on the main menu: sends a link to the latest Android APK (always the newest
// GitHub release) through the system share sheet. The Android app uses the Capacitor Share
// plugin, browsers use the Web Share API, and anything else gets the link to copy.
import { REPO } from './updates.js';
import { NATIVE } from './platform.js';

export const APK_URL = `https://github.com/${REPO}/releases/latest/download/FortCraft.apk`;
const TEXT = 'Play FortCraft with me. Download the Android app here:';

const CSS = `
#btnShare { display: flex; align-items: center; gap: 8px; flex: none; padding: 10px 16px; font: 400 16px var(--display); letter-spacing: 1px; }
#btnShare svg { width: 18px; height: 18px; fill: currentColor; }
#shareBox { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: rgba(4,6,16,.75); font-family: Rubik, sans-serif; }
#shareBox .sb { background: #141a33; border: 2px solid #3b4a7a; border-radius: 14px; padding: 18px 20px; width: min(460px, 90vw); color: #fff; }
#shareBox h3 { margin: 0 0 6px; font: 400 26px Lucky, sans-serif; color: #ffd84a; }
#shareBox p { margin: 0 0 12px; color: #c9d1e8; font-size: 14px; }
#shareBox input { width: 100%; box-sizing: border-box; font: 600 14px Rubik, sans-serif; padding: 10px 12px; border-radius: 8px; border: 2px solid #3b4a7a; background: #0b1022; color: #fff; }
#shareBox .sbrow { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
@media (max-height: 520px) and (orientation: landscape) { #btnShare { padding: 6px 10px; font-size: 13px; } #btnShare span { display: none; } }
`;
const ICON = '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z"/></svg>';

async function share() {
  const Share = NATIVE && window.Capacitor?.Plugins?.Share;
  try {
    if (Share?.share) { await Share.share({ title: 'FortCraft', text: TEXT, url: APK_URL, dialogTitle: 'Share FortCraft' }); return; }
    if (navigator.share) { await navigator.share({ title: 'FortCraft', text: TEXT, url: APK_URL }); return; }
  } catch (e) {
    if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return; // closed the share sheet
  }
  showLink();
}

// Fallback: show the link with a copy button.
function showLink() {
  if (document.getElementById('shareBox')) return;
  const box = document.createElement('div');
  box.id = 'shareBox'; box.className = 'padlayer';
  box.innerHTML = `<div class="sb"><h3>Share FortCraft</h3>
    <p>Send this link to a friend. It always downloads the newest Android app.</p>
    <input readonly value="${APK_URL}">
    <div class="sbrow"><button class="ghost back" id="shareClose">Close</button><button id="shareCopy">Copy link</button></div></div>`;
  document.body.appendChild(box);
  const input = box.querySelector('input'), copy = box.querySelector('#shareCopy');
  box.querySelector('#shareClose').onclick = () => box.remove();
  box.onclick = (e) => { if (e.target === box) box.remove(); };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(APK_URL); }
    catch { input.select(); try { document.execCommand('copy'); } catch { /* select the text so it can be copied by hand */ } }
    copy.textContent = 'Copied';
  };
}

export function installShare(game) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const card = document.querySelector('#menu .playercard');
  if (!card) return;
  const btn = document.createElement('button');
  btn.id = 'btnShare'; btn.className = 'ghost'; btn.title = 'Share a link to the Android app';
  btn.innerHTML = `${ICON}<span>Share</span>`;
  btn.onclick = () => share();
  card.parentNode.insertBefore(btn, card);
  game.shareApp = share;
}
