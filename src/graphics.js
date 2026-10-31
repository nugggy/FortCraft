// Rendering pipeline: time-of-day lighting, sky, sun shadows, water, ocean, clouds, post-processing.
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { SX, SZ, WATER_LEVEL } from './world.js';
import { makeNoise2D } from './noise.js';

// Lighting presets. The match seed picks one so every LAN client sees the same sky.
export const TIMES = {
  morning: {
    label: 'Morning', sun: [0.75, 0.42, 0.5], sunColor: 0xffe0b0, sunI: 2.3, hemiSky: 0xd6e6ff, hemiGround: 0x6b5a46, hemiI: 1.25,
    zenith: 0x5a95e0, horizon: 0xf2d6b8, ground: 0x6d7f95, deep: 0x1d4f8f, shallow: 0x3f8fc9, tint: [1.04, 1.0, 0.95], sat: 1.12, fogFar: 175,
  },
  noon: {
    label: 'Midday', sun: [0.35, 1.0, 0.25], sunColor: 0xfff4e2, sunI: 2.5, hemiSky: 0xdcefff, hemiGround: 0x7a6a50, hemiI: 1.35,
    zenith: 0x3b82e8, horizon: 0xbadcff, ground: 0x7d93ad, deep: 0x15529b, shallow: 0x3a9ad8, tint: [1.0, 1.0, 1.0], sat: 1.15, fogFar: 185,
  },
  afternoon: {
    label: 'Afternoon', sun: [-0.55, 0.62, 0.35], sunColor: 0xffecc8, sunI: 2.4, hemiSky: 0xd8e8ff, hemiGround: 0x76664c, hemiI: 1.3,
    zenith: 0x467fd6, horizon: 0xcfe0f2, ground: 0x7a8aa0, deep: 0x184c8c, shallow: 0x3a92cc, tint: [1.03, 1.0, 0.97], sat: 1.12, fogFar: 180,
  },
  sunset: {
    label: 'Sunset', sun: [-0.85, 0.2, 0.35], sunColor: 0xffa268, sunI: 2.2, hemiSky: 0xf0c8b4, hemiGround: 0x5a4a44, hemiI: 1.1,
    zenith: 0x3b4f94, horizon: 0xff9e62, ground: 0x5d5a78, deep: 0x23366e, shallow: 0x6a6fb0, tint: [1.08, 0.98, 0.92], sat: 1.18, fogFar: 165,
  },
  // scenes used by particular maps (src/maps.js)
  dawn: {
    label: 'Dawn', sun: [0.85, 0.16, -0.3], sunColor: 0xffb8a0, sunI: 1.9, hemiSky: 0xe8c8e0, hemiGround: 0x54465a, hemiI: 1.2,
    zenith: 0x4a5aa0, horizon: 0xffc0a8, ground: 0x6a6080, deep: 0x22407a, shallow: 0x5a7ab8, tint: [1.05, 0.98, 1.0], sat: 1.12, fogFar: 170,
  },
  heat: {
    label: 'Heatwave', sun: [0.2, 1.0, 0.4], sunColor: 0xfff0c8, sunI: 2.7, hemiSky: 0xffeccc, hemiGround: 0x8a7050, hemiI: 1.4,
    zenith: 0x5a8ad0, horizon: 0xf4e0b8, ground: 0x9a8a70, deep: 0x1a5a90, shallow: 0x40a8c8, tint: [1.08, 1.0, 0.9], sat: 1.1, fogFar: 170,
  },
  mist: {
    label: 'Misty', sun: [0.3, 0.7, 0.5], sunColor: 0xd8e0c8, sunI: 1.5, hemiSky: 0xc8d4c0, hemiGround: 0x4a5040, hemiI: 1.35,
    zenith: 0x7f8f8a, horizon: 0xb4c0b0, ground: 0x5c6658, deep: 0x2a4038, shallow: 0x4f6a5a, tint: [0.98, 1.02, 0.96], sat: 0.95, fogFar: 115,
  },
  night: {
    label: 'Night', sun: [0.4, 0.75, -0.5], sunColor: 0xb0c4ff, sunI: 1.1, hemiSky: 0x6a7fb8, hemiGround: 0x2a2a3a, hemiI: 0.95,
    zenith: 0x070d24, horizon: 0x26335e, ground: 0x151a2c, deep: 0x0a1a38, shallow: 0x1c3a66, tint: [0.92, 0.96, 1.1], sat: 0.95, fogFar: 150,
  },
};
// The classic island cycles through these; other maps pick their own scene.
export const TIME_KEYS = ['morning', 'noon', 'afternoon', 'sunset'];

