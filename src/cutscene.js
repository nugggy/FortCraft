// Camera director: the Warden arrival cutscene, the in-engine ending sequence, and the
// orbiting camera used while emoting. game.cutscene.active takes over the camera.
import * as THREE from '../vendor/three.module.min.js';
import { SX, SZ } from './world.js';
import { ENDING } from './story.js';

const ease = (k) => k * k * (3 - 2 * k);

const CSS = `
#letterbox { position: fixed; inset: 0; pointer-events: none; z-index: 8; }
#letterbox i { position: absolute; left: 0; right: 0; height: 0; background: #000; transition: height .45s ease; }
#letterbox i:first-child { top: 0; } #letterbox i:nth-child(2) { bottom: 0; }
#letterbox.show i { height: 11vh; }
#letterbox p { position: absolute; right: 24px; bottom: 3vh; margin: 0; color: #cfd6ea; font: 600 14px var(--font-body, sans-serif); opacity: 0; transition: opacity .4s; }
#letterbox.show p { opacity: .85; }
#letterbox h2 { position: absolute; left: 0; right: 0; top: 13vh; margin: 0; text-align: center; color: #fff; font: 900 44px var(--font-display, sans-serif); letter-spacing: 2px; text-shadow: 0 4px 0 #000; opacity: 0; transition: opacity .6s; }
#letterbox h2.show { opacity: 1; }
`;

