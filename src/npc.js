// npc.js — places NPC markers in the 3D scene and watches for the player
// getting close. Each NPC starts as a floating scarlet badge, optionally
// replaced by a portrait image. Walk within its radius -> "Press E to talk"
// appears -> pressing E opens its dialogue.

import * as THREE from 'three';
import { firstUnfinishedNPCInZone } from './interaction-tracker.js';
import { directionAngle } from './room-navigation.js';

const MIN_MARKER_SCALE = 0.32;
const MAX_MARKER_SCALE = 0.65;
const MARKER_SCALE_PER_METER = 0.04;

function makeBadgeTexture(label) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#CC0033';
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 136);
  return new THREE.CanvasTexture(c);
}

export class NPCManager {
  constructor(scene, dialogue, {
    isCompleted = () => false,
    isInteractionBlocked = () => false,
    isDirectionSuppressed = () => false,
    getGuidance = null,
  } = {}) {
    this.scene = scene;
    this.dialogue = dialogue;
    this.isCompleted = isCompleted;
    this.isInteractionBlocked = isInteractionBlocked;
    this.isDirectionSuppressed = isDirectionSuppressed;
    this.getGuidance = getGuidance;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.npcs = [];
    this.nearest = null;
    this.promptEl = document.getElementById('interact-prompt');
    this.directionEl = document.getElementById('guide-direction');
    this.directionArrowEl = document.getElementById('guide-direction-arrow');
    this.directionNameEl = document.getElementById('guide-direction-name');
    this.directionDistanceEl = document.getElementById('guide-direction-distance');
    this.directionTargetId = null;
    this.directionDistance = null;
    this.directionAngle = null;
    this.time = 0;

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.nearest && !this.dialogue.isOpen && !this.isInteractionBlocked()) {
        this.dialogue.start(this.nearest.data);
      }
    });
  }

  setNPCs(list, zoneId = null) {
    for (const npc of this.npcs) {
      npc.sprite.material.map?.dispose();
      npc.sprite.material.dispose();
    }
    this.group.clear();
    this.zoneId = zoneId;
    this.nearest = null;
    this.directionEl.hidden = true;
    this.directionTargetId = null;
    this.directionDistance = null;
    this.directionAngle = null;
    this.npcs = list.map((data) => {
      const markerLabel = data.markerLabel ?? (data.name ?? '?')[0].toUpperCase();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeBadgeTexture(markerLabel),
        transparent: true,
        depthTest: true
      }));
      if (data.markerImage) {
        new THREE.TextureLoader().load(data.markerImage, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          sprite.material.map.dispose();
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
        }, undefined, (error) => {
          console.warn(`Could not load NPC marker image: ${data.markerImage}`, error);
        });
      }
      sprite.scale.setScalar(MIN_MARKER_SCALE);
      sprite.position.set(data.position[0], data.position[1] ?? 1.6, data.position[2]);
      this.group.add(sprite);
      return { data, sprite, baseY: sprite.position.y };
    });
  }

  update(playerPos, viewYaw = 0) {
    this.time += 0.016;
    this.nearest = null;
    let best = Infinity;

    for (const npc of this.npcs) {
      // Gentle bob so markers are easy to spot (an accessibility requirement:
      // interactions must be visible, never hidden).
      npc.sprite.position.y = npc.baseY + Math.sin(this.time * 2 + npc.baseY) * 0.05;

      const dx = npc.sprite.position.x - playerPos.x;
      const dz = npc.sprite.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      const markerScale = THREE.MathUtils.clamp(
        MIN_MARKER_SCALE + dist * MARKER_SCALE_PER_METER,
        MIN_MARKER_SCALE,
        MAX_MARKER_SCALE
      );
      npc.sprite.scale.setScalar(markerScale);

      const radius = npc.data.radius ?? 2.0;
      if (dist < radius && dist < best) {
        best = dist;
        this.nearest = npc;
      }
    }

    this.promptEl.style.display =
      this.nearest && !this.dialogue.isOpen && !this.isInteractionBlocked() ? 'block' : 'none';

    let target;
    if (this.zoneId === 'hallway') target = null;
    else if (this.getGuidance) target = this.getGuidance(playerPos);
    else {
      // Standalone callers use the shared ordering helper too.
      const next = firstUnfinishedNPCInZone(
        [{ id: this.zoneId, npcs: this.npcs.map(npc => npc.data) }], this.zoneId, this.isCompleted
      );
      const npc = this.npcs.find(candidate => candidate.data.id === next?.npcId);
      if (npc) target = { id: next.npcId, label: next.label, position: npc.sprite.position, radius: npc.data.radius ?? 2 };
    }
    if (target && !this.npcs.some(npc => npc.data.id === target.id)) target = null;
    const distance = target ? Math.hypot(target.position.x - playerPos.x, target.position.z - playerPos.z) : 0;
    const showDirection = target && distance >= target.radius && !this.dialogue.isOpen
      && !this.isDirectionSuppressed() && !this.isInteractionBlocked();
    const directionHidden = !showDirection;
    if (this.directionEl.hidden !== directionHidden) {
      this.directionEl.hidden = directionHidden;
    }
    if (!showDirection) return;

    const wrappedAngle = directionAngle(playerPos, target.position, Number.isFinite(viewYaw) ? viewYaw : 0);
    if (this.directionAngle === null || Math.abs(wrappedAngle - this.directionAngle) > 0.001) {
      this.directionArrowEl.style.transform = `rotate(${wrappedAngle}rad)`;
      this.directionAngle = wrappedAngle;
    }

    if (this.directionTargetId !== target.id) {
      this.directionNameEl.textContent = target.label;
      this.directionTargetId = target.id;
    }

    const roundedDistance = Math.max(1, Math.round(distance));
    const distanceText = `${roundedDistance} m`;
    if (this.directionDistance !== distanceText) {
      this.directionDistanceEl.textContent = distanceText;
      this.directionDistance = distanceText;
    }
  }
}
