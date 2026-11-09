// main.js — entry point. Sets up the 3D scene and connects all systems.
// Reading order for newcomers: main.js -> controls.js -> zones.js -> npc.js -> dialogue.js

import * as THREE from 'three';
import { SparkRenderer } from '@sparkjsdev/spark';
import { PlayerControls, EYE_HEIGHT } from './controls.js';
import { ZoneManager } from './zones.js';
import { NPCManager } from './npc.js';
import { Dialogue } from './dialogue.js';
import { InteractionTracker } from './interaction-tracker.js';
import { RoomNavigation } from './room-navigation.js';
import { npcGuidance } from './npc-guidance.js';
import { room116ArrivalPosition } from './room116-arrival.js';
import { allowsDoorTransition } from './door-transition-policy.js';
import { room116ExitStop } from './room116-door-stop.js';
import { debugEquipment, equipmentPlaceholder, installEquipmentDebug } from './equipment-debug.js';

const app = document.getElementById('app');

// --- Three.js basics: scene, camera, renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101014);

const camera = new THREE.PerspectiveCamera(
  70, window.innerWidth / window.innerHeight, 0.05, 200
);
camera.position.set(0, EYE_HEIGHT, 0); // fallback until the configured start zone loads

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
const zones = new ZoneManager(scene, { debugEquipment, equipmentPlaceholder });
const tracker = new InteractionTracker();
const roomNavigation = new RoomNavigation({ controls, dialogue, tracker });
const npcs = new NPCManager(scene, dialogue, {
  isCompleted: (npcId) => tracker.completedNpcIds.has(npcId),
  isInteractionBlocked: () => roomNavigation.isOpen || !controls.enabled,
  isDirectionSuppressed: () => roomNavigation.active || roomNavigation.isOpen || !controls.enabled,
  getGuidance: () => npcGuidance(
    tracker.getNextUnfinishedNpcInZone(zones.current?.id), zones.current
  ),
});
installEquipmentDebug({ camera, controls, zones, dialogue });

// While a dialogue is open, freeze movement so buttons are usable.
dialogue.onOpen = () => {
  controls.enabled = false;
  controls.unlock();
  tracker.collapse();
};
dialogue.onClose = () => { controls.enabled = true; };
dialogue.onSessionClosed = (session) => roomNavigation.welcomeClosed(session);
dialogue.onComplete = (npcId) => {
  console.log('[NPC completed]', npcId);
  tracker.complete(npcId);
};
tracker.onReset = () => dialogue.completedNpcIds.clear();

// The localhost provider and fictional catalogs are never imported by a production build.
let room116Editor = null;
if (import.meta.env.DEV) {
  if (new URLSearchParams(window.location.search).get('debugRoom116NPCs') === '1') {
    void import('./room116-npc-debug.js').then(({ installRoom116NPCDebug }) => {
      room116Editor = installRoom116NPCDebug({ camera, controls, zones, dialogue, npcs });
    });
  }
  const guideParams = new URLSearchParams(window.location.search);
  if (guideParams.get('guideMock') === '1' && guideParams.get('guideBackend') === 'local') {
    void import('./guide-hallway-local.js').then((local) => {
      const provider = local.createHallwayLocalQuestionProvider({ search: window.location.search });
      dialogue.registerQuestionProvider(local.HALLWAY_GUIDE_ID, provider);
      local.installLocalGuideDisclosure();
    }).catch(() => {
      console.warn('The local Guide development preview could not be enabled.');
    });
  }
}

let initialWelcomeStarted = false;

async function startInitialWelcome(startZone) {
  if (initialWelcomeStarted || startZone.id !== 'hallway' || dialogue.isOpen) return;

  const hallwayGuide = (startZone.npcs ?? []).find(npc => npc.id === 'hallway-guide');
  if (!hallwayGuide) {
    console.warn('The hallway loaded without the hallway guide; skipping the welcome.');
    return;
  }

  // Set this before loading the dialogue so a slow or failed request cannot trigger a second attempt.
  initialWelcomeStarted = true;
  try {
    await dialogue.start(hallwayGuide, { allowQuestionProvider: false, initialWelcome: true });
    if (!dialogue.isOpen) console.warn('The hallway welcome could not be opened.');
  } catch (err) {
    console.error('Could not open the hallway welcome:', err);
  }
}

