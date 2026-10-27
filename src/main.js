// Front end, lobby, story, locker, end screens and pointer lock.
import { Game, saveSettings } from './game.js';
import { installFeatures } from './features.js';
import { enterTouchPlay } from './touch.js';
import { NATIVE, ON_PAGES, askServerAddress } from './platform.js';
import { OUTFITS, makeGlider, setHeld } from './models.js';
import { GLIDERS, PICKAXES, outfitLevel, isUnlocked, unlocksBetween, sanitiseCosmetics } from './ui/cosmetics.js';
import { INTRO, ENDING } from './story.js';
import { escapeHtml } from './hud.js';
import { audio } from './audio.js';
import { Progression } from './ui/progression.js';
import { outfitThumbnails, gliderThumbnails, pickaxeThumbnails } from './ui/locker.js';

const $ = (id) => document.getElementById(id);
const TIPS = [
  'Golden chests hum when you are close. Follow the sparkle.',
  'Hit trees with your pickaxe to collect wood for building.',
  'Getting shot? Throw up a wall with Q, then fight back.',
  'Rockets blow holes in anything, including the ground.',
  'The purple Static gets nastier every phase.',
  'Headshots deal extra damage. Snipers deal a lot extra.',
  'Ramps are staircases. Run up them and keep spamming X.',
  'Open the map with M and click to drop a marker for yourself.',
  'Red bursts around your crosshair show where gunfire is coming from.',
  'No Builds mode gives everyone an overshield that recharges out of combat.',
];
const PREVIEW = { play: { x: 0.55, y: 0.6, size: 1.25 }, locker: { x: 0.78, y: 0.6, size: 1.35 }, lockerGlider: { x: 0.78, y: 0.74, size: 0.95 } };
const MODE_DESC = {
  build: 'Harvest materials and build walls, ramps, floors and cones to outplay opponents.',
  zero: 'No building and no harvesting. Everyone gets a 50-point overshield that recharges.',
};
const CHAPTER_TAGS = ['1', '2', '3', '4', '5', 'E'];

function portrait(kind) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const x = c.getContext('2d');
  if (kind === 'echo') {
    x.fillStyle = '#1b2a3a'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#c9d6e3'; x.fillRect(1, 1, 6, 6);
    x.fillStyle = '#26e0ff'; x.fillRect(1, 3, 6, 2);
    x.fillStyle = '#ffffff'; x.fillRect(2, 3, 1, 1); x.fillRect(5, 3, 1, 1);
    x.fillStyle = '#7f8fa0'; x.fillRect(3, 6, 2, 1);
  } else {
    x.fillStyle = '#120808'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#3a3a44'; x.fillRect(1, 1, 6, 6);
    x.fillStyle = '#ff2a2a'; x.fillRect(3, 3, 2, 2);
    x.fillStyle = '#ff9a9a'; x.fillRect(3, 3, 1, 1);
    x.fillStyle = '#22222a'; x.fillRect(1, 1, 6, 1); x.fillRect(1, 6, 6, 1);
  }
  return c.toDataURL();
}
const PORTRAITS = {};
const portraitFor = (k) => PORTRAITS[k] || (PORTRAITS[k] = portrait(k));

class UI {
  constructor(game) {
    this.g = game; game.ui = this;
    this.screen = null;
    this.stack = [];
    this.tab = 'play';
    this.net = 'solo';
    this.progress = new Progression(game);
    this.progress.onLevelUp = (lvl, before) => this.levelToast(lvl, before);
    this.lockerKind = 'outfit';
    if (sanitiseCosmetics(game.settings, this.progress.view().level)) saveSettings(game.settings);
    // Every rebuilt menu preview gets the equipped glider and pickaxe.
    const baseUpdatePreview = game.updatePreview.bind(game);
    game.updatePreview = () => { baseUpdatePreview(); this.applyPreviewCosmetics(); };
    this.wire();
    this.renderPlayerCard();
  }

