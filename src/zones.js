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

  disposeCurrentGroup() {
    if (!this.currentGroup) return;

    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.currentGroup.traverse((object) => {
      if (object instanceof SplatMesh) {
        object.dispose();
        return;
      }

      if (object.geometry?.dispose) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) {
        if (material?.map?.dispose) textures.add(material.map);
        if (material?.dispose) materials.add(material);
      }
    });

    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    this.scene.remove(this.currentGroup);
    this.currentGroup.clear();
    this.currentGroup = null;
  }

  async loadZone(zoneId) {
    const zone = this.config.zones.find(z => z.id === zoneId);
    if (!zone) throw new Error(`Unknown zone "${zoneId}"`);

    // Release the previous zone's GPU and Three.js resources before replacing it.
    this.disposeCurrentGroup();

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
        const mesh = new SplatMesh({
          url: zone.splat,
          lod: true,
        });
        await mesh.initialized;

        // Splat files land in an arbitrary coordinate space: COLMAP recovers
        // geometry only up to an unknown scale, and splatfacto trains with
        // auto_scale_poses=True, which rescales it again. `rotation` and
        // `scale` below correct that back to our convention of 1 unit = 1
        // metre with the floor at y=0 — edit these values in zones.json and
        // reload instead of re-baking and re-exporting the splat file.
        //
        // Apply order: scale, then rotation, then position (origin).
        const scale = zone.scale ?? 1;
        const [rx, ry, rz] = zone.rotation ?? [0, 0, 0];
        mesh.scale.setScalar(scale);
        mesh.rotation.set(
          THREE.MathUtils.degToRad(rx),
          THREE.MathUtils.degToRad(ry),
          THREE.MathUtils.degToRad(rz)
        );
        if (zone.origin) mesh.position.set(...zone.origin);

        group.add(mesh);
        if (zone.debugCollision) this.buildCollisionDebug(group, zone);
        console.info(
          `Loaded splat for zone "${zone.id}" from ${zone.splat}`,
          `(scale=${scale}, rotation=[${rx}, ${ry}, ${rz}]deg, origin=${JSON.stringify(zone.origin ?? [0, 0, 0])})`
        );
      } catch (err) {
        console.warn(`Splat failed for zone "${zone.id}", using placeholder.`, err);
        this.buildPlaceholder(group, zone);
      }
    } else {
      this.buildPlaceholder(group, zone);
    }

    this.buildSigns(group, zone);
    this.scene.add(group);
    this.current = zone;
    this.currentGroup = group;
    return zone;
  }

  buildSigns(group, zone) {
    for (const sign of zone.signs ?? []) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 360;
      const context = canvas.getContext('2d');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#cc0033';
      context.lineWidth = 24;
      context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
      context.fillStyle = '#cc0033';
      context.fillRect(54, 172, canvas.width - 108, 8);

      context.fillStyle = '#171717';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = 'bold 72px system-ui, sans-serif';
      context.fillText(sign.title, canvas.width / 2, 112, canvas.width - 108);
      context.font = '44px system-ui, sans-serif';
      context.fillText(sign.subtitle, canvas.width / 2, 250, canvas.width - 108);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.FrontSide,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      });
      const [width, height] = sign.size ?? [1.2, 0.42];
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        material
      );
      mesh.name = `sign-${sign.id}`;
      mesh.position.set(...sign.position);
      const [rx, ry, rz] = sign.rotation ?? [0, 0, 0];
      mesh.rotation.set(
        THREE.MathUtils.degToRad(rx),
        THREE.MathUtils.degToRad(ry),
        THREE.MathUtils.degToRad(rz)
      );
      group.add(mesh);
    }
  }

  // Temporary alignment overlay: draw the same AABBs used by collision
  // over a loaded splat. These meshes do not participate in movement checks.
  buildCollisionDebug(group, zone) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.2, wireframe: true,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide
    });
    for (const box of zone.collision ?? []) {
      const w = box.max[0] - box.min[0];
      const h = box.max[1] - box.min[1];
      const d = box.max[2] - box.min[2];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(
        box.min[0] + w / 2, box.min[1] + h / 2, box.min[2] + d / 2
      );
      mesh.renderOrder = 1;
      group.add(mesh);
    }
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
