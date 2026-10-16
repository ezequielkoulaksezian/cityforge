import * as THREE from "three";
import { hash2 } from "../sim/random";
import { K, T } from "../sim/types";
import { isRail, isRoad, type World } from "../sim/world";
import { FIRE_COVERED } from "../sim/disasters";
import { buildingParts, chimneyTops } from "./buildings";
import { PartSet, Pool, type Part } from "./pool";

export type OverlayId =
  | "none"
  | "power"
  | "pollution"
  | "landValue"
  | "crime"
  | "traffic"
  | "density"
  | "police"
  | "fire";

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const tileColor = new THREE.Color();

/** Draws the whole city from the World and keeps it in sync using the world's revision counters. */
export class CityView {
  readonly group = new THREE.Group();
  private readonly size: number;
  private readonly half: number;

  private ground: THREE.InstancedMesh;
  private water: THREE.Mesh;
  private networks: PartSet;
  private nature: PartSet;
  private buildings: PartSet;
  private wires: THREE.LineSegments;
  private fires: Pool;
  private cars: Pool;
  private flags: Pool;
  private trucks: Pool;
  private actorsGroup = new THREE.Group();
  private smoke: THREE.Points;
  private smokeEmitters: [number, number, number][] = [];
  private overlayMesh: THREE.Mesh;
  private overlayTex: THREE.DataTexture;
  private overlayData: Uint8Array;
  overlay: OverlayId = "none";

  private seen = { terrain: -1, structures: -1, buildings: -1, maps: -1, fire: -1 };
  private roadCars: { x: number; z: number; dx: number; dz: number; phase: number; speed: number; color: number }[] = [];
  private fireTiles: number[] = [];
  private unpowered: [number, number][] = [];

