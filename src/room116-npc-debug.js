import { createRoom116Boundary, isRoom116PositionAllowed } from './room116-boundary.js';
import { installRoom116NPCEditor } from './room116-npc-editor.js';

// Imported only in Vite development mode. P is scoped to Room 116 so the
// printing-room equipment recorder keeps its existing shortcut.
export function installRoom116NPCDebug({ camera, controls, zones, dialogue, npcs,
  search = window.location.search, target = document, log = console.info }) {
  if (new URLSearchParams(search).get('debugRoom116NPCs') !== '1') return;
  log('[Room 116 NPC debug] In Project Studio, press P to record world position and heading. No files are changed.');
  const record = event => {
    if (event.code !== 'KeyP' || event.repeat || event.isComposing
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
      || !controls.enabled || dialogue.isOpen || zones.current?.id !== 'project-studio'
      || event.target?.isContentEditable
      || event.target?.closest?.('input, textarea, select, button, [role="textbox"]')) return;
    const { x, y, z } = camera.position;
    const position = [x, y, z].map(value => Number(value.toFixed(6)));
    const yawDegrees = Number((((controls.yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(3));
    const allowed = isRoom116PositionAllowed({ x, z }, createRoom116Boundary(zones.current));
    log('[Room 116 NPC position]', JSON.stringify({ zone: zones.current.id,
      x: position[0], y: position[1], z: position[2], position, yawDegrees,
      headingConvention: '0 = -Z, 90 = -X, 180 = +Z, 270 = +X',
      allowed, provisional: true }));
  };
  target.addEventListener('keydown', record);
  const editor = npcs ? installRoom116NPCEditor({ camera, controls, zones, dialogue, npcs, target }) : null;
  const dispose = () => {
    target.removeEventListener('keydown', record);
    editor?.dispose();
  };
  dispose.update = () => editor?.update();
  return dispose;
}
