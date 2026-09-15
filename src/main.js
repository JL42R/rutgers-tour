// main.js — entry point. Sets up the 3D scene and connects all systems.
// Reading order for newcomers: main.js -> controls.js -> zones.js -> npc.js -> dialogue.js

import * as THREE from 'three';
import { SparkRenderer } from '@sparkjsdev/spark';
import { PlayerControls, EYE_HEIGHT } from './controls.js';
import { ZoneManager } from './zones.js';
import { NPCManager } from './npc.js';
import { Dialogue } from './dialogue.js';

const app = document.getElementById('app');

// --- Three.js basics: scene, camera, renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101014);

const camera = new THREE.PerspectiveCamera(
  70, window.innerWidth / window.innerHeight, 0.05, 200
);
camera.position.set(0, EYE_HEIGHT, 3); // start 3m back from zone origin, at eye height

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

// Spark makes Gaussian splats render inside the normal Three.js scene.
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// Light only matters for placeholder meshes and sprites; splats carry their own color.
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(4, 10, 2);
scene.add(dir);

// --- Game systems ---
const dialogue = new Dialogue();
const controls = new PlayerControls(camera, renderer.domElement);
const zones = new ZoneManager(scene);
const npcs = new NPCManager(scene, dialogue);

// While a dialogue is open, freeze movement so buttons are usable.
dialogue.onOpen = () => { controls.enabled = false; controls.unlock(); };
dialogue.onClose = () => { controls.enabled = true; };

// --- Load the world ---
async function init() {
  const loadingEl = document.getElementById('loading');
  try {
    const config = await zones.loadConfig('./zones.json');
    const startZone = config.zones.find(z => z.id === config.startZone) ?? config.zones[0];
    await zones.loadZone(startZone.id);
    npcs.setNPCs(startZone.npcs ?? []);
    if (startZone.spawn) {
      camera.position.set(startZone.spawn[0], (startZone.spawn[1] ?? 0) + EYE_HEIGHT, startZone.spawn[2]);
    }
  } catch (err) {
    console.error('World failed to load:', err);
    loadingEl.firstElementChild.textContent = 'Failed to load — check the console (F12).';
  }
  loadingEl.style.opacity = '0';
  setTimeout(() => loadingEl.remove(), 500);
}
init();

// --- Frame loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); // clamp so tab-switch doesn't teleport you
  controls.update(dt, zones.getCollisionBoxes());
  npcs.update(camera.position);
  renderer.render(scene, camera);
});

// Keep canvas sized to the window.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
