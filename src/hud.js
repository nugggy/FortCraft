// DOM heads-up display: vitals, loadout, compass, minimap, full map and feedback.
import * as THREE from '../vendor/three.module.min.js';
import { WEAPONS, HEALS, RARITY, AMMO, RARITY_LETTERS, itemIcon, itemName, itemRarity, shortName } from './items.js';
import { SX, SZ } from './world.js';
import { PIECE_TYPES } from './building.js';
import * as TEX from './textures.js';
import { renderMapImage, drawPoiIcon } from './ui/mapimage.js';

const $ = (id) => document.getElementById(id);
const COLS = 'ABCDEFGHIJ';
const STORM_PHASES = 6;

// Sound visualiser icons (24x24, currentColor).
const SV_ICONS = {
  step: '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="8" cy="9" rx="3.2" ry="5"/><ellipse cx="8" cy="17.5" rx="2.4" ry="2.2"/><ellipse cx="16" cy="6" rx="3.2" ry="5"/><ellipse cx="16" cy="14.5" rx="2.4" ry="2.2"/></svg>',
  shot: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.6 6.4L21 5l-3.4 5.8L23 13l-6.2 1.6L19 21l-5.6-3.6L12 23l-1.4-5.6L5 21l2.2-6.4L1 13l5.4-2.2L3 5l6.4 2.4z"/></svg>',
  boom: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/><path d="M12 0l2 6h-4zM12 24l-2-6h4zM0 12l6-2v4zM24 12l-6 2v-4zM3.5 3.5l5.7 3-2.7 2.7zM20.5 20.5l-5.7-3 2.7-2.7zM20.5 3.5l-3 5.7-2.7-2.7zM3.5 20.5l3-5.7 2.7 2.7z"/></svg>',
  chest: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9h18v11H3z"/><path d="M4 4h16l1 4H3z" opacity=".75"/><rect x="10" y="10" width="4" height="5" fill="#000"/></svg>',
  pickaxe: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6c5-4 13-4 18 0l-1 2c-2-1.5-4-2.3-6-2.6L6.5 21.5 4 20 11.4 5.2C9 5.4 6.6 6.2 4 8z"/></svg>',
  glide: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 12c4-6 18-6 22 0-4-2-7-2-11 0-4-2-7-2-11 0z"/><path d="M8 13l4 8 4-8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  build: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 4h9v6H2zM13 4h9v6h-9zM2 12h5v6H2zM9 12h6v6H9zM17 12h5v6h-5z"/></svg>',
};
const SV_LIFE = { step: 0.45, shot: 1.1, boom: 1.6, chest: 1.3, pickaxe: 0.6, glide: 0.5, build: 0.8 };
const RING_LEN = 163.4;

export class Hud {
  constructor(game) {
    this.game = game;
    this.cache = {};
    this.nums = [];
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmapCanvas').getContext('2d');
    this.comp = $('compassCanvas').getContext('2d');
    this.mapImg = null;
    this.sv = new Map();
    this.waypoint = null;
    this.hitT = 0; this.noticeT = 0; this.bannerT = 0; this.elimT = 0; this.dirT = 0;
    this.buildHotbar();
    this.buildPhaseDots();
    this.makeBeacon();
    this.bindMap();
  }

