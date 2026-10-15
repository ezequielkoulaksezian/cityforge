import * as THREE from "three";

/** Shapes buildings are assembled from. All of them sit on y = 0 and are 1 unit in size. */
export type Shape = "box" | "roof" | "cyl" | "cone" | "tower" | "sphere";

export type Part = {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rot?: number;
  color: THREE.ColorRepresentation;
  /** Draw a procedural window grid on vertical faces. */
  windows?: boolean;
  /** Self-lit (fire, lights). */
  glow?: boolean;
};

function geometry(shape: Shape): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (shape) {
    case "box":
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
    case "roof": {
      // Gable roof: a triangular prism along the x axis.
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0);
      s.lineTo(0.5, 0);
      s.lineTo(0, 1);
      s.lineTo(-0.5, 0);
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
      g.translate(0, -0.5, -0.5);
      g.rotateY(Math.PI / 2);
      break;
    }
    case "cyl":
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
      break;
    case "cone":
      g = new THREE.ConeGeometry(0.5, 1, 8);
      break;
    case "sphere":
      g = new THREE.SphereGeometry(0.5, 14, 10);
      break;
    case "tower": {
      // Hyperboloid cooling tower.
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector2(0.5 - Math.sin(t * Math.PI) * 0.16 + (t > 0.7 ? (t - 0.7) * 0.25 : 0), t));
      }
      g = new THREE.LatheGeometry(pts, 20);
      g.translate(0, -0.5, 0);
      break;
    }
  }
  g.translate(0, 0.5, 0);
  return g;
}

/** Standard material extended with a world-space window grid on vertical faces. */
function buildingMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aFlags;\nvarying float vFlags;\nvarying vec3 vWorld;\nvarying vec3 vWNormal;",
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vWorld = wp.xyz;
        vFlags = aFlags;
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          nm = nm * mat3(instanceMatrix);
        #endif
        vWNormal = normalize(nm * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFlags;\nvarying vec3 vWorld;\nvarying vec3 vWNormal;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float isWin = mod(vFlags, 2.0);
        if (isWin > 0.5 && abs(vWNormal.y) < 0.3) {
          float along = abs(vWNormal.x) > 0.5 ? vWorld.z : vWorld.x;
          float gx = fract(along * 3.0);
          float gy = fract(vWorld.y * 3.2);
          float win = step(0.22, gx) * step(gx, 0.78) * step(0.3, gy) * step(gy, 0.8) * step(0.25, vWorld.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.3) + diffuseColor.rgb * 0.15, win * 0.8);
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (vFlags >= 1.5) totalEmissiveRadiance += diffuseColor.rgb * 1.6;`,
      );
  };
  return m;
}

/**
 * A growable InstancedMesh for one shape. Parts are written each rebuild; the mesh is recreated
 * with more capacity when needed.
 */
export class Pool {
  mesh: THREE.InstancedMesh;
  private count = 0;
  private flags: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.Material;
  private readonly tmp = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(
    private readonly parent: THREE.Object3D,
    shape: Shape,
    capacity = 512,
    private readonly shadows = true,
  ) {
    this.geo = geometry(shape);
    this.mat = buildingMaterial();
    this.flags = new Float32Array(capacity);
    this.mesh = this.create(capacity);
  }

  private create(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, capacity);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.flags = new Float32Array(capacity);
    this.geo.setAttribute("aFlags", new THREE.InstancedBufferAttribute(this.flags, 1));
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.parent.add(mesh);
    return mesh;
  }

  begin(): void {
    this.count = 0;
  }

  add(p: Part): void {
    if (this.count >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      const oldFlags = this.flags;
      const next = this.create(old.instanceMatrix.count * 2);
      next.instanceMatrix.array.set(old.instanceMatrix.array);
      (next.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
      this.flags.set(oldFlags);
      this.parent.remove(old);
      old.dispose();
      this.mesh = next;
    }
    const t = this.tmp;
    t.position.set(p.x, p.y, p.z);
    t.rotation.set(0, p.rot ?? 0, 0);
    t.scale.set(p.sx, p.sy, p.sz);
    t.updateMatrix();
    this.mesh.setMatrixAt(this.count, t.matrix);
    this.mesh.setColorAt(this.count, this.color.set(p.color));
    this.flags[this.count] = (p.windows ? 1 : 0) + (p.glow ? 2 : 0);
    this.count++;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    const attr = this.geo.getAttribute("aFlags") as THREE.InstancedBufferAttribute;
    attr.needsUpdate = true;
  }
}

/** One pool per shape, filled from a list of parts. */
export class PartSet {
  readonly pools: Record<Shape, Pool>;

  constructor(parent: THREE.Object3D, shadows = true) {
    this.pools = {
      box: new Pool(parent, "box", 2048, shadows),
      roof: new Pool(parent, "roof", 1024, shadows),
      cyl: new Pool(parent, "cyl", 512, shadows),
      cone: new Pool(parent, "cone", 512, shadows),
      tower: new Pool(parent, "tower", 64, shadows),
      sphere: new Pool(parent, "sphere", 64, shadows),
    };
  }

  set(parts: Part[]): void {
    for (const p of Object.values(this.pools)) p.begin();
    for (const part of parts) this.pools[part.shape].add(part);
    for (const p of Object.values(this.pools)) p.end();
  }
}
