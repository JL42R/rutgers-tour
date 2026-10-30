import { createEquipmentEditor } from './equipment-editor.js';

// Opt-in mapping tools; snapshots use aligned world metres, not splat coordinates.
export const debugEquipment = new URLSearchParams(window.location.search).has('debugEquipment');
export const equipmentPlaceholder = debugEquipment
  && new URLSearchParams(window.location.search).has('equipmentPlaceholder');

export function installEquipmentDebug({ camera, controls, zones, dialogue }) {
  if (!debugEquipment) return;
  const recordSample = createEquipmentEditor({ camera, controls, zones, dialogue });

  console.info('[Equipment debug] Enter the printing room, then press P for world coordinates. Cyan boxes show existing collisions.');
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.code !== 'KeyP' || event.repeat || event.isComposing
      || event.ctrlKey || event.altKey || event.metaKey
      || dialogue.isOpen || !controls.enabled || zones.current?.id !== 'printing-room'
      || target?.isContentEditable
      || target?.closest?.('input, textarea, select, [role="textbox"]')) return;

    const { x, y, z } = camera.position;
    const yawDegrees = ((controls.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const sample = {
      zone: zones.current.id,
      x, y, z, yawDegrees,
    };
    console.info('[Equipment debug]', JSON.stringify(sample));
    recordSample(sample);
  });
}
