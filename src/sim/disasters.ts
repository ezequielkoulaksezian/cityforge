import { DIFFICULTY } from "./constants";
import { K, T } from "./types";
import type { World } from "./world";

export type DisasterId = "fire" | "flood" | "tornado" | "earthquake" | "monster" | "planeCrash" | "meltdown";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Tiles that can catch fire: buildings, parks and forest. */
function flammable(w: World, i: number): boolean {
  const k = w.kind[i];
  return k === K.Building || k === K.Park || (k === K.None && w.terrain[i] === T.Forest);
}

export function ignite(w: World, x: number, y: number, months = 2 + w.rng.int(2)): boolean {
  if (!w.inBounds(x, y)) return false;
  const i = w.idx(x, y);
  if (!flammable(w, i) || w.fire[i]) return false;
  w.fire[i] = months;
  w.rev.fire++;
  return true;
}

/** Chance per month that a burning tile ignites each flammable neighbour (before fire coverage). */
const SPREAD_CHANCE = 0.06;

/** Fire coverage (0-1) above which a tile counts as protected by a fire station. */
export const FIRE_COVERED = 0.08;

/**
 * Monthly fire behaviour: random outbreaks, spread, burning out into rubble. Spread is kept below
 * one new fire per burning tile on average, so fires die out on their own unless a disaster
 * starts many at once; fire stations put them out much faster.
 */
export function updateFires(w: World): void {
  const n = w.size * w.size;
  const diff = DIFFICULTY[w.difficulty];

  // Random outbreak in a developed building; fire coverage makes it less likely.
  if (w.buildings.size > 4 && w.rng.chance(diff.fireChance * 0.25)) {
    const ids = [...w.buildings.keys()];
    const b = w.buildings.get(ids[w.rng.int(ids.length)])!;
    const x = b.x + w.rng.int(b.size);
    const y = b.y + w.rng.int(b.size);
    if (b.level > 0 && w.rng.next() > w.fireCoverage[w.idx(x, y)] / 200 && ignite(w, x, y)) {
      w.notify("fire", "danger", { x, y, cooldown: 2 });
    }
  }

  const burning: number[] = [];
  for (let i = 0; i < n; i++) if (w.fire[i]) burning.push(i);
  if (!burning.length) return;

  for (const i of burning) {
    // The building already burned down (or was bulldozed): nothing left to burn here.
    if (!flammable(w, i)) {
      w.fire[i] = 0;
      continue;
    }
    const x = i % w.size;
    const y = (i / w.size) | 0;
    const cover = w.fireCoverage[i] / 255;
    // Inside a fire station's range firefighters fight the fire: most fires are out within
    // a month or two, and they cannot spread.
    if (cover > FIRE_COVERED && w.rng.chance(Math.min(0.95, 0.45 + cover))) {
      w.fire[i] = 0;
      continue;
    }
    if (cover <= FIRE_COVERED * 2) {
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (w.inBounds(nx, ny) && w.rng.chance(SPREAD_CHANCE * (1 - cover))) ignite(w, nx, ny);
      }
    }
    w.fire[i]--;
    if (w.fire[i] === 0) w.destroyTile(x, y);
  }
  w.rev.fire++;
}

function randomLand(w: World, nearCity: boolean): [number, number] {
  const buildings = [...w.buildings.values()];
  for (let attempt = 0; attempt < 200; attempt++) {
    let x: number;
    let y: number;
    if (nearCity && buildings.length) {
      const b = buildings[w.rng.int(buildings.length)];
      x = b.x + w.rng.int(7) - 3;
      y = b.y + w.rng.int(7) - 3;
    } else {
      x = w.rng.int(w.size);
      y = w.rng.int(w.size);
    }
    if (w.inBounds(x, y) && !w.isWater(x, y)) return [x, y];
  }
  return [w.size >> 1, w.size >> 1];
}

