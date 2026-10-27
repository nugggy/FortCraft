// Headless sanity test for Agent A gameplay (run: node src/_test_gameplay.mjs). Not loaded by the game.
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {}, measureText: () => ({ width: 10 }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }), toDataURL: () => '' }) };
const THREE = await import('../vendor/three.module.min.js');
const { World } = await import('../src/world.js');
const { B } = await import('../src/blocks.js');
const { Actor } = await import('../src/actor.js');
const items = await import('../src/items.js');
const { Gadgets } = await import('../src/gadgets.js');
const { Vehicles } = await import('../src/vehicles.js');
const { Vending } = await import('../src/vending.js');

const sent = [], explosions = [], spawned = [];
const handlers = new Map();
const world = new World(777); world.generate();
const game = {
  world, scene: new THREE.Scene(), time: 0, buildMode: false, noBuild: false,
  effects: { splash() {}, dust() {}, burst() {}, sparkle() {} },
  audio: { play() {} }, hud: { notice() {}, damageNumber() {} },
  net: { isHost: true, send: (m) => sent.push(m), sendTo: (to, m) => sent.push(m), on: (t, f) => handlers.set(t, f) },
  events: { on() {}, emit() {} },
  interactProviders: [], actors: [],
  actorById(id) { return this.actors.find(a => a.id === id); },
  localActors() { return this.actors; },
  explode: (p, r, owner, dmg, rid) => explosions.push({ p, r, dmg, rid }),
  loot: { spawn: (it) => spawned.push(it) },
  onLanded() {}, damage() {},
  controller: { controls: { move: () => ({ x: 0, z: -1 }) } },
  addSystem(s) { return s; },
};
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

// --- inventory stacking
const a = new Actor(game, { id: 'p0', name: 'T', owner: 0, isPlayer: true });
game.actors.push(a); game.player = a;
a.addItem({ kind: 'throwable', id: 'grenade', count: 3 });
a.addItem({ kind: 'throwable', id: 'grenade', count: 3 });
a.addItem({ kind: 'throwable', id: 'grenade', count: 3 });
ok(a.slots[0].count === 6 && a.slots[1] && a.slots[1].count === 3, `grenades stack to 6 then overflow (${a.slots.map(s => s && s.count)})`);
ok(items.itemName({ kind: 'utility', id: 'launchpad', count: 1 }) === 'Launch Pad', 'launch pad name');
ok(items.WEAPONS.burst.burst === 3, 'burst rifle defined');

// --- flat test arena: put a floor at y=40 high in the sky and a 2-block ledge
const Y = 50;
for (let x = 100; x < 140; x++) for (let z = 100; z < 120; z++) { world.put(x, Y - 1, z, B.STONE); for (let y = Y; y < Y + 6; y++) world.put(x, y, z, B.AIR); }
for (let x = 130; x < 140; x++) for (let z = 100; z < 120; z++) { world.put(x, Y, z, B.STONE); world.put(x, Y + 1, z, B.STONE); }
const step = (ctl, n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) { game.time += dt; a.physics(dt, ctl); } };
a.state = 'ground'; a.pos.set(105.5, Y, 110.5); a.vel.set(0, 0, 0); a.yaw = -Math.PI / 2; // facing +x
step({ mx: 0, mz: 0, jump: false }, 10);
step({ mx: 1, mz: 0, jump: false, sprint: true, forward: 1 }, 40);
ok(a.sprinting && Math.abs(a.vel.x - 8.5) < 0.3, `sprint speed ${a.vel.x.toFixed(2)}`);
step({ mx: 1, mz: 0, jump: false, sprint: true, forward: 1, crouch: true, crouchPressed: true }, 1);
ok(a.sliding && a.vel.x > 10, `slide starts with boost ${a.vel.x.toFixed(2)}`);
ok(a.height < 1.5, `slide is low profile (height ${a.height})`);
step({ mx: 1, mz: 0, jump: false, sprint: true, forward: 1, crouch: true }, 70);
ok(!a.sliding, 'slide ends');
ok(a.crouching && Math.abs(Math.hypot(a.vel.x, a.vel.z) - 2.6) < 0.4, `crouch walk speed ${Math.hypot(a.vel.x, a.vel.z).toFixed(2)}`);
// mantle: walk to the 2-high ledge at x=130 and jump
a.pos.set(127.5, Y, 110.5); a.vel.set(0, 0, 0);
step({ mx: 0, mz: 0 }, 5);
let mantled = false;
for (let i = 0; i < 90; i++) { game.time += 1 / 60; a.physics(1 / 60, { mx: 1, mz: 0, jump: true }); if (a.mantling) mantled = true; }
ok(mantled && a.pos.y >= Y + 2 - 0.01 && a.pos.x > 130, `mantle onto 2-high ledge (pos ${a.pos.toArray().map(v => v.toFixed(2))})`);

