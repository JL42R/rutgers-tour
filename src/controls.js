// controls.js — first-person movement: click to capture the mouse,
// WASD to walk, mouse to look. The camera stays at a fixed eye height
// (there is no jumping or stairs in v1 — the tour floor is flat).

import * as THREE from 'three';
import { resolveMovement } from './collision.js';

export const EYE_HEIGHT = 1.65; // meters — average standing eye level
const WALK_SPEED = 2.2;         // meters per second
const LOOK_SENSITIVITY = 0.0022;

export class PlayerControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.enabled = true;
    this.keys = new Set();
    this.yaw = 0;    // left/right rotation
    this.pitch = 0;  // up/down rotation

    // Click the 3D view to capture the mouse (standard for first-person controls).
    this.dom.addEventListener('click', () => {
      if (this.enabled && document.pointerLockElement !== this.dom) {
        this.dom.requestPointerLock();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom || !this.enabled) return;
      this.yaw -= e.movementX * LOOK_SENSITIVITY;
      this.pitch -= e.movementY * LOOK_SENSITIVITY;
      // Stop the camera flipping over backwards.
      const limit = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });

    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  unlock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  update(dt, collisionBoxes) {
    // Apply look rotation (yaw around Y, then pitch).
    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')
    );

    if (!this.enabled) return;

    // Build a movement direction from whichever WASD/arrow keys are held.
    const input = new THREE.Vector3(
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0),
      0,
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) -
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
    );
    if (input.lengthSq() === 0) return;

    // Rotate the input by the camera's yaw so "W" means "the way I'm facing".
    input.normalize().applyEuler(new THREE.Euler(0, this.yaw, 0));
    const step = input.multiplyScalar(WALK_SPEED * dt);

    // Try to move, sliding along any collision walls.
    const next = resolveMovement(this.camera.position, step, collisionBoxes);
    this.camera.position.set(next.x, this.camera.position.y, next.z);
  }
}
