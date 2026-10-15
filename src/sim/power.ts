import { POWER_CAPACITY, POWER_DEMAND } from "./constants";
import type { Building } from "./types";
import { isConductor, type World } from "./world";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Power flows from plants through conductive tiles (lines, line crossings and buildings, so
 * adjacent zones pass power along). Each connected network has the capacity of its plants;
 * when demand exceeds it, the buildings farthest from the plants go dark (brownout).
 */
export function updatePower(w: World): { brownout: boolean } {
  const n = w.size * w.size;
  w.power.fill(0);
  for (const b of w.buildings.values()) b.powered = false;

  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let brownout = false;
  let totalCapacity = 0;
  let totalDemand = 0;

  for (const plant of w.buildings.values()) {
    const capacity = POWER_CAPACITY[plant.type];
    if (!capacity) continue;
    const start = w.idx(plant.x, plant.y);
    if (visited[start]) continue;

    // Breadth-first search over the whole network this plant belongs to.
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;
    const order: Building[] = [];
    const seen = new Set<number>();
    const tiles: number[] = [];
    while (head < tail) {
      const i = queue[head++];
      tiles.push(i);
      const id = w.bid[i];
      if (id && !seen.has(id)) {
        seen.add(id);
        order.push(w.buildings.get(id)!);
      }
      const x = i % w.size;
      const y = (i / w.size) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.inBounds(nx, ny)) continue;
        const j = w.idx(nx, ny);
        if (visited[j] || !isConductor(w.kind[j]) || w.flood[j] > 0) continue;
        visited[j] = 1;
        queue[tail++] = j;
      }
    }

    let networkCapacity = 0;
    for (const b of order) networkCapacity += POWER_CAPACITY[b.type] ?? 0;
    let remaining = networkCapacity;
    totalCapacity += networkCapacity;
    for (const b of order) {
      const demand = POWER_DEMAND[b.type];
      totalDemand += demand;
      if (POWER_CAPACITY[b.type]) {
        b.powered = true;
      } else if (remaining >= demand) {
        remaining -= demand;
        b.powered = true;
      } else {
        brownout = true;
      }
    }
    for (const i of tiles) {
      const id = w.bid[i];
      if (!id || w.buildings.get(id)!.powered) w.power[i] = 1;
    }
  }

  for (const b of w.buildings.values()) {
    if (!POWER_CAPACITY[b.type] && !visited[w.idx(b.x, b.y)]) totalDemand += POWER_DEMAND[b.type];
  }
  w.census.powerCapacity = totalCapacity;
  w.census.powerDemand = totalDemand;
  return { brownout };
}
