import { HIGH_DENSITY_LAND_VALUE, MAX_LEVEL } from "./constants";
import type { Building } from "./types";
import type { World } from "./world";

/** Average of a map over a building's footprint. */
export function footprintAverage(w: World, map: Uint8Array, b: Building): number {
  let sum = 0;
  for (let dy = 0; dy < b.size; dy++) for (let dx = 0; dx < b.size; dx++) sum += map[w.idx(b.x + dx, b.y + dy)];
  return sum / (b.size * b.size);
}

/** Average of a map around a building (footprint plus a ring), used for traffic next to it. */
function surroundingAverage(w: World, map: Uint8Array, b: Building, ring = 2): number {
  let sum = 0;
  let count = 0;
  for (let y = b.y - ring; y < b.y + b.size + ring; y++) {
    for (let x = b.x - ring; x < b.x + b.size + ring; x++) {
      if (!w.inBounds(x, y)) continue;
      sum += map[w.idx(x, y)];
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** Growth score of a zone; positive means it wants to grow. See section 8 of the design document. */
export function growthScore(w: World, b: Building): number {
  const land = footprintAverage(w, w.landValue, b);
  const pollution = footprintAverage(w, w.pollution, b);
  const crime = footprintAverage(w, w.crime, b);
  if (b.type === "R") {
    const traffic = surroundingAverage(w, w.traffic, b);
    return w.valves.R / 20 + (land - 60) / 3 - pollution / 3 - crime / 4 - traffic / 8;
  }
  if (b.type === "C") {
    const nearbyPeople = surroundingAverage(w, w.density, b, 6);
    return w.valves.C / 15 + (land - 40) / 4 - crime / 4 + Math.min(25, nearbyPeople / 3);
  }
  return w.valves.I / 15 - crime / 8;
}

/** Monthly growth and decline of every R/C/I zone. */
export function updateZones(w: World): void {
  let changed = false;
  for (const b of w.buildings.values()) {
    b.age++;
    if (b.type !== "R" && b.type !== "C" && b.type !== "I") continue;
    const before = b.level;

    if (!b.powered) {
      if (b.level > 0 && w.rng.chance(0.4)) b.level--;
    } else if (!b.transport) {
      if (b.level > 0 && w.rng.chance(0.25)) b.level--;
    } else {
      const score = growthScore(w, b);
      const threshold = w.rng.range(0, 60);
      if (score > threshold && b.level < MAX_LEVEL[b.type]) {
        const land = footprintAverage(w, w.landValue, b);
        if (b.level < 3 || land >= HIGH_DENSITY_LAND_VALUE[b.type]) b.level++;
      } else if (score < -threshold && b.level > 0) {
        b.level--;
      }
    }
    if (b.level !== before) {
      changed = true;
      if (b.level > before) b.seed = (b.seed * 1103515245 + 12345) & 0x3fffffff;
    }
  }
  if (changed) w.rev.buildings++;
}