  buildHotbar() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<span class="key">${i + 1}</span><img alt=""><span class="count"></span><span class="label"></span><span class="rl"></span>`;
      hb.appendChild(d);
    }
    $('buildbar').innerHTML = PIECE_TYPES.map((p, i) => `<div class="piece" data-p="${p}"><span class="key">${'QZXV'[i]}</span>${p}</div>`).join('');
    this.paletteV = 0;
  }

  // Key hints on the hotbar and build bar follow the player's bindings (or the pad layout).
  refreshKeyLabels() {
    const C = this.game.controller?.controls;
    if (!C) return;
    const pad = C.usingPad;
    const slotActs = ['pickaxe', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
    [...$('hotbar').children].forEach((el, i) => { el.querySelector('.key').textContent = pad ? '' : C.label(slotActs[i]); });
    [...$('buildbar').children].forEach((el) => { el.querySelector('.key').textContent = pad ? '' : C.label(el.dataset.p); });
    this.cache.keyPad = pad;
  }

  // Colour-blind palette changed: redraw rarity-coloured elements.
  refreshPalette() { this.paletteV = (this.paletteV || 0) + 1; this.cache.heldIconKey = null; }

  buildPhaseDots() { $('phaseDots').innerHTML = '<i></i>'.repeat(STORM_PHASES); }

  // Material icons cropped from the block atlas.
  matIcons() {
    const atlas = this.game.atlas;
    if (!atlas || this.matIconsDone) return;
    this.matIconsDone = true;
    const fallback = { wood_build: '#c9955a', brick_build: '#a85a44', metal_build: '#a7b0bb' };
    for (const img of document.querySelectorAll('#mats .mi')) {
      const name = img.dataset.tile;
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const ctx = c.getContext('2d');
      const ti = TEX.TILES ? TEX.TILES[name] : undefined;
      const uv = ti !== undefined && atlas.uvs ? atlas.uvs[ti] : null;
      if (uv && atlas.canvas) {
        const W = atlas.canvas.width, H = atlas.canvas.height;
        ctx.drawImage(atlas.canvas, Math.round(uv[0] * W), Math.round((1 - uv[3]) * H), 16, 16, 0, 0, 16, 16);
      } else { ctx.fillStyle = fallback[name] || '#888'; ctx.fillRect(0, 0, 16, 16); }
      img.src = c.toDataURL();
    }
  }

  // Precompute the island map image for this match. Also marks the start of a match.
  prepareMap() {
    this.mapImg = renderMapImage(this.game.world, this.game.atlas);
    this.matIcons();
    this.waypoint = null;
    this.game.ui?.progress?.startMatch();
    this.matchStart = performance.now();
  }

  show(on) { $('hud').classList.toggle('hidden', !on); }

  set(id, prop, value) {
    const key = id + prop;
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    const el = $(id);
    if (!el) return;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'class') el.setAttribute('class', value);
    else el.style[prop] = value;
  }

  // ---------------------------------------------------------------- events
  toast(text, item) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderColor = item ? RARITY[itemRarity(item)].color : '#fff';
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  notice(text, color = '#ffffff') { const n = $('notice'); n.textContent = text; n.style.color = color; n.classList.add('show'); this.noticeT = 2.2; }

  banner(title, sub = '') { $('banner').querySelector('h1').textContent = title; $('banner').querySelector('p').textContent = sub; $('banner').classList.add('show'); this.bannerT = 4; }

  elim(name) { const e = $('elimText'); e.innerHTML = `ELIMINATED <b>${escapeHtml(name)}</b>`; e.classList.add('show'); this.elimT = 2.5; }

  killfeed(html) {
    const el = document.createElement('div');
    el.className = 'kf' + (html.includes('class="me"') ? ' mine' : '');
    el.innerHTML = html;
    const kf = $('killfeed');
    kf.prepend(el);
    while (kf.children.length > 6) kf.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  hitmarker(head) {
    const h = $('hitmarker');
    h.className = '';
    void h.offsetWidth; // restart the pop animation
    h.className = 'show' + (head ? ' head' : '');
    this.hitT = 0.2;
  }

  damageNumber(pos, amount, kind) {
    const el = document.createElement('div');
    el.className = 'dmgnum ' + kind;
    el.textContent = amount;
    $('dmgNums').appendChild(el);
    this.nums.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6)), t: 0 });
  }

  damageFrom(angle) { const d = $('dmgDir'); d.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`; d.classList.add('show'); this.dirT = 1; }

  renderObjectives() {
    const s = this.game.story;
    const objs = s.objectivesView();
    $('objectives').innerHTML = `<div class="ch">${escapeHtml(s.chapter.title)}</div>` + objs.map(o =>
      `<div class="obj ${o.have >= o.need ? 'done' : ''}"><span>${escapeHtml(o.label)}</span><b>${o.need >= 999 ? o.have : `${o.have}/${o.need}`}</b><i style="width:${Math.min(100, o.have / o.need * 100)}%"></i></div>`).join('');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, me = g.viewActor(), pl = g.player;
    if (!me) return;
    // vitals
    this.set('shieldFill', 'width', `${me.shield / me.maxShield * 100}%`);
    this.set('healthFill', 'width', `${me.hp / me.maxHp * 100}%`);
    this.set('shieldNum', 'text', `${Math.ceil(me.shield)}`);
    this.set('overFill', 'width', `${me.maxOver ? me.over / me.maxOver * 100 : 0}%`);
    this.set('overNum', 'text', `${Math.ceil(me.over || 0)}`);
    this.set('healthNum', 'text', `${Math.ceil(me.hp)}`);
    this.set('alive', 'text', `${g.aliveCount()}`);
    this.set('kills', 'text', `${pl.kills}`);
    this.set('spectating', 'text', me !== pl ? `SPECTATING ${me.name}` : '');

    // storm row
    const st = g.storm;
    const mm = Math.floor(Math.max(0, st.timer) / 60), ss = Math.floor(Math.max(0, st.timer) % 60);
    this.set('stormInfo', 'text', g.phase === 'bus' ? `Bus leaves in ${g.busLeft()}s` : `${st.label}  ${mm}:${String(ss).padStart(2, '0')}`);
    const dotsKey = `${st.phase}${st.stage}`;
    if (this.cache.dots !== dotsKey) {
      this.cache.dots = dotsKey;
      [...$('phaseDots').children].forEach((d, i) => { d.className = i < st.phase ? 'done' : i === st.phase ? 'now' : ''; });
    }
    const inStorm = me.alive && me.state !== 'bus' && st.outside(me.pos);
    this.set('stormOverlay', 'opacity', inStorm ? '1' : '0');

    // hotbar
    const slots = $('hotbar').children;
    for (let i = 0; i < 6; i++) {
      const it = i === 0 ? { kind: 'weapon', id: 'pickaxe', rarity: 0 } : pl.slots[i - 1];
      const count = !it ? '' : (it.kind === 'heal' || it.kind === 'throwable' || it.kind === 'utility') ? `x${it.count}` : it.kind === 'weapon' && it.id !== 'pickaxe' ? `${it.mag}` : '';
      const key = (it ? `${it.kind}${it.id}${it.rarity}${count}` : 'none') + this.paletteV;
      const el = slots[i];
      if (el.dataset.k !== key) {
        el.querySelector('.rl').textContent = it && it.id !== 'pickaxe' ? RARITY_LETTERS[itemRarity(it)] || '' : '';
        el.dataset.k = key;
        const img = el.querySelector('img');
        if (it) { img.src = itemIcon(it.id, it.kind === 'weapon' ? it.rarity : 0); img.style.visibility = 'visible'; }
        else img.style.visibility = 'hidden';
        el.classList.toggle('empty', !it);
        el.style.setProperty('--rar', it ? RARITY[itemRarity(it)].color : 'transparent');
        el.querySelector('.count').textContent = count;
        el.querySelector('.label').textContent = shortName(it);
      }
      el.classList.toggle('sel', !g.buildMode && pl.selected === i);
    }
    if (this.cache.keyPad !== g.controller?.controls?.usingPad) this.refreshKeyLabels();
    // held item card
    const held = pl.held();
    const card = $('heldCard');
    card.classList.toggle('build', g.buildMode);
    if (g.buildMode) {
      this.set('heldName', 'text', `BUILD: ${g.buildPiece.toUpperCase()}`);
      this.set('heldRarity', 'text', g.buildMat);
      this.set('ammoType', 'text', '');
      this.set('ammo', 'html', `${pl.mats[g.buildMat]} <small>mats</small>`);
      this.set('heldIcon', 'visibility', 'hidden');
    } else if (held) {
      const rar = RARITY[itemRarity(held)];
      const wdef = held.kind === 'weapon' ? WEAPONS[held.id] : null;
      card.style.setProperty('--rar', rar.color);
      const iconKey = held.id + (held.rarity || 0);
      if (this.cache.heldIconKey !== iconKey) { this.cache.heldIconKey = iconKey; $('heldIcon').src = itemIcon(held.id, held.kind === 'weapon' ? held.rarity : 0); }
      this.set('heldIcon', 'visibility', 'visible');
      this.set('heldName', 'text', (held.kind === 'weapon' ? wdef.name : HEALS[held.id]?.name || shortName(held) || itemName(held)).toUpperCase());
      this.set('heldRarity', 'text', held.id === 'pickaxe' ? 'Harvesting tool' : rar.name);
      if (wdef && wdef.ammo) {
        this.set('ammoType', 'text', AMMO[wdef.ammo].name.replace(' Ammo', ''));
        this.set('ammoType', 'background', AMMO[wdef.ammo].color);
        this.set('ammo', 'html', `${held.mag} <small>/ &infin;</small>`);
      } else if (held.kind === 'heal') {
        const h = HEALS[held.id];
        this.set('ammoType', 'text', h.heal ? `+${h.heal} HP` : `+${h.shield} shield`);
        this.set('ammoType', 'background', h.heal ? '#7fe07f' : '#6ec8ff');
        this.set('ammo', 'html', `x${held.count}`);
      } else if (held.count) { this.set('ammoType', 'text', ''); this.set('ammo', 'html', `x${held.count}`); } // throwables and utilities
      else { this.set('ammoType', 'text', ''); this.set('ammo', 'html', ''); }
    }
    for (const m of ['wood', 'brick', 'metal']) {
      this.set('mat_' + m, 'text', `${pl.mats[m]}`);
      this.set('matbox_' + m, 'class', 'mat' + (g.buildMode && g.buildMat === m ? ' sel' : ''));
    }
    $('buildbar').classList.toggle('show', g.buildMode);
    for (const el of $('buildbar').children) el.classList.toggle('sel', el.dataset.p === g.buildPiece);

    // progress ring (reload / heal / chest search)
    let prog = null, label = '', kind = '';
    if (pl.reloading > 0) { prog = 1 - pl.reloading / pl.reloadTotal; label = 'Reloading'; }
    else if (pl.using) {
      const h = HEALS[pl.slots[pl.using.slot]?.id];
      prog = 1 - pl.using.t / pl.using.total; label = h ? h.name : 'Using'; kind = h && h.shield ? 'shield' : 'heal';
    } else if (pl.searchT > 0) { prog = pl.searchT / 0.45; label = 'Searching'; kind = 'search'; }
    this.set('ring', 'display', prog === null || !pl.alive ? 'none' : 'block');
    this.set('ring', 'class', kind);
    this.set('ringText', 'text', prog === null || !pl.alive ? '' : label);
    if (prog !== null) $('ringFill').style.strokeDashoffset = `${RING_LEN * (1 - Math.min(1, prog))}`;

    // crosshair
    const w = held && held.kind === 'weapon' ? WEAPONS[held.id] : null;
    const sc = g.scoped;
    this.set('scope', 'display', sc ? 'block' : 'none');
    this.set('crosshair', 'display', sc || g.phase === 'bus' || !pl.alive || pl.state !== 'ground' ? 'none' : 'block');
    let type = 'cross', spread = 6;
    if (g.buildMode) type = 'cross build';
    else if (!w || w.melee) type = 'dot';
    else if (held.id === 'shotgun') type = 'shotgun';
    else if (held.id === 'sniper' || held.id === 'rocket') type = 'sniper';
    if (w && !w.melee) spread = 6 + ((pl.ads ? w.ads : w.spread) + pl.bloom) * 380;
    if (held && held.id === 'shotgun') spread = 10 + (pl.ads ? w.ads : w.spread) * 300;
    this.set('crosshair', 'class', type);
    $('crosshair').style.setProperty('--s', `${spread.toFixed(0)}px`);

    // timers
    if ((this.hitT -= dt) <= 0) $('hitmarker').className = '';
    if ((this.noticeT -= dt) <= 0) $('notice').classList.remove('show');
    if ((this.bannerT -= dt) <= 0) $('banner').classList.remove('show');
    if ((this.elimT -= dt) <= 0) $('elimText').classList.remove('show');
    if ((this.dirT -= dt) <= 0) $('dmgDir').classList.remove('show');

    // damage numbers
    const cam = g.camera, W = innerWidth, H = innerHeight;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      if (n.t > 0.9) { n.el.remove(); this.nums.splice(i, 1); continue; }
      const p = n.pos.clone(); p.y += n.t * 1.2;
      p.project(cam);
      if (p.z > 1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = 'block';
      const pop = n.t < 0.08 ? 1.6 - n.t * 4 : 1.3 - n.t * 0.4;
      n.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * W}px, ${(-p.y * 0.5 + 0.5) * H}px) translate(-50%,-50%) scale(${pop})`;
      n.el.style.opacity = `${1 - Math.max(0, n.t - 0.5) * 2.5}`;
    }

    this.updateSoundViz(dt);
    this.updateBeacon(me);
    this.drawCompass(me);
    this.drawMinimap(me);
    if (g.bigMapOpen) this.drawBigMap(me);
  }

  // ---------------------------------------------------------------- sound visualiser
  soundViz(kind, pos, key, strength) {
    let v = this.sv.get(key);
    if (!v || v.kind !== kind) {
      if (v) v.el.remove();
      const el = document.createElement('div');
      el.className = 'sv ' + kind;
      el.innerHTML = SV_ICONS[kind];
      $('soundViz').appendChild(el);
      v = { el, kind };
      this.sv.set(key, v);
    }
    v.x = pos.x; v.z = pos.z; v.t = 0; v.str = Math.max(0, Math.min(1, strength));
  }

  updateSoundViz(dt) {
    const cam = this.game.camera, yaw = cam.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const R = Math.min(170, innerHeight * 0.24);
    for (const [key, v] of this.sv) {
      v.t += dt;
      const life = SV_LIFE[v.kind] || 1;
      if (v.t > life) { v.el.remove(); this.sv.delete(key); continue; }
      const dx = v.x - cam.position.x, dz = v.z - cam.position.z;
      const th = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      v.el.style.transform = `translate(${Math.sin(th) * R}px, ${-Math.cos(th) * R}px) scale(${0.75 + v.str * 0.45})`;
      v.el.style.opacity = `${(1 - v.t / life) * (0.6 + 0.4 * v.str)}`;
    }
  }

  clearSoundViz() { for (const v of this.sv.values()) v.el.remove(); this.sv.clear(); }

  // ---------------------------------------------------------------- waypoint
  makeBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 90, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    beam.position.y = 45;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false }));
    gem.position.y = 2.2;
    g.add(beam, gem);
    g.visible = false;
    this.beacon = g; this.beaconGem = gem;
    this.game.scene.add(g);
  }

  setWaypoint(x, z) {
    if (x == null) { this.waypoint = null; return; }
    this.waypoint = { x: Math.max(0, Math.min(SX, x)), z: Math.max(0, Math.min(SZ, z)) };
    this.waypoint.y = this.game.world ? this.game.world.groundY(Math.floor(this.waypoint.x), Math.floor(this.waypoint.z)) : 20;
    this.game.audio?.play('pickup', { vol: 0.5 });
  }

  updateBeacon(me) {
    const wp = this.waypoint, b = this.beacon, lab = $('wpLabel');
    const on = !!wp && this.game.inMatch();
    b.visible = on;
    if (!on) { lab.style.display = 'none'; return; }
    b.position.set(wp.x, wp.y, wp.z);
    this.beaconGem.rotation.y += 0.04;
    this.beaconGem.position.y = 2.2 + Math.sin(performance.now() / 300) * 0.25;
    const d = Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z);
    if (d < 3) { this.waypoint = null; return; }
    const p = new THREE.Vector3(wp.x, wp.y + 4, wp.z).project(this.game.camera);
    if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) { lab.style.display = 'none'; return; }
    lab.style.display = 'block';
    lab.textContent = `${Math.round(d)}m`;
    lab.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
  }

  // ---------------------------------------------------------------- compass strip
  drawCompass(me) {
    const ctx = this.comp, W = ctx.canvas.width, H = ctx.canvas.height, g = this.game;
    ctx.clearRect(0, 0, W, H);
    const yaw = g.camera.rotation.y;
    const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    const span = 120, ppd = W / span;
    const xOf = (deg) => W / 2 + (((deg - heading + 540) % 360) - 180) * ppd;
    ctx.textAlign = 'center';
    for (let d = Math.floor((heading - span / 2) / 5) * 5; d <= heading + span / 2; d += 5) {
      const dd = ((d % 360) + 360) % 360, x = xOf(dd);
      const major = dd % 15 === 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(Math.round(x), H - (major ? 14 : 8), 2, major ? 14 : 8);
      if (major) {
        const lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[dd];
        ctx.font = lab ? '20px Lucky, "Trebuchet MS", sans-serif' : '600 12px Rubik, sans-serif';
        ctx.fillStyle = lab === 'N' ? '#ffd23f' : lab ? '#fff' : 'rgba(255,255,255,0.75)';
        ctx.fillText(lab || String(dd), x, lab ? 24 : 21);
      }
    }
    const marker = (px, pz, color, shape) => {
      const b = ((Math.atan2(px - me.pos.x, -(pz - me.pos.z)) * 180 / Math.PI) + 360) % 360;
      let x = xOf(b);
      x = Math.max(10, Math.min(W - 10, x));
      ctx.fillStyle = color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (shape === 'diamond') { ctx.moveTo(x, 2); ctx.lineTo(x + 7, 9); ctx.lineTo(x, 16); ctx.lineTo(x - 7, 9); }
      else ctx.arc(x, 9, 6, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    if (g.phase === 'play' && me.alive) marker(g.storm.next.x, g.storm.next.z, '#c070ff', 'circle');
    if (this.waypoint) marker(this.waypoint.x, this.waypoint.z, '#ffc400', 'diamond');
    for (const m of g.extraMarkers || []) marker(m.x, m.z, m.color, m.shape === 'dot' ? 'circle' : 'diamond'); // team markers and teammates
  }

  // ---------------------------------------------------------------- minimap
  drawCircle(ctx, x, z, r, s, ox, oz, color, width, fillOutside) {
    ctx.beginPath();
    ctx.arc((x - ox) * s, (z - oz) * s, Math.max(0, r * s), 0, Math.PI * 2);
    if (fillOutside) {
      ctx.save();
      ctx.rect(5000, -5000, -10000, 10000);
      ctx.fillStyle = 'rgba(120,40,200,0.38)';
      ctx.fill('evenodd');
      ctx.restore();
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  drawMinimap(me) {
    const ctx = this.mini, S = ctx.canvas.width, scale = 2.2;
    const g = this.game;
    if (!this.mapImg) return;
    const ox = me.pos.x - S / scale / 2, oz = me.pos.z - S / scale / 2;
    ctx.fillStyle = '#16407a'; ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapImg, -ox * scale, -oz * scale, SX * scale, SZ * scale);
    ctx.font = '600 10px Rubik, sans-serif'; ctx.textAlign = 'center';
    for (const p of g.world.pois) {
      const x = (p.x - ox) * scale, y = (p.z - oz) * scale;
      if (x < 10 || y < 10 || x > S - 10 || y > S - 10) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(p.name.toUpperCase(), x + 1, y + 1);
      ctx.fillStyle = '#fff'; ctx.fillText(p.name.toUpperCase(), x, y);
    }
    for (const pg of g.pings || []) {
      const x = (pg.x - ox) * scale, y = (pg.z - oz) * scale, k = 1 - pg.t / 2;
      ctx.strokeStyle = `rgba(255,${pg.kind === 'boom' ? 150 : 70},50,${k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 3 + pg.t * 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,80,60,${k})`; ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    this.drawOverlays(ctx, scale, ox, oz, me, false);
    const st = g.storm;
    ctx.textAlign = 'center';
    if (g.phase === 'play' && me.alive) {
      const dx = st.next.x - me.pos.x, dz = st.next.z - me.pos.z, d = Math.hypot(dx, dz);
      if (d > st.next.r) {
        const a = Math.atan2(dz, dx), rr = S / 2 - 14;
        ctx.save(); ctx.translate(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr); ctx.rotate(a);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = 'rgba(10,6,30,0.8)'; ctx.fillRect(0, S - 18, S, 18);
        ctx.fillStyle = '#e6b8ff'; ctx.font = '700 11px Rubik, sans-serif';
        ctx.fillText(`SAFE ZONE ${Math.round(d - st.next.r)}m`, S / 2, S - 5);
      }
    }
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = '14px Lucky, "Trebuchet MS", sans-serif';
    const low = S - 5 - (g.phase === 'play' ? 16 : 0);
    for (const [t, x, y] of [['N', S / 2, 16], ['S', S / 2, low], ['W', 10, S / 2 + 5], ['E', S - 10, S / 2 + 5]]) { ctx.strokeText(t, x, y); ctx.fillStyle = t === 'N' ? '#ffd23f' : '#fff'; ctx.fillText(t, x, y); }
  }

  // ---------------------------------------------------------------- full map
  bindMap() {
    const cv = $('bigmapCanvas');
    const toWorld = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * SX, z: (e.clientY - r.top) / r.height * SZ };
    };
    cv.addEventListener('click', (e) => { const p = toWorld(e); this.setWaypoint(p.x, p.z); });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.setWaypoint(null); });
    cv.addEventListener('mousemove', (e) => { this.mapHover = toWorld(e); });
    cv.addEventListener('mouseleave', () => { this.mapHover = null; });
    $('btnMapClose').addEventListener('click', () => { if (this.game.bigMapOpen) this.game.toggleBigMap(); });
    // Free the mouse while the map is open so markers can be placed.
    new MutationObserver(() => {
      const open = $('bigmap').classList.contains('show');
      if (open === this.mapWasOpen) return;
      this.mapWasOpen = open;
      if (!this.game.inMatch()) return;
      if (open) this.game.ui.unlockPointer();
      else if (this.game.ui.screen === null) this.game.ui.lockPointer();
    }).observe($('bigmap'), { attributes: true, attributeFilter: ['class'] });
  }

  gridRef(x, z) { return `${COLS[Math.max(0, Math.min(9, Math.floor(x / SX * 10)))]}${Math.max(1, Math.min(10, Math.floor(z / SZ * 10) + 1))}`; }

  drawBigMap(me) {
    const ctx = this.big, S = ctx.canvas.width, scale = S / SX;
    if (!this.mapImg) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#16407a'; ctx.fillRect(0, 0, S, S);
    ctx.drawImage(this.mapImg, 0, 0, S, S);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const p = Math.round(i * S / 10) + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
    }
    ctx.font = '15px Lucky, "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 10; i++) {
      const c = (i + 0.5) * S / 10;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(c - 11, 2, 22, 20); ctx.fillRect(2, c - 10, 24, 20);
      ctx.fillStyle = '#fff'; ctx.fillText(COLS[i], c, 18); ctx.fillText(String(i + 1), 14, c + 6);
    }
    // locations
    for (const p of this.game.world.pois) {
      const x = p.x * scale, y = p.z * scale;
      drawPoiIcon(ctx, p.type, x, y);
      ctx.font = '16px Lucky, "Trebuchet MS", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(p.name.toUpperCase(), x, y + 30);
      ctx.fillStyle = '#fff'; ctx.fillText(p.name.toUpperCase(), x, y + 30);
    }
    this.drawOverlays(ctx, scale, 0, 0, me, true);
    // info panel
    const parts = [`You are in <b>${this.gridRef(me.pos.x, me.pos.z)}</b>`];
    if (this.waypoint) parts.push(`Marker at <b>${this.gridRef(this.waypoint.x, this.waypoint.z)}</b>, ${Math.round(Math.hypot(this.waypoint.x - me.pos.x, this.waypoint.z - me.pos.z))}m away`);
    if (this.mapHover) parts.push(`Cursor <b>${this.gridRef(this.mapHover.x, this.mapHover.z)}</b>`);
    this.set('mapInfo', 'html', parts.join('<br>'));
  }

  drawOverlays(ctx, s, ox, oz, me, big) {
    const g = this.game, st = g.storm;
    ctx.save();
    if (g.phase !== 'bus') {
      this.drawCircle(ctx, st.cur.x, st.cur.z, st.cur.r, s, ox, oz, '#c070ff', big ? 3 : 2, true);
      ctx.setLineDash([5, 5]);
      this.drawCircle(ctx, st.next.x, st.next.z, st.next.r, s, ox, oz, '#ffffff', big ? 2.5 : 1.5, false);
      ctx.setLineDash([]);
    }
    if ((g.phase === 'bus' || big) && g.busFrom) {
      const a = g.busFrom, b = g.busTo;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = big ? 3 : 2; ctx.setLineDash([8, 7]);
      ctx.beginPath(); ctx.moveTo((a.x - ox) * s, (a.z - oz) * s); ctx.lineTo((b.x - ox) * s, (b.z - oz) * s); ctx.stroke(); ctx.setLineDash([]);
      if (g.phase === 'bus') { const bp = g.bus.position; ctx.fillStyle = '#3b9ef0'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fillRect((bp.x - ox) * s - 6, (bp.z - oz) * s - 6, 12, 12); ctx.strokeRect((bp.x - ox) * s - 6, (bp.z - oz) * s - 6, 12, 12); }
    }
    const diamond = (x, y, r, fill) => {
      ctx.fillStyle = fill; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.85, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.85, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    const shard = g.story.shard;
    if (shard) diamond((shard.pos.x - ox) * s, (shard.pos.z - oz) * s, big ? 10 : 7, '#d070ff');
    if (this.waypoint) diamond((this.waypoint.x - ox) * s, (this.waypoint.z - oz) * s, big ? 11 : 7, '#ffc400');
    for (const m of g.extraMarkers || []) { // team markers and teammates (teams.js)
      const mx = (m.x - ox) * s, my = (m.z - oz) * s;
      if (m.shape === 'dot') { ctx.fillStyle = m.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, big ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else diamond(mx, my, big ? 10 : 7, m.color);
    }
    for (const a of g.actors) if (a.remote && a.alive && a.isPlayer && a.state !== 'bus' && !g.teamMode) {
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.fillRect((a.pos.x - ox) * s - 4, (a.pos.z - oz) * s - 4, 8, 8); ctx.strokeRect((a.pos.x - ox) * s - 4, (a.pos.z - oz) * s - 4, 8, 8);
    }
    const px = (me.pos.x - ox) * s, pz = (me.pos.z - oz) * s, k = big ? 1.4 : 1;
    ctx.translate(px, pz); ctx.rotate(-me.yaw);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9 * k); ctx.lineTo(7 * k, 7 * k); ctx.lineTo(0, 3 * k); ctx.lineTo(-7 * k, 7 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  clearTransient() {
    for (const n of this.nums) n.el.remove();
    this.nums.length = 0;
    $('killfeed').innerHTML = ''; $('toasts').innerHTML = '';
    for (const id of ['notice', 'banner', 'elimText', 'dmgDir']) $(id).classList.remove('show');
    $('radio').className = '';
    $('wpLabel').style.display = 'none';
    this.clearSoundViz();
  }
}

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
