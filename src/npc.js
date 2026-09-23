// npc.js — places NPC markers in the 3D scene and watches for the player
// getting close. Each NPC starts as a floating scarlet badge, optionally
// replaced by a portrait image. Walk within its radius -> "Press E to talk"
// appears -> pressing E opens its dialogue.

import * as THREE from 'three';

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
  constructor(scene, dialogue) {
    this.scene = scene;
    this.dialogue = dialogue;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.npcs = [];
    this.nearest = null;
    this.promptEl = document.getElementById('interact-prompt');
    this.time = 0;

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.nearest && !this.dialogue.isOpen) {
        this.dialogue.start(this.nearest.data);
      }
    });
  }

  setNPCs(list) {
    this.group.clear();
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
      sprite.scale.setScalar(0.45);
      sprite.position.set(data.position[0], data.position[1] ?? 1.6, data.position[2]);
      this.group.add(sprite);
      return { data, sprite, baseY: sprite.position.y };
    });
  }

  update(playerPos) {
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
      const radius = npc.data.radius ?? 2.0;
      if (dist < radius && dist < best) {
        best = dist;
        this.nearest = npc;
      }
    }

    this.promptEl.style.display =
      this.nearest && !this.dialogue.isOpen ? 'block' : 'none';
  }
}
