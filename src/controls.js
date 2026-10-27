// Input layer: named actions bound to keys, mouse buttons and gamepad buttons.
// Bindings are rebindable (settings.binds) and gamepads work alongside keyboard and mouse.

// Key codes follow KeyboardEvent.code. Mouse buttons are M0 (left), M1 (middle), M2 (right).
// Mouse wheel is WheelUp / WheelDown (edge only). Ctrl is avoided because Ctrl+W closes the tab.
export const DEFAULT_BINDS = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  jump: ['Space'], sprint: ['ShiftLeft'], crouch: ['KeyC'],
  fire: ['M0'], ads: ['M2'], reload: ['KeyR'], interact: ['KeyE'],
  pickaxe: ['Digit1'], slot1: ['Digit2'], slot2: ['Digit3'], slot3: ['Digit4'], slot4: ['Digit5'], slot5: ['Digit6'],
  nextItem: ['WheelDown'], prevItem: ['WheelUp'],
  wall: ['KeyQ'], floor: ['KeyZ'], ramp: ['KeyX'], cone: ['KeyV'],
  buildToggle: ['KeyG'], cycleMat: ['KeyR'],
  map: ['KeyM'], ping: ['M1'], emote: ['KeyB'], scoreboard: ['Tab'],
};

export const ACTION_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', sprint: 'Sprint',
  crouch: 'Crouch / slide', fire: 'Fire / use', ads: 'Aim down sights', reload: 'Reload', interact: 'Interact / pick up',
  pickaxe: 'Pickaxe', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3', slot4: 'Slot 4', slot5: 'Slot 5',
  nextItem: 'Next item', prevItem: 'Previous item', wall: 'Build wall', floor: 'Build floor', ramp: 'Build ramp', cone: 'Build cone',
  buildToggle: 'Toggle build mode', cycleMat: 'Change material (build mode)', map: 'Full map', ping: 'Place marker', emote: 'Emote wheel', scoreboard: 'Team / scoreboard',
};

// Standard gamepad mapping (Xbox layout names). Values are action names.
export const PAD_BUTTONS = {
  0: 'jump', 1: 'crouch', 2: 'interact', 3: 'buildToggle', 4: 'prevItem', 5: 'nextItem', 6: 'ads', 7: 'fire',
  8: 'map', 9: 'pause', 10: 'sprint', 11: 'pickaxe', 12: 'emote', 13: 'ping', 14: 'cycleMat', 15: 'reload',
};
// In build mode the bumpers cycle build pieces instead of items.
export const PAD_BUILD = { 4: 'prevPiece', 5: 'nextPiece' };

const PAD_DEAD = 0.18;

export function keyLabel(code) {
  if (!code) return '';
  if (code === 'M0') return 'LMB'; if (code === 'M1') return 'MMB'; if (code === 'M2') return 'RMB';
  if (code === 'WheelUp') return 'Wheel up'; if (code === 'WheelDown') return 'Wheel down';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Space';
  if (code.startsWith('Shift')) return 'Shift';
  if (code.startsWith('Alt')) return 'Alt';
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}

export class Controls {
  constructor(settings, target) {
    this.settings = settings;
    this.target = target;            // element that owns pointer lock
    this.held = new Set();           // codes held
    this.edges = new Set();          // codes pressed this frame
    this.padHeld = new Set();        // actions held on gamepad
    this.padEdges = new Set();
    this.mdx = 0; this.mdy = 0;
    this.padMove = { x: 0, z: 0 };
    this.padLook = { x: 0, y: 0 };
    this.usingPad = false;
    this.enabled = () => true;
    this.capture = null;             // rebinding: callback(code)
    // virtual source for on-screen touch controls (src/touch.js)
    this.vHeld = new Set(); this.vEdges = new Set();
    this.vMove = { x: 0, z: 0 }; this.vdx = 0; this.vdy = 0;
    this.usingTouch = false;
    this.loadBinds();
    this.listen();
  }

  loadBinds() {
    const custom = this.settings.binds || {};
    this.binds = {};
    for (const a in DEFAULT_BINDS) this.binds[a] = custom[a] ? [...custom[a]] : [...DEFAULT_BINDS[a]];
    this.index();
  }

  index() {
    this.byCode = new Map();
    for (const a in this.binds) for (const c of this.binds[a]) {
      if (!this.byCode.has(c)) this.byCode.set(c, []);
      this.byCode.get(c).push(a);
    }
  }

  rebind(action, code, slot = 0) {
    const list = this.binds[action] || [];
    list[slot] = code;
    this.binds[action] = list.filter(Boolean);
    this.settings.binds = { ...(this.settings.binds || {}), [action]: this.binds[action] };
    this.index();
  }

