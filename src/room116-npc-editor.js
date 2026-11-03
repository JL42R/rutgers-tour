// Loaded only through the opt-in development recorder. No splat raycasting.
const TARGETS = [
  'Soccer Ball Machine', 'Small Trailer Movement System', 'Folding Machine',
  'Car Simulator', '3D Scanner and Printer', 'Cobots',
];
const copyPosition = position => position ? [...position] : null;

export function cameraOffset(position, yaw, forward = 0, right = 0) {
  return [-Math.sin(yaw) * forward + Math.cos(yaw) * right + position.x,
    position.y, -Math.cos(yaw) * forward - Math.sin(yaw) * right + position.z];
}

// Shared zone data drives dialogue proximity and guidance as well as the sprites.
export function createRoom116Placement({ camera, controls, zones, npcs }) {
  let originals = null;
  const zone = () => zones.current?.id === 'project-studio' ? zones.current : null;
  const entries = () => zone()?.npcs.filter(npc => /^room116-project-[1-6]$/.test(npc.id)) ?? [];
  function capture() {
    if (!originals && entries().length) originals = new Map(entries().map(npc => [npc.id, copyPosition(npc.position)]));
  }
  function move(id, position) {
    capture();
    const npc = entries().find(entry => entry.id === id);
    if (!npc || (position !== null && (position.length !== 3 || !position.every(Number.isFinite)))) return false;
    npc.position = copyPosition(position);
    const marker = npcs.npcs.find(entry => entry.data.id === id);
    if (marker && position) {
      marker.baseY = position[1];
      marker.sprite.position.set(...position);
      npcs.nearest = null;
    } else {
      // Create the actual P6 sprite on first placement, or remove it on restore.
      npcs.setNPCs(zone().npcs, zone().id);
    }
    return true;
  }
  return {
    entries, capture, move,
    place(id, forward) {
      return move(id, cameraOffset(camera.position, controls.yaw, forward));
    },
    nudge(id, forward, right, up = 0) {
      const npc = entries().find(entry => entry.id === id);
      if (!npc?.position) return false;
      const [x, y, z] = npc.position;
      const position = cameraOffset({ x, y, z }, controls.yaw, forward, right);
      position[1] += up;
      return move(id, position);
    },
    restore(id) {
      capture();
      return originals?.has(id) ? move(id, originals.get(id)) : false;
    },
    export() {
      capture();
      return {
        format: 'rutgers-room116-npc-positions-v1', zoneId: 'project-studio',
        instructions: 'Apply only position fields to matching NPC IDs in public/zones.json after visual approval.',
        npcs: entries().map(npc => ({ id: npc.id, position: copyPosition(npc.position),
          originalPosition: copyPosition(originals.get(npc.id)) })),
      };
    },
  };
}

