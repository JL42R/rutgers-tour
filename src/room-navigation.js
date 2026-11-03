// Optional hallway guidance. Targets come from transitions, never splat geometry.
export function directionAngle(position, target, yaw = 0) {
  const angle = Math.atan2(target.x - position.x, -(target.z - position.z)) + yaw;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function connectedRooms(config) {
  const hallway = config.zones.find(zone => zone.id === 'hallway');
  return (hallway?.transitions ?? []).flatMap(door => {
    const zone = config.zones.find(candidate => candidate.id === door.target);
    if (!zone || !['x', 'z'].includes(door.axis) || !Number.isFinite(door.plane)
      || !door.range?.every(Number.isFinite) || door.range.length !== 2
      || door.range[1] <= door.range[0] || !['positive', 'negative'].includes(door.direction)
      || !zone.transitions?.some(exit => exit.target === hallway.id)) return [];
    return [{ id: zone.id, label: zone.label ?? zone.id, door }];
  });
}

export function hallwayWaypoint(position, door, hallway) {
  const across = door.axis;
  const along = across === 'x' ? 'z' : 'x';
  const middle = (door.range[0] + door.range[1]) / 2;
  const tolerance = Math.min(0.2, (door.range[1] - door.range[0]) / 4);
  if (Math.abs(position[along] - middle) > tolerance) {
    // Stay on the corridor spine until aligned with the opening.
    return { [across]: hallway.spawn?.[across === 'x' ? 0 : 2] ?? 0, [along]: middle };
  }
  return { [across]: door.plane + (door.direction === 'positive' ? 0.45 : -0.45), [along]: middle };
}

export function completedInitialWelcome(session) {
  return session?.initialWelcome === true && session.npcId === 'hallway-guide' && session.reachedEnding === true;
}

export class RoomRoute {
  constructor(config) {
    this.rooms = connectedRooms(config);
    this.hallway = config.zones.find(zone => zone.id === 'hallway');
    this.destination = null;
  }
  select(id) { this.destination = this.rooms.find(room => room.id === id) ?? null; }
  cancel() { this.destination = null; }
  enter(zoneId) {
    if (this.destination?.id === zoneId) { this.cancel(); return true; }
    return false;
  }
  waypoint(position, zoneId) {
    return this.destination && zoneId === 'hallway'
      ? hallwayWaypoint(position, this.destination.door, this.hallway) : null;
  }
}

export class RoomNavigation {
  constructor({ controls, dialogue, tracker }) {
    this.controls = controls;
    this.dialogue = dialogue;
    this.tracker = tracker;
    this.selector = document.getElementById('room-selector');
    this.choices = document.getElementById('room-options');
    this.openButton = document.getElementById('room-select-open');
    this.indicator = document.getElementById('room-direction');
    this.arrow = document.getElementById('room-direction-arrow');
    this.name = document.getElementById('room-direction-name');
    this.instruction = document.getElementById('room-direction-instruction');
    this.openButton.addEventListener('click', () => this.open());
    document.getElementById('room-change').addEventListener('click', () => this.open());
    document.getElementById('room-cancel').addEventListener('click', () => this.cancel());
    document.getElementById('room-explore').addEventListener('click', () => {
      this.cancel(); this.selector.close();
    });
    this.selector.addEventListener('close', () => {
      this.controls.keys.clear();
      this.controls.enabled = !this.dialogue.isOpen;
      this.openButton.hidden = this.dialogue.isOpen;
      this.openButton.focus({ preventScroll: true });
    });
  }
  get isOpen() { return this.selector.open; }
  get active() { return !!this.route?.destination; }
  configure(config) {
    this.route = new RoomRoute(config);
    this.choices.replaceChildren();
    for (const room of this.route.rooms) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = room.label;
      button.addEventListener('click', () => {
        this.route.select(room.id);
        this.selector.close();
      });
      this.choices.appendChild(button);
    }
    this.openButton.hidden = this.route.rooms.length === 0;
  }
  open() {
    if (!this.route || this.dialogue.isOpen || this.isOpen || !this.controls.enabled) return;
    this.controls.enabled = false;
    this.controls.keys.clear();
    this.controls.unlock();
    this.tracker.collapse();
    this.indicator.hidden = true;
    this.selector.showModal();
    this.choices.firstElementChild?.focus();
  }
  welcomeClosed(session) {
    if (!this.welcomeHandled && completedInitialWelcome(session)) {
      this.welcomeHandled = true;
      this.open();
    }
  }
  cancel() {
    this.route?.cancel();
    this.indicator.hidden = true;
    this.openButton.focus({ preventScroll: true });
  }
  update(position, yaw, zoneId, switching) {
    const arrived = this.route?.enter(zoneId);
    const hidden = !this.active || this.isOpen || this.dialogue.isOpen || switching;
    const restoreFocus = arrived && this.indicator.contains(document.activeElement);
    this.indicator.hidden = hidden;
    this.openButton.hidden = !this.route?.rooms.length || this.dialogue.isOpen || this.isOpen || switching;
    if (restoreFocus) this.openButton.focus({ preventScroll: true });
    if (hidden) return;
    if (this.name.textContent !== this.route.destination.label) this.name.textContent = this.route.destination.label;
    const target = this.route.waypoint(position, zoneId);
    this.arrow.hidden = !target;
    const instruction = target ? 'Follow the arrow' : 'Return to the hallway to resume';
    if (this.instruction.textContent !== instruction) this.instruction.textContent = instruction;
    if (target) this.arrow.style.transform = `rotate(${directionAngle(position, target, yaw)}rad)`;
  }
}
