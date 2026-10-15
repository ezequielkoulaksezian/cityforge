import * as THREE from "three";

/**
 * Renderer, scene, lights and an isometric orthographic camera that can pan, zoom and rotate
 * in 90° steps around a target point on the ground.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly sun: THREE.DirectionalLight;
  readonly target = new THREE.Vector3();
  /** World units visible vertically. */
  zoom = 48;
  rotation = 0;
  private displayRotation = 0;
  private shake = 0;
  readonly mapSize: number;

  constructor(canvas: HTMLCanvasElement, mapSize: number) {
    this.mapSize = mapSize;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color("#8fb8d8");
    this.scene.fog = new THREE.Fog("#8fb8d8", 260, 520);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1000);

    const hemi = new THREE.HemisphereLight("#dfeeff", "#4d5a3a", 1.15);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight("#fff3dd", 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.target.set(0, 0, 0);
    this.resize();
  }

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.updateCamera();
  }

  /** Rotation in quarter turns; the view animates toward it. */
  rotate(dir: 1 | -1): void {
    this.rotation += dir;
  }

  /** Moves the target along screen axes: dx to the right, dz toward the bottom of the screen. */
  pan(dx: number, dz: number): void {
    const angle = (this.displayRotation * Math.PI) / 2 + Math.PI / 4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.target.x += dx * cos + dz * sin;
    this.target.z += -dx * sin + dz * cos;
    const half = this.mapSize / 2;
    this.target.x = Math.max(-half, Math.min(half, this.target.x));
    this.target.z = Math.max(-half, Math.min(half, this.target.z));
  }

  /** Converts a screen drag in pixels to a ground pan. */
  panPixels(px: number, py: number): void {
    const h = this.renderer.domElement.clientHeight || 1;
    const unitsPerPixel = this.zoom / h;
    // The ground is foreshortened vertically in the isometric view.
    this.pan(-px * unitsPerPixel, -py * unitsPerPixel * 1.6);
  }

  zoomBy(factor: number): void {
    this.zoom = Math.max(10, Math.min(150, this.zoom * factor));
  }

  focusTile(x: number, y: number): void {
    this.target.set(x - this.mapSize / 2 + 0.5, 0, y - this.mapSize / 2 + 0.5);
  }

  startShake(): void {
    this.shake = 1;
  }

  updateCamera(dt = 0): void {
    const canvas = this.renderer.domElement;
    const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
    const k = 1 - Math.pow(0.0001, dt / 1000);
    this.displayRotation += (this.rotation - this.displayRotation) * (dt ? Math.min(1, k * 1.2) : 1);

    const angle = (this.displayRotation * Math.PI) / 2 + Math.PI / 4;
    const distance = 200;
    const elevation = Math.atan(1 / Math.SQRT2);
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.8 : 0;
    const shakeZ = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.8 : 0;
    this.shake = Math.max(0, this.shake - dt / 2500);

    const t = this.target;
    this.camera.position.set(
      t.x + shakeX + Math.sin(angle) * Math.cos(elevation) * distance,
      t.y + Math.sin(elevation) * distance,
      t.z + shakeZ + Math.cos(angle) * Math.cos(elevation) * distance,
    );
    this.camera.lookAt(t.x + shakeX, t.y, t.z + shakeZ);

    const halfH = this.zoom / 2;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    // Keep the shadow camera tight around the visible area for crisp shadows.
    const sunOffset = new THREE.Vector3(-60, 110, 40);
    this.sun.position.copy(t).add(sunOffset);
    this.sun.target.position.copy(t);
    const extent = Math.max(30, this.zoom * aspect * 0.75);
    const sc = this.sun.shadow.camera;
    sc.left = -extent;
    sc.right = extent;
    sc.top = extent;
    sc.bottom = -extent;
    sc.near = 1;
    sc.far = 400;
    sc.updateProjectionMatrix();
  }

  /** Ground point under a screen position, in tile coordinates (may be out of bounds). */
  pickTile(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return {
      x: Math.floor(hit.x + this.mapSize / 2),
      y: Math.floor(hit.z + this.mapSize / 2),
    };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
