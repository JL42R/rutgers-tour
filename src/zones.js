// zones.js — loads zones described in public/zones.json.
// A zone is one captured area (lobby, hallway, lab...). Each zone has:
//   - a splat file (the photorealistic scan), OR "placeholder": true while
//     no scan exists yet — then we build a simple gray room from the
//     collision boxes so navigation and NPCs are testable immediately.
//   - collision boxes (invisible walls)
//   - NPCs

import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';

export class ZoneManager {
  constructor(scene) {
    this.scene = scene;
    this.config = null;
    this.current = null;        // zone data currently loaded
    this.currentGroup = null;   // THREE.Group holding the zone's objects
  }

  async loadConfig(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not fetch ${url}`);
    this.config = await res.json();
    return this.config;
  }

  getCollisionBoxes() {
    return this.current?.collision ?? [];
  }

  async loadZone(zoneId) {
    const zone = this.config.zones.find(z => z.id === zoneId);
    if (!zone) throw new Error(`Unknown zone "${zoneId}"`);

    // Remove the previous zone's objects, if any.
    if (this.currentGroup) {
      this.scene.remove(this.currentGroup);
      this.currentGroup = null;
    }

    const group = new THREE.Group();
    group.name = `zone-${zone.id}`;

    if (zone.splat && !zone.placeholder) {
      // Real captured scene: Spark loads the splat file and renders it
      // like any other Three.js object.
      //
      // `new SplatMesh({ url })` returns immediately and keeps loading the
      // file in the background — a 404 or corrupt file won't throw here,
      // it surfaces later on `mesh.initialized`, a promise that resolves
      // once the file is loaded and REJECTS if loading fails. We have to
      // await it inside this try so a load failure actually reaches our
      // catch, instead of failing silently after this function has
      // already returned.
      try {
        const mesh = new SplatMesh({ url: zone.splat });
        await mesh.initialized;
        if (zone.origin) mesh.position.set(...zone.origin);
        if (zone.rotation) mesh.quaternion.set(...zone.rotation);
        group.add(mesh);
        console.info(`Loaded splat for zone "${zone.id}" from ${zone.splat}`);
      } catch (err) {
        console.warn(`Splat failed for zone "${zone.id}", using placeholder.`, err);
        this.buildPlaceholder(group, zone);
      }
    } else {
      this.buildPlaceholder(group, zone);
    }

    this.scene.add(group);
    this.current = zone;
    this.currentGroup = group;
    return zone;
  }

  // A stand-in room: grid floor + translucent boxes where the collision
  // walls are. Replace by adding a splat file and removing "placeholder".
  buildPlaceholder(group, zone) {
    const size = zone.placeholderSize ?? [12, 12];

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshStandardMaterial({ color: 0x24242c })
    );
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    const grid = new THREE.GridHelper(Math.max(...size), Math.max(...size), 0xcc0033, 0x3a3a44);
    grid.position.y = 0.01;
    group.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x555566, transparent: true, opacity: 0.6
    });
    for (const box of zone.collision ?? []) {
      const w = box.max[0] - box.min[0];
      const h = box.max[1] - box.min[1];
      const d = box.max[2] - box.min[2];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      mesh.position.set(
        box.min[0] + w / 2, box.min[1] + h / 2, box.min[2] + d / 2
      );
      group.add(mesh);
    }
  }
}
