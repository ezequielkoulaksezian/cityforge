import * as THREE from "three";

/** Translucent tiles that preview where a tool will act: green when valid, red when not. */
export class Cursor {
  readonly group = new THREE.Group();
  private tiles: THREE.InstancedMesh;
  private outline: THREE.LineSegments;
  private readonly tmp = new THREE.Object3D();
  private readonly ok = new THREE.Color("#4ade80");
  private readonly bad = new THREE.Color("#ef4444");
  private readonly neutral = new THREE.Color("#ffffff");

  constructor(private readonly half: number) {
    const geo = new THREE.BoxGeometry(1, 0.06, 1);
    this.tiles = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }),
      4096,
    );
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(4096 * 3), 3);
    this.tiles.count = 0;
    this.tiles.renderOrder = 5;
    this.tiles.frustumCulled = false;
    this.group.add(this.tiles);

    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }),
    );
    this.outline.visible = false;
    this.outline.renderOrder = 6;
    this.group.add(this.outline);
  }

  /** Shows individual tiles (drags, network tools). */
  showTiles(tiles: [number, number][], valid: boolean[] | null): void {
    this.outline.visible = false;
    const n = Math.min(tiles.length, 4096);
    for (let k = 0; k < n; k++) {
      const [x, y] = tiles[k];
      this.tmp.position.set(x - this.half + 0.5, 0.05, y - this.half + 0.5);
      this.tmp.updateMatrix();
      this.tiles.setMatrixAt(k, this.tmp.matrix);
      this.tiles.setColorAt(k, valid ? (valid[k] ? this.ok : this.bad) : this.neutral);
    }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.instanceColor!.needsUpdate = true;
  }

  /** Shows a building footprint with a wireframe box. */
  showFootprint(x: number, y: number, size: number, valid: boolean): void {
    const tiles: [number, number][] = [];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tiles.push([x + dx, y + dy]);
    this.showTiles(tiles, tiles.map(() => valid));
    this.outline.visible = true;
    this.outline.scale.set(size, 1.2, size);
    this.outline.position.set(x - this.half + size / 2, 0.6, y - this.half + size / 2);
    (this.outline.material as THREE.LineBasicMaterial).color.set(valid ? "#bbf7d0" : "#fecaca");
  }

  hide(): void {
    this.tiles.count = 0;
    this.outline.visible = false;
  }
}
