// Visual effects: block particles, tracers, explosions, muzzle flashes.
import * as THREE from '../vendor/three.module.min.js';

const MAX_P = 1500;
// leaf block id -> falling leaf colour (oak, pine, birch, dark oak)
const LEAF_COLOURS = { 7: [0.32, 0.6, 0.2], 21: [0.2, 0.42, 0.25], 31: [0.55, 0.7, 0.3], 44: [0.22, 0.38, 0.15] };

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.pmesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_P);
    this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pmesh.frustumCulled = false;
    this.pmesh.count = 0;
    scene.add(this.pmesh);
    this.parts = [];
    this.tracers = [];
    this.flashes = [];
    this.booms = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.9 });
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.95 });
    this.flashGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.boomGeo = new THREE.IcosahedronGeometry(1, 1);
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  burst(x, y, z, rgb, n = 8, speed = 4, size = 0.14, life = 0.7) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_P) this.parts.shift();
      this.parts.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.9 + 1, vz: (Math.random() - 0.5) * speed,
        r: rgb[0], g: rgb[1], b: rgb[2], s: size * (0.6 + Math.random() * 0.8), life, max: life, grav: 18,
      });
    }
  }

  sparkle(x, y, z, rgb, n = 6) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: 0, vy: 1 + Math.random() * 1.5, vz: 0, r: rgb[0], g: rgb[1], b: rgb[2], s: 0.08, life: 1, max: 1, grav: 0 });
    }
  }

  tracer(from, to, color = 0xfff2a8) {
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = color === 0xfff2a8 ? this.tracerMat.clone() : new THREE.LineBasicMaterial({ color, transparent: true });
    const l = new THREE.Line(g, mat);
    this.scene.add(l);
    this.tracers.push({ l, t: 0.07 });
  }

  flash(pos) {
    if (this.onFlash) this.onFlash(pos);
    const m = new THREE.Mesh(this.flashGeo, this.flashMat);
    m.position.copy(pos);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(m);
    this.flashes.push({ m, t: 0.05 });
  }

  // Ambient particles around the viewer: falling leaves under trees, snow up high.
  ambient(dt, world, c) {
    if (!world || !c) return;
    this.ambT = (this.ambT || 0) + dt;
    const tries = Math.floor(this.ambT * 40);
    this.ambT -= tries / 40;
    for (let i = 0; i < tries; i++) {
      const x = Math.floor(c.x + (Math.random() - 0.5) * 36), z = Math.floor(c.z + (Math.random() - 0.5) * 36);
      const y = Math.floor(c.y + Math.random() * 12);
      const id = world.get(x, y, z);
      const leaf = LEAF_COLOURS[id];
      if (leaf && world.get(x, y - 1, z) === 0 && Math.random() < 0.35) {
        const g = leaf;
        this.parts.push({ x: x + Math.random(), y: y - 0.1, z: z + Math.random(), vx: 0, vy: -0.9, vz: 0, r: g[0], g: g[1], b: g[2], s: 0.09, life: 4, max: 4, grav: 0, sway: Math.random() * 6 });
      }
    }
    const top = world.topSolid(Math.floor(c.x), Math.floor(c.z));
    if (top > 40 || world.get(Math.floor(c.x), top, Math.floor(c.z)) === 15) {
      for (let i = 0; i < 2; i++) this.parts.push({ x: c.x + (Math.random() - 0.5) * 40, y: c.y + 14, z: c.z + (Math.random() - 0.5) * 40, vx: 0.4, vy: -2, vz: 0, r: 1, g: 1, b: 1, s: 0.07, life: 7, max: 7, grav: 0, sway: Math.random() * 6 });
    }
  }

  dust(p, rgb = [0.75, 0.68, 0.55]) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.parts.push({ x: p.x, y: p.y + 0.1, z: p.z, vx: Math.cos(a) * 3, vy: 0.8 + Math.random(), vz: Math.sin(a) * 3, r: rgb[0], g: rgb[1], b: rgb[2], s: 0.16, life: 0.6, max: 0.6, grav: 4 });
    }
  }

  splash(p) {
    for (let i = 0; i < 22; i++) {
      this.parts.push({ x: p.x + (Math.random() - 0.5), y: p.y + 0.5, z: p.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 3, r: 0.75, g: 0.88, b: 1, s: 0.11, life: 0.8, max: 0.8, grav: 18 });
    }
  }

  explosion(x, y, z, radius) {
    const m = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.booms.push({ m, t: 0, max: 0.45, r: radius });
    this.burst(x, y, z, [1, 0.6, 0.15], 30, 14, 0.3, 0.8);
    this.burst(x, y, z, [0.25, 0.25, 0.25], 25, 6, 0.45, 1.6);
  }

  update(dt) {
    const m = this._m, c = this._c, q = this._q, s = this._s, p = this._p;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const a = this.parts[i];
      a.life -= dt;
      if (a.life <= 0) { this.parts.splice(i, 1); continue; }
      a.vy -= a.grav * dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      if (a.sway !== undefined) { a.x += Math.sin(a.life * 2.2 + a.sway) * dt * 0.8; a.z += Math.cos(a.life * 1.7 + a.sway) * dt * 0.6; }
    }
    for (const a of this.parts) {
      const k = Math.min(1, a.life / a.max * 2);
      p.set(a.x, a.y, a.z); s.setScalar(a.s * k);
      m.compose(p, q, s);
      this.pmesh.setMatrixAt(n, m);
      this.pmesh.setColorAt(n, c.setRGB(a.r, a.g, a.b));
      n++;
    }
    this.pmesh.count = n;
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      t.l.material.opacity = Math.max(0, t.t / 0.07);
      if (t.t <= 0) { this.scene.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      if (f.t <= 0) { this.scene.remove(f.m); this.flashes.splice(i, 1); }
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const k = b.t / b.max;
      b.m.scale.setScalar(b.r * (0.3 + k * 1.1));
      b.m.material.opacity = 0.9 * (1 - k);
      b.m.material.color.setRGB(1, 0.65 - k * 0.4, 0.2 - k * 0.15);
      if (k >= 1) { this.scene.remove(b.m); b.m.material.dispose(); this.booms.splice(i, 1); }
    }
  }

  clear() {
    this.parts.length = 0;
    for (const t of this.tracers) this.scene.remove(t.l);
    for (const f of this.flashes) this.scene.remove(f.m);
    for (const b of this.booms) this.scene.remove(b.m);
    this.tracers.length = 0; this.flashes.length = 0; this.booms.length = 0;
  }
}