  // ---------------------------------------------------------------- screens
  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    this.screen = name;
    if (name) $(name).classList.add('show');
    if (name === 'menu') { this.setTab(this.tab); this.renderPlayerCard(); this.renderChapterCard(); }
    else this.g.previewScreenPos = null;
    if (name !== 'end') { $('confetti').innerHTML = ''; $('end').classList.remove('won'); }
  }

  open(name) {
    this.stack.push(this.screen);
    if (name === 'settings') { $('settingsHomeModal').appendChild($('settingsPanel')); this.syncSettings(); }
    if (name === 'help') $('helpHomeModal').appendChild($('helpPanel'));
    this.showScreen(name);
  }
  back() { this.showScreen(this.stack.pop() || 'menu'); }

  setTab(tab) {
    this.tab = tab;
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.tabpanel').forEach(p => p.classList.toggle('on', p.id === 'tab-' + tab));
    if (tab === 'settings') { $('settingsHomeTab').appendChild($('settingsPanel')); this.syncSettings(); }
    if (tab === 'help') $('helpHomeTab').appendChild($('helpPanel'));
    if (tab === 'story') this.renderStory();
    if (tab === 'locker') this.renderLocker();
    const pv = tab === 'locker' && this.lockerKind === 'glider' ? PREVIEW.lockerGlider : PREVIEW[tab];
    this.g.previewScreenPos = this.screen === 'menu' && pv ? { ...pv } : null;
    this.applyPreviewCosmetics();
  }

  loading(text, p) {
    $('loadText').textContent = text;
    $('loadFill').style.width = `${Math.round(p * 100)}%`;
  }

  lockPointer() {
    // touch devices have no pointer lock: just start playing (fullscreen landscape where supported)
    if (this.g.touch) { this.g.paused = false; this.showScreen(null); enterTouchPlay(); return; }
    const el = this.g.renderer.domElement;
    try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => this.showPause()); } catch { this.showPause(); }
  }
  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

  showPause() {
    const g = this.g;
    if (!g.inMatch() || g.phase === 'over' || this.screen === 'end' || g.bigMapOpen || g.creativeMenuOpen || g.replay?.active) return; // creative menu and kill cam free the mouse
    g.paused = !g.net.online;
    $('pauseTitle').textContent = g.net.online ? 'Match running' : 'Paused';
    $('btnQuit').textContent = g.net.online && g.net.isHost ? 'End match for everyone' : 'Leave match';
    this.showScreen('pause');
  }

  showBusHint(show, canJump) {
    const C = this.g.controller?.controls;
    const key = C ? (C.usingPad ? 'A' : C.label('jump').toUpperCase()) : 'SPACE';
    const t = show ? (canJump ? `Press ${key} to jump` : 'Doors open soon') : '';
    this.g.hud.set('busHint', 'text', t);
  }

  // ---------------------------------------------------------------- end of match
  fmtTime(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  showDeath(r) {
    if (this.screen === 'end') return;
    if (this.g.replay?.interceptDeath(r)) return; // kill cam plays first, then calls showDeath again
    this.unlockPointer();
    const g = this.g;
    $('end').classList.remove('won');
    $('endTitle').textContent = `#${r.placement}`;
    $('endSub').textContent = r.killer ? `Eliminated by ${r.killer}` : 'Eliminated';
    const t = g.time;
    this.renderEndStats(r.kills, r.placement, t);
    this.renderXp(this.progress.commit(r.placement, g.actors.length, t));
    $('btnSpectate').style.display = '';
    this.setEndButtons(false);
    this.showScreen('end');
  }

  showEnd(info) {
    this.unlockPointer();
    const g = this.g;
    $('end').classList.toggle('won', info.won);
    $('endTitle').textContent = `#${info.placement}`;
    $('endSub').textContent = info.won ? 'You broke the Loop for today.' : `${info.winner} won the match.`;
    const alreadyCommitted = this.progress.match && this.progress.match.committed;
    const t = alreadyCommitted ? (this.deathTime ?? g.time) : g.time;
    this.renderEndStats(info.kills, info.placement, t);
    this.renderXp(this.progress.commit(info.placement, g.actors.length, t));
    $('btnSpectate').style.display = 'none';
    this.setEndButtons(true);
    this.showScreen('end');
    if (info.won) this.confetti();
    if (g.story.pendingEnding) {
      g.story.pendingEnding = false;
      setTimeout(() => this.crawl(ENDING, () => this.showScreen('end')), 3000);
    }
  }

  renderEndStats(kills, placement, t) {
    this.deathTime = t;
    $('endStats').innerHTML = `<div><b>${kills}</b>Eliminations</div><div><b>#${placement}</b>Placement</div><div><b>${this.fmtTime(t)}</b>Time survived</div>`;
  }

  renderXp(m) {
    const pr = this.progress;
    const gained = m ? m.gained : 0;
    const before = pr.view(pr.p.xp - gained), after = pr.view();
    $('endLevel').textContent = before.level;
    $('endXpGain').textContent = `+${gained} XP`;
    $('xpBreakdown').innerHTML = m ? m.parts.map(p => `<span>${escapeHtml(p.label)}${p.count > 1 ? ` x${p.count}` : ''} <b>+${p.xp}</b></span>`).join('') : '';
    const fill = $('endXpFill');
    fill.style.transition = 'none';
    fill.style.width = `${before.frac * 100}%`;
    void fill.offsetWidth;
    fill.style.transition = 'width 1.2s ease-out';
    setTimeout(() => {
      if (after.level > before.level) {
        fill.style.width = '100%';
        setTimeout(() => { $('endLevel').textContent = after.level; fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = 'width .8s ease-out'; fill.style.width = `${after.frac * 100}%`; }, 1250);
      } else fill.style.width = `${after.frac * 100}%`;
    }, 300);
    this.renderPlayerCard();
  }

  confetti() {
    const box = $('confetti');
    box.innerHTML = '';
    const cols = ['#ffd23f', '#4fb6ff', '#6ee05a', '#ff5fb0', '#a55cf0', '#ffffff', '#ff9f1c'];
    for (let i = 0; i < 140; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = `${2.5 + Math.random() * 3}s`;
      c.style.animationDelay = `${Math.random() * 1.8}s`;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      if (Math.random() < 0.4) { c.style.width = '7px'; c.style.height = '7px'; c.style.borderRadius = '50%'; }
      box.appendChild(c);
    }
  }

  setEndButtons(over) {
    const n = this.g.net;
    // In LAN play the host keeps simulating until the match ends.
    const canLeave = over || !n.online || !n.isHost;
    $('btnEndMenu').style.display = canLeave ? '' : 'none';
    $('btnAgain').textContent = n.online ? 'BACK TO LOBBY' : 'PLAY AGAIN';
    $('btnAgain').style.display = canLeave ? '' : 'none';
  }

  levelToast(lvl, before = lvl - 1) {
    $('levelToastNum').textContent = lvl;
    const t = $('levelToast');
    const unlocks = unlocksBetween(before, lvl);
    t.querySelector('span').innerHTML = unlocks.length
      ? `Unlocked: ${unlocks.map(u => `<b class="unl">${escapeHtml(u.name)}</b> <small>${u.kind}</small>`).join(', ')}`
      : 'Keep looping.';
    t.classList.add('show');
    this.g.audio.play('elim', { vol: 0.6 });
    clearTimeout(this.levelT);
    this.levelT = setTimeout(() => t.classList.remove('show'), unlocks.length ? 5200 : 3200);
  }

  // ---------------------------------------------------------------- lobby
  toLobby(msg) { this.renderLobby(); this.showScreen('lobby'); if (msg) $('lobbyWait').textContent = msg; }
  toMenu(msg) { this.g.net.disconnect(); this.showScreen('menu'); $('menuMsg').textContent = msg || ''; }

  renderLobby() {
    const n = this.g.net;
    $('lobbyList').innerHTML = n.lobby.map(p => {
      const o = OUTFITS[p.outfit % OUTFITS.length] || OUTFITS[0];
      const status = p.id === n.hostId ? '<span class="badge host">HOST</span>' : `<span class="badge">${p.spectator ? 'SPECTATING' : p.inMatch ? 'IN MATCH' : 'READY'}</span>`;
      return `<li class="${p.id === n.id ? 'me' : ''}"><span class="chip" style="background:linear-gradient(${o.hair} 0 30%, ${o.skin} 30% 55%, ${o.shirt} 55%)"></span>
        <span class="nm">${escapeHtml(p.name)}<small>${p.platform === 'mobile' ? '&#128241; Mobile' : '&#128187; PC'} · ${escapeHtml(o.name)}${p.id === n.id ? ' · you' : ''}</small></span>${status}</li>`;
    }).join('');
    const host = n.isHost;
    $('hostControls').style.display = host ? '' : 'none';
    $('lobbyWait').textContent = host ? `${n.lobby.length} player${n.lobby.length === 1 ? '' : 's'} in the lobby. Start when everyone is in.`
      : n.lobby.some(p => p.inMatch) ? 'A match is in progress. You will join the next one.' : 'Waiting for the host to start the match.';
  }

  // ---------------------------------------------------------------- crawl
  crawl(lines, done) {
    let i = 0, typing = null;
    const prog = $('crawlProg');
    prog.innerHTML = lines.map(() => '<i></i>').join('');
    const show = () => {
      const raw = lines[i];
      const m = raw.match(/^(Echo|The Architect): (.*)$/);
      const who = m ? (m[1] === 'Echo' ? 'echo' : 'architect') : null;
      const text = (m ? m[2] : raw).replace(/^"|"$/g, '');
      const img = $('crawlPortrait');
      img.hidden = !who;
      if (who) { img.src = portraitFor(who); img.className = who; }
      $('crawlSpeaker').textContent = who ? (who === 'echo' ? 'ECHO' : 'THE ARCHITECT') : '';
      $('crawlSpeaker').className = who || '';
      const el = $('crawlText');
      el.className = who ? '' : 'narration';
      [...prog.children].forEach((d, k) => d.classList.toggle('on', k <= i));
      $('btnCrawl').textContent = i === lines.length - 1 ? 'BEGIN' : 'CONTINUE';
      clearInterval(typing);
      let n = 0;
      el.textContent = '';
      typing = setInterval(() => {
        n += 2;
        el.textContent = text.slice(0, n);
        if (n >= text.length) { clearInterval(typing); typing = null; }
      }, 30);
      this.crawlFinishLine = () => { clearInterval(typing); typing = null; el.textContent = text; };
    };
    this.crawlNext = () => {
      if (typing) { this.crawlFinishLine(); return; }
      i++;
      if (i >= lines.length) { this.crawlNext = null; done(); } else show();
    };
    this.crawlSkip = () => { clearInterval(typing); this.crawlNext = null; done(); };
    this.showScreen('crawl');
    show();
  }

  // ---------------------------------------------------------------- front-end panels
  renderPlayerCard() {
    const v = this.progress.view(), p = this.progress.p;
    $('pcName').textContent = this.g.settings.name;
    $('pcLevel').textContent = v.level;
    $('pcXp').style.width = `${v.frac * 100}%`;
    $('pcXpText').textContent = `${v.into} / ${v.need} XP · ${p.wins} wins · ${p.kills} elims`;
  }

  renderChapterCard() {
    const s = this.g.story;
    $('chapterCard').innerHTML = `<div class="kicker">Story</div><h4>${escapeHtml(s.chapter.title)}</h4>` +
      s.objectivesView().map(o => `<div class="obj ${o.have >= o.need ? 'done' : ''}"><span>${escapeHtml(o.label)}</span><b>${o.need >= 999 ? o.have : `${o.have}/${o.need}`}</b></div>`).join('');
  }

  renderStory() {
    const s = this.g.story;
    $('storyTitle').textContent = s.chapter.title;
    $('storyBrief').textContent = s.chapter.brief;
    $('storyObjs').innerHTML = s.objectivesView().map(o => `<div class="obj ${o.have >= o.need ? 'done' : ''}"><span>${escapeHtml(o.label)}</span><b>${o.need >= 999 ? o.have : `${o.have} / ${o.need}`}</b><i style="width:${Math.min(100, o.have / o.need * 100)}%"></i></div>`).join('');
    const idx = s.chapterIndex;
    $('chapterDots').innerHTML = CHAPTER_TAGS.map((t, k) => `<span class="${k < idx ? 'done' : k === idx ? 'now' : ''}">${k === 5 ? 'Epilogue' : `Ch ${t}`}</span>`).join('');
    const entries = s.codexEntries();
    $('codex').innerHTML = entries.length
      ? entries.map(e => `<div class="entry"><b>${escapeHtml(e.title)}</b><br>${escapeHtml(e.text)}</div>`).join('')
      : '<p class="locked">Complete chapters to unlock lore entries.</p>';
  }

  // Locker: outfits, gliders and pickaxes, unlocked by player level.
  renderLocker() {
    const s = this.g.settings, level = this.progress.view().level, kind = this.lockerKind;
    document.querySelectorAll('#lockerTabs button').forEach(b => b.classList.toggle('on', b.dataset.k === kind));
    let items;
    if (kind === 'outfit') {
      const thumbs = outfitThumbnails();
      items = OUTFITS.map((o, i) => ({ key: i, name: o.name, img: thumbs[i], colour: o.shirt, level: outfitLevel(i), on: i === s.outfit }));
    } else if (kind === 'glider') {
      const thumbs = gliderThumbnails(s.outfit);
      items = GLIDERS.map((g, i) => ({ key: g.id, name: g.name, img: thumbs[i], colour: '#4fb6ff', level: g.level, on: g.id === (s.glider || 'default'), desc: g.desc }));
    } else {
      const thumbs = pickaxeThumbnails();
      items = PICKAXES.map((p, i) => ({ key: p.id, name: p.name, img: thumbs[i], colour: '#ffd23f', level: p.level, on: p.id === (s.pickaxeSkin || 'default'), desc: p.desc }));
    }
    const owned = items.filter(it => it.level <= level).length;
    $('lockerInfo').innerHTML = `<span>${owned} / ${items.length} unlocked</span><span>Level ${level}</span>`;
    $('lockerGrid').className = kind === 'glider' ? 'wide' : '';
    $('lockerGrid').innerHTML = items.map(it => {
      const locked = it.level > level;
      return `<button class="outfit-card ${it.on ? 'on' : ''} ${locked ? 'locked' : ''}" data-k="${it.key}" style="--c:${it.colour}" title="${escapeHtml(it.desc || it.name)}">
        <img alt="" src="${it.img || ''}"><span>${escapeHtml(it.name)}</span>${locked ? `<em class="lock">LVL ${it.level}</em>` : ''}</button>`;
    }).join('');
    for (const b of $('lockerGrid').children) b.onclick = () => {
      const key = kind === 'outfit' ? +b.dataset.k : b.dataset.k;
      const it = items.find(x => x.key === key);
      if (it.level > level) { $('lockerInfo').innerHTML = `<span class="lockmsg">${escapeHtml(it.name)} unlocks at level ${it.level}</span><span>Level ${level}</span>`; return; }
      this.equip(kind, key);
    };
  }

  equip(kind, key) {
    const s = this.g.settings;
    if (kind === 'outfit') { this.setOutfit(key); this.renderLocker(); return; }
    if (kind === 'glider') s.glider = key; else s.pickaxeSkin = key;
    saveSettings(s);
    this.sendProfile();
    this.applyPreviewCosmetics();
    this.renderLocker();
  }

  sendProfile() {
    const s = this.g.settings;
    if (this.g.net.online) this.g.net.send({ t: 'profile', name: s.name, outfit: s.outfit, glider: s.glider || 'default', pickaxe: s.pickaxeSkin || 'default' });
  }

  // Put the equipped glider and pickaxe on the menu preview character.
  applyPreviewCosmetics() {
    const g = this.g, p = g.preview, s = g.settings;
    if (!p) return;
    const gid = s.glider || 'default';
    if (p.gliderId !== gid || p.gliderOutfit !== s.outfit) {
      p.root.remove(p.glider);
      p.glider = makeGlider(s.outfit, gid);
      p.root.add(p.glider);
      p.gliderId = gid; p.gliderOutfit = s.outfit;
    }
    p.glider.visible = this.tab === 'locker' && this.lockerKind === 'glider';
    setHeld(p, { kind: 'weapon', id: 'pickaxe', rarity: 0, skin: s.pickaxeSkin || 'default' });
  }

  setOutfit(i) {
    const s = this.g.settings;
    s.outfit = (i + OUTFITS.length) % OUTFITS.length;
    saveSettings(s);
    $('outfitName').textContent = OUTFITS[s.outfit].name;
    this.g.updatePreview();
    this.sendProfile();
  }

  // Arrow buttons skip outfits that are still locked.
  stepOutfit(dir) {
    const level = this.progress.view().level, n = OUTFITS.length;
    let i = this.g.settings.outfit;
    for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (isUnlocked('outfit', i, level)) break; }
    this.setOutfit(i);
  }

  renderPlayOptions() {
    const s = this.g.settings;
    document.querySelectorAll('#segNet button').forEach(b => b.classList.toggle('on', b.dataset.v === this.net));
    $('modeBuild').classList.toggle('on', !s.noBuild); $('modeZero').classList.toggle('on', !!s.noBuild);
    $('modeDesc').textContent = s.noBuild ? MODE_DESC.zero : MODE_DESC.build;
    $('lobbyMode').value = s.noBuild ? 'zero' : 'build';
    document.querySelectorAll('#segBots button').forEach(b => b.classList.toggle('on', +b.dataset.v === s.bots));
    document.querySelectorAll('#segSkill button').forEach(b => b.classList.toggle('on', b.dataset.v === s.difficulty));
    $('soloOpts').style.display = this.net === 'solo' ? '' : 'none';
    $('playSub').textContent = this.net === 'solo' ? `Solo · ${s.noBuild ? 'No Builds' : 'Builds'} · ${s.bots} bots` : `LAN lobby · ${s.noBuild ? 'No Builds' : 'Builds'}`;
  }

  startTips() {
    const dots = $('tipDots');
    dots.innerHTML = TIPS.map(() => '<i></i>').join('');
    let k = Math.floor(Math.random() * TIPS.length);
    const show = () => {
      const p = $('loadTip');
      p.textContent = TIPS[k];
      p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i === k));
      k = (k + 1) % TIPS.length;
    };
    show();
    setInterval(show, 4500);
  }

  // ---------------------------------------------------------------- wiring
  wire() {
    const g = this.g, s = g.settings, n = g.net;
    const persist = () => saveSettings(s);
    if (!s.quality) s.quality = 'high';

    document.querySelectorAll('#tabs .tab').forEach(b => b.onclick = () => this.setTab(b.dataset.tab));

    $('nameInput').value = s.name;
    $('nameInput').addEventListener('input', (e) => {
      s.name = e.target.value.trim() || 'Looper'; persist(); this.renderPlayerCard();
      this.sendProfile();
    });
    $('outPrev').onclick = () => this.stepOutfit(-1);
    $('outNext').onclick = () => this.stepOutfit(1);
    document.querySelectorAll('#lockerTabs button').forEach(b => b.onclick = () => { this.lockerKind = b.dataset.k; this.setTab('locker'); });
    $('outfitName').textContent = OUTFITS[s.outfit].name;

    document.querySelectorAll('#segNet button').forEach(b => b.onclick = () => { this.net = b.dataset.v; this.renderPlayOptions(); });
    $('modeBuild').onclick = () => { s.noBuild = false; persist(); this.renderPlayOptions(); };
    $('modeZero').onclick = () => { s.noBuild = true; persist(); this.renderPlayOptions(); };
    $('lobbyMode').onchange = (e) => { s.noBuild = e.target.value === 'zero'; persist(); this.renderPlayOptions(); };
    document.querySelectorAll('#segBots button').forEach(b => b.onclick = () => { s.bots = +b.dataset.v; persist(); this.renderPlayOptions(); });
    document.querySelectorAll('#segSkill button').forEach(b => b.onclick = () => { s.difficulty = b.dataset.v; persist(); this.renderPlayOptions(); });
    this.renderPlayOptions();

    const withIntro = (fn) => {
      audio.init();
      if (!g.story.state.seenIntro) {
        g.story.state.seenIntro = true; g.story.save();
        this.crawl([...INTRO, 'Echo: Hey. Can you hear me? Good. Stick with me and we might just break this thing.'], fn);
      } else fn();
    };
    const startSolo = () => withIntro(() => { n.disconnect(); g.hostStart(); });
    const startLan = () => withIntro(async () => {
      if (this.screen !== 'menu') this.showScreen('menu');
      if (ON_PAGES && !NATIVE) { $('menuMsg').textContent = 'LAN play needs the FortCraft server or the Android app. Open the address your server prints instead.'; return; }
      if (NATIVE) { const addr = await askServerAddress(s); if (!addr) return; n.server = addr; }
      $('menuMsg').textContent = 'Connecting...';
      try {
        await n.connect(s.name, s.outfit);
        this.sendProfile(); // shares glider and pickaxe cosmetics with the lobby
        $('menuMsg').textContent = '';
        $('lanAddr').textContent = n.server || location.host;
        this.toLobby();
      } catch (e) { $('menuMsg').textContent = e.message; }
    });
    $('btnPlay').onclick = () => (this.net === 'solo' ? startSolo() : startLan());
    $('btnSolo').onclick = startSolo;
    $('btnLan').onclick = startLan;
    document.querySelectorAll('.back').forEach(b => b.onclick = () => this.back());
    $('btnIntro').onclick = () => this.crawl(INTRO, () => { this.showScreen('menu'); this.setTab('story'); });
    $('btnStoryReset').onclick = () => { if (confirm('Reset all story progress?')) { g.story.reset(); this.renderStory(); this.renderChapterCard(); } };

    // lobby
    $('lobbyBots').value = s.bots; $('lobbyBotsVal').textContent = s.bots;
    $('lobbyBots').oninput = (e) => { s.bots = +e.target.value; $('lobbyBotsVal').textContent = s.bots; persist(); };
    $('lobbyDiff').value = s.difficulty;
    $('lobbyDiff').onchange = (e) => { s.difficulty = e.target.value; persist(); };
    $('btnLobbyStart').onclick = () => { if (n.isHost) g.hostStart(); };
    $('btnLobbyLeave').onclick = () => { n.disconnect(); this.showScreen('menu'); };

    // settings
    const bindRange = (id, key, fmt = (v) => v) => {
      $(id).oninput = (e) => { s[key] = +e.target.value; $(id + 'Val').textContent = fmt(s[key]); persist(); if (key === 'volume') audio.setVolume(s.volume); if (key === 'bots') this.renderPlayOptions(); };
    };
    bindRange('setBots', 'bots'); bindRange('setSens', 'sens', v => v.toFixed(2)); bindRange('setFov', 'fov'); bindRange('setVol', 'volume', v => Math.round(v * 100) + '%');
    $('setDiff').onchange = (e) => { s.difficulty = e.target.value; persist(); this.renderPlayOptions(); };
    $('setInvert').onchange = (e) => { s.invert = e.target.checked; persist(); };
    $('setSoundViz').onchange = (e) => { s.soundViz = e.target.checked; persist(); if (!s.soundViz) g.hud.clearSoundViz(); };
    $('setQuality').onchange = (e) => { s.quality = e.target.value; persist(); if (g.applyQuality) g.applyQuality(); };

    // pause / end
    $('btnResume').onclick = () => { audio.init(); this.lockPointer(); };
    $('btnPauseSettings').onclick = () => this.open('settings');
    $('btnPauseHelp').onclick = () => this.open('help');
    $('btnQuit').onclick = () => {
      if (n.online && n.isHost && g.inMatch()) n.send({ t: 'end', winner: null });
      g.leaveMatch(); g.paused = false;
      if (n.online) this.toLobby(); else this.showScreen('menu');
    };
    $('btnSpectate').onclick = () => { if (!g.spectate) g.cycleSpectate(); this.showScreen(null); this.lockPointer(); };
    $('btnAgain').onclick = () => { g.leaveMatch(); if (n.online) this.toLobby(); else g.hostStart(); };
    $('btnEndMenu').onclick = () => { g.leaveMatch(); n.disconnect(); this.showScreen('menu'); };
    $('btnCrawl').onclick = () => this.crawlNext && this.crawlNext();
    $('btnCrawlSkip').onclick = () => this.crawlSkip && this.crawlSkip();

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === g.renderer.domElement) {
        g.paused = false;
        if (this.screen === 'pause' || this.screen === 'end') this.showScreen(null);
      } else if (g.inMatch() && this.screen === null && !g.bigMapOpen && !g.creativeMenuOpen) this.showPause();
    });
    g.renderer.domElement.addEventListener('click', () => { if (g.inMatch() && !document.pointerLockElement && this.screen === null && !g.bigMapOpen && !g.creativeMenuOpen && !g.replay?.active) this.lockPointer(); });
  }

  syncSettings() {
    const s = this.g.settings;
    $('setBots').value = s.bots; $('setBotsVal').textContent = s.bots;
    $('setDiff').value = s.difficulty;
    $('setSens').value = s.sens; $('setSensVal').textContent = s.sens.toFixed(2);
    $('setFov').value = s.fov; $('setFovVal').textContent = s.fov;
    $('setVol').value = s.volume; $('setVolVal').textContent = Math.round(s.volume * 100) + '%';
    $('setInvert').checked = s.invert;
    $('setSoundViz').checked = s.soundViz;
    $('setQuality').value = s.quality || 'high';
  }
}

const game = new Game();
const ui = new UI(game);
window.fortcraft = game; // handy for debugging in the console
installFeatures(game);
ui.showScreen('loading');
ui.startTips();
game.showMenuWorld((t, p) => ui.loading(t, p)).then(() => ui.showScreen('menu'));