// --- grenade
const gad = new Gadgets(game);
a.pos.set(110.5, Y, 110.5); a.state = 'ground'; a.slots = [{ kind: 'throwable', id: 'grenade', count: 2 }, null, null, null, null]; a.select(1);
const used = gad.use(a, a.slots[0], a.eyePos, new THREE.Vector3(1, 0.2, 0).normalize());
ok(used && a.slots[0].count === 1 && sent.some(m => m.t === 'throw'), 'grenade thrown and broadcast');
for (let i = 0; i < 200; i++) { game.time += 1 / 60; gad.update(1 / 60); }
ok(explosions.length === 1 && explosions[0].dmg === 70, `grenade exploded after fuse at ${explosions[0] && explosions[0].p.toArray().map(v => v.toFixed(1))}`);
// med mist heals
a.hp = 50;
a.slots[1] = { kind: 'throwable', id: 'medmist', count: 1 }; a.select(2); a.cooldown = 0;
gad.use(a, a.slots[1], a.eyePos, new THREE.Vector3(0, -1, 0));
for (let i = 0; i < 240; i++) { game.time += 1 / 60; gad.update(1 / 60); }
ok(a.hp > 70 && a.slots[1] === null, `med mist healed to ${a.hp}`);
// launch pad
a.slots[2] = { kind: 'utility', id: 'launchpad', count: 1 }; a.select(3); a.yaw = -Math.PI / 2;
const placed = gad.use(a, a.slots[2], a.eyePos, a.lookDir());
ok(placed && gad.pads.size === 1, 'launch pad placed');
const pad = [...gad.pads.values()][0];
a.pos.set(pad.x + 0.5, pad.y, pad.z + 0.5); a.state = 'ground';
gad.update(1 / 60);
ok(a.state === 'launch' && a.vel.y > 20, 'stepping on the pad launches');
let peak = 0; for (let i = 0; i < 400; i++) { a.physics(1 / 60, { mx: 0, mz: 0 }); peak = Math.max(peak, a.pos.y); if (a.state === 'glide') break; }
ok(a.state === 'glide' && peak > pad.y + 12, `launch peaks ${(peak - pad.y).toFixed(1)} blocks up then glides`);

// --- minecart
const veh = new Vehicles(game);
veh.start();
ok(veh.carts.length >= 2, `carts spawned: ${veh.carts.length}`);
const cart = veh.carts[0];
a.state = 'ground'; a.pos.copy(cart.mesh.position);
{ const p = veh.sample(cart, cart.s); a.yaw = Math.atan2(-p.dx, -p.dz); a.pitch = 0; }
veh.board(a, cart);
const s0 = cart.s;
for (let i = 0; i < 180; i++) { game.time += 1 / 60; a.physics(1 / 60, { mx: 1, mz: 0 }); veh.update(1 / 60); }
ok(Math.abs(cart.s - s0) > 5 && a.pos.distanceTo(cart.mesh.position) < 0.6, `cart drove ${Math.abs(cart.s - s0).toFixed(1)} rail blocks with rider attached`);
veh.exit(a);
ok(!a.vehicle && !cart.rider, 'exit cart');

// --- vending
const vend = new Vending(game);
vend.start();
ok(vend.machines.length >= 6, `vending machines: ${vend.machines.length}`);
const m = vend.machines[0];
a.mats[m.mat] = 1000; a.pos.set(m.x + 0.5 + m.fx, m.y, m.z + 0.5 + m.fz);
const C = { usingPad: false, label: () => 'E', pressed: (k) => k === 'interact', down: () => false };
vend.prompt(a, C);
ok(a.mats[m.mat] === 1000 - m.cost && spawned.some(it => it.kind === 'weapon' && it.rarity === m.rarity), `bought ${m.item.id} r${m.rarity} for ${m.cost} ${m.mat}`);

// --- supply drop (bot-facing API)
const { SupplyDrops } = await import('../src/supplydrop.js');
const emitted = [];
game.events.emit = (ev, ...args) => emitted.push(ev);
game.storm = { next: { x: 160, z: 160, r: 60 } };
const sd = new SupplyDrops(game);
sd.spawn();
const drop = sd.drops[0];
ok(drop && drop.falling && !drop.opened, 'supply drop spawned and falling');
for (let i = 0; i < 60 * 40; i++) { game.time += 1 / 60; sd.update(1 / 60); }
ok(drop.landed && !drop.falling && Math.abs(drop.pos.y - drop.y) < 0.01, `supply drop landed at y ${drop.y}`);
spawned.length = 0;
a.pos.set(drop.pos.x + 1, drop.y, drop.pos.z);
ok(sd.open(a, drop) && spawned.filter(it => it.kind === 'weapon' && it.rarity >= 3).length === 2 && emitted.includes('sdropopen'), `supply drop opened: ${spawned.map(i => i.kind + ':' + (i.id || i.ammo || i.mat)).join(', ')}`);
ok(sd.drops.length === 0, 'opened drop removed');