export function installRoom116NPCEditor({ camera, controls, zones, dialogue, npcs, target = document }) {
  const placement = createRoom116Placement({ camera, controls, zones, npcs });
  const launcher = document.createElement('button');
  launcher.textContent = 'Position Room 116 NPCs (O)';
  launcher.style.cssText = 'position:fixed;top:90px;right:16px;z-index:1000;padding:10px';
  launcher.hidden = true;
  document.body.appendChild(launcher);
  const panel = document.createElement('dialog');
  panel.setAttribute('aria-label', 'Room 116 NPC positioning');
  panel.style.cssText = 'position:fixed;inset:12px 12px auto auto;margin:0;width:300px;max-width:85vw;max-height:85vh;overflow:auto;background:#20232a;color:white;border:2px solid white;border-radius:8px;padding:16px';
  document.body.appendChild(panel);
  const add = (tag, text) => {
    const el = document.createElement(tag); el.textContent = text; panel.appendChild(el); return el;
  };
  add('h2', 'Position Room 116 NPCs');
  add('p', 'Walk and face a machine, press O, then place and adjust. Directions follow your current facing.');
  const label = add('label', 'Choose NPC ');
  const select = document.createElement('select'); label.appendChild(select);
  TARGETS.forEach((name, index) => {
    const option = document.createElement('option');
    option.value = `room116-project-${index + 1}`;
    option.textContent = `P${index + 1} - ${name}`; select.appendChild(option);
  });
  select.value = 'room116-project-1';
  const status = add('p', ''); status.setAttribute('role', 'status');
  const readout = add('p', '');
  const refresh = () => {
    const npc = placement.entries().find(entry => entry.id === select.value);
    readout.textContent = npc?.position ? `Position: ${npc.position.map(n => n.toFixed(2)).join(', ')}` : 'Not placed yet';
  };
  const button = (text, action) => {
    const el = add('button', text); el.type = 'button';
    el.style.cssText = 'padding:8px;margin:4px;font:inherit';
    el.addEventListener('click', action); return el;
  };
  const change = action => {
    status.textContent = action() ? 'Marker updated live. Save Positions before refreshing.' : 'Place this NPC first.';
    refresh();
  };
  button('Place Here', () => change(() => placement.place(select.value, 0)));
  button('Place 1 m Ahead', () => change(() => placement.place(select.value, 1)));
  add('p', 'Fine adjustments: 10 cm per click');
  for (const [text, forward, right, up] of [
    ['Forward', .1, 0, 0], ['Back', -.1, 0, 0], ['Left', 0, -.1, 0], ['Right', 0, .1, 0],
    ['Higher', 0, 0, .1], ['Lower', 0, 0, -.1],
  ]) button(text, () => change(() => placement.nudge(select.value, forward, right, up)));
  button('Restore Selected', () => change(() => placement.restore(select.value)));
  button('Restore All', () => {
    for (const npc of placement.entries()) placement.restore(npc.id);
    status.textContent = 'Original positions restored.'; refresh();
  });
  const outputLabel = add('label', 'Position export (read only)');
  const output = document.createElement('textarea'); output.readOnly = true;
  output.rows = 5; output.style.width = '100%'; outputLabel.appendChild(output);
  button('Save Positions', () => {
    output.value = JSON.stringify(placement.export(), null, 2);
    const url = URL.createObjectURL(new Blob([output.value], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'room116-npc-positions.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Downloaded positions and originals. Send the JSON to Codex to apply after review.';
  });
  button('Copy Positions', async () => {
    output.value = JSON.stringify(placement.export(), null, 2);
    try {
      await navigator.clipboard.writeText(output.value);
      status.textContent = 'Copied all six positions and originals.';
    } catch {
      output.focus(); output.select();
      status.textContent = 'Press Ctrl+C to copy the selected export, or use Save Positions.';
    }
  });
  add('p', 'Edits remain in this tour session when you walk or change rooms. Reloading discards them. Saving downloads JSON; it does not change project files.');
  button('Walk / Close (Esc)', () => panel.close());
  let paused = false;
  const close = () => {
    if (!paused) return;
    paused = false; controls.keys.clear();
    if (!dialogue.isOpen) controls.enabled = true;
    launcher.focus();
  };
  panel.addEventListener('close', close);
  function open() {
    if (zones.current?.id !== 'project-studio' || dialogue.isOpen || !controls.enabled || panel.open) return;
    placement.capture(); controls.keys.clear(); controls.unlock();
    controls.enabled = false; paused = true;
    panel.showModal(); refresh(); select.focus();
  }
  launcher.addEventListener('click', open);
  select.addEventListener('change', refresh);
  const key = event => {
    if (event.code !== 'KeyO' || event.repeat || event.isComposing || event.ctrlKey || event.altKey
      || event.metaKey || event.shiftKey || event.target?.isContentEditable
      || event.target?.closest?.('input, textarea, select, button, [role="textbox"]')) return;
    open();
  };
  target.addEventListener('keydown', key);
  return {
    update() {
      const inRoom = zones.current?.id === 'project-studio';
      launcher.hidden = !inRoom || dialogue.isOpen || !controls.enabled;
      if (!inRoom && panel.open) panel.close();
      if (inRoom) placement.capture();
    },
    dispose() {
      if (panel.open) panel.close();
      target.removeEventListener('keydown', key); launcher.remove(); panel.remove();
    },
  };
}
