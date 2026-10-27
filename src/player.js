// Local player input and third-person camera.
import * as THREE from '../vendor/three.module.min.js';
import { B } from './blocks.js';
import { WEAPONS, itemName } from './items.js';
import { PIECE_TYPES } from './building.js';

import { Controls } from './controls.js';

const BUILD_ACTIONS = { wall: 'wall', floor: 'floor', ramp: 'ramp', cone: 'cone' };
const SLOT_ACTIONS = ['pickaxe', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
// Actions the core controller handles itself. Everything else is forwarded as an
// 'input' event (game.events.emit('input', action)) for feature modules.
const CORE = new Set(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'crouch', 'fire', 'ads', 'reload', 'interact',
  ...SLOT_ACTIONS, 'nextItem', 'prevItem', 'wall', 'floor', 'ramp', 'cone', 'buildToggle', 'cycleMat', 'map']);
const EXTRA = ['ping', 'emote', 'scoreboard'];

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.controls = new Controls(game.settings, game.renderer.domElement);
    this.controls.enabled = () => game.inMatch() && !game.paused;
    this.camPos = new THREE.Vector3();
    this.camDist = 3.2;
    this.searchT = 0;
    this.kickPitch = 0;
    this.fov = 75;
    this.buildRepeat = 0;
  }

  get actor() { return this.game.player; }

  kick(id) {
    const k = id === 'sniper' ? 0.06 : id === 'shotgun' ? 0.05 : id === 'rocket' ? 0.03 : 0.012;
    this.kickPitch += k;
  }

  // Called each frame during a match.
  update(dt) {
    const g = this.game, a = this.actor, C = this.controls;
    C.poll(g.buildMode);
    if (C.pressed('pause')) { if (g.paused) { g.paused = false; g.ui.showScreen(null); } else g.ui.showPause(); }
    const look = C.look(dt);
    this.lastLook = look; // spectator free cam reads this
    const sens = 0.0022 * g.settings.sens * (this.fov / 75);
    if ((a.alive && !a.inputLocked) || g.phase === 'bus') {
      a.yaw -= look.dx * sens;
      a.pitch = Math.max(-1.5, Math.min(1.5, a.pitch - look.dy * sens * (g.settings.invert ? -1 : 1)));
    }
    if (this.kickPitch > 0) { const k = Math.min(this.kickPitch, dt * 0.6); a.pitch = Math.min(1.5, a.pitch + k * 2); this.kickPitch -= k; }

    if (C.pressed('map')) g.toggleBigMap();
    for (const act of EXTRA) if (C.pressed(act)) g.events.emit('input', act);
    if (!a.alive) {
      if (!(g.spectatorInput && g.spectatorInput(C, dt)) && (C.pressed('fire') || C.pressed('jump'))) g.cycleSpectate();
      C.endFrame(); return;
    }

    if (a.state === 'bus') {
      if (C.pressed('jump') && g.busCanJump()) g.jumpFromBus(a);
      C.endFrame();
      return;
    }

    // movement relative to facing
    const m = a.inputLocked ? { x: 0, z: 0 } : C.move();
    const s = Math.sin(a.yaw), c = Math.cos(a.yaw);
    const ctl = {
      mx: m.x * c + m.z * s, mz: -m.x * s + m.z * c,
      jump: !a.inputLocked && C.down('jump'), jumpPressed: !a.inputLocked && C.pressed('jump'),
      sprint: C.down('sprint'), crouch: C.down('crouch'), crouchPressed: C.pressed('crouch'),
      forward: -m.z,
    };
    if (a.state === 'dive' && C.pressed('jump')) a.state = 'glide';
    if (a.downed) { ctl.mx *= 0.21; ctl.mz *= 0.21; ctl.jump = ctl.jumpPressed = ctl.sprint = false; a.ads = false; g.hud.set('prompt', 'html', ''); }

    if (a.state === 'ground' && !a.inputLocked && !a.downed) this.handleActions(dt);
    if (!(g.creativeControl && g.creativeControl(a, ctl, dt, C))) a.physics(dt, ctl);
    g.combat.tick(a, dt);
    C.endFrame();
  }

  handleActions(dt) {
    const g = this.game, a = this.actor, C = this.controls;
    // slot selection
    SLOT_ACTIONS.forEach((act, i) => { if (C.pressed(act)) { g.buildMode = false; a.select(i); } });
    if (!g.buildMode && (C.pressed('nextItem') || C.pressed('prevItem'))) {
      const dir = C.pressed('nextItem') ? 1 : -1;
      for (let k = 1; k <= 6; k++) {
        const i = (a.selected + dir * k + 6) % 6;
        if (i === 0 || a.slots[i - 1]) { a.select(i); break; }
      }
    }
    const buildPressed = Object.keys(BUILD_ACTIONS).find(act => C.pressed(act));
    if (g.noBuild) {
      if (C.pressed('buildToggle') || buildPressed) g.hud.notice('Building is off in No Builds mode', '#e6b8ff');
    } else {
      if (buildPressed) { g.buildMode = true; g.buildPiece = BUILD_ACTIONS[buildPressed]; a.reloading = 0; a.using = null; a.ads = false; }
      if (C.pressed('buildToggle')) g.buildMode = !g.buildMode;
    }
    if (g.buildMode && C.pressed('cycleMat')) { const order = ['wood', 'brick', 'metal']; g.buildMat = order[(order.indexOf(g.buildMat) + 1) % 3]; }
    else if (!g.buildMode && C.pressed('reload')) g.combat.startReload(a);
    if (g.buildMode && (C.pressed('nextPiece') || C.pressed('prevPiece'))) {
      const i = PIECE_TYPES.indexOf(g.buildPiece), d = C.pressed('nextPiece') ? 1 : 3;
      g.buildPiece = PIECE_TYPES[(i + d) % 4];
    }

    // interaction
    const eye = a.eyePos, look = a.lookDir();
    const hit = g.world.raycast(eye.x, eye.y, eye.z, look.x, look.y, look.z, 3.4);
    const chest = hit && hit.id === B.CHEST ? hit : null;
    const pick = g.loot.nearest(a, 2.6, p => p.item.kind === 'weapon' || p.item.kind === 'heal' || p.item.kind === 'throwable' || p.item.kind === 'utility');
    const key = C.usingPad ? 'X' : C.label('interact');
    let prompt = '';
    if (g.interactPrompt) prompt = g.interactPrompt(a, C, dt) || '';   // feature modules (vending, revive, vehicles)
    if (!prompt && chest) {
      prompt = `Hold <b>${key}</b> to search`;
      if (C.down('interact')) {
        this.searchT += dt;
        if (this.searchT >= 0.45) { g.loot.openChest(a, chest.x, chest.y, chest.z); this.searchT = 0; }
      } else this.searchT = 0;
    } else {
      this.searchT = 0;
      if (!prompt && pick) {
        prompt = `<b>${key}</b> Pick up <span style="color:${rarColor(pick.item)}">${itemName(pick.item)}</span>`;
        if (!a.hasRoomFor(pick.item)) prompt += ' <small>(swap)</small>';
        if (C.pressed('interact')) g.loot.requestTake(a, pick.id);
      }
    }
    a.searchT = this.searchT;
    g.hud.set('prompt', 'html', prompt);

    if (g.buildMode) {
      a.ads = false;
      g.build.showGhost(a, g.buildPiece, g.buildMat);
      if (C.pressed('fire') || (C.down('fire') && (this.buildRepeat -= dt) <= 0)) {
        if (g.build.place(a, g.buildPiece, g.buildMat)) this.buildRepeat = 0.12;
        else if (C.pressed('fire') && a.mats[g.buildMat] < 10) g.hud.notice(`Not enough ${g.buildMat}`, '#ff7070');
      }
      if (C.pressed('ads')) { const i = PIECE_TYPES.indexOf(g.buildPiece); g.buildPiece = PIECE_TYPES[(i + 1) % 4]; }
      return;
    }
    g.build.hideGhost();
    const held = a.held();
    a.ads = C.down('ads') && held && held.kind === 'weapon' && held.id !== 'pickaxe';
    if (C.down('fire')) {
      const { origin, dir } = this.aim();
      g.combat.fire(a, origin, dir, C.pressed('fire'));
    }
  }

  // Shot ray: from the actor's eye toward whatever the crosshair is on.
  aim() {
    const g = this.game, a = this.actor;
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const start = cam.position.clone().addScaledVector(fwd, this.camDist + 0.3);
    const res = g.combat.trace(a, start, fwd, 400);
    const eye = a.eyePos;
    if (g.scoped) return { origin: cam.position.clone(), dir: fwd };
    const dir = res.point.clone().sub(eye);
    if (dir.lengthSq() < 0.01) return { origin: eye, dir: fwd };
    return { origin: eye, dir: dir.normalize() };
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const g = this.game, cam = g.camera;
    const target = g.viewActor();
    let pivot, back, right, up, fovTarget = g.settings.fov;
    g.scoped = false;
    if (g.phase === 'bus' && target.state === 'bus') {
      pivot = g.bus.position.clone(); back = 22; right = 0; up = 3;
    } else {
      pivot = new THREE.Vector3(target.pos.x, target.pos.y - target.stepOffset + target.eye, target.pos.z);
      const held = target.held();
      const def = held && held.kind === 'weapon' ? WEAPONS[held.id] : null;
      if (target.state === 'dive' || target.state === 'glide') { back = 6.5; right = 0; up = 1.2; }
      else if (target.ads && def && def.scope && target === g.player) { back = 0; right = 0; up = 0; g.scoped = true; fovTarget = g.settings.fov / def.zoom; }
      else if (target.ads && def) { back = 1.9; right = 0.6; up = 0.2; fovTarget = g.settings.fov / def.zoom; }
      else { back = 3.2 * target.scale; right = 0.75; up = 0.4; }
      if (g.buildMode && target === g.player) { back = 3.6; }
    }
    const yaw = target.yaw, pitch = target === g.player || g.phase === 'bus' ? target.pitch : target.pitch;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const rv = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const off = rv.multiplyScalar(right).addScaledVector(dir, -back);
    off.y += up;
    let dist = off.length();
    if (dist > 0.01) {
      const n = off.clone().normalize();
      const hit = g.world.raycast(pivot.x, pivot.y, pivot.z, n.x, n.y, n.z, dist + 0.3);
      if (hit) dist = Math.max(0.2, hit.t - 0.3);
      off.copy(n.multiplyScalar(dist));
    }
    this.camDist = dist;
    cam.position.copy(pivot).add(off);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitch, yaw, 0);
    this.fov += (fovTarget - this.fov) * Math.min(1, dt * 14);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    // hide own model when the camera is inside it
    target.hidden = g.scoped || dist < 0.6;
  }
}

function rarColor(item) {
  const r = item.kind === 'weapon' ? item.rarity : 0;
  return ['#c8c8c8', '#5cc449', '#3b9ef0', '#b65cf0', '#f5a623'][r];
}
