// The Static: shrinking storm circle. Host simulates; clients receive snapshots.
import * as THREE from '../vendor/three.module.min.js';
import { SX, SZ, WATER_LEVEL } from './world.js';

const PHASES = [
  { wait: 55, shrink: 40, frac: 0.55, dps: 1 },
  { wait: 40, shrink: 35, frac: 0.5, dps: 2 },
  { wait: 35, shrink: 30, frac: 0.45, dps: 4 },
  { wait: 30, shrink: 25, frac: 0.42, dps: 7 },
  { wait: 25, shrink: 20, frac: 0.35, dps: 9 },
  { wait: 20, shrink: 25, frac: 0.0, dps: 12 },
];

export class Storm {
  constructor(game) {
    this.game = game;
    this.uniforms = { uTime: { value: 0 } };
    this.wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 220, 128, 1, true),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: false,
        vertexShader: `varying vec2 vUv; varying float vY;
          void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vY = wp.y; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vY;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          void main() {
            vec2 p = vec2(vUv.x * 160.0, vY * 0.12);
            p = floor(p * 2.0) / 2.0; // chunky pixels
            float t = uTime;
            float swirl = n(p * 0.5 + vec2(t * 0.6, -t * 0.4)) * 0.6 + n(p * 1.3 + vec2(-t * 1.1, t * 0.3)) * 0.4;
            float streak = smoothstep(0.82, 0.95, n(vec2(p.x * 0.35 + t * 2.0, p.y * 3.0)));
            vec3 col = mix(vec3(0.22, 0.05, 0.42), vec3(0.75, 0.3, 1.0), swirl);
            col += vec3(1.4, 0.9, 2.2) * streak;
            float a = 0.55 + swirl * 0.3 + streak * 0.3;
            a *= smoothstep(150.0, 60.0, vY);
            gl_FragColor = vec4(col, a);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.wall.position.y = 60;
    this.wall.renderOrder = 3;
    game.scene.add(this.wall);
    this.reset();
  }

  reset() {
    this.cur = { x: SX / 2, z: SZ / 2, r: SX * 0.74 };
    this.next = { ...this.cur };
    this.from = { ...this.cur };
    this.phase = 0; this.stage = 'wait';
    this.timer = PHASES[0].wait;
    this.dps = 1;
    this.tickT = 1;
    this.planNext();
    this.wall.visible = false;
  }

  planNext() {
    const ph = PHASES[Math.min(this.phase, PHASES.length - 1)];
    const r = this.cur.r * ph.frac;
    // try a few spots and prefer one on land (atoll and archipelago maps have a lot of sea)
    const world = this.game.world;
    let x, z;
    for (let tries = 0; tries < 12; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const off = Math.random() * (this.cur.r - r) * 0.85;
      x = this.cur.x + Math.cos(ang) * off; z = this.cur.z + Math.sin(ang) * off;
      x = Math.max(30, Math.min(SX - 30, x)); z = Math.max(30, Math.min(SZ - 30, z));
      if (!world || world.topSolid(x, z) >= WATER_LEVEL) break;
    }
    this.next = { x, z, r };
  }

  get label() { return this.stage === 'wait' ? 'Static closing in' : 'Static shrinking'; }

  // Host only.
  update(dt) {
    if (this.phase >= PHASES.length) return;
    const ph = PHASES[this.phase];
    this.timer -= dt;
    if (this.stage === 'wait') {
      if (this.timer <= 0) {
        this.stage = 'shrink'; this.timer = ph.shrink; this.from = { ...this.cur };
        this.dps = ph.dps;
        this.game.onStormEvent('shrink', this.phase);
      }
    } else {
      const k = 1 - Math.max(0, this.timer) / ph.shrink;
      this.cur.x = this.from.x + (this.next.x - this.from.x) * k;
      this.cur.z = this.from.z + (this.next.z - this.from.z) * k;
      this.cur.r = this.from.r + (this.next.r - this.from.r) * k;
      if (this.timer <= 0) {
        this.phase++;
        if (this.phase < PHASES.length) {
          this.stage = 'wait'; this.timer = PHASES[this.phase].wait;
          this.planNext();
          this.game.onStormEvent('wait', this.phase);
        } else this.timer = 0;
      }
    }
  }

  snapshot() { return { c: [this.cur.x, this.cur.z, this.cur.r], n: [this.next.x, this.next.z, this.next.r], ph: this.phase, st: this.stage, tm: this.timer, d: this.dps }; }
  apply(s) {
    this.cur = { x: s.c[0], z: s.c[1], r: s.c[2] };
    this.next = { x: s.n[0], z: s.n[1], r: s.n[2] };
    if (s.ph !== this.phase || s.st !== this.stage) this.game.onStormEvent(s.st, s.ph);
    this.phase = s.ph; this.stage = s.st; this.timer = s.tm; this.dps = s.d;
  }

  outside(pos) { return Math.hypot(pos.x - this.cur.x, pos.z - this.cur.z) > this.cur.r; }
  outsideNext(pos, margin = 0) { return Math.hypot(pos.x - this.next.x, pos.z - this.next.z) > this.next.r - margin; }

  render(t) {
    this.wall.visible = true;
    this.wall.position.x = this.cur.x; this.wall.position.z = this.cur.z;
    this.wall.scale.set(Math.max(0.5, this.cur.r), 1, Math.max(0.5, this.cur.r));
    this.uniforms.uTime.value = t;
  }
}
