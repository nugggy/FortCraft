// LAN extras: join a running match as a spectator (host sends a catch-up snapshot),
// spectator controls (follow cam cycling and a free-fly camera) and rematch voting.
import * as THREE from '../vendor/three.module.min.js';
import { World, SX, SZ } from './world.js';
import { Actor } from './actor.js';
import { PIECE_HP } from './building.js';
import { escapeHtml } from './hud.js';

// Messages that change the world; buffered while a catch-up is loading so nothing is lost.
const WORLD_MSGS = ['blk', 'boom', 'piece', 'pdmg', 'pedit', 'loot+', 'loot-'];

export function installLanExtras(game) {
  const L = new LanExtras(game);
  game.addSystem(L);
  game.lan = L;
  game.spectatorInput = (C, dt) => L.spectatorInput(C, dt);
  game.cameraProviders.push((dt) => L.freeCamera(dt));
  const n = game.net;
  n.on('welcome', (m) => { if (m.inMatch) L.requestCatchup(); });
  n.on('catchup', (m) => L.onCatchup(m));
  n.on('vote', (m) => L.onVote(m));
  n.on('rematch', () => { game.hud.notice('Rematch starting', '#7cf07c'); });
  injectCss();
  // Refresh the vote box whenever the end screen is shown.
  const end = document.getElementById('end');
  if (end) new MutationObserver(() => L.renderVote()).observe(end, { attributes: true, attributeFilter: ['class'] });
  return L;
}

class LanExtras {
  constructor(game) {
    this.game = game;
    this.votes = new Set();
    this.free = false;
    this.camYaw = 0; this.camPitch = -0.3;
    this.camPos = new THREE.Vector3();
    this.buffer = null;
    this.bar = null;
    this.barT = 0;
  }

  start() { this.votes.clear(); this.free = false; this.renderVote(); }
  reset() { this.free = false; if (this.bar) this.bar.style.display = 'none'; }

  update(dt) {
    const g = this.game;
    this.barT -= dt;
    if (this.barT > 0) return;
    this.barT = 0.25;
    const show = g.player && !g.player.alive && g.inMatch() && g.phase !== 'over';
    if (!show) { if (this.bar) this.bar.style.display = 'none'; return; }
    if (!this.bar) {
      this.bar = document.createElement('div');
      this.bar.id = 'specBar';
      document.getElementById('hud').appendChild(this.bar);
    }
    const C = g.controller.controls;
    const fireKey = C.usingPad ? 'RT' : C.label('fire'), rKey = C.usingPad ? 'D-pad right' : C.label('reload');
    const who = this.free ? 'Free camera' : g.spectate && g.spectate.alive ? `Spectating <b>${escapeHtml(g.spectate.name)}</b>` : 'Spectating';
    this.bar.innerHTML = `<span class="sp-tag">${g.player.id.startsWith('spec') ? 'SPECTATOR' : 'ELIMINATED'}</span><span>${who}</span>
      <span class="sp-k"><b>${fireKey}</b> next player</span><span class="sp-k"><b>${rKey}</b> ${this.free ? 'follow players' : 'free camera'}</span>`;
    this.bar.style.display = '';
    if (!this.free && (!g.spectate || !g.spectate.alive)) g.cycleSpectate();
  }

