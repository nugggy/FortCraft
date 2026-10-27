// Teams: duos and squads, knock-down and revive, shared markers, teammate highlight,
// team panel and scoreboard. Solo matches give every actor its own team.
import * as THREE from '../vendor/three.module.min.js';
import { escapeHtml } from './hud.js';
import { saveSettings } from './game.js';

export const TEAM_SIZES = { solo: 1, duos: 2, squads: 4, creative: 1 };
// Colours for members within a team (the local player's team uses these on HUD and markers).
export const MEMBER_COLOURS = ['#4fc3ff', '#ffd23f', '#7cf07c', '#ff7ab6'];
const REVIVE_TIME = 4;
const BLEED = 4;

// Host: map actor id -> team number. LAN humans are grouped first, then bots fill teams.
export function assignTeams(mode, humans, bots) {
  const size = TEAM_SIZES[mode] || 1;
  const ids = [...humans.map(h => 'p' + h.id), ...bots.map(b => b.id)];
  const teams = {};
  ids.forEach((id, i) => { teams[id] = Math.floor(i / size); });
  return teams;
}

export function installTeams(game) {
  const T = new TeamSystem(game);
  game.teams = T;
  game.sameTeam = (a, b) => !!(game.teamMode && a && b && a.team !== undefined && a.team === b.team);
  game.revive = (reviver, target) => T.revive(reviver, target);
  game.addSystem(T);
  game.interactProviders.push((a, C, dt) => T.revivePrompt(a, C, dt));
  game.events.on((ev, act) => {
    if (ev !== 'input' || !game.inMatch()) return;
    if (act === 'ping') T.ping();
    if (act === 'scoreboard' && !game.creative) T.toggleScoreboard();
  });
  // Full-map waypoints double as team markers.
  const origSet = game.hud.setWaypoint.bind(game.hud);
  game.hud.setWaypoint = (x, z) => { origSet(x, z); T.broadcastMarker(); };
  const n = game.net;
  n.on('down', (m) => T.onDown(m));
  n.on('revive', (m) => T.onRevive(m));
  n.on('marker', (m) => T.onMarker(m));
  injectPlaylistUI(game);
  injectCss();
  return T;
}

export class TeamSystem {
  constructor(game) {
    this.game = game;
    this.reviving = new Map();   // target id -> { by, p, last }
    this.markers = new Map();    // owner id -> { x, y, z, color, mesh, name }
    this.xray = [];
    this.tags = new Map();
    this.panelT = 0;
    this.panel = null; this.board = null;
  }

  // ---------------------------------------------------------------- lifecycle
  start(msg) {
    const g = this.game;
    const mode = msg.mode || 'solo';
    g.mode = mode;
    g.teamMode = mode === 'duos' || mode === 'squads';
    let n = 1000;
    for (const a of g.actors) {
      a.team = msg.teams && msg.teams[a.id] !== undefined ? msg.teams[a.id] : (a.boss ? -1 : n++);
      a.downed = false; a.downHp = 0;
    }
    if (!g.teamMode || !g.player) return;
    // member colour index within the local team
    const mine = g.actors.filter(a => g.sameTeam(a, g.player));
    mine.forEach((a, i) => { a.teamColour = MEMBER_COLOURS[i % MEMBER_COLOURS.length]; });
    for (const a of mine) if (a !== g.player) this.highlight(a);
    // hide enemy human name tags so they can't be seen through walls
    for (const a of g.actors) if (a.tag && !g.sameTeam(a, g.player)) a.tag.visible = false;
    this.buildPanel();
  }

  reset() {
    for (const m of this.markers.values()) if (m.mesh) this.game.scene.remove(m.mesh);
    this.markers.clear();
    this.reviving.clear();
    for (const x of this.xray) x.parent && x.parent.remove(x);
    this.xray = [];
    for (const t of this.tags.values()) t.sprite.parent && t.sprite.parent.remove(t.sprite);
    this.tags.clear();
    if (this.panel) { this.panel.remove(); this.panel = null; }
    if (this.board) this.board.classList.remove('show');
    this.game.teamMode = false;
    this.game.extraMarkers = [];
  }

