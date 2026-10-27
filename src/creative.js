// Creative mode: no storm or bus, unlimited materials and ammo, flying, an item menu,
// respawns, optional bots and island reset. Works in solo and on the LAN.
import * as THREE from '../vendor/three.module.min.js';
import * as Items from './items.js';
import { Actor } from './actor.js';
import { BotBrain } from './bot.js';
import { OUTFITS } from './models.js';
import { escapeHtml } from './hud.js';

const RESPAWN = 3;

export function installCreative(game) {
  const C = new CreativeSystem(game);
  game.addSystem(C);
  game.creativeControl = (a, ctl, dt, controls) => C.control(a, ctl, dt, controls);
  game.events.on((ev, act) => {
    if (ev === 'input' && act === 'scoreboard' && game.creative && game.inMatch()) C.toggleMenu();
  });
  game.net.on('respawn', (m) => C.onRespawn(m));
  injectCss();
  return C;
}

class CreativeSystem {
  constructor(game) {
    this.game = game;
    this.lastJump = -1;
    this.menu = null; this.bar = null;
    this.botN = 0;
  }

  spawnPoint(a, i = 0) {
    const g = this.game, w = g.world;
    const wp = g.hud.waypoint;
    let x, z;
    if (wp && a === g.player) { x = wp.x; z = wp.z; }
    else {
      const pois = w.pois.filter(p => p.type !== 'lake');
      let h = 0; for (const c of a.id) h = (h * 31 + c.charCodeAt(0)) | 0;
      const p = pois[Math.abs(h + i) % pois.length] || { x: 160, z: 160 };
      x = p.x + ((Math.abs(h) % 9) - 4); z = p.z + ((Math.abs(h >> 4) % 9) - 4);
    }
    return new THREE.Vector3(x + 0.5, w.groundY(Math.floor(x), Math.floor(z)) + 0.2, z + 0.5);
  }

  start(msg) {
    const g = this.game;
    g.creative = msg.mode === 'creative';
    document.getElementById('hud').classList.toggle('creative', g.creative);
    if (!g.creative) return;
    g.phase = 'play';
    g.bus.visible = false;
    g.storm.cur.r = g.storm.next.r = 5000;
    g.storm.wall.visible = false;
    g.storm.timer = 0;
    for (const a of g.localActors()) this.place(a);
    this.ensureBar();
    g.hud.notice('Creative: press the scoreboard key (Tab) for the item menu, double-tap jump to fly', '#7fd0ff');
  }

  place(a) {
    a.state = 'ground'; a.pos.copy(this.spawnPoint(a)); a.vel.set(0, 0, 0);
    a.hp = a.maxHp; a.shield = 100; a.alive = true; a.flying = false; a.downed = false;
    if (!a.slots.some(Boolean)) {
      a.slots[0] = Items.makeWeapon('ar', 4); a.slots[1] = Items.makeWeapon('shotgun', 4);
      a.slots[2] = Items.makeWeapon('sniper', 4); a.slots[3] = Items.makeWeapon('rocket', 4);
    }
  }

  reset() {
    this.game.creative = false;
    document.getElementById('hud')?.classList.remove('creative');
    if (this.menu) this.menu.classList.remove('show');
    if (this.bar) this.bar.style.display = 'none';
  }

  update(dt) {
    const g = this.game;
    if (!g.creative) return;
    for (const a of g.localActors()) {
      if (a.id.startsWith('spec')) continue;
      a.mats.wood = a.mats.brick = a.mats.metal = 999;
      for (const k in a.ammo) a.ammo[k] = 999;
      if (!a.alive) {
        a.respawnT = (a.respawnT || 0) + dt;
        if (a.respawnT >= RESPAWN) {
          a.respawnT = 0;
          this.place(a);
          a.netSentDead = false;
          if (a === g.player) { g.spectate = null; g.hud.notice('Respawned', '#7cf07c'); }
          g.net.send({ t: 'respawn', id: a.id });
        }
      }
    }
    if (this.bar) this.bar.style.display = '';
  }