export function triggerDisaster(w: World, id: DisasterId): boolean {
  switch (id) {
    case "fire": {
      const [x, y] = randomLand(w, true);
      let lit = false;
      for (let d = 0; d < 6; d++) lit = ignite(w, x + w.rng.int(3) - 1, y + w.rng.int(3) - 1, 6 + w.rng.int(4)) || lit;
      if (!lit) return false;
      w.notify("fire", "danger", { x, y, cooldown: 0 });
      return true;
    }
    case "flood": {
      // Water spreads from the shore over nearby land for a few months.
      const shores: number[] = [];
      for (let y = 1; y < w.size - 1; y++)
        for (let x = 1; x < w.size - 1; x++) {
          const i = w.idx(x, y);
          if (w.terrain[i] !== T.Water) continue;
          if (DIRS.some(([dx, dy]) => w.terrain[w.idx(x + dx, y + dy)] !== T.Water)) shores.push(i);
        }
      if (!shores.length) return false;
      // Prefer shores close to buildings.
      let start = shores[w.rng.int(shores.length)];
      const buildings = [...w.buildings.values()];
      if (buildings.length) {
        const b = buildings[w.rng.int(buildings.length)];
        let best = Infinity;
        for (const s of shores) {
          const d = Math.hypot((s % w.size) - b.x, ((s / w.size) | 0) - b.y);
          if (d < best) {
            best = d;
            start = s;
          }
        }
      }
      const queue = [start];
      const seen = new Set([start]);
      let flooded = 0;
      while (queue.length && flooded < 70) {
        const i = queue.shift()!;
        const x = i % w.size;
        const y = (i / w.size) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!w.inBounds(nx, ny)) continue;
          const j = w.idx(nx, ny);
          if (seen.has(j)) continue;
          seen.add(j);
          if (w.terrain[j] !== T.Water) {
            if (!w.rng.chance(0.75)) continue;
            w.destroyTile(nx, ny);
            w.flood[j] = 6 + w.rng.int(5);
            flooded++;
          }
          queue.push(j);
        }
      }
      w.rev.terrain++;
      w.notify("flood", "danger", { x: start % w.size, y: (start / w.size) | 0, cooldown: 0 });
      return flooded > 0;
    }
    case "tornado": {
      const [x, y] = randomLand(w, true);
      const angle = w.rng.next() * Math.PI * 2;
      w.actors.push({ kind: "tornado", x, y, dx: Math.cos(angle), dy: Math.sin(angle), life: 45 });
      w.notify("tornado", "danger", { x, y, cooldown: 0 });
      return true;
    }
    case "earthquake": {
      const [cx, cy] = randomLand(w, true);
      const radius = 16;
      for (let y = cy - radius; y <= cy + radius; y++)
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (!w.inBounds(x, y) || Math.hypot(x - cx, y - cy) > radius) continue;
          const r = w.rng.next();
          if (r < 0.06) ignite(w, x, y);
          else if (r < 0.2) w.destroyTile(x, y);
        }
      w.notify("earthquake", "danger", { x: cx, y: cy, cooldown: 0 });
      return true;
    }
    case "monster": {
      const edge = w.rng.int(4);
      const p = w.rng.int(w.size);
      const [x, y] = [
        [p, 1],
        [w.size - 2, p],
        [p, w.size - 2],
        [1, p],
      ][edge];
      w.actors.push({ kind: "monster", x, y, dx: 0, dy: 0, life: 80 });
      w.notify("monster", "danger", { x, y, cooldown: 0 });
      return true;
    }
    case "planeCrash": {
      const airports = [...w.buildings.values()].filter((b) => b.type === "airport");
      if (!airports.length) return false;
      const a = airports[w.rng.int(airports.length)];
      const x = a.x + w.rng.int(20) - 7;
      const y = a.y + w.rng.int(20) - 7;
      for (let d = 0; d < 8; d++) {
        const fx = x + w.rng.int(5) - 2;
        const fy = y + w.rng.int(5) - 2;
        w.destroyTile(fx, fy);
        ignite(w, fx, fy);
      }
      w.notify("planeCrash", "danger", { x, y, cooldown: 0 });
      return true;
    }
    case "meltdown": {
      const plants = [...w.buildings.values()].filter((b) => b.type === "nuclear");
      if (!plants.length) return false;
      const p = plants[w.rng.int(plants.length)];
      const cx = p.x + 2;
      const cy = p.y + 2;
      w.removeBuilding(p, true);
      for (let y = cy - 6; y <= cy + 6; y++)
        for (let x = cx - 6; x <= cx + 6; x++) {
          if (!w.inBounds(x, y) || w.isWater(x, y)) continue;
          const d = Math.hypot(x - cx, y - cy);
          if (d > 6) continue;
          if (d < 3 || w.rng.chance(0.35)) {
            w.destroyTile(x, y);
            w.setTileKind(x, y, K.Radioactive);
          } else if (w.rng.chance(0.2)) ignite(w, x, y);
        }
      w.notify("meltdown", "danger", { x: cx, y: cy, cooldown: 0 });
      return true;
    }
  }
}