  // ---------------------------------------------------------------- downed
  // Called by game.applyDamage when an actor would die. Returns true if knocked instead.
  tryDown(t, killerId, weapon) {
    const g = this.game;
    if (!g.teamMode || t.downed || g.creative) return false;
    const standing = g.actors.some(a => a !== t && a.alive && !a.downed && !a.dormant && g.sameTeam(a, t));
    if (!standing) return false;
    t.downed = true; t.downHp = 100; t.hp = 1; t.shield = 0; t.over = 0;
    t.knockedBy = killerId; t.using = null; t.ads = false; t.reloading = 0;
    if (t === g.player) { g.buildMode = false; g.build.hideGhost(); }
    const msg = { t: 'down', id: t.id, by: killerId, w: weapon };
    g.net.send(msg);
    this.onDown(msg);
    return true;
  }

  onDown(m) {
    const g = this.game;
    const v = g.actorById(m.id);
    if (!v) return;
    v.downed = true; if (!v.downHp) v.downHp = 100;
    const k = m.by && g.actorById(m.by);
    const nm = (a) => `<b class="${a === g.player ? 'me' : ''}">${escapeHtml(a.name)}</b>`;
    g.hud.killfeed(k && k !== v ? `${nm(k)} knocked ${nm(v)}` : `${nm(v)} was knocked`);
    if (k === g.player) { g.hud.notice(`KNOCKED ${v.name.toUpperCase()}`, '#ffb84a'); g.audio.play('hit', { rate: 0.7 }); }
    if (v === g.player) g.hud.notice('You are down! Crawl to cover and wait for a revive', '#ff7070');
    else if (g.sameTeam(v, g.player)) g.hud.notice(`${v.name} is down!`, '#ffb84a');
    g.events.emit('downed', v, m.by);
  }

  // Reviver's simulator calls this every frame while holding interact on the target.
  revive(reviver, target) {
    const g = this.game;
    if (!target || !target.downed || !target.alive || !reviver.alive || reviver.downed || !g.sameTeam(reviver, target)) return 0;
    if (reviver.pos.distanceTo(target.pos) > 3) return 0;
    const now = g.time;
    let r = this.reviving.get(target.id);
    if (!r || r.by !== reviver.id || now - r.last > 0.3) r = { by: reviver.id, p: 0, last: now };
    r.p += Math.min(0.1, now - r.last);
    r.last = now;
    this.reviving.set(target.id, r);
    if (r.p >= REVIVE_TIME) {
      this.reviving.delete(target.id);
      if (!target.remote) this.finishRevive(target, reviver.id);
      else g.net.sendTo(target.owner, { t: 'revive', id: target.id, by: reviver.id, req: 1 });
      return 1;
    }
    return r.p / REVIVE_TIME;
  }

  finishRevive(t, byId) {
    const g = this.game;
    if (!t.downed || !t.alive) return;
    t.downed = false; t.downHp = 0; t.hp = 30; t.knockedBy = null;
    const msg = { t: 'revive', id: t.id, by: byId, done: 1 };
    g.net.send(msg);
    this.onRevive(msg);
  }

  onRevive(m) {
    const g = this.game;
    const t = g.actorById(m.id);
    if (!t) return;
    if (m.req) { if (!t.remote) this.finishRevive(t, m.by); return; }
    t.downed = false; t.downHp = 0;
    const by = g.actorById(m.by);
    if (t === g.player) g.hud.notice(`${by ? by.name : 'A teammate'} revived you!`, '#7cf07c');
    else if (g.sameTeam(t, g.player)) g.hud.notice(`${t.name} is back up`, '#7cf07c');
    g.audio.play('heal', { pos: t.pos });
    g.events.emit('revived', t, m.by);
  }

