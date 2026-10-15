import { TRIP_MAX_DISTANCE, ZONE_LEVELS } from "./constants";
import type { Building } from "./types";
import { isRoad, isTransport, type World } from "./world";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const TARGETS: Record<"R" | "C" | "I", ("R" | "C" | "I")[]> = {
  R: ["C", "I"],
  C: ["R"],
  I: ["R"],
};

/** Transport tiles touching the outside of a building's footprint. */
export function perimeterTransport(w: World, b: Building): number[] {
  const out: number[] = [];
  const s = b.size;
  for (let d = 0; d < s; d++) {
    for (const [x, y] of [
      [b.x + d, b.y - 1],
      [b.x + d, b.y + s],
      [b.x - 1, b.y + d],
      [b.x + s, b.y + d],
    ]) {
      if (w.inBounds(x, y) && isTransport(w.kind[w.idx(x, y)])) out.push(w.idx(x, y));
    }
  }
  return out;
}

/**
 * Trip generation as in SimCity: each developed zone searches the road/rail network (up to 40 tiles)
 * for a zone that complements it (homes need jobs and shops; shops and factories need workers).
 * Successful trips add traffic to the road tiles they used; rail carries trips without traffic.
 * A quarter of the zones is processed each month to keep the cost low.
 */
export function updateTraffic(w: World): { jammed: number } {
  const n = w.size * w.size;
  const load = new Float32Array(n);
  const dist = new Int16Array(n).fill(-1);
  const parent = new Int32Array(n);
  const queue = new Int32Array(n);
  const touched: number[] = [];

  const zones = [...w.buildings.values()].filter((b) => b.type === "R" || b.type === "C" || b.type === "I");
  const batch = Math.max(1, Math.ceil(zones.length / 4));

  for (let k = 0; k < zones.length; k++) {
    const b = zones[k];
    const start = perimeterTransport(w, b);
    const inBatch = (k - w.tripCursor + zones.length) % zones.length < batch;
    if (!start.length) {
      b.transport = false;
      continue;
    }
    if (b.level === 0) {
      // Empty lots only need road access to start growing.
      b.transport = true;
      continue;
    }
    if (!inBatch) continue;

    const targets = TARGETS[b.type as "R" | "C" | "I"];
    let head = 0;
    let tail = 0;
    for (const i of start) {
      if (dist[i] !== -1) continue;
      dist[i] = 0;
      parent[i] = -1;
      queue[tail++] = i;
      touched.push(i);
    }
    let found = -1;
    while (head < tail && found < 0) {
      const i = queue[head++];
      const x = i % w.size;
      const y = (i / w.size) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.inBounds(nx, ny)) continue;
        const j = w.idx(nx, ny);
        const id = w.bid[j];
        if (id && id !== b.id) {
          const t = w.buildings.get(id)!;
          if ((targets as string[]).includes(t.type)) {
            found = i;
            break;
          }
        }
        if (dist[j] !== -1 || !isTransport(w.kind[j]) || w.flood[j] > 0) continue;
        if (dist[i] + 1 > TRIP_MAX_DISTANCE) continue;
        dist[j] = dist[i] + 1;
        parent[j] = i;
        queue[tail++] = j;
        touched.push(j);
      }
    }

    b.transport = found >= 0;
    if (found >= 0) {
      const amount = 6 + ZONE_LEVELS[b.type as "R" | "C" | "I"][b.level] / 12;
      for (let i = found; i !== -1; i = parent[i]) {
        if (isRoad(w.kind[i])) load[i] += amount;
      }
    }
    for (const i of touched) dist[i] = -1;
    touched.length = 0;
  }
  w.tripCursor = zones.length ? (w.tripCursor + batch) % zones.length : 0;

  let jammed = 0;
  for (let i = 0; i < n; i++) {
    if (!isRoad(w.kind[i])) {
      w.traffic[i] = 0;
      continue;
    }
    // A quarter of the zones ran this month, so scale the load up and smooth over time.
    const fresh = Math.min(255, load[i] * 4);
    const value = Math.round(w.traffic[i] * 0.55 + fresh * 0.45);
    w.traffic[i] = value;
    if (value > 190) jammed++;
  }
  return { jammed };
}
