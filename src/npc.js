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
  ctx.font = label.length > 1 ? 'bold 94px system-ui, sans-serif' : 'bold 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 136);
  return new THREE.CanvasTexture(c);
}

// Optional source-pixel square framing: originals stay unchanged on disk.
// Negative offsets permit padding a tightly cropped head instead of clipping it.
function framePortrait(texture, frame) {
  if (!frame || !texture.image) return texture;
  const [x, y, size, background] = frame;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const ratio = canvas.width / size;
  ctx.drawImage(texture.image, -x * ratio, -y * ratio,
    texture.image.width * ratio, texture.image.height * ratio);
  const framed = new THREE.CanvasTexture(canvas);
  texture.dispose();
  return framed;
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
    // An unmeasured stop can be registered in progress without a guessed marker.
    this.npcs = list.filter(data => data.position != null).map((data) => {
      const markerLabel = data.markerLabel ?? (data.name ?? '?')[0].toUpperCase();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeBadgeTexture(markerLabel),
        transparent: true,
        // Clip badge corners without dropping the original depth footprint:
        // Spark's later splats must still respect the visible badge pixels.
        ...(!data.markerImage && markerLabel.length > 1 ? { alphaTest: 0.1 } : {}),
        depthTest: true
      }));
      if (data.markerImage) {
        // Clip the sprite itself so both portraits and failed-image badges have
        // transparent corners that cannot write a square into the depth buffer.
        // Keep the original image/UVs and the existing depth test/write behavior.
        sprite.material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            vec2 markerOffset = vMapUv - vec2(0.5);
            if (dot(markerOffset, markerOffset) > 0.25) discard;`
          );
        };
        sprite.material.customProgramCacheKey = () => 'circular-npc-marker-v1';
        new THREE.TextureLoader().load(data.markerImage, (texture) => {
          texture = framePortrait(texture, data.markerFrame);
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
