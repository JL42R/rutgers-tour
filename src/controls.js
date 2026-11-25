// controls.js — first-person movement: click to capture the mouse,
// WASD to walk, mouse to look. The camera stays at a fixed eye height
// (there is no jumping or stairs in v1 — the tour floor is flat).

import * as THREE from 'three';
import { resolveMovement } from './collision.js';
import { createRoom116Boundary, resolveRoom116Movement } from './room116-boundary.js';
import { keyboardForwardInput } from './movement-input.js';

export const EYE_HEIGHT = 1.65; // meters — average standing eye level
const WALK_SPEED = 2.2;         // meters per second
const LOOK_SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const UP = new THREE.Vector3(0, 1, 0);

export class PlayerControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.enabled = true;
    this.keys = new Set();
    this.yaw = 0;    // left/right rotation
    this.pitch = 0;  // up/down rotation
    const listeners = new AbortController();
    this.listeners = listeners;
    const options = { signal: listeners.signal };
    let canvasPointerType;

    this.dom.addEventListener('pointerdown', (event) => {
      canvasPointerType = event.pointerType;
    }, options);

    // Click the 3D view to capture the mouse (standard for first-person controls).
    this.dom.addEventListener('click', (event) => {
      if (this.enabled && event.pointerType !== 'touch' && canvasPointerType !== 'touch'
        && document.pointerLockElement !== this.dom) {
        this.dom.requestPointerLock?.()?.catch?.(() => {});
      }
    }, options);

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom || !this.enabled) return;
      this.look(e.movementX, e.movementY, LOOK_SENSITIVITY);
    }, options);

    document.addEventListener('keydown', (e) => this.keys.add(e.code), options);
    document.addEventListener('keyup', (e) => this.keys.delete(e.code), options);
    window.addEventListener('blur', () => this.keys.clear(), options);
  }

  get enabled() {
    return this.movementEnabled;
  }

  set enabled(value) {
    this.movementEnabled = value;
    this.touchNavigation?.setEnabled(value);
  }

  look(dx, dy, sensitivity) {
    if (!this.enabled) return;
    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
  }

  destroy() {
    this.enabled = false;
    this.touchNavigation?.destroy();
    this.listeners.abort();
    this.keys.clear();
    this.unlock();
  }

  unlock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  update(dt, collisionBoxes, zone = null) {
    // Apply look rotation (yaw around Y, then pitch).
    this.lookEuler ??= new THREE.Euler(0, 0, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.lookEuler.set(this.pitch, this.yaw, 0));

    if (!this.enabled) return 0;

    let x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
      Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    let forward = keyboardForwardInput(this.keys);
    if (!x && !forward && this.touchNavigation) {
      x = this.touchNavigation.x;
      forward = this.touchNavigation.forward;
    }
    if (!x && !forward) return 0;

    // Rotate the input by the camera's yaw so "W" means "the way I'm facing".
    this.step ??= new THREE.Vector3();
    const step = this.step.set(x, 0, -forward).clampLength(0, 1)
      .applyAxisAngle(UP, this.yaw).multiplyScalar(WALK_SPEED * dt);

    // Try to move, sliding along any collision walls.
    let next;
    if (zone?.id === 'project-studio' && zone.walkingBoundary) {
      if (this.boundaryZone !== zone) {
        this.roomBoundary = createRoom116Boundary(zone);
        this.boundaryZone = zone;
      }
      next = resolveRoom116Movement(this.camera.position, step, this.roomBoundary);
    } else {
      next = resolveMovement(this.camera.position, step, collisionBoxes);
    }
    this.camera.position.set(next.x, this.camera.position.y, next.z);
    // Doorway checks use the same forward intent as the movement just applied.
    return forward;
  }
}