  constructor(private world: World) {
    this.size = world.size;
    this.half = world.size / 2;

    // Ground: one box per tile, colored per instance.
    const tileGeo = new THREE.BoxGeometry(1, 1, 1);
    tileGeo.translate(0, -0.5, 0);
    const n = this.size * this.size;
    this.ground = new THREE.InstancedMesh(
      tileGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }),
      n,
    );
    this.ground.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    // Base under the map so its edges look solid.
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(this.size + 0.4, 3, this.size + 0.4),
      new THREE.MeshStandardMaterial({ color: "#5b4a3a", roughness: 1 }),
    );
    base.position.y = -2.4;
    this.group.add(base);

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size, this.size),
      new THREE.MeshStandardMaterial({
        color: "#3a86c0",
        transparent: true,
        opacity: 0.82,
        roughness: 0.18,
        metalness: 0.15,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.14;
    this.water.receiveShadow = true;
    this.group.add(this.water);

    this.networks = new PartSet(this.group, false);
    this.nature = new PartSet(this.group, true);
    this.buildings = new PartSet(this.group, true);
    this.fires = new Pool(this.group, "cone", 256, false);
    this.cars = new Pool(this.group, "box", 1024, false);
    this.flags = new Pool(this.group, "box", 128, false);
    this.trucks = new Pool(this.group, "box", 128, false);

    this.wires = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: "#2b2b2b", transparent: true, opacity: 0.7 }),
    );
    this.group.add(this.wires);
    this.group.add(this.actorsGroup);

    // Smoke particles.
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(1200 * 3), 3));
    smokeGeo.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(1200), 1));
    const smokeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 1 } },
      vertexShader: `attribute float alpha; varying float vA; uniform float uScale;
        void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * (0.6 + (1.0 - alpha) * 1.4); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(0.62), vA * 0.5 * (1.0 - d * 2.0)); }`,
    });
    this.smoke = new THREE.Points(smokeGeo, smokeMat);
    this.smoke.frustumCulled = false;
    this.group.add(this.smoke);

    // Overlay texture laid over the ground.
    this.overlayData = new Uint8Array(n * 4);
    this.overlayTex = new THREE.DataTexture(this.overlayData, this.size, this.size, THREE.RGBAFormat);
    this.overlayTex.magFilter = THREE.NearestFilter;
    this.overlayTex.minFilter = THREE.LinearFilter;
    this.overlayTex.flipY = false;
    this.overlayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size, this.size),
      new THREE.MeshBasicMaterial({ map: this.overlayTex, transparent: true, depthWrite: false }),
    );
    this.overlayMesh.rotation.x = -Math.PI / 2;
    this.overlayMesh.position.y = 0.08;
    this.overlayMesh.renderOrder = 2;
    this.overlayMesh.visible = false;
    this.group.add(this.overlayMesh);
  }

  /** World coordinate of a tile's top-left corner. */
  private wx(x: number): number {
    return x - this.half;
  }

  setWorld(world: World): void {
    this.world = world;
    this.seen = { terrain: -1, structures: -1, buildings: -1, maps: -1, fire: -1 };
  }

  setOverlay(id: OverlayId): void {
    this.overlay = id;
    this.overlayMesh.visible = id !== "none";
    this.updateOverlay();
  }

  /** Rebuilds the layers whose revision changed. */
  sync(): void {
    const r = this.world.rev;
    if (r.terrain !== this.seen.terrain || r.structures !== this.seen.structures) this.updateGround();
    if (r.structures !== this.seen.structures) this.updateNetworks();
    if (r.terrain !== this.seen.terrain || r.structures !== this.seen.structures) this.updateNature();
    if (r.buildings !== this.seen.buildings || r.structures !== this.seen.structures) this.updateBuildings();
    if (r.maps !== this.seen.maps || r.structures !== this.seen.structures) {
      this.updateCars();
      this.updateIndicators();
      this.updateOverlay();
    }
    if (r.fire !== this.seen.fire) this.collectFires();
    this.seen = { ...r };
  }

  private updateGround(): void {
    const w = this.world;
    const m = new THREE.Matrix4();
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const i = w.idx(x, y);
        const terrain = w.terrain[i];
        const k = w.kind[i];
        const water = terrain === T.Water || w.flood[i] > 0;
        const v = hash2(x, y, 11) * 0.08 - 0.04;
        let top = 0;
        if (water && !(isRoad(k) && terrain === T.Water)) top = -0.45;
        if (water && isRoad(k)) top = 0;

        if (water && !isRoad(k)) tileColor.set("#2f6f9e");
        else if (isRoad(k)) tileColor.set(water ? "#8b8984" : "#50545a");
        else if (isRail(k)) tileColor.set("#857565");
        else if (k === K.Park) tileColor.set("#5fae4f");
        else if (k === K.Rubble) tileColor.set("#7d6d5c");
        else if (k === K.Radioactive) tileColor.set("#a5c93a");
        else if (k === K.Building) {
          const b = w.buildingAt(x, y)!;
          if (b.type === "R") tileColor.set(b.level ? "#a8b597" : "#8fc47a");
          else if (b.type === "C") tileColor.set(b.level ? "#a3a9b0" : "#84aed6");
          else if (b.type === "I") tileColor.set(b.level ? "#a09c8e" : "#d8c46a");
          else if (b.type === "airport") tileColor.set("#9da1a3");
          else if (b.type === "seaport") tileColor.set("#8d8f8a");
          else if (b.type === "stadium") tileColor.set("#a9a69c");
          else tileColor.set("#b3b0a6");
        } else if (terrain === T.Forest) tileColor.setRGB(0.3 + v, 0.47 + v, 0.24);
        else tileColor.setRGB(0.42 + v, 0.6 + v * 1.4, 0.3 + v);

        m.makeScale(1, 1, 1);
        m.setPosition(this.wx(x) + 0.5, top, this.wx(y) + 0.5);
        this.ground.setMatrixAt(i, m);
        this.ground.setColorAt(i, tileColor);
      }
    }
    this.ground.instanceMatrix.needsUpdate = true;
    this.ground.instanceColor!.needsUpdate = true;
  }

  private connections(x: number, y: number, test: (k: number) => boolean): boolean[] {
    const w = this.world;
    return DIRS.map(([dx, dy]) => w.inBounds(x + dx, y + dy) && test(w.kind[w.idx(x + dx, y + dy)]));
  }

  private updateNetworks(): void {
    const w = this.world;
    const parts: Part[] = [];
    const wire: number[] = [];
    const poleTop = 1.05;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const k = w.kind[w.idx(x, y)];
        const cx = this.wx(x) + 0.5;
        const cz = this.wx(y) + 0.5;
        if (isRoad(k)) {
          const c = this.connections(x, y, isRoad);
          const straightX = c[0] && c[2] && !c[1] && !c[3];
          const straightZ = c[1] && c[3] && !c[0] && !c[2];
          if (straightX || (!c[1] && !c[3] && (c[0] || c[2])))
            for (const o of [-0.25, 0.25]) parts.push({ shape: "box", x: cx + o, y: 0, z: cz, sx: 0.22, sy: 0.012, sz: 0.04, color: "#f1e9c8" });
          if (straightZ || (!c[0] && !c[2] && (c[1] || c[3])))
            for (const o of [-0.25, 0.25]) parts.push({ shape: "box", x: cx, y: 0, z: cz + o, sx: 0.04, sy: 0.012, sz: 0.22, color: "#f1e9c8" });
          if (w.isWater(x, y)) {
            // Bridge railings.
            const along = c[0] || c[2] ? "x" : "z";
            for (const o of [-0.46, 0.46])
              parts.push(
                along === "x"
                  ? { shape: "box", x: cx, y: 0, z: cz + o, sx: 1, sy: 0.12, sz: 0.05, color: "#c9c5bb" }
                  : { shape: "box", x: cx + o, y: 0, z: cz, sx: 0.05, sy: 0.12, sz: 1, color: "#c9c5bb" },
              );
          }
        }
        if (isRail(k) && !(w.isWater(x, y))) {
          let c = this.connections(x, y, isRail);
          if (!c.some(Boolean)) c = [true, false, true, false];
          DIRS.forEach(([dx, dy], d) => {
            if (!c[d]) return;
            const mx = cx + dx * 0.25;
            const mz = cz + dy * 0.25;
            for (const t of [0.12, 0.38]) {
              parts.push({
                shape: "box",
                x: cx + dx * t,
                y: 0,
                z: cz + dy * t,
                sx: dx ? 0.08 : 0.7,
                sy: 0.03,
                sz: dx ? 0.7 : 0.08,
                color: "#5a4636",
              });
            }
            for (const o of [-0.17, 0.17])
              parts.push({
                shape: "box",
                x: mx + (dy ? o : 0),
                y: 0.03,
                z: mz + (dx ? o : 0),
                sx: dx ? 0.5 : 0.04,
                sy: 0.03,
                sz: dx ? 0.04 : 0.5,
                color: "#9aa3aa",
              });
          });
        }
        if (k === K.Power || k === K.RoadPower || k === K.RailPower) {
          const px = cx + 0.32;
          const pz = cz + 0.32;
          parts.push({ shape: "cyl", x: px, y: 0, z: pz, sx: 0.06, sy: poleTop, sz: 0.06, color: "#6d5a45" });
          parts.push({ shape: "box", x: px, y: poleTop - 0.08, z: pz, sx: 0.3, sy: 0.04, sz: 0.04, color: "#6d5a45" });
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (!w.inBounds(nx, ny)) continue;
            const nk = w.kind[w.idx(nx, ny)];
            if (nk === K.Power || nk === K.RoadPower || nk === K.RailPower) {
              for (const o of [-0.12, 0.12]) {
                wire.push(px + (dy ? o : 0), poleTop - 0.06, pz + (dx ? o : 0));
                wire.push(px + dx + (dy ? o : 0), poleTop - 0.06, pz + dy + (dx ? o : 0));
              }
            }
          }
        }
      }
    }
    this.networks.set(parts);
    this.wires.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
    this.wires.geometry = g;
  }

  private updateNature(): void {
    const w = this.world;
    const parts: Part[] = [];
    const greens = ["#3f7d3a", "#4c8c3f", "#2f6b34", "#56923f"];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const i = w.idx(x, y);
        const k = w.kind[i];
        const forest = w.terrain[i] === T.Forest && k === K.None && !w.flood[i];
        const park = k === K.Park;
        if (!forest && !park) continue;
        const count = park ? 2 : 1 + (hash2(x, y, 5) > 0.55 ? 1 : 0);
        for (let t = 0; t < count; t++) {
          const jx = (hash2(x, y, 17 + t) - 0.5) * 0.55;
          const jz = (hash2(x, y, 31 + t) - 0.5) * 0.55;
          const h = 0.55 + hash2(x, y, 43 + t) * 0.45;
          const px = this.wx(x) + 0.5 + jx;
          const pz = this.wx(y) + 0.5 + jz;
          parts.push({ shape: "cyl", x: px, y: 0, z: pz, sx: 0.08, sy: h * 0.35, sz: 0.08, color: "#6b4f2e" });
          parts.push({
            shape: "cone",
            x: px,
            y: h * 0.25,
            z: pz,
            sx: h * 0.62,
            sy: h,
            sz: h * 0.62,
            color: greens[Math.floor(hash2(x, y, 57 + t) * greens.length)],
          });
        }
        if (park && hash2(x, y, 3) > 0.6) {
          parts.push({ shape: "box", x: this.wx(x) + 0.3, y: 0, z: this.wx(y) + 0.75, sx: 0.3, sy: 0.08, sz: 0.1, color: "#8d6e4c" });
        }
      }
    }
    this.nature.set(parts);
  }

  private updateBuildings(): void {
    const w = this.world;
    const parts: Part[] = [];
    this.smokeEmitters = [];
    for (const b of w.buildings.values()) {
      const ox = this.wx(b.x);
      const oz = this.wx(b.y);
      for (const p of buildingParts(b, ox, oz)) parts.push(p);
      if (b.level === 0 && (b.type === "R" || b.type === "C" || b.type === "I")) {
        // A small sign marks an undeveloped zone.
        const color = b.type === "R" ? "#2e9d4f" : b.type === "C" ? "#2f6fbd" : "#c79a12";
        parts.push({ shape: "cyl", x: ox + 1.5, y: 0, z: oz + 1.5, sx: 0.05, sy: 0.6, sz: 0.05, color: "#ddd" });
        parts.push({ shape: "box", x: ox + 1.5, y: 0.45, z: oz + 1.5, sx: 0.42, sy: 0.3, sz: 0.05, color });
      }
      if (b.powered) for (const e of chimneyTops(b, ox, oz)) this.smokeEmitters.push(e);
    }
    this.buildings.set(parts);
  }

  private updateCars(): void {
    const w = this.world;
    this.roadCars = [];
    const colors = [0xd84343, 0x3d7bd9, 0xf2f2f2, 0xf2c94c, 0x2d2d2d, 0x5bb36a];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const i = w.idx(x, y);
        if (!isRoad(w.kind[i])) continue;
        const traffic = w.traffic[i];
        if (traffic < 25) continue;
        const c = this.connections(x, y, isRoad);
        const dirs = DIRS.filter((_, d) => c[d]);
        if (!dirs.length) continue;
        const count = traffic > 170 ? 3 : traffic > 80 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const [dx, dz] = dirs[Math.floor(hash2(x, y, 70 + k) * dirs.length)];
          this.roadCars.push({
            x: this.wx(x) + 0.5,
            z: this.wx(y) + 0.5,
            dx,
            dz,
            phase: hash2(x, y, 90 + k),
            speed: traffic > 190 ? 0.15 : 0.5 + hash2(x, y, 99 + k) * 0.3,
            color: colors[Math.floor(hash2(x, y, 120 + k) * colors.length)],
          });
        }
      }
    }
  }

  private updateIndicators(): void {
    this.unpowered = [];
    for (const b of this.world.buildings.values()) {
      if (b.type === "coal" || b.type === "nuclear") continue;
      if (!b.powered) this.unpowered.push([this.wx(b.x) + b.size / 2, this.wx(b.y) + b.size / 2]);
    }
  }

  private collectFires(): void {
    this.fireTiles = [];
    const f = this.world.fire;
    for (let i = 0; i < f.length; i++) if (f[i]) this.fireTiles.push(i);
  }

  private updateOverlay(): void {
    if (this.overlay === "none") return;
    const w = this.world;
    const d = this.overlayData;
    d.fill(0);
    const set = (o: number, rgb: [number, number, number], alpha: number) => {
      d[o * 4] = rgb[0];
      d[o * 4 + 1] = rgb[1];
      d[o * 4 + 2] = rgb[2];
      d[o * 4 + 3] = alpha;
    };
    const ramp = (o: number, value: number, rgb: [number, number, number]) => {
      const a = value / 255;
      if (a >= 0.04) set(o, rgb, Math.round(a * 200));
    };
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const i = w.idx(x, y);
        // The plane's texture rows run bottom-up in world space.
        const o = (this.size - 1 - y) * this.size + x;
        switch (this.overlay) {
          case "power": {
            const k = w.kind[i];
            if (k === K.Building) set(o, w.buildings.get(w.bid[i])!.powered ? [255, 220, 40] : [230, 40, 40], 200);
            else if (k === K.Power || k === K.RoadPower || k === K.RailPower)
              set(o, w.power[i] ? [255, 220, 40] : [160, 120, 120], 200);
            break;
          }
          case "pollution":
            ramp(o, w.pollution[i], [150, 110, 40]);
            break;
          case "landValue": {
            const v = w.landValue[i];
            if (v) {
              const t = v / 250;
              set(o, [Math.round(220 * (1 - t)), Math.round(120 + 120 * t), 60], 150);
            }
            break;
          }
          case "crime":
            ramp(o, w.crime[i], [220, 30, 50]);
            break;
          case "traffic":
            if (isRoad(w.kind[i])) {
              const t = w.traffic[i] / 255;
              set(o, [Math.round(60 + 195 * Math.min(1, t * 2)), Math.round(200 * (1 - Math.max(0, t - 0.5) * 2)), 40], 220);
            }
            break;
          case "density":
            ramp(o, Math.min(255, w.density[i] * 1.5), [140, 60, 200]);
            break;
          case "police":
            ramp(o, w.policeCoverage[i], [40, 110, 240]);
            break;
          case "fire":
            ramp(o, w.fireCoverage[i], [245, 120, 30]);
            break;
        }
      }
    }
    this.overlayTex.needsUpdate = true;
  }

  /** Per-frame animation: water, fire, smoke, cars, warnings and disaster actors. */
  animate(time: number, zoom: number): void {
    const t = time / 1000;
    const waterMat = this.water.material as THREE.MeshStandardMaterial;
    waterMat.color.setHSL(0.57, 0.52, 0.47 + Math.sin(t * 0.8) * 0.015);

    // Fire.
    this.fires.begin();
    for (const i of this.fireTiles) {
      const x = this.wx(i % this.size) + 0.5;
      const z = this.wx((i / this.size) | 0) + 0.5;
      for (let k = 0; k < 2; k++) {
        const f = 0.55 + Math.sin(t * 9 + i * 1.7 + k * 2) * 0.25;
        this.fires.add({
          shape: "cone",
          x: x + (k - 0.5) * 0.3,
          y: 0,
          z: z + (k - 0.5) * 0.2,
          sx: 0.45,
          sy: f + k * 0.2,
          sz: 0.45,
          color: k ? "#ffcc33" : "#ff5a1f",
          glow: true,
        });
      }
    }
    this.fires.end();

    // Fire trucks at fires inside a fire station's range, with flashing lights.
    this.trucks.begin();
    const flash = Math.floor(t * 4) % 2 === 0;
    for (const i of this.fireTiles) {
      if (this.world.fireCoverage[i] / 255 <= FIRE_COVERED) continue;
      const x = this.wx(i % this.size) + 0.5;
      const z = this.wx((i / this.size) | 0) + 0.5;
      this.trucks.add({ shape: "box", x: x + 0.62, y: 0, z: z + 0.1, sx: 0.22, sy: 0.18, sz: 0.48, color: "#d32f2f" });
      this.trucks.add({ shape: "box", x: x + 0.62, y: 0.18, z: z - 0.06, sx: 0.16, sy: 0.05, sz: 0.08, color: flash ? "#4fc3f7" : "#ff1744", glow: true });
      // Water spray toward the fire.
      this.trucks.add({ shape: "box", x: x + 0.32, y: 0.32, z: z + 0.1, sx: 0.5, sy: 0.03, sz: 0.03, color: "#bfe6ff", glow: true });
    }
    this.trucks.end();

    // Cars move back and forth across their tile.
    this.cars.begin();
    for (const c of this.roadCars) {
      const p = ((t * c.speed + c.phase) % 1) - 0.5;
      const lane = 0.16;
      this.cars.add({
        shape: "box",
        x: c.x + c.dx * p + c.dz * lane,
        y: 0,
        z: c.z + c.dz * p - c.dx * lane,
        sx: c.dx ? 0.28 : 0.15,
        sy: 0.12,
        sz: c.dx ? 0.15 : 0.28,
        color: c.color,
      });
    }
    this.cars.end();

    // Blinking "no power" warnings.
    this.flags.begin();
    if (Math.floor(t * 2) % 2 === 0) {
      for (const [x, z] of this.unpowered)
        this.flags.add({ shape: "box", x, y: 2.2, z, sx: 0.35, sy: 0.55, sz: 0.1, color: "#ffd21f", glow: true });
    }
    this.flags.end();

    // Smoke particles rising from chimneys.
    const pos = this.smoke.geometry.getAttribute("position") as THREE.BufferAttribute;
    const alpha = this.smoke.geometry.getAttribute("alpha") as THREE.BufferAttribute;
    const per = 6;
    const max = Math.min(pos.count, this.smokeEmitters.length * per);
    for (let k = 0; k < pos.count; k++) {
      if (k >= max) {
        alpha.setX(k, 0);
        continue;
      }
      const e = this.smokeEmitters[Math.floor(k / per)];
      const age = (t * 0.35 + (k % per) / per + e[0] * 0.13) % 1;
      pos.setXYZ(k, e[0] + age * 0.9, e[1] + age * 2.4, e[2] - age * 0.4);
      alpha.setX(k, 1 - age);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
    const canvasH = 900;
    (this.smoke.material as THREE.ShaderMaterial).uniforms.uScale.value = (canvasH / zoom) * 0.9;

    this.updateActors(t);
  }

  private updateActors(t: number): void {
    const actors = this.world.actors;
    while (this.actorsGroup.children.length > actors.length) this.actorsGroup.remove(this.actorsGroup.children.at(-1)!);
    actors.forEach((a, k) => {
      let obj = this.actorsGroup.children[k] as THREE.Group | undefined;
      if (!obj || obj.userData.kind !== a.kind) {
        if (obj) this.actorsGroup.remove(obj);
        obj = a.kind === "tornado" ? makeTornado() : makeMonster();
        obj.userData.kind = a.kind;
        this.actorsGroup.add(obj);
      }
      obj.position.set(this.wx(a.x) + 0.5, 0, this.wx(a.y) + 0.5);
      if (a.kind === "tornado") obj.rotation.y = t * 8;
      else {
        obj.rotation.y = Math.atan2(a.dx, a.dy);
        obj.position.y = Math.abs(Math.sin(t * 6)) * 0.3;
      }
    });
  }
}

function makeTornado(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#8c8f94", transparent: true, opacity: 0.75, roughness: 1 });
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4 + k * 0.45, 0.3 + k * 0.38, 1.4, 12, 1, true), mat);
    m.position.set(Math.sin(k) * 0.3, 0.7 + k * 1.3, Math.cos(k) * 0.3);
    g.add(m);
  }
  return g;
}

function makeMonster(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: "#3d8c4a", roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), skin);
  body.scale.set(1, 1.5, 1);
  body.position.y = 2.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), skin);
  head.position.set(0, 4.3, 0.6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#ffeb3b", emissive: "#ffeb3b", emissiveIntensity: 1 });
  for (const s of [-0.3, 0.3]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), eyeMat);
    eye.position.set(s, 4.5, 1.3);
    g.add(eye);
  }
  for (const s of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.2, 10), skin);
    leg.position.set(s, 0.6, 0);
    g.add(leg);
  }
  const spikes = new THREE.MeshStandardMaterial({ color: "#2b5e33" });
  for (let k = 0; k < 4; k++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 8), spikes);
    spike.position.set(0, 1.8 + k * 0.7, -1.2);
    spike.rotation.x = -0.6;
    g.add(spike);
  }
  g.add(body, head);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