/** Monthly chance of a random disaster, and floods receding. */
export function updateDisasters(w: World): void {
  let receded = false;
  for (let i = 0; i < w.flood.length; i++) {
    if (w.flood[i]) {
      w.flood[i]--;
      if (!w.flood[i]) receded = true;
    }
  }
  if (receded) w.rev.terrain++;

  if (!w.settings.disasters || w.buildings.size < 10) return;
  const chance = DIFFICULTY[w.difficulty].disasterChance;
  if (w.census.avgPollution > 110 && w.rng.chance(chance * 1.5)) {
    triggerDisaster(w, "monster");
    return;
  }
  if (!w.rng.chance(chance)) return;
  const options: DisasterId[] = ["fire", "fire", "flood", "tornado", "earthquake"];
  if (w.census.airports) options.push("planeCrash");
  if (w.census.nuclear && w.rng.chance(0.15)) options.push("meltdown");
  triggerDisaster(w, options[w.rng.int(options.length)]);
}

/**
 * Moves tornadoes and monsters. Runs several times per month so they look continuous.
 * Returns true when anything changed.
 */
export function stepActors(w: World): boolean {
  if (!w.actors.length) return false;
  for (const a of w.actors) {
    a.life--;
    if (a.kind === "tornado") {
      a.dx += (w.rng.next() - 0.5) * 0.6;
      a.dy += (w.rng.next() - 0.5) * 0.6;
      const len = Math.hypot(a.dx, a.dy) || 1;
      a.dx /= len;
      a.dy /= len;
      a.x += a.dx * 0.9;
      a.y += a.dy * 0.9;
      w.destroyTile(Math.round(a.x), Math.round(a.y));
    } else {
      // Monsters walk toward the most polluted nearby tile, smashing what they step on.
      let best = -1;
      let tx = a.x;
      let ty = a.y;
      for (let t = 0; t < 12; t++) {
        const x = Math.round(a.x + (w.rng.next() - 0.5) * 30);
        const y = Math.round(a.y + (w.rng.next() - 0.5) * 30);
        if (!w.inBounds(x, y)) continue;
        const v = w.pollution[w.idx(x, y)] + w.density[w.idx(x, y)] * 0.3;
        if (v > best) {
          best = v;
          tx = x;
          ty = y;
        }
      }
      const len = Math.hypot(tx - a.x, ty - a.y) || 1;
      a.dx = a.dx * 0.6 + ((tx - a.x) / len) * 0.4;
      a.dy = a.dy * 0.6 + ((ty - a.y) / len) * 0.4;
      a.x += a.dx * 0.7;
      a.y += a.dy * 0.7;
      for (let oy = 0; oy <= 1; oy++)
        for (let ox = 0; ox <= 1; ox++) {
          const x = Math.round(a.x) + ox;
          const y = Math.round(a.y) + oy;
          if (w.inBounds(x, y) && !w.isWater(x, y)) {
            w.destroyTile(x, y);
            if (w.rng.chance(0.08)) ignite(w, x, y);
          }
        }
    }
    if (!w.inBounds(Math.round(a.x), Math.round(a.y))) a.life = 0;
  }
  w.actors = w.actors.filter((a) => a.life > 0);
  return true;
}