const STORM = { zenith: new THREE.Color(0x3a1460), horizon: new THREE.Color(0x8a3ad0), fog: new THREE.Color(0x6a2ea8) };

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep the sky at the far plane
}`;
const SKY_FRAG = `
uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(h, 0.55)) : mix(uHorizon, uGround, pow(-h, 0.4));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.45);
  // blocky square sun, like the classic voxel games
  vec3 sd = normalize(uSunDir);
  vec3 r = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(r, sd);
  vec2 q = vec2(dot(d, r), dot(d, u));
  if (dot(d, sd) > 0.0 && max(abs(q.x), abs(q.y)) < 0.045) col = uSunColor * 3.5;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const WATER_VERT = `
uniform float uTime;
varying vec3 vWorld;
varying float vUp;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vUp = normal.y;
  if (normal.y > 0.5) wp.y += (sin(wp.x * 0.6 + uTime * 1.5) + cos(wp.z * 0.55 + uTime * 1.2)) * 0.035 - 0.05;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FRAG = `
uniform float uTime;
uniform vec3 uSunDir, uSunColor, uSky, uDeep, uShallow;
varying vec3 vWorld;
varying float vUp;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 p = floor(vWorld.xz * 8.0) / 8.0; // pixel-snapped ripples for the voxel look
  float t = uTime;
  vec2 g = vec2(
    cos(p.x * 1.1 + t * 1.7) * 0.8 + cos((p.x + p.y) * 1.6 - t * 2.3) * 0.5,
    sin(p.y * 0.9 - t * 1.4) * 0.8 + cos((p.x - p.y) * 1.4 + t * 2.0) * 0.5) * 0.09;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  if (vUp < 0.5) n = vec3(0.0, 1.0, 0.0);
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float band = 0.5 + 0.5 * sin(p.x * 0.07 + t * 0.2) * sin(p.y * 0.06 - t * 0.15);
  vec3 col = mix(uShallow, uDeep, band * 0.6);
  col = mix(col, uSky, fres * 0.75);
  vec3 h = normalize(normalize(uSunDir) + v);
  float spec = pow(max(dot(n, h), 0.0), 160.0);
  col += uSunColor * spec * 3.0;
  float alpha = mix(0.8, 0.96, fres);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uSat: { value: 1.12 }, uContrast: { value: 1.06 },
    uTint: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.35 }, uStorm: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette, uStorm; uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.18) * uContrast + 0.18;
  c *= uTint;
  float d = distance(vUv, vec2(0.5));
  c *= mix(1.0, smoothstep(0.95, 0.35, d), uVignette);
  c = mix(c, c * vec3(0.78, 0.55, 1.05), uStorm);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`,
};

export class Graphics {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.quality = 'high';
    this.time = 0; this.stormK = 0;
    this.preset = TIMES.noon;

    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.3);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.shadow.camera.left = -70; this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70; this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.06;
    if ('intensity' in this.sun.shadow) this.sun.shadow.intensity = 0.8;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.35, 1, 0.25).normalize();

    // muzzle flash light (kept in the scene permanently so shaders don't recompile)
    this.flashLight = new THREE.PointLight(0xffc860, 0, 14, 2);
    scene.add(this.flashLight);
    this.flashT = 0;

    this.makeSky();
    this.waterMat = this.makeWaterMaterial();
    this.makeOcean();
    this.clouds = null;
  }

  // ---------------------------------------------------------------- sky
  makeSky() {
    this.skyUniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scene.background = null;
  }

  makeWaterMaterial() {
    this.waterUniforms = {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
    };
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.waterUniforms]),
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      transparent: true, depthWrite: false, fog: true,
    });
  }

  // Ocean around the island (four big quads framing the voxel world) plus a sea floor.
  makeOcean() {
    const E = 3000, y = WATER_LEVEL + 0.88;
    this.ocean = new THREE.Group();
    const quad = (x0, z0, x1, z1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.waterMat);
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      m.renderOrder = 2; m.frustumCulled = false;
      this.ocean.add(m);
    };
    quad(-E, -E, SX + E, 0);
    quad(-E, SZ, SX + E, SZ + E);
    quad(-E, 0, 0, SZ);
    quad(SX, 0, SX + E, SZ);
    this.scene.add(this.ocean);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(E * 2 + SX, E * 2 + SZ), new THREE.MeshLambertMaterial({ color: 0x3d5a66 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(SX / 2, -6, SZ / 2);
    this.scene.add(floor);
    this.seaFloor = floor;
  }

  // Blocky voxel clouds from noise, drifting slowly across the island.
  makeClouds(seed) {
    if (this.clouds) { this.scene.remove(this.clouds); this.clouds.geometry.dispose(); }
    const n = makeNoise2D(seed ^ 0x51ed);
    const cell = 8, pad = 320;
    const cells = [];
    for (let z = -pad; z < SZ + pad; z += cell) for (let x = -pad; x < SX + pad; x += cell) {
      const v = n(x * 0.012, z * 0.012) * 0.7 + n(x * 0.04, z * 0.04) * 0.3;
      if (v > 0.32) cells.push([x, z]);
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(cell, 4, cell), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9a9a9a, transparent: true, opacity: 0.9 }), cells.length);
    const m = new THREE.Matrix4();
    cells.forEach(([x, z], i) => { m.makeTranslation(x + cell / 2, 104, z + cell / 2); mesh.setMatrixAt(i, m); });
    mesh.frustumCulled = false;
    this.clouds = mesh;
    this.scene.add(mesh);
  }

  // ---------------------------------------------------------------- presets and quality
  setTime(key) {
    const p = TIMES[key] || TIMES.noon;
    this.preset = p; this.timeKey = key;
    this.sunDir.set(...p.sun).normalize();
    this.sun.color.set(p.sunColor); this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky); this.hemi.groundColor.set(p.hemiGround); this.hemi.intensity = p.hemiI;
    this.base = { zenith: new THREE.Color(p.zenith), horizon: new THREE.Color(p.horizon), ground: new THREE.Color(p.ground) };
    const u = this.skyUniforms;
    u.uSunDir.value.copy(this.sunDir); u.uSunColor.value.set(p.sunColor);
    const w = this.waterMat.uniforms;
    w.uSunDir.value.copy(this.sunDir); w.uSunColor.value.set(p.sunColor);
    w.uDeep.value.set(p.deep); w.uShallow.value.set(p.shallow);
    if (this.grade) { this.grade.uniforms.uTint.value.set(...p.tint); this.grade.uniforms.uSat.value = p.sat; }
    this.applySky(0);
  }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    const dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.25) : 1);
    const shadows = q !== 'low';
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      this.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (q === 'low') { this.composer = null; }
    else this.buildComposer();
    this.resize();
  }

  buildComposer() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE);
    this.grade.uniforms.uTint.value.set(...this.preset.tint);
    this.grade.uniforms.uSat.value = this.preset.sat;
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }

  // ---------------------------------------------------------------- per frame
  applySky(k) {
    const b = this.base;
    if (!b) return;
    const u = this.skyUniforms;
    u.uZenith.value.copy(b.zenith).lerp(STORM.zenith, k);
    u.uHorizon.value.copy(b.horizon).lerp(STORM.horizon, k);
    u.uGround.value.copy(b.ground).lerp(STORM.zenith, k);
    this.waterMat.uniforms.uSky.value.copy(u.uHorizon.value);
    if (this.scene.fog) this.scene.fog.color.copy(b.horizon).lerp(STORM.fog, k);
  }

  update(dt, focus, inStorm) {
    this.time += dt;
    this.stormK += ((inStorm ? 1 : 0) - this.stormK) * Math.min(1, dt * 3);
    this.applySky(this.stormK);
    const fog = this.scene.fog;
    if (fog) {
      const far = this.preset.fogFar * (this.fogScale || 1);
      fog.near += ((inStorm ? 8 : far * 0.4) - fog.near) * Math.min(1, dt * 3);
      fog.far += ((inStorm ? 70 : far) - fog.far) * Math.min(1, dt * 3);
    }
    if (this.grade) this.grade.uniforms.uStorm.value = this.stormK * 0.6;
    this.waterMat.uniforms.uTime.value = this.time;
    this.sky.position.copy(this.camera.position);
    if (this.clouds) this.clouds.position.x = (this.time * 0.6) % 320;

    // shadow camera follows the focus point, snapped to shadow texels to avoid shimmering
    if (this.sun.castShadow && focus) {
      const texel = 140 / this.sun.shadow.mapSize.x;
      const tx = Math.round(focus.x / texel) * texel, ty = Math.round(focus.y / texel) * texel, tz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(tx, ty, tz);
      this.sun.position.set(tx + this.sunDir.x * 180, ty + this.sunDir.y * 180, tz + this.sunDir.z * 180);
    } else {
      this.sun.position.copy(this.sunDir).multiplyScalar(200);
      this.sun.target.position.set(0, 0, 0);
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
  }

  muzzle(pos) {
    if (this.quality === 'low') return;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 40;
    this.flashT = 0.05;
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
