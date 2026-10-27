// Update channel: on load, compare this copy's version.json with GitHub.
//   stable: the latest GitHub release (tag vX.Y.Z)
//   beta:   version.json on the main branch
//   off:    never check
// GitHub Pages players just reload. Local git installs can update in one click
// (the server runs git pull). The Android app downloads the new APK from the release.
// Other installs get a download link.
import { saveSettings } from './game.js';
import { NATIVE } from './platform.js';

export const REPO = 'nugggy/FortCraft';
const RELEASES = `https://github.com/${REPO}/releases/latest`;

const parse = (v) => String(v || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
export function isNewer(remote, local) {
  const a = parse(remote), b = parse(local);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return false;
}

const CSS = `
#updateBanner { position: fixed; left: 50%; top: 74px; transform: translate(-50%, -20px); z-index: 30; display: flex; align-items: center; gap: 14px;
  padding: 10px 14px 10px 18px; border-radius: 12px; background: linear-gradient(90deg, rgba(20, 60, 40, .96), rgba(20, 40, 80, .96));
  box-shadow: 0 0 0 2px #5cc449, 0 14px 40px rgba(0,0,0,.5); color: #fff; font: 600 14px Rubik, sans-serif; opacity: 0; pointer-events: none; transition: all .3s; max-width: calc(100vw - 32px); }
#updateBanner.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
#updateBanner b { color: #9cf28c; }
#updateBanner .ub-actions { display: flex; gap: 8px; flex: none; }
#updateBanner button, #updateBanner a { font: 700 13px Rubik, sans-serif; padding: 6px 12px; border-radius: 8px; border: 0; cursor: pointer; text-decoration: none; }
#updateBanner .ub-go { background: #5cc449; color: #0b1a08; }
#updateBanner .ub-alt { background: rgba(255,255,255,.12); color: #fff; }
#updateBanner .ub-x { background: transparent; color: #bbb; padding: 4px 6px; }
#versionTag { position: fixed; left: 14px; bottom: 10px; z-index: 11; font: 600 11px Rubik, sans-serif; color: rgba(255,255,255,.55); pointer-events: none; }
body.in-match #versionTag, body.in-match #updateBanner { display: none; }
.updcard select { margin-left: 8px; }
.updcard .updstatus { margin-top: 8px; font-size: 13px; color: #c9d1e8; }
`;

class Updater {
  constructor(game) {
    this.game = game;
    this.local = null;
    this.remote = null;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.banner = document.createElement('div'); this.banner.id = 'updateBanner';
    document.body.appendChild(this.banner);
    this.tag = document.createElement('div'); this.tag.id = 'versionTag';
    document.body.appendChild(this.tag);
    this.addSettingsCard();
    // hide the version tag and banner during matches
    setInterval(() => document.body.classList.toggle('in-match', game.inMatch() || game.phase === 'loading'), 500);
  }

  get channel() { return this.game.settings.updateChannel || 'stable'; }
  get onPages() { return /\.github\.io$/i.test(location.hostname); }

  async loadLocal() {
    try { this.local = await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json(); }
    catch { this.local = { version: '0.0.0' }; }
    this.tag.textContent = `FortCraft v${this.local.version}${NATIVE ? ' for Android' : ''}${this.channel === 'beta' ? ' (beta channel)' : ''}`;
  }

  async fetchRemote() {
    if (this.channel === 'beta') {
      const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
      const j = await r.json();
      return { version: j.version, notes: j.notes || '', url: `https://github.com/${REPO}` };
    }
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return null; // no releases yet
    if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
    const j = await r.json();
    // the Android app downloads the APK attached to the release
    const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
    return { version: j.tag_name, notes: (j.body || '').split('\n')[0].slice(0, 160), url: j.html_url || RELEASES, apk: apk ? apk.browser_download_url : null };
  }

  async check(manual = false) {
    if (!this.local) await this.loadLocal();
    if (this.channel === 'off' && !manual) { this.setStatus('Update checks are off.'); return; }
    this.setStatus('Checking for updates...');
    try {
      this.remote = await this.fetchRemote();
      if (this.remote && isNewer(this.remote.version, this.local.version)) {
        this.setStatus(`Update available: ${this.remote.version.replace(/^v?/, 'v')}`);
        this.showBanner();
      } else {
        this.setStatus(`You're up to date (v${this.local.version}).`);
        if (manual) this.hideBanner();
      }
    } catch (e) {
      // offline LAN parties are common, so fail quietly
      this.setStatus(`Couldn't reach GitHub (${e.message}).`);
    }
  }

  async showBanner() {
    const r = this.remote, v = r.version.replace(/^v?/, 'v');
    let actions = '';
    if (NATIVE) actions = `<button class="ub-go" data-act="apk">Download update</button>`;
    else if (this.onPages) actions = `<button class="ub-go" data-act="reload">Reload to update</button>`;
    else {
      let info = { canUpdate: false };
      try { info = await (await fetch('/api/update-info', { cache: 'no-store' })).json(); } catch { /* old server or file:// */ }
      actions = info.canUpdate
        ? `<button class="ub-go" data-act="update">Update now</button>`
        : `<a class="ub-go" href="${RELEASES}" target="_blank" rel="noopener">Download</a>`;
    }
    this.banner.innerHTML = `<span>Update available: <b>${v}</b> (you have v${this.local.version})${r.notes ? ` · ${escapeHtml(r.notes)}` : ''}</span>
      <span class="ub-actions">${actions}<a class="ub-alt" href="${r.url}" target="_blank" rel="noopener">What's new</a><button class="ub-x" data-act="close" title="Dismiss">✕</button></span>`;
    this.banner.classList.add('show');
    this.banner.onclick = (e) => {
      const act = e.target.dataset?.act;
      if (act === 'close') this.hideBanner();
      if (act === 'reload') location.replace(`${location.pathname}?v=${encodeURIComponent(r.version)}`);
      if (act === 'update') this.runUpdate(e.target);
      // opens in the phone's browser; Android then offers to install the new APK over this one
      if (act === 'apk') location.href = r.apk || r.url || RELEASES;
    };
  }

  hideBanner() { this.banner.classList.remove('show'); }

  async runUpdate(btn) {
    btn.disabled = true; btn.textContent = 'Updating...';
    try {
      const res = await fetch('/api/update', { method: 'POST', headers: { 'X-FortCraft': 'update' } });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Update failed');
      this.banner.querySelector('span').innerHTML = '<b>Updated.</b> Close the server window and run <b>start.bat</b> again, then refresh this page.';
      btn.remove();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Update now';
      this.banner.querySelector('span').innerHTML = `Update failed: ${escapeHtml(e.message)}. You can <a href="${RELEASES}" target="_blank" rel="noopener" style="color:#9cf28c">download it</a> instead.`;
    }
  }

  setStatus(t) { const el = document.getElementById('updStatus'); if (el) el.textContent = t; }

  addSettingsCard() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    const card = document.createElement('div');
    card.className = 'card updcard';
    card.innerHTML = `<div class="cardhead"><h3>Updates</h3><button class="ghost small" id="updCheck">Check now</button></div>
      <label>Update channel <select id="updChannel"><option value="stable">Stable (releases)</option><option value="beta">Beta (latest code)</option><option value="off">Off</option></select></label>
      <p class="hint">FortCraft checks GitHub for a newer version each time it loads.${NATIVE ? ' On Android the update downloads as a new APK that installs over this one, keeping your progress.' : ''}</p>
      <div class="updstatus" id="updStatus"></div>`;
    panel.appendChild(card);
    const sel = card.querySelector('#updChannel');
    sel.value = this.channel;
    sel.onchange = () => { this.game.settings.updateChannel = sel.value; saveSettings(this.game.settings); this.loadLocal().then(() => this.check(true)); };
    card.querySelector('#updCheck').onclick = () => this.check(true);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

export function installUpdates(game) {
  const u = new Updater(game);
  game.updater = u;
  setTimeout(() => u.check(false), 1500);
}