export class Director {
  constructor(game) {
    this.game = game;
    this.mode = null; this.t = 0;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.id = 'letterbox';
    this.el.innerHTML = '<i></i><i></i><h2></h2><p>Press Space to skip</p>';
    document.body.appendChild(this.el);
    addEventListener('keydown', (e) => {
      if ((this.mode === 'boss' || this.mode === 'ending') && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); this.skip(); }
    });
  }

  get active() { return !!this.mode; }

  bars(on, title = '') {
    this.el.classList.toggle('show', on);
    const h = this.el.querySelector('h2');
    h.textContent = title; h.classList.toggle('show', !!title);
  }

  lock(on) {
    const p = this.game.player;
    if (!p) return;
    if (on && !p.inputLocked) { p.inputLocked = true; this.locked = true; }
    if (!on && this.locked) { p.inputLocked = false; this.locked = false; }
  }

  // ---------------------------------------------------------------- Warden arrival
  startBoss() {
    const g = this.game, b = g.boss, p = g.player;
    if (!b || !p || !p.alive || p.state !== 'ground' || this.mode === 'ending') return;
    this.stopEmoteNow();
    this.mode = 'boss'; this.t = 0; this.dusted = false;
    this.from = g.camera.position.clone();
    this.fromQ = g.camera.quaternion.clone();
    this.life = p.hp + p.shield + (p.over || 0);
    this.lock(true);
    this.bars(true);
    g.audio.play('whoosh', { vol: 0.8 });
  }

  // ---------------------------------------------------------------- ending
  startEnding(done) {
    const g = this.game;
    this.stopEmoteNow();
    this.mode = 'ending'; this.t = 0; this.done = done;
    this.from = g.camera.position.clone();
    g.hud.show(false);
    g.ui.showScreen(null);
    this.bars(true, 'THE LOOP IS BROKEN');
    g.audio.play('shard', { vol: 0.9 });
  }

  // ---------------------------------------------------------------- emotes
  startEmote() { if (!this.mode) { this.mode = 'emote'; this.t = 0; this.from = this.game.camera.position.clone(); } }
  stopEmote() { if (this.mode === 'emote') this.mode = null; }
  stopEmoteNow() { if (this.mode === 'emote') { this.mode = null; this.game.emotes?.stop(); } }

  skip() {
    if (this.mode === 'boss') this.endBoss();
    else if (this.mode === 'ending') this.endEnding();
  }

  endBoss() { this.mode = null; this.bars(false); this.lock(false); }

  endEnding() {
    this.mode = null; this.bars(false);
    const done = this.done; this.done = null;
    if (done) done();
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const g = this.game, cam = g.camera;
    this.t += dt;
    g.scoped = false;
    if (g.player) g.player.hidden = false;
    if (this.mode === 'boss') return this.bossCam(dt, cam);
    if (this.mode === 'ending') return this.endingCam(dt, cam);
    if (this.mode === 'emote') return this.emoteCam(dt, cam);
  }

  bossCam(dt, cam) {
    const g = this.game, b = g.boss, p = g.player;
    const life = p ? p.hp + p.shield + (p.over || 0) : 0;
    if (!b || !b.alive || !p || !p.alive || life < this.life - 0.5 || g.phase !== 'play') { this.endBoss(); this.baseCamera(dt); return; }
    const T = this.t;
    const target = new THREE.Vector3(b.pos.x, b.pos.y + b.height * 0.6, b.pos.z);
    const toPlayer = new THREE.Vector3(p.pos.x - b.pos.x, 0, p.pos.z - b.pos.z);
    if (toPlayer.lengthSq() < 1) toPlayer.set(1, 0, 0);
    toPlayer.normalize();
    const orbit = 0.5 * Math.max(0, T - 1.3);
    const dir = toPlayer.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
    const shot = target.clone().addScaledVector(dir, 11).add(new THREE.Vector3(0, 4, 0));
    if (!this.dusted && T > 1.25) {
      this.dusted = true;
      g.effects.dust(b.pos, [0.6, 0.55, 0.5]);
      g.effects.burst(b.pos.x, b.pos.y + 0.5, b.pos.z, [0.55, 0.5, 0.45], 40, 9, 0.3, 1.2);
      g.audio.play('impact', { vol: 1 });
      g.shake = 0.8;
      this.bars(true, 'THE WARDEN');
    }
    if (T < 1.3) {
      // fly from the player's view up and over to the Warden
      const k = ease(T / 1.3);
      const mid = this.from.clone().lerp(shot, 0.5); mid.y += 25;
      const a = this.from.clone().lerp(mid, k), c = mid.clone().lerp(shot, k);
      cam.position.copy(a.lerp(c, k));
      cam.lookAt(target);
    } else if (T < 3.4) {
      cam.position.copy(shot);
      cam.lookAt(target);
    } else if (T < 4.2) {
      // ease back into the normal third-person camera
      this.baseCamera(dt);
      const k = ease((T - 3.4) / 0.8);
      const back = cam.position.clone(), q = cam.quaternion.clone();
      cam.position.copy(shot.lerp(back, k));
      const look = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, target, new THREE.Vector3(0, 1, 0)));
      cam.quaternion.copy(look.slerp(q, k));
    } else { this.endBoss(); this.baseCamera(dt); }
    if (T > 2.6) this.bars(true);
  }

  endingCam(dt, cam) {
    const g = this.game, T = this.t;
    const ang = T * 0.12 + 0.6, r = SX * 0.62;
    const pos = new THREE.Vector3(SX / 2 + Math.cos(ang) * r, 70 + Math.sin(T * 0.3) * 6, SZ / 2 + Math.sin(ang) * r);
    const k = ease(Math.min(1, T / 2.5));
    cam.position.copy(this.from.clone().lerp(pos, k));
    cam.lookAt(SX / 2, 22, SZ / 2);
    if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
    // the Static dissolves outward
    const st = g.storm;
    if (st && st.cur) st.cur.r += dt * (20 + T * 12);
    // blocks shimmer across the island
    const w = g.world;
    if (w) for (let i = 0; i < 8; i++) {
      const x = Math.floor(Math.random() * SX), z = Math.floor(Math.random() * SZ);
      const y = w.topSolid(x, z);
      if (y > 0) g.effects.sparkle(x + 0.5, y + 1.1, z + 0.5, Math.random() < 0.5 ? [1, 0.85, 0.35] : [0.4, 0.9, 1], 1);
    }
    if (T > 3.5) this.bars(true, '');
    if (T > 11) this.endEnding();
  }

  emoteCam(dt, cam) {
    const g = this.game, p = g.player;
    if (!p || !p.alive || !p.emote) { this.mode = null; this.baseCamera(dt); return; }
    const pivot = new THREE.Vector3(p.pos.x, p.pos.y + 1.1 * p.scale, p.pos.z);
    // in front of the player, slowly drifting around
    const a = p.yaw + Math.sin(this.t * 0.4) * 0.5;
    const want = new THREE.Vector3(pivot.x - Math.sin(a) * 4.2, pivot.y + 0.6, pivot.z - Math.cos(a) * 4.2);
    const dir = want.clone().sub(pivot), len = dir.length(); dir.normalize();
    const hit = g.world.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, len);
    if (hit) want.copy(pivot).addScaledVector(dir, Math.max(0.8, hit.t - 0.3));
    const k = Math.min(1, this.t / 0.6);
    cam.position.copy(this.from.clone().lerp(want, ease(k)));
    if (k >= 1) this.from.copy(cam.position);
    cam.lookAt(pivot);
  }
}

export function installCutscenes(game) {
  const d = new Director(game);
  game.cutscene = d;
  d.baseCamera = game.controller.updateCamera.bind(game.controller);
  // cutscenes come first so they win over spectator and kill cams
  const provider = (dt) => { if (!d.active) return false; d.updateCamera(dt); return true; };
  if (game.cameraProviders) game.cameraProviders.unshift(provider);
  else game.controller.updateCamera = (dt) => (provider(dt) ? undefined : d.baseCamera(dt));
  game.events.on((ev) => {
    if (ev === 'bossSpawn') d.startBoss();
    if (ev === 'victory' && game.story.pendingEnding) {
      // take over the ending from the end screen: in-engine sequence, then the crawl
      game.story.pendingEnding = false;
      setTimeout(() => d.startEnding(() => game.ui.crawl(ENDING, () => game.ui.showScreen('end'))), 1400);
    }
  });
  game.addSystem({ reset() { if (d.mode && d.mode !== 'ending') { d.mode = null; d.bars(false); d.lock(false); } } });
  return d;
}
