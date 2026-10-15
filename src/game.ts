import { TOOL_BY_ID, TOOLS, type Speed, type ToolId } from "./sim/constants";
import { triggerDisaster, type DisasterId } from "./sim/disasters";
import { AUTOSAVE_SLOT, saveToSlot } from "./sim/save";
import { Simulation } from "./sim/simulation";
import { World, type PlaceError } from "./sim/world";
import { CityView, type OverlayId } from "./render/cityView";
import { Cursor } from "./render/cursor";
import { Stage } from "./render/scene";
import { detectLang, type Lang } from "./i18n";

export type Feedback = { text: PlaceError | "cost"; cost?: number; x: number; y: number; at: number };

/**
 * Owns the simulation, the 3D view and input handling, and exposes a tiny observable store
 * for the React interface (subscribe + version).
 */
export class Game {
  world: World;
  sim: Simulation;
  readonly stage: Stage;
  view: CityView;
  readonly cursor: Cursor;

  tool: ToolId = "query";
  speed: Speed = 2;
  overlay: OverlayId = "none";
  lang: Lang = detectLang();
  hover: { x: number; y: number } | null = null;
  selected: { x: number; y: number } | null = null;
  feedback: Feedback | null = null;
  /** Cost preview of the current drag or hover, shown next to the pointer. */
  preview: { cost: number; ok: boolean; clientX: number; clientY: number } | null = null;

  version = 0;
  private listeners = new Set<() => void>();
  private lastEmit = 0;
  private dragStart: { x: number; y: number } | null = null;
  private panning: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private raf = 0;
  private last = performance.now();
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.world = world;
    this.sim = new Simulation(world);
    this.stage = new Stage(canvas, world.size);
    this.view = new CityView(world);
    this.stage.scene.add(this.view.group);
    this.cursor = new Cursor(world.size / 2);
    this.stage.scene.add(this.cursor.group);
    this.stage.setShadows(world.settings.shadows);
    this.sim.onYear = () => saveToSlot(this.world, AUTOSAVE_SLOT);
    this.sim.refresh();
    this.focusCity();
    this.bindInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---- Store -------------------------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  emit(): void {
    this.version++;
    this.lastEmit = performance.now();
    for (const fn of this.listeners) fn();
  }

  // ---- Main loop ----------------------------------------------------------------

  private frame = (now: number): void => {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    const changed = this.sim.tick(dt, this.speed);
    this.keyboardPan(dt);
    this.view.sync();
    this.stage.updateCamera(dt);
    this.view.animate(now, this.stage.zoom);
    this.stage.render();
    if (changed && now - this.lastEmit > 200) this.emit();
    const last = this.world.messages.at(-1);
    if (last?.key === "earthquake" && last.id !== this.shakenFor) {
      this.shakenFor = last.id;
      this.stage.startShake();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Id of the last earthquake message the camera already shook for. */
  private shakenFor = -1;

  private keyboardPan(dt: number): void {
    const speed = (this.stage.zoom / 40) * dt * 0.03;
    let dx = 0;
    let dz = 0;
    if (this.keys.has("arrowleft") || this.keys.has("a")) dx -= speed;
    if (this.keys.has("arrowright") || this.keys.has("d")) dx += speed;
    if (this.keys.has("arrowup") || this.keys.has("w")) dz -= speed;
    if (this.keys.has("arrowdown") || this.keys.has("s")) dz += speed;
    if (dx || dz) this.stage.pan(dx, dz * 1.4);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("contextmenu", this.onContextMenu);
    c.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    this.stage.dispose();
  }

  // ---- Actions ---------------------------------------------------------------------

  setTool(tool: ToolId): void {
    this.tool = tool;
    this.dragStart = null;
    this.cursor.hide();
    this.emit();
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.emit();
  }

  setOverlay(id: OverlayId): void {
    this.overlay = id;
    this.view.setOverlay(id);
    this.emit();
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    try {
      localStorage.setItem("cityforge.lang", lang);
    } catch {}
    this.emit();
  }

  setTax(tax: number): void {
    this.world.tax = tax;
    this.emit();
  }

  setFunding(key: "police" | "fire" | "transport", value: number): void {
    this.world.funding[key] = value;
    this.sim.refresh();
    this.emit();
  }

  setShadows(on: boolean): void {
    this.world.settings.shadows = on;
    this.stage.setShadows(on);
    this.emit();
  }

  setDisasters(on: boolean): void {
    this.world.settings.disasters = on;
    this.emit();
  }

  disaster(id: DisasterId): boolean {
    const ok = triggerDisaster(this.world, id);
    if (ok) {
      const m = this.world.messages.at(-1);
      if (m?.x !== undefined && m.y !== undefined) this.stage.focusTile(m.x, m.y);
    }
    this.emit();
    return ok;
  }

  clearSelection(): void {
    this.selected = null;
    this.emit();
  }

  focusTile(x: number, y: number): void {
    this.stage.focusTile(x, y);
  }

  rotate(dir: 1 | -1): void {
    this.stage.rotate(dir);
  }

  zoom(factor: number): void {
    this.stage.zoomBy(factor);
  }

  /** Replaces the running city (new game or loaded file). */
  loadWorld(world: World): void {
    this.world = world;
    this.sim = new Simulation(world);
    this.sim.onYear = () => saveToSlot(this.world, AUTOSAVE_SLOT);
    this.view.setWorld(world);
    this.view.setOverlay(this.overlay);
    this.stage.setShadows(world.settings.shadows);
    this.selected = null;
    this.sim.refresh();
    this.focusCity();
    this.emit();
  }

  private focusCity(): void {
    const bs = [...this.world.buildings.values()];
    if (bs.length) {
      const cx = bs.reduce((s, b) => s + b.x, 0) / bs.length;
      const cy = bs.reduce((s, b) => s + b.y, 0) / bs.length;
      this.stage.focusTile(cx, cy);
    } else {
      this.stage.focusTile(this.world.size / 2, this.world.size / 2);
    }
  }

  // ---- Input ------------------------------------------------------------------------

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointerleave", this.onPointerLeave);
    c.addEventListener("contextmenu", this.onContextMenu);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
  }

  private onResize = (): void => this.stage.resize();

  private onPointerLeave = (): void => {
    this.hover = null;
    this.preview = null;
    if (!this.dragStart) this.cursor.hide();
    this.emit();
  };

  private onContextMenu = (e: Event): void => e.preventDefault();

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.stage.zoomBy(Math.exp(e.deltaY * 0.0012));
  };