  // Double-tap jump toggles flying; while flying, sprint is faster and crouch descends.
  control(a, ctl, dt, C) {
    const g = this.game;
    if (!g.creative) return false;
    if (C.pressed('jump')) {
      if (g.time - this.lastJump < 0.3) { a.flying = !a.flying; this.lastJump = -1; g.hud.notice(a.flying ? 'Flying' : 'Landed', '#7fd0ff'); }
      else this.lastJump = g.time;
    }
    if (!a.flying) return false;
    const sp = C.down('sprint') ? 26 : 12;
    const vy = (C.down('jump') ? 1 : 0) - (C.down('crouch') ? 1 : 0);
    a.vel.set(ctl.mx * sp, vy * 11, ctl.mz * sp);
    a.onGround = false; a.canStep = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(a.vel.x), Math.abs(a.vel.y), Math.abs(a.vel.z)) * dt / 0.35));
    for (let i = 0; i < steps; i++) {
      a.moveAxis(0, a.vel.x * dt / steps); a.moveAxis(2, a.vel.z * dt / steps); a.moveAxis(1, a.vel.y * dt / steps);
    }
    a.pos.y = Math.min(a.pos.y, 120);
    return true;
  }

  onRespawn(m) {
    const g = this.game;
    if (m.bot && !g.actorById(m.bot.id)) {
      const a = new Actor(g, { id: m.bot.id, name: m.bot.name, outfit: m.bot.outfit, owner: g.net.hostId, isBot: true, remote: true });
      a.team = m.bot.team; a.state = 'ground';
      g.actors.push(a);
      return;
    }
    const a = g.actorById(m.id);
    if (a && a.remote) { a.alive = true; a.state = 'ground'; }
  }

  // Host: add a bot near the player.
  addBot() {
    const g = this.game;
    if (!g.net.isHost) { g.hud.notice('Only the host can add bots', '#ff7070'); return; }
    const id = 'cb' + (++this.botN) + '_' + Math.floor(Math.random() * 1e4);
    const names = ['Dummy', 'Target', 'Sparring', 'Practice', 'Rookie', 'Trainer'];
    const name = `${names[this.botN % names.length]} Bot ${this.botN}`;
    const outfit = Math.floor(Math.random() * OUTFITS.length);
    const a = new Actor(g, { id, name, outfit, owner: g.net.hostId, isBot: true });
    a.team = 5000 + this.botN;
    const p = g.player ? g.player.pos : this.spawnPoint(a);
    const ang = Math.random() * Math.PI * 2;
    const x = p.x + Math.cos(ang) * 12, z = p.z + Math.sin(ang) * 12;
    a.pos.set(x, g.world.groundY(Math.floor(x), Math.floor(z)) + 0.2, z);
    a.state = 'ground';
    a.slots[0] = Items.makeWeapon('ar', 2); a.slots[1] = Items.makeWeapon('shotgun', 1); a.select(1);
    g.actors.push(a);
    const brain = new BotBrain(g, a, g.settings.difficulty || 'normal', Math.random);
    g.brains.push(brain); a.brain = brain;
    g.net.send({ t: 'respawn', bot: { id, name, outfit, team: a.team } });
    g.hud.notice(`${name} joined`, '#7fd0ff');
  }

  resetIsland() {
    const g = this.game;
    if (!g.net.isHost) { g.hud.notice('Only the host can reset the island', '#ff7070'); return; }
    this.closeMenu();
    g.leaveMatch();
    g.hostStart();
  }

  give(item) {
    const g = this.game, a = g.player;
    if (!a || !a.alive) return;
    const it = { ...item };
    if (!a.addItem(it)) {
      const slot = a.selected > 0 ? a.selected - 1 : 0;
      a.slots[slot] = it;
    }
    const idx = a.slots.findIndex(s => s && s.id === it.id && s.rarity === it.rarity && s.kind === it.kind);
    if (idx >= 0) a.select(idx + 1);
    g.audio.play('pickup');
    g.hud.toast(`+ ${Items.itemName(it)}`, it);
  }

  // ---------------------------------------------------------------- UI
  ensureBar() {
    if (this.bar) return;
    const b = document.createElement('div');
    b.id = 'creativeBar';
    b.innerHTML = '<span class="ct">CREATIVE</span><span>Tab: item menu</span><span>Double-tap jump: fly</span>';
    document.getElementById('hud').appendChild(b);
    this.bar = b;
  }

  toggleMenu() { if (this.menu && this.menu.classList.contains('show')) this.closeMenu(); else this.openMenu(); }

  openMenu() {
    const g = this.game;
    if (!this.menu) {
      this.menu = document.createElement('div');
      this.menu.id = 'creativeMenu';
      document.body.appendChild(this.menu);
      this.menu.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'item') this.give(JSON.parse(b.dataset.item));
        else if (act === 'fly') { if (g.player) { g.player.flying = !g.player.flying; this.renderMenu(); } }
        else if (act === 'bot') this.addBot();
        else if (act === 'reset') this.resetIsland();
        else if (act === 'heal') { if (g.player) { g.player.hp = g.player.maxHp; g.player.shield = 100; } }
        else if (act === 'close') this.closeMenu();
      });
    }
    this.renderMenu();
    this.menu.classList.add('show');
    g.creativeMenuOpen = true;
    g.ui.unlockPointer();
  }

  closeMenu() {
    if (!this.menu || !this.menu.classList.contains('show')) return;
    this.menu.classList.remove('show');
    this.game.creativeMenuOpen = false;
    if (this.game.inMatch()) this.game.ui.lockPointer();
  }

  renderMenu() {
    const g = this.game;
    const cards = [];
    const card = (item) => {
      const r = Items.itemRarity ? Items.itemRarity(item) : (item.rarity || 0);
      const col = Items.RARITY[r]?.color || '#aaa';
      const icon = Items.itemIcon(item.id, item.kind === 'weapon' ? item.rarity : 0);
      cards.push(`<button class="ci" data-act="item" data-item='${escapeHtml(JSON.stringify(item))}' style="--rar:${col}"><img src="${icon}" alt=""><span>${escapeHtml(Items.itemName(item))}</span></button>`);
    };
    for (const [id, w] of Object.entries(Items.WEAPONS)) {
      if (w.melee) continue;
      for (const r of w.rarities || [0]) card(Items.makeWeapon(id, r));
    }
    for (const id of Object.keys(Items.HEALS)) card({ kind: 'heal', id, count: Items.HEALS[id].max });
    // newer item families (throwables, utility) when the gameplay module provides them
    for (const [key, kind] of [['THROWABLES', 'throwable'], ['UTILITIES', 'utility'], ['UTILITY', 'utility']]) {
      const table = Items[key];
      if (table) for (const id of Object.keys(table)) card({ kind, id, count: table[id].max || table[id].per || 3 });
    }
    const host = g.net.isHost;
    this.menu.innerHTML = `<div class="cm-head"><h2>Creative menu</h2><button data-act="close" class="cm-x">Close</button></div>
      <div class="cm-tools">
        <button data-act="fly">${g.player && g.player.flying ? 'Stop flying' : 'Fly'}</button>
        <button data-act="heal">Full health and shield</button>
        <button data-act="bot" ${host ? '' : 'disabled'}>Add bot</button>
        <button data-act="reset" ${host ? '' : 'disabled'}>Reset island</button>
      </div>
      <p class="cm-hint">Click an item to add it to your inventory. Materials and ammo are unlimited. Your map marker is your respawn point.</p>
      <div class="cm-grid">${cards.join('')}</div>`;
  }
}

