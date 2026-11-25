const DEAD_ZONE = 0.15;
const TOUCH_LOOK_SENSITIVITY = 0.004; // radians per CSS pixel

export function joystickPosition(dx, dy, radius) {
  const distance = Math.hypot(dx, dy);
  if (!distance) return { x: 0, forward: 0, thumbX: 0, thumbY: 0 };
  const displacement = Math.min(distance / radius, 1);
  const intensity = Math.max(0, (displacement - DEAD_ZONE) / (1 - DEAD_ZONE));
  return {
    x: dx / distance * intensity,
    forward: -dy / distance * intensity,
    thumbX: dx / distance * displacement * radius * 0.55,
    thumbY: dy / distance * displacement * radius * 0.55,
  };
}

export class TouchNavigation {
  constructor(controls, joystick, thumb, {
    lookSensitivity = TOUCH_LOOK_SENSITIVITY,
    onActivate = () => {},
  } = {}) {
    this.controls = controls;
    this.canvas = controls.dom;
    this.joystick = joystick;
    this.thumb = thumb;
    this.x = 0;
    this.forward = 0;
    this.movePointer = null;
    this.lookPointer = null;
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };

    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const setTouchMode = (active) => {
      if (active === this.active) return;
      this.active = active;
      document.body.toggleAttribute('data-touch-navigation', active);
      if (active) {
        controls.unlock();
        onActivate();
      } else {
        this.reset();
      }
    };
    setTouchMode(coarsePointer.matches);
    this.setEnabled(controls.enabled);
    coarsePointer.addEventListener('change', (event) => setTouchMode(event.matches), options);

    joystick.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || !controls.enabled || this.movePointer !== null) return;
      event.preventDefault();
      const rect = joystick.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      this.radius = Math.min(rect.width, rect.height) / 2;
      if (!this.radius) return;
      joystick.setPointerCapture(event.pointerId);
      this.movePointer = event.pointerId;
      this.move(event);
    }, options);
    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.movePointer) this.move(event);
    }, options);

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && !coarsePointer.matches) setTouchMode(false);
      if (event.pointerType !== 'touch') return;
      setTouchMode(true);
      if (!controls.enabled || this.lookPointer !== null) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.lookPointer = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    }, options);
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointer) return;
      controls.look(event.clientX - this.lastX, event.clientY - this.lastY, lookSensitivity);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    }, options);

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      joystick.addEventListener(type, (event) => {
        if (event.pointerId === this.movePointer) this.stopMovement();
      }, options);
      this.canvas.addEventListener(type, (event) => {
        if (event.pointerId === this.lookPointer) this.stopLook();
      }, options);
    }
    document.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' && event.target !== this.canvas && !joystick.contains(event.target)) {
        this.reset();
      }
    }, { ...options, capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    }, options);
    window.addEventListener('blur', () => this.reset(), options);
    window.addEventListener('resize', () => this.reset(), options);
  }

  move(event) {
    const { x, forward, thumbX, thumbY } = joystickPosition(
      event.clientX - this.centerX, event.clientY - this.centerY, this.radius
    );
    this.x = x;
    this.forward = forward;
    this.thumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
  }

  stopMovement() {
    const pointer = this.movePointer;
    this.movePointer = null;
    this.x = 0;
    this.forward = 0;
    this.thumb.style.transform = '';
    if (pointer !== null && this.joystick.hasPointerCapture(pointer)) {
      this.joystick.releasePointerCapture(pointer);
    }
  }

  stopLook() {
    const pointer = this.lookPointer;
    this.lookPointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) {
      this.canvas.releasePointerCapture(pointer);
    }
  }

  reset() {
    this.stopMovement();
    this.stopLook();
  }

  setEnabled(enabled) {
    this.joystick.hidden = !enabled;
    if (!enabled) this.reset();
  }

  destroy() {
    this.listeners.abort();
    this.reset();
    document.body.removeAttribute('data-touch-navigation');
  }
}
