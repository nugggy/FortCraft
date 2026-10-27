// Locker thumbnails rendered once with a short-lived offscreen renderer.
import * as THREE from '../../vendor/three.module.min.js';
import { makeCharacter, makeGlider, makeItemMesh, OUTFITS } from '../models.js';
import { GLIDERS, PICKAXES } from './cosmetics.js';

const cache = new Map();

// Renders a list of scene builders to data URLs with one temporary WebGL context.
function renderThumbs(w, h, jobs) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return jobs.map(() => '');
  }
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-1, 2, -2); scene.add(sun);
  const out = jobs.map(job => {
    const { obj, cam } = job();
    scene.add(obj);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL();
    scene.remove(obj);
    return url;
  });
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}

export function outfitThumbnails() {
  if (cache.has('outfits')) return cache.get('outfits');
  const cam = new THREE.PerspectiveCamera(30, 160 / 200, 0.1, 20);
  cam.position.set(-1.3, 1.35, -3.6);
  cam.lookAt(0, 0.92, 0);
  const urls = renderThumbs(160, 200, OUTFITS.map((_, i) => () => {
    const m = makeCharacter(i);
    m.glider.visible = false;
    m.armR.rotation.x = 0.35; m.armL.rotation.x = -0.25; m.legL.rotation.x = 0.2; m.legR.rotation.x = -0.2;
    m.head.rotation.y = -0.2;
    return { obj: m.root, cam };
  }));
  cache.set('outfits', urls);
  return urls;
}

// The default glider takes the outfit's colours, so thumbnails are keyed by outfit.
export function gliderThumbnails(outfit) {
  const key = 'gliders' + outfit;
  if (cache.has(key)) return cache.get(key);
  const cam = new THREE.PerspectiveCamera(34, 200 / 160, 0.1, 30);
  cam.position.set(-2.4, 3.9, -4.4);
  cam.lookAt(0, 2.75, 0);
  const urls = renderThumbs(200, 160, GLIDERS.map(gl => () => ({ obj: makeGlider(outfit, gl.id), cam })));
  cache.set(key, urls);
  return urls;
}

export function pickaxeThumbnails() {
  if (cache.has('pickaxes')) return cache.get('pickaxes');
  const cam = new THREE.PerspectiveCamera(30, 160 / 200, 0.1, 20);
  cam.position.set(2.7, 0.15, 0);
  cam.lookAt(0, 0, 0);
  const urls = renderThumbs(160, 200, PICKAXES.map(p => () => {
    const g = new THREE.Group();
    const m = makeItemMesh({ kind: 'weapon', id: 'pickaxe', rarity: 0, skin: p.id });
    m.position.z = 0.36; // centre the tool on the pivot
    g.add(m);
    g.rotation.x = -0.8; // handle down-left, head up-right
    return { obj: g, cam };
  }));
  cache.set('pickaxes', urls);
  return urls;
}
