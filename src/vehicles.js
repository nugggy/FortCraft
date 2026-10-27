// Minecarts on the rail track out of the mine. The rider's client simulates the cart and
// broadcasts 'veh' updates; everyone else smooths toward them.
import * as THREE from '../vendor/three.module.min.js';

const ACCEL = 9, BRAKE = 14, MAX = 15, FRICTION = 0.6, SLOPE_G = 7;
const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });

function makeCart() {
  const g = new THREE.Group();
  const add = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
  add(1.1, 0.12, 1.4, 0x4a4f57, 0, 0.32, 0);            // floor
  add(0.1, 0.5, 1.4, 0x6a717c, -0.55, 0.6, 0);          // sides
  add(0.1, 0.5, 1.4, 0x6a717c, 0.55, 0.6, 0);
  add(1.1, 0.5, 0.1, 0x6a717c, 0, 0.6, 0.7);
  add(1.1, 0.5, 0.1, 0x6a717c, 0, 0.6, -0.7);
  add(1.2, 0.08, 1.5, 0x8a929c, 0, 0.86, 0);            // rim
  for (const x of [-0.5, 0.5]) for (const z of [-0.45, 0.45]) add(0.12, 0.26, 0.26, 0x24262a, x, 0.18, z); // wheels
  return g;
}

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.carts = [];
    this.sendT = 0;
    game.net.on('veh', (m) => this.onNet(m));
    game.interactProviders.push((a, C, dt) => this.prompt(a, C, dt));
  }

  start() {
    this.reset();
    const w = this.game.world;
    if (!w.rails) return;
    w.cartSpawns.forEach((sp, i) => {
      const mesh = makeCart();
      this.game.scene.add(mesh);
      const cart = { id: 'cart' + i, track: sp.track, s: sp.idx, speed: 0, dir: 1, rider: null, mesh, target: null, lastTouch: -1 };
      this.place(cart);
      this.carts.push(cart);
    });
  }

  reset() {
    for (const c of this.carts) {
      this.game.scene.remove(c.mesh);
      const r = c.rider && this.game.actorById(c.rider);
      if (r) { r.vehicle = null; }
    }
    this.carts = [];
  }

  pts(cart) { return this.game.world.rails[cart.track].pts; }

  // Position and heading on the track at parameter s.
  sample(cart, s) {
    const pts = this.pts(cart);
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(s)));
    const f = Math.max(0, Math.min(1, s - i));
    const a = pts[i], b = pts[i + 1];
    return {
      x: a[0] + 0.5 + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + 0.5 + (b[2] - a[2]) * f,
      dx: b[0] - a[0], dy: b[1] - a[1], dz: b[2] - a[2],
    };
  }

  place(cart) {
    const p = this.sample(cart, cart.s);
    cart.mesh.position.set(p.x, p.y, p.z);
    const yaw = Math.atan2(-(p.dx * cart.dir), -(p.dz * cart.dir));
    cart.mesh.rotation.set(0, 0, 0);
    cart.mesh.rotation.y = yaw;
    cart.mesh.rotateX(Math.atan2(p.dy * cart.dir, 1) * 0.9);
    return p;
  }

  nearest(a, maxD = 2.4) {
    let best = null, bd = maxD;
    for (const c of this.carts) {
      const d = Math.hypot(c.mesh.position.x - a.pos.x, c.mesh.position.z - a.pos.z);
      if (d < bd && Math.abs(c.mesh.position.y - a.pos.y) < 2) { bd = d; best = c; }
    }
    return best;
  }

  prompt(a, C) {
    const g = this.game;
    const key = C.usingPad ? 'X' : C.label('interact');
    if (a.vehicle) {
      if (C.pressed('interact') || C.pressed('jump')) this.exit(a);
      return `<b>${key}</b> Get out <small>(W/S to drive)</small>`;
    }
    const c = this.nearest(a);
    if (!c || c.rider) return '';
    if (C.pressed('interact')) { this.board(a, c); return ''; }
    return `<b>${key}</b> Ride minecart`;
  }

  board(a, c) {
    c.rider = a.id; a.vehicle = c;
    a.sliding = a.sprinting = false;
    // face along the cart's direction of travel
    const p = this.sample(c, c.s);
    const fwd = a.lookDir();
    c.dir = (p.dx * fwd.x + p.dz * fwd.z) >= 0 ? 1 : -1;
    this.game.audio.play('build', { pos: a.pos, rate: 0.7 });
    this.send(c);
  }

  exit(a) {
    const c = a.vehicle;
    a.vehicle = null;
    if (!c) return;
    c.rider = null;
    const p = this.sample(c, c.s);
    // step off to the side
    const sx = -p.dz, sz = p.dx;
    const w = this.game.world;
    for (const side of [1, -1]) {
      const x = p.x + sx * 1.2 * side, z = p.z + sz * 1.2 * side;
      if (!a.collidesAt(x, p.y + 0.3, z)) { a.pos.set(x, p.y + 0.3, z); break; }
    }
    if (a.collidesAt(a.pos.x, a.pos.y, a.pos.z)) a.pos.set(p.x, w.groundY(Math.floor(p.x), Math.floor(p.z)) + 0.05, p.z);
    a.vel.set(p.dx * c.speed * c.dir * 0.5, 3, p.dz * c.speed * c.dir * 0.5);
    this.send(c);
  }

  send(c) {
    this.game.net.send({ t: 'veh', id: c.id, s: +c.s.toFixed(3), sp: +c.speed.toFixed(2), d: c.dir, r: c.rider });
  }

  onNet(m) {
    const c = this.carts.find(k => k.id === m.id);
    if (!c) return;
    // a cart someone else is driving: follow their updates
    const mine = c.rider && this.game.actorById(c.rider) && !this.game.actorById(c.rider).remote;
    if (mine) return;
    if (m.r === null) { c.s = m.s; c.speed = m.sp; c.dir = m.d; c.rider = null; c.target = null; return; }
    c.target = m.s; c.speed = m.sp; c.dir = m.d; c.rider = m.r;
  }

  update(dt) {
    const g = this.game;
    this.sendT -= dt;
    for (const c of this.carts) {
      const rider = c.rider && g.actorById(c.rider);
      if (rider && (!rider.alive || (rider.vehicle !== c && !rider.remote))) { c.rider = null; if (rider.vehicle === c) rider.vehicle = null; }
      const local = rider && !rider.remote;
      const pts = this.pts(c);
      if (local || !c.rider) {
        // simulate: throttle from the driver, gravity on slopes, friction
        const p = this.sample(c, c.s);
        let acc = (local ? -p.dy * c.dir * SLOPE_G : 0) - Math.sign(c.speed) * FRICTION * (local ? 1 : 4);
        if (local && rider === g.player && !rider.inputLocked) {
          const throttle = -g.controller.controls.move().z;
          if (throttle > 0.2) acc += ACCEL;
          else if (throttle < -0.2) acc -= c.speed > 0.5 ? BRAKE : ACCEL * 0.6;
        }
        c.speed = Math.max(-MAX * 0.5, Math.min(MAX, c.speed + acc * dt));
        if (!local && Math.abs(c.speed) < 0.3) c.speed = 0;
        c.s += c.speed * c.dir * dt;
        if (c.s <= 0 || c.s >= pts.length - 1) {
          c.s = Math.max(0, Math.min(pts.length - 1.001, c.s));
          if (Math.abs(c.speed) > 6) g.audio.play('land', { pos: c.mesh.position, vol: 0.6 });
          c.speed = 0;
        }
      } else {
        // remote driver: dead-reckon then ease toward the latest update
        c.s += c.speed * c.dir * dt;
        if (c.target !== null) c.s += (c.target - c.s) * Math.min(1, dt * 6);
        c.s = Math.max(0, Math.min(pts.length - 1.001, c.s));
      }
      const p = this.place(c);
      if (rider && !rider.remote) {
        rider.pos.set(p.x, p.y + 0.35, p.z);
        rider.vel.set(0, 0, 0); rider.onGround = true;
      }
      if (local && this.sendT <= 0) this.send(c);
      if (Math.abs(c.speed) > 4 && Math.random() < dt * 8) g.effects.sparkle(p.x, p.y + 0.1, p.z, [1, 0.8, 0.4], 1);
    }
    if (this.sendT <= 0) this.sendT = 0.1;
  }
}

export function installVehicles(game) {
  game.vehicles = game.addSystem(new Vehicles(game));
}