  /** Footprint origin for a building centered on the hovered tile. */
  private origin(x: number, y: number): { x: number; y: number } {
    const size = TOOL_BY_ID[this.tool].size;
    const off = Math.floor((size - 1) / 2);
    return { x: x - off, y: y - off };
  }

  private dragTiles(end: { x: number; y: number }): [number, number][] {
    const start = this.dragStart ?? end;
    const def = TOOL_BY_ID[this.tool];
    if (def.drag === "line") return World.linePath(start.x, start.y, end.x, end.y);
    if (def.drag === "rect") return World.rectTiles(start.x, start.y, end.x, end.y);
    return [[end.x, end.y]];
  }

  private updatePreview(clientX: number, clientY: number): void {
    const h = this.hover;
    if (!h || this.tool === "query") {
      this.cursor.hide();
      if (h && this.tool === "query") this.cursor.showTiles([[h.x, h.y]], null);
      this.preview = null;
      return;
    }
    const def = TOOL_BY_ID[this.tool];
    if (def.size > 1) {
      const o = this.origin(h.x, h.y);
      const res = this.world.check(this.tool, o.x, o.y);
      this.cursor.showFootprint(o.x, o.y, def.size, res.ok);
      this.preview = { cost: res.cost, ok: res.ok, clientX, clientY };
    } else {
      const tiles = this.dragTiles(h).filter(([x, y]) => this.world.inBounds(x, y));
      const res = this.world.checkMany(this.tool, tiles);
      this.cursor.showTiles(tiles, res.valid);
      this.preview = { cost: res.cost, ok: res.count > 0, clientX, clientY };
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      this.panning = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    const tile = this.stage.pickTile(e.clientX, e.clientY);
    if (!tile) return;
    if (this.tool === "query") {
      this.selected = this.world.inBounds(tile.x, tile.y) ? tile : null;
      this.emit();
      return;
    }
    if (TOOL_BY_ID[this.tool].drag !== "none") {
      this.dragStart = tile;
      this.hover = tile;
      this.updatePreview(e.clientX, e.clientY);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.panning) {
      this.stage.panPixels(e.clientX - this.panning.x, e.clientY - this.panning.y);
      this.panning = { x: e.clientX, y: e.clientY };
      return;
    }
    const tile = this.stage.pickTile(e.clientX, e.clientY);
    const changed = !tile || !this.hover || tile.x !== this.hover.x || tile.y !== this.hover.y;
    this.hover = tile;
    if (changed || this.preview) {
      this.updatePreview(e.clientX, e.clientY);
      this.emit();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.panning) {
      this.panning = null;
      return;
    }
    if (e.button !== 0 || this.tool === "query") return;
    const tile = this.stage.pickTile(e.clientX, e.clientY) ?? this.hover;
    if (!tile) return;
    const def = TOOL_BY_ID[this.tool];
    let spent = 0;
    let error: PlaceError | undefined;
    if (def.size > 1) {
      const o = this.origin(tile.x, tile.y);
      const res = this.world.check(this.tool, o.x, o.y);
      if (res.ok) spent = this.world.apply(this.tool, o.x, o.y);
      else error = res.reason;
    } else {
      const tiles = this.dragTiles(tile).filter(([x, y]) => this.world.inBounds(x, y));
      const res = this.world.checkMany(this.tool, tiles);
      spent = this.world.applyMany(
        this.tool,
        tiles.filter((_, k) => res.valid[k]),
      );
      if (!spent && tiles.length === 1) error = this.world.check(this.tool, tile.x, tile.y).reason;
    }
    this.dragStart = null;
    if (spent > 0) {
      this.sim.refresh();
      this.feedback = { text: "cost", cost: spent, x: e.clientX, y: e.clientY, at: performance.now() };
    } else if (error && error !== "nothing") {
      this.feedback = { text: error, x: e.clientX, y: e.clientY, at: performance.now() };
    }
    this.updatePreview(e.clientX, e.clientY);
    this.emit();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const key = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(key)) {
      this.keys.add(key);
      e.preventDefault();
      return;
    }
    if (key === " ") {
      e.preventDefault();
      this.setSpeed(this.speed === 0 ? 2 : 0);
    } else if (key === "q") this.rotate(-1);
    else if (key === "e") this.rotate(1);
    else if (key === "escape") {
      this.dragStart = null;
      this.selected = null;
      this.setTool("query");
    } else if (key === "+" || key === "=") this.zoom(0.85);
    else if (key === "-") this.zoom(1.18);
    else {
      const tool = TOOLS.find((t) => t.key === key);
      if (tool) this.setTool(tool.id);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };
}
