import { parseEquipmentDrafts, draftFromSamples, assertDraftClearance } from './equipment-drafts.js';

export function createEquipmentEditor({ camera, controls, zones, dialogue }) {
  const panel = document.createElement('details');
  panel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:5;width:min(410px,90vw);max-height:75vh;overflow:auto;background:#17171f;color:white;padding:12px;font:14px system-ui;';
  panel.innerHTML = `
    <summary>Equipment drafts (debug only)</summary>
    <p>Cyan: production walls. Orange: drafts. Press P twice near opposite corners,
    then create a draft. Samples are player centres, not equipment surfaces.</p>
    <label>Box ID <input data-id value="" placeholder="e.g. bambu-bench"></label>
    <label>Measured height (m) <input data-height type="number" min="0" step="0.01"></label>
    <p data-samples>No samples recorded this visit.</p>
    <button data-create type="button">Draft from last two P samples</button>
    <label style="display:block">Draft boxes (world metres)
      <textarea data-boxes rows="9" spellcheck="false" style="width:100%;box-sizing:border-box">[]</textarea>
    </label>
    <p>Edit min/max to match measured faces. Keep one box per continuous bench.
    The orange outline is the physical box; movement adds 0.35 m clearance.</p>
    <button data-apply type="button">Apply visual preview</button>
    <label><input data-collide type="checkbox"> Test draft collisions</label>
    <button data-export type="button">Download drafts and samples</button>
    <p data-status role="status">No production equipment boxes have been added.</p>`;
  document.body.appendChild(panel);
  const find = (selector) => panel.querySelector(selector);
  const editor = find('[data-boxes]');
  const collide = find('[data-collide]');
  const status = find('[data-status]');
  const samples = [];
  let applied = [];
  const key = 'rutgers-printing-room-equipment-drafts-v1';
  try { editor.value = localStorage.getItem(key) ?? '[]'; } catch { /* Storage may be disabled. */ }

  // Editing must not feed WASD/E/number shortcuts to the tour underneath.
  for (const type of ['keydown', 'keyup']) panel.addEventListener(type, (event) => event.stopPropagation());
  panel.addEventListener('focusin', () => {
    controls.keys.clear();
    controls.unlock();
  });
  panel.addEventListener('toggle', () => controls.keys.clear());
  const run = (operation) => {
    try {
      if (zones.current?.id !== 'printing-room' || dialogue.isOpen || !controls.enabled) {
        throw new Error('Close dialogue and enter the printing room first.');
      }
      operation();
    } catch (error) { status.textContent = error.message; }
  };
  find('[data-create]').addEventListener('click', () => run(() => {
    if (samples.length < 2) throw new Error('Record two P samples first.');
    const draft = draftFromSamples(find('[data-id]').value.trim(), samples.at(-2), samples.at(-1),
      Number(find('[data-height]').value));
    const boxes = parseEquipmentDrafts(editor.value);
    editor.value = JSON.stringify(parseEquipmentDrafts(JSON.stringify([...boxes, draft])), null, 2);
    status.textContent = 'Draft created in editor. Correct observation-point offsets, then apply preview.';
  }));
  find('[data-apply]').addEventListener('click', () => run(() => {
    const boxes = parseEquipmentDrafts(editor.value);
    zones.setEquipmentDrafts(boxes, false);
    applied = boxes;
    collide.checked = false;
    try { localStorage.setItem(key, JSON.stringify(boxes)); } catch { /* Download remains available. */ }
    status.textContent = `${boxes.length} orange drafts shown. Collisions OFF. Saved locally when storage is available.`;
  }));
  collide.addEventListener('change', () => {
    const enable = collide.checked;
    collide.checked = false;
    // Recovery must work even during dialogue or after stepping into the hallway.
    if (!enable) {
      zones.testEquipmentCollisions = false;
      status.textContent = 'Draft collisions OFF.';
      return;
    }
    run(() => {
      if (enable) assertDraftClearance(applied, zones.current, camera.position);
      zones.setEquipmentDrafts(applied, enable);
      collide.checked = enable;
      status.textContent = enable
        ? 'Draft collisions ON. Manually check the aisle, every NPC, sliding, and doorway. Uncheck to recover.'
        : 'Draft collisions OFF.';
    });
  });
  find('[data-export]').addEventListener('click', () => {
    try {
      const data = { zone: 'printing-room', coordinateSystem: 'hallway-aligned world metres',
        verified: false, boxes: parseEquipmentDrafts(editor.value), samples };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'printing-room-equipment-drafts.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Downloaded unverified drafts and this visit’s samples.';
    } catch (error) { status.textContent = error.message; }
  });
  return (sample) => {
    samples.push(sample);
    find('[data-samples]').textContent = `${samples.length} samples recorded. Last: X=${sample.x.toFixed(3)}, Z=${sample.z.toFixed(3)}.`;
  };
}
