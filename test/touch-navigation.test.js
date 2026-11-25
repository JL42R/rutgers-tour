import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { PlayerControls } from '../src/controls.js';
import { joystickPosition, TouchNavigation } from '../src/touch-navigation.js';

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

class Surface extends EventTarget {
  style = {};
  captured = new Set();
  contains(target) { return this === target; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function emit(target, type, fields = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), fields);
  target.dispatchEvent(event);
  return event;
}

function pointer(target, type, pointerId, clientX = 50, clientY = 50, pointerType = 'touch') {
  return emit(target, type, { pointerId, clientX, clientY, pointerType });
}

function setup(t, { lookSensitivity, coarse = true } = {}) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const doc = new EventTarget();
  const win = new EventTarget();
  const media = new EventTarget();
  media.matches = coarse;
  win.matchMedia = () => media;
  const attributes = new Set();
  doc.body = {
    toggleAttribute: (name, active) => active ? attributes.add(name) : attributes.delete(name),
    removeAttribute: (name) => attributes.delete(name),
  };
  doc.exitPointerLock = () => { doc.pointerLockElement = null; };
  Object.assign(globalThis, { document: doc, window: win });
  const camera = new PerspectiveCamera();
  const canvas = new Surface();
  const stick = new Surface();
  const thumb = new Surface();
  canvas.requestPointerLock = () => { doc.pointerLockElement = canvas; };
  const controls = new PlayerControls(camera, canvas);
  const touch = new TouchNavigation(controls, stick, thumb, { lookSensitivity });
  controls.touchNavigation = touch;
  t.after(() => {
    controls.destroy();
    Object.assign(globalThis, previous);
  });
  return { controls, touch, stick, thumb, canvas, camera, doc, win, attributes };
}

test('joystick has a radial dead zone, analog intensity and unit diagonals', () => {
  const neutral = joystickPosition(4, -3, 50);
  closeTo(neutral.x, 0);
  closeTo(neutral.forward, 0);
  closeTo(joystickPosition(0, -28.75, 50).forward, .5);
  closeTo(joystickPosition(-50, 0, 50).x, -1);
  closeTo(joystickPosition(0, 50, 50).forward, -1);
  const diagonal = joystickPosition(100, -100, 50);
  closeTo(diagonal.x, Math.SQRT1_2);
  closeTo(diagonal.forward, Math.SQRT1_2);
  closeTo(Math.hypot(diagonal.thumbX, diagonal.thumbY), 27.5);
});

test('two touch pointers move and look independently with configured sensitivity and shared pitch limits', t => {
  const { controls, stick, canvas, camera, touch } = setup(t, { lookSensitivity: .01 });
  assert(pointer(stick, 'pointerdown', 1, 50, 21.25).defaultPrevented);
  assert(pointer(canvas, 'pointerdown', 2, 200, 100).defaultPrevented);
  assert(stick.hasPointerCapture(1) && canvas.hasPointerCapture(2));
  closeTo(controls.yaw, 0);
  pointer(canvas, 'pointermove', 2, 220, 1000);
  closeTo(controls.yaw, -.2);
  closeTo(controls.pitch, -(Math.PI / 2 - .05));
  closeTo(controls.update(.05, []), .5);
  closeTo(Math.hypot(camera.position.x, camera.position.z), .055);
  assert(camera.position.x > 0 && camera.position.z < 0);
  pointer(canvas, 'pointerup', 2);
  closeTo(touch.forward, .5);
  pointer(canvas, 'pointerdown', 3, 300, 600);
  closeTo(controls.yaw, -.2);
  pointer(canvas, 'pointermove', 3, 300, 0);
  closeTo(controls.pitch, Math.PI / 2 - .05);
});

test('release, cancellation, capture loss, blur, resize and hidden tabs clear movement', t => {
  const { controls, touch, stick, thumb, canvas, win, doc, camera } = setup(t);
  const stop = () => {
    assert.equal(touch.forward, 0);
    assert.equal(thumb.style.transform, '');
    const before = camera.position.clone();
    assert.equal(controls.update(.05, []), 0);
    assert(camera.position.equals(before));
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pointer(stick, 'pointerdown', 1, 50, 0);
    pointer(stick, type, 2);
    closeTo(touch.forward, 1);
    pointer(stick, type, 1);
    stop();
  }
  for (const type of ['blur', 'resize', 'visibilitychange', 'disable']) {
    pointer(stick, 'pointerdown', 1, 50, 0);
    pointer(canvas, 'pointerdown', 2);
    if (type === 'visibilitychange') {
      doc.hidden = true;
      emit(doc, type);
    } else if (type === 'disable') {
      controls.enabled = false;
      assert.equal(stick.hidden, true);
    } else {
      emit(win, type);
    }
    stop();
    assert(!canvas.hasPointerCapture(2));
    pointer(canvas, 'pointermove', 2, 100, 20);
    closeTo(controls.yaw, 0);
    controls.enabled = true;
    assert.equal(stick.hidden, false);
  }
  controls.destroy();
  pointer(stick, 'pointerdown', 1, 50, 0);
  assert(!stick.hasPointerCapture(1));
  stop();
});

test('desktop pointer lock and keyboard aliases coexist with hybrid touchscreen activation', t => {
  const { controls, doc, camera, canvas, stick, attributes } = setup(t, { coarse: false });
  const touchMode = 'data-touch-navigation';
  assert(!attributes.has(touchMode));
  pointer(canvas, 'pointerdown', 1, 50, 50, 'mouse');
  emit(canvas, 'click', { pointerType: 'mouse' });
  assert.equal(doc.pointerLockElement, canvas);
  emit(doc, 'mousemove', { movementX: 100, movementY: -10 });
  closeTo(controls.yaw, -.22);
  closeTo(controls.pitch, .022);
  emit(doc, 'keydown', { code: 'ArrowUp' });
  emit(doc, 'keydown', { code: 'KeyD' });
  assert.equal(controls.update(.05, []), 1);
  closeTo(camera.position.length(), .11);

  pointer(canvas, 'pointerdown', 2);
  assert(attributes.has(touchMode));
  emit(canvas, 'click');
  assert.equal(doc.pointerLockElement, null);
  pointer(stick, 'pointerdown', 3, 50, 0);
  pointer(doc, 'pointerdown', 4); // A separate touch on the HUD ends scene input.
  assert(!stick.hasPointerCapture(3) && !canvas.hasPointerCapture(2));
  pointer(canvas, 'pointerdown', 1, 50, 50, 'mouse');
  assert(!attributes.has(touchMode));
});

test('joystick movement is timestep-scaled and uses the existing wall collision solver', t => {
  const { controls, stick, camera } = setup(t);
  pointer(stick, 'pointerdown', 1, 50, 0);
  controls.update(.04, []);
  closeTo(camera.position.z, -.088);
  camera.position.z = 0;
  for (let i = 0; i < 4; i++) controls.update(.01, []);
  closeTo(camera.position.z, -.088);
  const walls = [{ min: [-1, 0, -1.5], max: [1, 3, -1] }];
  for (let i = 0; i < 30; i++) controls.update(.05, walls);
  assert(camera.position.z > -.66 && camera.position.z < -.5);
});