function injectCss() {
  if (document.getElementById('creativeCss')) return;
  const st = document.createElement('style');
  st.id = 'creativeCss';
  st.textContent = `
#hud.creative #mat_wood, #hud.creative #mat_brick, #hud.creative #mat_metal { font-size: 0; }
#hud.creative #mat_wood::after, #hud.creative #mat_brick::after, #hud.creative #mat_metal::after { content: '\\221E'; font-size: 18px; }
#hud.creative #stormRow, #hud.creative .stormrow { visibility: hidden; }
#creativeBar { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); display: flex; gap: 14px; align-items: center; padding: 6px 14px;
  background: rgba(10, 30, 60, 0.7); border-radius: 8px; font: 600 12px Rubik, sans-serif; color: #cfe8ff; pointer-events: none; }
#creativeBar .ct { font: 16px Lucky, "Trebuchet MS", sans-serif; color: #7fd0ff; letter-spacing: 1px; }
#creativeMenu { position: fixed; inset: 6vh 8vw; z-index: 40; display: none; flex-direction: column; padding: 18px 22px; background: rgba(10, 14, 34, 0.95);
  border-radius: 16px; box-shadow: 0 0 0 3px rgba(127, 208, 255, 0.35), 0 30px 80px rgba(0,0,0,0.7); color: #fff; font: 500 14px Rubik, sans-serif; }
#creativeMenu.show { display: flex; }
#creativeMenu .cm-head { display: flex; justify-content: space-between; align-items: center; }
#creativeMenu h2 { margin: 0; font: 30px Lucky, "Trebuchet MS", sans-serif; color: #7fd0ff; letter-spacing: 1px; }
#creativeMenu .cm-tools { display: flex; gap: 8px; margin: 12px 0 4px; flex-wrap: wrap; }
#creativeMenu button { cursor: pointer; font: 700 13px Rubik, sans-serif; color: #fff; background: #23305a; border: 0; border-radius: 8px; padding: 8px 14px; }
#creativeMenu button:hover:not([disabled]) { background: #34478a; }
#creativeMenu button[disabled] { opacity: 0.4; cursor: default; }
#creativeMenu .cm-hint { opacity: 0.65; font-size: 12px; margin: 6px 0 10px; }
#creativeMenu .cm-grid { flex: 1; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; align-content: start; }
#creativeMenu .ci { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px; text-align: center;
  background: linear-gradient(160deg, rgba(0,0,0,0.6) 20%, color-mix(in srgb, var(--rar) 55%, #000)); box-shadow: inset 0 -4px 0 var(--rar); }
#creativeMenu .ci img { width: 96px; height: 54px; image-rendering: pixelated; }
#creativeMenu .ci span { font-size: 12px; line-height: 1.2; }
`;
  document.head.appendChild(st);
}
