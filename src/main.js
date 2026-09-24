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
renderer.setPixelRatio(1);
app.appendChild(renderer.domElement);

// Spark makes Gaussian splats render inside the normal Three.js scene.
const spark = new SparkRenderer({
  renderer,
  lodSplatCount: 500000,
});
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

let zoneSwitchInProgress = false;

async function switchZone(zoneId) {
  if (zoneSwitchInProgress || zones.current?.id === zoneId) return;

  const oldZoneId = zones.current?.id ?? 'none';
  zoneSwitchInProgress = true;
  controls.enabled = false;

  try {
    const newZone = await zones.loadZone(zoneId);
    npcs.setNPCs(newZone.npcs ?? []);
    console.info(`Switched zone from "${oldZoneId}" to "${newZone.id}".`);
  } catch (err) {
    console.error(`Could not switch from zone "${oldZoneId}" to "${zoneId}".`, err);
  } finally {
    controls.enabled = true;
    zoneSwitchInProgress = false;
  }
}

function crossedTransition(previousPosition, currentPosition, transition) {
  if (transition.axis !== 'x' && transition.axis !== 'z') return false;
  if (!Array.isArray(transition.range) || transition.range.length !== 2) return false;

  const rangeAxis = transition.axis === 'x' ? 'z' : 'x';
  const insideRange = currentPosition[rangeAxis] >= transition.range[0]
    && currentPosition[rangeAxis] <= transition.range[1];
  if (!insideRange) return false;

  if (transition.direction === 'negative') {
    return previousPosition[transition.axis] >= transition.plane
      && currentPosition[transition.axis] < transition.plane;
  }
  if (transition.direction === 'positive') {
    return previousPosition[transition.axis] <= transition.plane
      && currentPosition[transition.axis] > transition.plane;
  }
  return false;
}

// --- Frame loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); // clamp so tab-switch doesn't teleport you
  const previousPosition = { x: camera.position.x, z: camera.position.z };
  controls.update(dt, zones.getCollisionBoxes());

  if (!zoneSwitchInProgress) {
    const transition = (zones.current?.transitions ?? []).find((candidate) =>
      crossedTransition(previousPosition, camera.position, candidate)
    );
    if (transition) void switchZone(transition.target);
  }

  npcs.update(camera.position);
  renderer.render(scene, camera);
});

// Keep canvas sized to the window.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