  revivePrompt(a, C) {
    const g = this.game;
    if (!g.teamMode || !a.alive || a.downed) return '';
    let best = null, bd = 2.6;
    for (const o of g.actors) {
      if (o === a || !o.downed || !o.alive || !g.sameTeam(o, a)) continue;
      const d = o.pos.distanceTo(a.pos);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return '';
    const key = C.usingPad ? 'X' : C.label('interact');
    if (C.down('interact')) {
      const p = this.revive(a, best);
      return `Reviving <b>${escapeHtml(best.name)}</b> <span class="rv-bar"><i style="width:${Math.round(p * 100)}%"></i></span>`;
    }
    return `Hold <b>${key}</b> to revive ${escapeHtml(best.name)}`;
  }

  // ---------------------------------------------------------------- markers
  ping() {
    const g = this.game, p = g.player;
    if (!p || !p.alive || g.phase === 'bus') return;
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const start = cam.position.clone().addScaledVector(fwd, (g.controller.camDist || 3) + 0.3);
    const res = g.combat.trace(p, start, fwd, 300);
    g.hud.setWaypoint(res.point.x, res.point.z);
  }

  broadcastMarker() {
    const g = this.game;
    if (!g.teamMode || !g.player || !g.inMatch()) return;
    const w = g.hud.waypoint;
    g.net.send({ t: 'marker', id: g.player.id, team: g.player.team, p: w ? [w.x, w.y, w.z] : null });
  }

  onMarker(m) {
    const g = this.game;
    const a = g.actorById(m.id);
    if (!a || !g.player || !g.sameTeam(a, g.player) || a === g.player) return;
    const old = this.markers.get(m.id);
    if (old && old.mesh) g.scene.remove(old.mesh);
    this.markers.delete(m.id);
    if (!m.p) return;
    const color = a.teamColour || '#ffffff';
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 80, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
    mesh.position.set(m.p[0], m.p[1] + 40, m.p[2]);
    g.scene.add(mesh);
    this.markers.set(m.id, { x: m.p[0], y: m.p[1], z: m.p[2], color, mesh, name: a.name, t: g.time });
    g.hud.notice(`${a.name} placed a marker`, color);
    g.audio.play('pickup', { vol: 0.4, rate: 1.3 });
  }

  // ---------------------------------------------------------------- highlight
  highlight(a) {
    const color = new THREE.Color(a.teamColour || '#4fc3ff');
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false, fog: false });
    const meshes = [];
    a.model.root.traverse(o => { if (o.isMesh && !isUnder(o, a.model.glider) && !isUnder(o, a.model.hold)) meshes.push(o); });
    for (const o of meshes) {
      const x = new THREE.Mesh(o.geometry, mat);
      x.position.copy(o.position); x.rotation.copy(o.rotation); x.scale.copy(o.scale);
      x.renderOrder = 30;
      o.parent.add(x);
      this.xray.push(x);
    }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
    sprite.scale.set(2.6, 0.65, 1); sprite.position.y = 2.5; sprite.renderOrder = 31;
    a.model.root.add(sprite);
    if (a.tag) a.tag.visible = false;
    this.tags.set(a.id, { sprite, canvas: c, tex, text: '' });
  }

  updateTags() {
    const g = this.game, me = g.viewActor();
    for (const [id, t] of this.tags) {
      const a = g.actorById(id);
      if (!a) continue;
      const d = me ? Math.round(a.pos.distanceTo(me.pos)) : 0;
      const text = `${a.name}${a.downed ? ' (DOWN)' : ''}|${d}m`;
      t.sprite.visible = a.alive;
      if (t.text === text) continue;
      t.text = text;
      const x = t.canvas.getContext('2d');
      x.clearRect(0, 0, 256, 64);
      x.font = 'bold 26px Rubik, "Trebuchet MS", sans-serif'; x.textAlign = 'center';
      x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,0.85)';
      x.fillStyle = a.downed ? '#ff8a6a' : (a.teamColour || '#fff');
      x.strokeText(text.split('|')[0], 128, 28); x.fillText(text.split('|')[0], 128, 28);
      x.font = 'bold 20px Rubik, sans-serif'; x.fillStyle = '#fff';
      x.strokeText(`${d}m`, 128, 56); x.fillText(`${d}m`, 128, 56);
      t.tex.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game;
    // bleed out and team wipe (each simulator handles its own actors)
    for (const a of g.localActors()) {
      if (!a.alive || !a.downed) continue;
      a.downHp -= (BLEED + (g.storm.phase || 0) * 1.5) * dt;
      const standing = g.actors.some(o => o !== a && o.alive && !o.downed && !o.dormant && g.sameTeam(o, a));
      if (a.downHp <= 0 || !standing) { a.downed = false; g.kill(a, a.knockedBy, a.downHp <= 0 ? 'bleed' : a.lastWeapon); }
    }
    if (!g.teamMode) return;
    // marker expiry and HUD marker list
    const extra = [];
    for (const [id, m] of this.markers) {
      if (g.time - m.t > 90) { if (m.mesh) g.scene.remove(m.mesh); this.markers.delete(id); continue; }
      extra.push({ x: m.x, z: m.z, color: m.color, shape: 'diamond' });
    }
    for (const a of g.actors) if (a !== g.player && a.alive && g.player && g.sameTeam(a, g.player) && a.state !== 'bus') extra.push({ x: a.pos.x, z: a.pos.z, color: a.teamColour || '#fff', shape: 'dot', mate: true });
    g.extraMarkers = extra;
    this.panelT -= dt;
    if (this.panelT <= 0) { this.panelT = 0.2; this.updatePanel(); this.updateTags(); if (this.board && this.board.classList.contains('show')) this.renderBoard(); }
  }

  // ---------------------------------------------------------------- team panel
  buildPanel() {
    const hud = document.getElementById('hud');
    this.panel = document.createElement('div');
    this.panel.id = 'teamPanel';
    hud.appendChild(this.panel);
    this.updatePanel();
  }

  updatePanel() {
    const g = this.game;
    if (!this.panel || !g.player) return;
    const obj = document.getElementById('objectives');
    if (obj) this.panel.style.top = `${obj.offsetTop + obj.offsetHeight + 10}px`;
    const mates = g.actors.filter(a => g.sameTeam(a, g.player));
    this.panel.innerHTML = mates.map(a => {
      const state = !a.alive ? 'dead' : a.downed ? 'down' : '';
      const hp = a.downed ? a.downHp : a.hp;
      return `<div class="tm ${state}"><i style="background:${a.teamColour}"></i><span class="nm">${escapeHtml(a.name)}${a === g.player ? ' (you)' : ''}</span>
        <span class="st">${!a.alive ? 'OUT' : a.downed ? 'DOWN' : ''}</span>
        <div class="bars"><b class="sh" style="width:${a.downed ? 0 : Math.max(0, a.shield) / a.maxShield * 100}%"></b><b class="hp ${a.downed ? 'dn' : ''}" style="width:${Math.max(0, hp) / (a.downed ? 100 : a.maxHp) * 100}%"></b></div></div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- scoreboard
  toggleScoreboard() {
    if (!this.board) {
      this.board = document.createElement('div');
      this.board.id = 'scoreboard';
      document.getElementById('hud').appendChild(this.board);
    }
    this.board.classList.toggle('show');
    if (this.board.classList.contains('show')) this.renderBoard();
  }

  renderBoard() {
    const g = this.game;
    const groups = new Map();
    for (const a of g.actors) {
      if (a.dormant || a.id.startsWith('spec')) continue;
      const k = g.teamMode ? a.team : 0;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    const rows = [...groups.entries()].map(([team, list]) => {
      const alive = list.some(a => a.alive);
      const kills = list.reduce((s, a) => s + (a.kills || 0), 0);
      const mine = g.player && list.includes(g.player);
      return { team, list, alive, kills, mine };
    }).sort((a, b) => (b.alive - a.alive) || (b.kills - a.kills));
    const status = (a) => !a.alive ? '<em class="out">Out</em>' : a.downed ? '<em class="dn">Down</em>' : '<em class="ok">Alive</em>';
    this.board.innerHTML = `<h2>${g.teamMode ? (g.mode === 'duos' ? 'Duos' : 'Squads') : 'Players'}</h2>
      <div class="sb-head"><span>${g.teamMode ? 'Team' : 'Player'}</span><span>Elims</span><span>Status</span></div>` +
      (g.teamMode
        ? rows.map(r => `<div class="sb-team ${r.mine ? 'mine' : ''} ${r.alive ? '' : 'gone'}"><div class="sb-tname">Team ${r.team + 1} <small>${r.kills} elims</small></div>${r.list.map(a => `<div class="sb-row"><span>${escapeHtml(a.name)}</span><span>${a.kills || 0}</span><span>${status(a)}</span></div>`).join('')}</div>`).join('')
        : rows[0] ? rows[0].list.slice().sort((a, b) => (b.alive - a.alive) || ((b.kills || 0) - (a.kills || 0))).map(a => `<div class="sb-row ${a === g.player ? 'mine' : ''}"><span>${escapeHtml(a.name)}</span><span>${a.kills || 0}</span><span>${status(a)}</span></div>`).join('') : '')
      + '<p class="sb-hint">Press the scoreboard key again to close</p>';
  }
}

function isUnder(o, parent) { for (let p = o; p; p = p.parent) if (p === parent) return true; return false; }

// ---------------------------------------------------------------- UI (lobby playlist pickers)
const PLAYLISTS = [['solo', 'Solo'], ['duos', 'Duos'], ['squads', 'Squads'], ['creative', 'Creative']];
function injectPlaylistUI(game) {
  const s = game.settings;
  const persist = () => saveSettings(s);
  // Play tab mode card: a "Playlist" segmented control under Builds / No Builds.
  const modes = document.querySelector('#tab-play .seg.modes');
  if (modes && !document.getElementById('segPlaylist')) {
    const h = document.createElement('h3'); h.textContent = 'Playlist';
    const seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'segPlaylist';
    seg.innerHTML = PLAYLISTS.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
    modes.after(h, seg);
    const sync = () => { for (const b of seg.children) b.classList.toggle('on', b.dataset.v === (s.mode || 'solo')); const sel = document.getElementById('lobbyPlaylist'); if (sel) sel.value = s.mode || 'solo'; };
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; s.mode = b.dataset.v; persist(); sync(); });
    sync();
    game.syncPlaylistUI = sync;
  }
  // LAN lobby host controls: playlist select after the Builds / No Builds select.
  const lobbyMode = document.getElementById('lobbyMode');
  if (lobbyMode && !document.getElementById('lobbyPlaylist')) {
    const label = document.createElement('label'); label.className = 'field';
    label.innerHTML = `Playlist <select id="lobbyPlaylist">${PLAYLISTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
    lobbyMode.closest('label').after(label);
    const sel = label.querySelector('select');
    sel.value = s.mode || 'solo';
    sel.addEventListener('change', () => { s.mode = sel.value; persist(); game.syncPlaylistUI && game.syncPlaylistUI(); });
  }
}

function injectCss() {
  if (document.getElementById('teamsCss')) return;
  const st = document.createElement('style');
  st.id = 'teamsCss';
  st.textContent = `
#teamPanel { position: absolute; left: 16px; top: 120px; width: 250px; display: flex; flex-direction: column; gap: 5px; pointer-events: none; }
#teamPanel .tm { position: relative; background: rgba(10, 14, 30, 0.7); border-radius: 6px; padding: 5px 8px 7px 22px; font: 600 13px Rubik, sans-serif; color: #fff; }
#teamPanel .tm > i { position: absolute; left: 7px; top: 8px; width: 9px; height: 9px; border-radius: 2px; }
#teamPanel .tm .st { float: right; font-weight: 800; font-size: 11px; color: #ff8a6a; }
#teamPanel .tm.dead { opacity: 0.45; }
#teamPanel .tm.down .nm { color: #ffb08a; }
#teamPanel .bars { position: relative; height: 6px; margin-top: 4px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; }
#teamPanel .bars b { position: absolute; left: 0; height: 3px; }
#teamPanel .bars .sh { top: 0; background: #4fb8ff; }
#teamPanel .bars .hp { bottom: 0; background: #6ee05a; }
#teamPanel .bars .hp.dn { background: #ff6a4a; height: 6px; }
.rv-bar { display: inline-block; vertical-align: middle; width: 90px; height: 8px; margin-left: 6px; background: rgba(0,0,0,0.5); border-radius: 4px; overflow: hidden; }
.rv-bar i { display: block; height: 100%; background: #7cf07c; }
#scoreboard { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(0.96); min-width: 460px; max-height: 76vh; overflow: auto; padding: 18px 22px;
  background: rgba(10, 14, 34, 0.92); border-radius: 14px; box-shadow: 0 0 0 3px rgba(255,255,255,0.12), 0 20px 50px rgba(0,0,0,0.6); color: #fff; opacity: 0; transition: all .15s; pointer-events: none; font: 500 14px Rubik, sans-serif; }
#scoreboard.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#scoreboard h2 { margin: 0 0 10px; font: 28px Lucky, "Trebuchet MS", sans-serif; color: #ffd23f; letter-spacing: 1px; }
#scoreboard .sb-head, #scoreboard .sb-row { display: grid; grid-template-columns: 1fr 70px 80px; gap: 8px; padding: 4px 8px; }
#scoreboard .sb-head { font-size: 11px; text-transform: uppercase; opacity: 0.6; letter-spacing: 1px; }
#scoreboard .sb-team { margin: 6px 0; padding: 4px 0; border-radius: 8px; background: rgba(255,255,255,0.04); }
#scoreboard .sb-team.mine { background: rgba(79, 195, 255, 0.16); box-shadow: inset 3px 0 0 #4fc3ff; }
#scoreboard .sb-team.gone { opacity: 0.45; }
#scoreboard .sb-tname { padding: 2px 8px; font-weight: 800; }
#scoreboard .sb-tname small { opacity: 0.6; font-weight: 600; margin-left: 6px; }
#scoreboard .sb-row.mine { color: #ffd23f; font-weight: 700; }
#scoreboard em { font-style: normal; font-weight: 700; }
#scoreboard em.ok { color: #7cf07c; } #scoreboard em.dn { color: #ffb08a; } #scoreboard em.out { color: #ff6a6a; }
#scoreboard .sb-hint { margin: 10px 0 0; font-size: 12px; opacity: 0.55; }
`;
  document.head.appendChild(st);
}