// --- Load the world ---
async function init() {
  const loadingEl = document.getElementById('loading');
  try {
    const config = await zones.loadConfig('./zones.json');
    tracker.setConfig(config);
    roomNavigation.configure(config);
    for (const npcId of tracker.completedNpcIds) dialogue.completedNpcIds.add(npcId);
    const startZone = config.zones.find(z => z.id === config.startZone) ?? config.zones[0];
    await zones.loadZone(startZone.id);
    npcs.setNPCs(startZone.npcs ?? [], startZone.id);
    if (startZone.spawn) {
      camera.position.set(startZone.spawn[0], (startZone.spawn[1] ?? 0) + EYE_HEIGHT, startZone.spawn[2]);
    }
    if (Number.isFinite(startZone.spawnYaw)) {
      controls.yaw = THREE.MathUtils.degToRad(startZone.spawnYaw);
    }
    await startInitialWelcome(startZone);
  } catch (err) {
    console.error('World failed to load:', err);
    loadingEl.firstElementChild.textContent = 'Failed to load — check the console (F12).';
  }
  loadingEl.style.opacity = '0';
  setTimeout(() => loadingEl.remove(), 500);
}
init();

let zoneSwitchInProgress = false;

async function switchZone(zoneId, transition = null, previousPosition = null) {
  if (zoneSwitchInProgress || zones.current?.id === zoneId) return;

  const oldZoneId = zones.current?.id ?? 'none';
  const sourceZone = zones.current;
  const crossingPosition = { x: controls.camera.position.x, z: controls.camera.position.z };
  zoneSwitchInProgress = true;
  controls.enabled = false;

  try {
    const newZone = await zones.loadZone(zoneId);
    if (oldZoneId === 'hallway' && newZone.id === 'project-studio'
      && transition?.id === 'project-studio-door' && transition.target === newZone.id
      && sourceZone.transitions?.includes(transition) && previousPosition
      && crossedTransition(previousPosition, crossingPosition, transition)) {
      const arrival = room116ArrivalPosition(crossingPosition, newZone);
      if (arrival) {
        controls.camera.position.x = arrival.x;
        controls.camera.position.z = arrival.z;
      } else {
        console.warn('D3 inward arrival was unsafe; retaining the original crossing position.');
      }
    }
    npcs.setNPCs(newZone.npcs ?? [], newZone.id);
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
  const movementEnabled = controls.enabled;
  controls.update(dt, zones.getCollisionBoxes(), zones.current);

  if (!zoneSwitchInProgress) {
    const stopped = room116ExitStop({
      zone: zones.current, boundary: controls.roomBoundary,
      previous: previousPosition, current: camera.position,
      movementEnabled, keys: controls.keys, yaw: controls.yaw,
    });
    camera.position.x = stopped.x;
    camera.position.z = stopped.z;
    const transition = (zones.current?.transitions ?? []).find((candidate) =>
      crossedTransition(previousPosition, camera.position, candidate)
    );
    if (transition) {
      if (allowsDoorTransition({
        transition, movementEnabled, keys: controls.keys, yaw: controls.yaw,
        previous: previousPosition, current: camera.position,
      })) {
        void switchZone(transition.target, transition, previousPosition);
      } else {
        // Keep a rejected crossing in its source zone at the last valid position.
        camera.position.x = previousPosition.x;
        camera.position.z = previousPosition.z;
      }
    }
  }

  roomNavigation.update(camera.position, controls.yaw, zones.current?.id, zoneSwitchInProgress);
  npcs.update(camera.position, controls.yaw);
  room116Editor?.update?.();
  renderer.render(scene, camera);
});

// Keep canvas sized to the window.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
