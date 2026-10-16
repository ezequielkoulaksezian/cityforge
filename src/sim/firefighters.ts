import { SERVICE_RADIUS } from "./constants";
import type { FireTruck } from "./types";
import { isRoad, type World } from "./world";

/** Fire coverage (0-1) above which a tile counts as protected by a fire station. */
export const FIRE_COVERED = 0.08;

const TRUCKS_PER_STATION = 2;
/** Tiles a truck advances per actor step (about 7 per second at normal speed). */
const TRUCK_SPEED = 0.85;
/** Actor steps the crew sprays one burning tile before it is out. */
const STEPS_PER_TILE = 5;
const MAX_ROUTE = 90;

type Rect = { x0: number; y0: number; x1: number; y1: number };

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The area a fire belongs to: the whole building it burns in, or just the tile. */
export function fireArea(w: World, i: number): Rect {
  const x = i % w.size;
  const y = (i / w.size) | 0;
  const b = w.buildingAt(x, y);
  if (b) return { x0: b.x, y0: b.y, x1: b.x + b.size - 1, y1: b.y + b.size - 1 };
  return { x0: x, y0: y, x1: x, y1: y };
}

function near(r: Rect, x: number, y: number, margin: number): boolean {
  return x >= r.x0 - margin && x <= r.x1 + margin && y >= r.y0 - margin && y <= r.y1 + margin;
}

/** True while a truck is on its way to, or working at, the fire around this tile: the fire is contained. */
export function isContained(w: World, i: number): boolean {
  if (!w.trucks.length) return false;
  const x = i % w.size;
  const y = (i / w.size) | 0;
  for (const t of w.trucks) {
    if (t.state === "returning") continue;
    if (near(fireArea(w, t.target), x, y, 2)) return true;
  }
  return false;
}

/**
 * Shortest road route from a station to a road tile right next to the fire area, or within two
 * tiles of it when no road touches the burning building.
 */
function route(w: World, stationId: number, area: Rect): number[] | null {
  return routeWithin(w, stationId, area, 1) ?? routeWithin(w, stationId, area, 2);
}

function routeWithin(w: World, stationId: number, area: Rect, margin: number): number[] | null {
  const s = w.buildings.get(stationId);
  if (!s) return null;
  const n = w.size * w.size;
  const prev = new Int32Array(n).fill(-2);
  const dist = new Int16Array(n);
  const queue: number[] = [];
  for (let d = 0; d < s.size; d++) {
    for (const [x, y] of [
      [s.x + d, s.y - 1],
      [s.x + d, s.y + s.size],
      [s.x - 1, s.y + d],
      [s.x + s.size, s.y + d],
    ]) {
      if (!w.inBounds(x, y)) continue;
      const i = w.idx(x, y);
      if (isRoad(w.kind[i]) && prev[i] === -2) {
        prev[i] = -1;
        queue.push(i);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % w.size;
    const y = (i / w.size) | 0;
    if (near(area, x, y, margin)) {
      const path: number[] = [];
      for (let k = i; k !== -1; k = prev[k]) path.push(k);
      return path.reverse();
    }
    if (dist[i] >= MAX_ROUTE) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!w.inBounds(nx, ny)) continue;
      const j = w.idx(nx, ny);
      if (prev[j] !== -2 || !isRoad(w.kind[j]) || w.flood[j] > 0) continue;
      prev[j] = i;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return null;
}

/**
 * Sends a fire engine from the nearest fire station with a free truck to every fire inside fire
 * coverage that nobody is fighting yet. Warns when no road leads to the fire.
 */
export function dispatchTrucks(w: World): void {
  const stations = [...w.buildings.values()].filter((b) => b.type === "fire");
  if (!stations.length) return;
  const handled: Rect[] = [];
  for (let i = 0; i < w.fire.length; i++) {
    if (!w.fire[i] || isContained(w, i)) continue;
    if (w.fireCoverage[i] / 255 <= FIRE_COVERED) continue;
    const x = i % w.size;
    const y = (i / w.size) | 0;
    if (handled.some((r) => near(r, x, y, 2))) continue;
    const area = fireArea(w, i);
    handled.push(area);

    const candidates = stations
      .filter((s) => w.trucks.filter((t) => t.stationId === s.id).length < TRUCKS_PER_STATION)
      .map((s) => ({ s, d: Math.hypot(s.x + 1.5 - x, s.y + 1.5 - y) }))
      .filter((c) => c.d <= SERVICE_RADIUS + 4)
      .sort((a, b) => a.d - b.d);
    let sent = false;
    for (const { s } of candidates) {
      const path = route(w, s.id, area);
      if (!path) continue;
      const truck: FireTruck = {
        id: w.nextTruckId++,
        stationId: s.id,
        path,
        pos: 0,
        state: "going",
        target: i,
        spraying: -1,
        work: 0,
      };
      w.trucks.push(truck);
      w.notify("fireDispatched", "info", { x, y, cooldown: 2 });
      sent = true;
      break;
    }
    if (!sent && candidates.length) w.notify("fireUnreachable", "warning", { x, y, cooldown: 6 });
  }
}

/** Nearest burning tile around the truck's fire, or -1 when the fire is out. */
function nextBurning(w: World, t: FireTruck): number {
  const area = fireArea(w, t.target);
  const end = t.path[t.path.length - 1];
  const ex = end % w.size;
  const ey = (end / w.size) | 0;
  let best = -1;
  let bestD = Infinity;
  for (let y = area.y0 - 2; y <= area.y1 + 2; y++) {
    for (let x = area.x0 - 2; x <= area.x1 + 2; x++) {
      if (!w.inBounds(x, y)) continue;
      const i = w.idx(x, y);
      if (!w.fire[i]) continue;
      const d = Math.hypot(x - ex, y - ey);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

/** Moves trucks and lets crews put out fires. Runs on the fast actor clock. Returns true if anything moved. */
export function stepTrucks(w: World): boolean {
  if (!w.trucks.length) return false;
  const last = (t: FireTruck) => t.path.length - 1;
  for (const t of w.trucks) {
    if (t.state === "going") {
      t.pos = Math.min(last(t), t.pos + TRUCK_SPEED);
      if (t.pos >= last(t)) t.state = "fighting";
    } else if (t.state === "fighting") {
      if (t.spraying < 0 || !w.fire[t.spraying]) {
        t.spraying = nextBurning(w, t);
        t.work = 0;
        if (t.spraying < 0) {
          t.state = "returning";
          w.notify("fireOut", "success", { cooldown: 2 });
          continue;
        }
      }
      t.work++;
      if (t.work >= STEPS_PER_TILE) {
        w.fire[t.spraying] = 0;
        w.rev.fire++;
        t.spraying = -1;
      }
    } else {
      t.spraying = -1;
      t.pos -= TRUCK_SPEED;
    }
  }
  w.trucks = w.trucks.filter((t) => t.pos >= 0 && w.buildings.has(t.stationId));
  return true;
}