  resetBinds() { this.settings.binds = {}; this.loadBinds(); }

  label(action) { return keyLabel((this.binds[action] || [])[0]); }

  listen() {
    const press = (code, e) => {
      if (this.capture) { e && e.preventDefault(); const cb = this.capture; this.capture = null; cb(code); return; }
      if (!this.enabled()) return;
      if (!this.held.has(code)) this.edges.add(code);
      this.held.add(code);
      this.usingPad = false;
    };
    addEventListener('keydown', (e) => {
      if (this.capture && e.code === 'Escape') { this.capture = null; return; }
      if (this.enabled() && this.byCode.has(e.code) && ['Tab', 'Space', 'KeyQ', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      press(e.code, e);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('mousedown', (e) => {
      if (this.capture) { press('M' + e.button, e); return; }
      if (document.pointerLockElement !== this.target) return;
      press('M' + e.button, e);
    });
    addEventListener('mouseup', (e) => this.held.delete('M' + e.button));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.target) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
      this.usingPad = false;
    });
    addEventListener('wheel', (e) => {
      const code = e.deltaY > 0 ? 'WheelDown' : 'WheelUp';
      if (this.capture) { press(code, e); return; }
      if (!this.enabled()) return;
      this.edges.add(code);
    }, { passive: true });
    addEventListener('blur', () => { this.held.clear(); this.padHeld.clear(); });
    addEventListener('contextmenu', (e) => { if (this.enabled()) e.preventDefault(); });
  }

  // Poll gamepads once per frame (before reading actions).
  poll(buildMode) {
    this.padEdges.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(p => p && p.connected);
    this.padConnected = !!pad;
    if (!pad) { this.padHeld.clear(); this.padMove.x = this.padMove.z = 0; this.padLook.x = this.padLook.y = 0; return; }
    const dz = (v) => Math.abs(v) < PAD_DEAD ? 0 : (v - Math.sign(v) * PAD_DEAD) / (1 - PAD_DEAD);
    this.padMove.x = dz(pad.axes[0] || 0); this.padMove.z = dz(pad.axes[1] || 0);
    this.padLook.x = dz(pad.axes[2] || 0); this.padLook.y = dz(pad.axes[3] || 0);
    const now = new Set();
    pad.buttons.forEach((b, i) => {
      const pressed = b.pressed || b.value > 0.5;
      if (!pressed) return;
      const action = (buildMode && PAD_BUILD[i]) || PAD_BUTTONS[i];
      if (action) now.add(action);
    });
    for (const a of now) if (!this.padHeld.has(a)) this.padEdges.add(a);
    this.padHeld = now;
    if (now.size || this.padMove.x || this.padMove.z || this.padLook.x || this.padLook.y) this.usingPad = true;
  }

  // Touch API: hold/release an action, tap it for one frame, or feed movement and look.
  vPress(action) { if (!this.vHeld.has(action)) this.vEdges.add(action); this.vHeld.add(action); this.usingTouch = true; }
  vRelease(action) { this.vHeld.delete(action); }
  vTap(action) { this.vEdges.add(action); this.usingTouch = true; }
  vLook(dx, dy) { this.vdx += dx; this.vdy += dy; this.usingTouch = true; }

  down(action) {
    if (this.padHeld.has(action) || this.vHeld.has(action)) return true;
    for (const c of this.binds[action] || []) if (this.held.has(c)) return true;
    return false;
  }

  pressed(action) {
    if (this.padEdges.has(action) || this.vEdges.has(action)) return true;
    for (const c of this.binds[action] || []) if (this.edges.has(c)) return true;
    return false;
  }

  // Movement in local space: x = strafe right, z = backwards (forward is negative).
  move() {
    let x = 0, z = 0;
    if (this.down('forward')) z -= 1; if (this.down('back')) z += 1;
    if (this.down('left')) x -= 1; if (this.down('right')) x += 1;
    x += this.padMove.x + this.vMove.x; z += this.padMove.z + this.vMove.z;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  // Look delta in mouse-pixel units (gamepad stick scaled to feel similar).
  look(dt) {
    const curve = (v) => Math.sign(v) * v * v;
    const ps = this.settings.padSens ?? 1, pinv = this.settings.padInvert ? -1 : 1; // controller settings (Settings > Controller)
    const ts = this.settings.touchSens ?? 1;
    const dx = this.mdx + curve(this.padLook.x) * 1500 * dt * ps + this.vdx * 1.6 * ts;
    const dy = this.mdy + curve(this.padLook.y) * 1000 * dt * ps * pinv + this.vdy * 1.6 * ts;
    this.mdx = this.mdy = 0; this.vdx = this.vdy = 0;
    return { dx, dy };
  }

  endFrame() { this.edges.clear(); this.vEdges.clear(); }
}