  // ---------------------------------------------------------------- spectator controls
  spectatorInput(C, dt) {
    const g = this.game;
    if (C.pressed('reload')) {
      this.free = !this.free;
      if (this.free) {
        this.camPos.copy(g.camera.position);
        this.camYaw = g.camera.rotation.y; this.camPitch = g.camera.rotation.x;
      }
      return true;
    }
    if (this.free && (C.pressed('fire') || C.pressed('jump'))) { this.free = false; g.cycleSpectate(); return true; }
    if (!this.free) return false;
    const look = g.controller.lastLook || { dx: 0, dy: 0 };
    const sens = 0.0022 * (g.settings.sens || 1);
    this.camYaw -= look.dx * sens;
    this.camPitch = Math.max(-1.5, Math.min(1.5, this.camPitch - look.dy * sens * (g.settings.invert ? -1 : 1)));
    const m = C.move();
    const sp = C.down('sprint') ? 40 : 16;
    const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw), cp = Math.cos(this.camPitch), spch = Math.sin(this.camPitch);
    // forward follows where the camera looks
    const fx = -s * cp, fy = spch, fz = -c * cp;
    this.camPos.x += (fx * -m.z + c * m.x) * sp * dt;
    this.camPos.y += (fy * -m.z) * sp * dt + ((C.down('jump') ? 1 : 0) - (C.down('crouch') ? 1 : 0)) * sp * dt;
    this.camPos.z += (fz * -m.z - s * m.x) * sp * dt;
    this.camPos.x = Math.max(-40, Math.min(SX + 40, this.camPos.x));
    this.camPos.z = Math.max(-40, Math.min(SZ + 40, this.camPos.z));
    this.camPos.y = Math.max(2, Math.min(140, this.camPos.y));
    return true;
  }

  freeCamera() {
    const g = this.game;
    if (!this.free || !g.player || g.player.alive || !g.inMatch()) { this.free = false; return false; }
    const cam = g.camera;
    cam.position.copy(this.camPos);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.camPitch, this.camYaw, 0);
    if (Math.abs(cam.fov - g.settings.fov) > 0.01) { cam.fov = g.settings.fov; cam.updateProjectionMatrix(); }
    return true;
  }

  // ---------------------------------------------------------------- catch-up (join mid-match)
  requestCatchup() {
    const g = this.game, n = g.net;
    if (n.isHost) return;
    // buffer world-changing messages until the snapshot is applied
    this.buffer = [];
    this.saved = new Map();
    for (const t of WORLD_MSGS) {
      const fn = n.handlers.get(t);
      this.saved.set(t, fn);
      n.handlers.set(t, (m) => this.buffer.push(m));
    }
    n.sendTo('host', { t: 'catchup', req: 1 });
    g.ui.showScreen('loading');
    g.ui.loading('Joining as spectator', 0.02);
  }

  restoreHandlers() {
    const n = this.game.net;
    if (!this.saved) return;
    for (const [t, fn] of this.saved) n.handlers.set(t, fn);
    this.saved = null;
  }

  // Host: build a snapshot of the running match for a late joiner.
  buildCatchup() {
    const g = this.game;
    const msg = g.matchMsg;
    const fresh = new World(msg.seed);
    fresh.generate();
    const diff = [];
    const a = g.world.data, b = fresh.data;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i, a[i]);
    return {
      msg, diff, phase: g.phase, time: g.time, busT: g.busT, storm: g.storm.snapshot(),
      pieces: [...g.build.pieces.values()].map(p => [p.id, p.mat, p.hp, p.blocks.filter(i => g.build.blockPiece.get(i) === p.id)]),
      pickups: [...g.loot.pickups.values()].map(p => [p.id, p.item, [p.pos.x, p.pos.y, p.pos.z]]),
      nextLoot: g.loot.nextId,
      actors: g.actors.filter(x => !x.id.startsWith('spec')).map(x => ({
        id: x.id, name: x.name, outfit: x.outfit, isBot: x.isBot, isPlayer: x.isPlayer, boss: x.boss, owner: x.owner,
        team: x.team, dormant: !!x.dormant, kills: x.kills, snap: x.snapshot(),
      })),
    };
  }

  async onCatchup(m) {
    const g = this.game, n = g.net;
    if (m.req) {
      if (!n.isHost || !g.inMatch() || !g.matchMsg) return;
      n.sendTo(m.from, { t: 'catchup', data: this.buildCatchup() });
      return;
    }
    if (!m.data || !this.buffer) return;
    const c = m.data;
    g.phase = 'loading';
    g.ui.showScreen('loading');
    g.clearMatch();
    g.matchMsg = c.msg;
    await g.loadWorld(c.msg.seed, (t, p) => g.ui.loading('Joining as spectator', p * 0.8));
    const w = g.world;
    for (let i = 0; i < c.diff.length; i += 2) w.data[c.diff[i]] = c.diff[i + 1];
    for (let k = 0; k < (SX / 16) * (SZ / 16); k++) w.dirty.add(k);
    const total = w.dirty.size;
    while (w.dirty.size) { g.mesher.update(16); g.ui.loading('Joining as spectator', 0.8 + 0.2 * (1 - w.dirty.size / total)); await new Promise(r => requestAnimationFrame(r)); }
    // pieces
    for (const [id, mat, hp, blocks] of c.pieces) {
      g.build.pieces.set(id, { id, blocks, hp, maxHp: PIECE_HP[mat], mat });
      for (const i of blocks) g.build.blockPiece.set(i, id);
    }
    // actors (all remote) plus a local spectator ghost
    for (const info of c.actors) {
      const a = new Actor(g, { id: info.id, name: info.name, outfit: info.outfit, owner: info.owner, isBot: info.isBot, isPlayer: info.isPlayer, boss: info.boss, remote: true, nameTag: info.isPlayer || info.boss, tagColor: info.boss ? '#ff4a4a' : '#ffd84a' });
      a.team = info.team; a.dormant = info.dormant; a.kills = info.kills || 0;
      a.applySnapshot(info.snap);
      if (!a.alive) a.state = 'dead';
      g.actors.push(a);
      if (a.boss) g.boss = a;
    }
    const ghost = new Actor(g, { id: 'spec' + n.id, name: g.settings.name, outfit: g.settings.outfit, owner: n.id, isPlayer: true });
    ghost.alive = false; ghost.state = 'dead'; ghost.hidden = true; ghost.team = -999;
    g.actors.push(ghost);
    g.player = ghost;
    for (const [id, item, p] of c.pickups) g.loot.create(id, item, { x: p[0], y: p[1], z: p[2] }, { x: 0, y: 0, z: 0 });
    g.loot.nextId = c.nextLoot || g.loot.nextId;
    // bus and storm
    const mm = c.msg;
    g.busFrom = { x: mm.bus.a[0], z: mm.bus.a[1] }; g.busTo = { x: mm.bus.b[0], z: mm.bus.b[1] };
    g.busLen = Math.hypot(g.busTo.x - g.busFrom.x, g.busTo.z - g.busFrom.z);
    g.busSpeed = 24; g.busDuration = g.busLen / g.busSpeed; g.busT = c.busT;
    const dx = (g.busTo.x - g.busFrom.x) / g.busLen, dz = (g.busTo.z - g.busFrom.z) / g.busLen;
    g.busDir = new THREE.Vector3(dx, 0, dz);
    g.bus.rotation.y = Math.atan2(-dx, -dz);
    g.bus.visible = c.phase === 'bus';
    g.storm.reset();
    g.storm.apply(c.storm);
    g.noBuild = !!mm.noBuild;
    document.getElementById('hud').classList.toggle('nobuild', g.noBuild);
    g.pings = []; g.stepT = new Map();
    g.time = c.time; g.result = { spectator: true };
    g.buildMode = false;
    for (const sys of g.systems) sys.start?.(mm);
    g.phase = c.phase === 'over' ? 'over' : c.phase;
    g.spectate = null; g.cycleSpectate();
    g.hud.prepareMap();
    g.hud.clearTransient();
    g.hud.show(true);
    g.ui.showScreen(null);
    // replay world messages that arrived while loading
    this.restoreHandlers();
    const buf = this.buffer || [];
    this.buffer = null;
    for (const msg of buf) { const fn = n.handlers.get(msg.t); if (fn) fn(msg); }
    g.hud.notice('Joined as a spectator. You will play in the next match.', '#7fd0ff');
  }

  // ---------------------------------------------------------------- rematch vote
  vote() {
    const g = this.game, n = g.net;
    if (!n.online) return;
    this.votes.add(n.id);
    n.send({ t: 'vote', v: 1 });
    this.renderVote();
    this.checkVotes();
  }

  onVote(m) {
    this.votes.add(m.from);
    this.renderVote();
    this.checkVotes();
  }

  checkVotes(force = false) {
    const g = this.game, n = g.net;
    if (!n.isHost || !n.online) return;
    const present = n.lobby.map(p => p.id);
    const all = present.length > 0 && present.every(id => this.votes.has(id));
    if (!(all || force) || g.phase !== 'over') return;
    n.send({ t: 'rematch' });
    this.votes.clear();
    g.leaveMatch();
    g.hostStart();
  }

  renderVote() {
    const g = this.game, n = g.net;
    const end = document.getElementById('end');
    const btns = end && end.querySelector('.endbtns');
    if (!btns) return;
    let box = document.getElementById('voteBox');
    const show = n.online && g.phase === 'over' && end.classList.contains('show');
    if (!show) { if (box) box.style.display = 'none'; return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'voteBox';
      btns.before(box);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.act === 'vote') this.vote();
        if (b.dataset.act === 'force') this.checkVotes(true);
      });
    }
    const present = n.lobby.length || 1;
    const voted = this.votes.has(n.id);
    const names = n.lobby.filter(p => this.votes.has(p.id)).map(p => escapeHtml(p.name)).join(', ');
    box.style.display = '';
    box.innerHTML = `<div class="vb-row"><button class="playbtn small" data-act="vote" ${voted ? 'disabled' : ''}>${voted ? 'VOTED' : 'VOTE REMATCH'}</button>
      ${n.isHost ? '<button class="ghost" data-act="force">Start now</button>' : ''}</div>
      <div class="vb-count"><b>${this.votes.size}/${present}</b> votes for a rematch${names ? `: ${names}` : ''}</div>`;
  }
}

function injectCss() {
  if (document.getElementById('lanCss')) return;
  const st = document.createElement('style');
  st.id = 'lanCss';
  st.textContent = `
#specBar { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); display: flex; gap: 16px; align-items: center; padding: 8px 16px;
  background: rgba(10, 14, 34, 0.82); border-radius: 10px; font: 600 14px Rubik, sans-serif; color: #fff; pointer-events: none; white-space: nowrap; }
#specBar .sp-tag { font: 16px Lucky, "Trebuchet MS", sans-serif; color: #ff8a6a; letter-spacing: 1px; }
#specBar .sp-k { opacity: 0.8; font-size: 12px; }
#specBar .sp-k b { display: inline-block; background: #fff; color: #000; border-radius: 3px; padding: 0 5px; margin-right: 4px; }
#voteBox { margin: 10px auto 6px; text-align: center; }
#voteBox .vb-row { display: flex; gap: 8px; justify-content: center; }
#voteBox .vb-count { margin-top: 6px; font: 600 13px Rubik, sans-serif; opacity: 0.85; }
#voteBox button[disabled] { opacity: 0.6; cursor: default; }
`;
  document.head.appendChild(st);
}
