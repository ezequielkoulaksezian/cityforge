import { SERVICE_RADIUS, ZONE_LEVELS } from "./constants";
import { K, T } from "./types";
import { isRoad, type World } from "./world";

/** Separable box blur, in place, over a Float32Array grid. */
function blur(src: Float32Array, size: number, radius: number, passes = 1): Float32Array {
  const tmp = new Float32Array(src.length);
  const window = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      let acc = 0;
      for (let x = -radius; x <= radius; x++) acc += src[y * size + Math.min(size - 1, Math.max(0, x))];
      for (let x = 0; x < size; x++) {
        tmp[y * size + x] = acc / window;
        const add = Math.min(size - 1, x + radius + 1);
        const sub = Math.max(0, x - radius);
        acc += src[y * size + add] - src[y * size + sub];
      }
    }
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(size - 1, Math.max(0, y)) * size + x];
      for (let y = 0; y < size; y++) {
        src[y * size + x] = acc / window;
        const add = Math.min(size - 1, y + radius + 1);
        const sub = Math.max(0, y - radius);
        acc += tmp[add * size + x] - tmp[sub * size + x];
      }
    }
  }
  return src;
}

const clamp = (v: number, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);

/** Coverage map of a service: linear falloff over SERVICE_RADIUS, scaled by budget funding. */
function coverage(w: World, type: "police" | "fire", funding: number, out: Uint8Array): void {
  out.fill(0);
  const strength = 255 * (funding / 100);
  for (const b of w.buildings.values()) {
    if (b.type !== type) continue;
    const effective = b.powered ? strength : strength * 0.5;
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    for (let y = Math.max(0, Math.floor(cy - SERVICE_RADIUS)); y < Math.min(w.size, cy + SERVICE_RADIUS); y++) {
      for (let x = Math.max(0, Math.floor(cx - SERVICE_RADIUS)); x < Math.min(w.size, cx + SERVICE_RADIUS); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > SERVICE_RADIUS) continue;
        const v = effective * (1 - d / SERVICE_RADIUS);
        const i = w.idx(x, y);
        out[i] = clamp(Math.max(out[i], v));
      }
    }
  }
}

/** Recomputes population density, pollution, land value, crime and service coverage. */
export function updateMaps(w: World): { center: [number, number] } {
  const n = w.size * w.size;
  const size = w.size;

  // Population density.
  const dens = new Float32Array(n);
  let cx = 0;
  let cy = 0;
  let total = 0;
  for (const b of w.buildings.values()) {
    if (b.type !== "R" && b.type !== "C" && b.type !== "I") continue;
    const people = ZONE_LEVELS[b.type][b.level] * (b.type === "R" ? 1 : 0.6);
    const perTile = people / (b.size * b.size) / 0.4;
    for (let dy = 0; dy < b.size; dy++)
      for (let dx = 0; dx < b.size; dx++) dens[w.idx(b.x + dx, b.y + dy)] = perTile;
    cx += (b.x + 1.5) * people;
    cy += (b.y + 1.5) * people;
    total += people;
  }
  const center: [number, number] = total > 0 ? [cx / total, cy / total] : [size / 2, size / 2];
  blur(dens, size, 1);
  for (let i = 0; i < n; i++) w.density[i] = clamp(Math.round(dens[i]));

  // Pollution sources.
  const pol = new Float32Array(n);
  for (const b of w.buildings.values()) {
    let amount = 0;
    if (b.type === "I") amount = b.level > 0 ? 40 + b.level * 30 : 0;
    else if (b.type === "coal") amount = 230;
    else if (b.type === "airport") amount = 110;
    else if (b.type === "seaport") amount = 80;
    if (!amount) continue;
    for (let dy = 0; dy < b.size; dy++)
      for (let dx = 0; dx < b.size; dx++) pol[w.idx(b.x + dx, b.y + dy)] += amount;
  }
  for (let i = 0; i < n; i++) {
    const k = w.kind[i];
    if (isRoad(k)) pol[i] += w.traffic[i] * 0.6;
    if (w.fire[i]) pol[i] += 160;
    if (k === K.Radioactive) pol[i] += 255;
  }
  blur(pol, size, 2, 2);
  for (let i = 0; i < n; i++) {
    let v = pol[i] * 1.6;
    const k = w.kind[i];
    if (k === K.Park) v -= 30;
    else if (w.terrain[i] === T.Forest) v -= 15;
    w.pollution[i] = clamp(Math.round(v));
  }

  // Service coverage.
  coverage(w, "police", w.funding.police, w.policeCoverage);
  coverage(w, "fire", w.funding.fire, w.fireCoverage);

  // Land value: distance to the city centre, nearby nature, minus pollution and crime.
  const nature = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (w.terrain[i] === T.Water) nature[i] = 1;
    else if (w.terrain[i] === T.Forest) nature[i] = 0.7;
    else if (w.kind[i] === K.Park) nature[i] = 1.2;
  }
  blur(nature, size, 3);
  const maxDist = size * 0.75;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (w.terrain[i] === T.Water || w.kind[i] === K.Radioactive) {
        w.landValue[i] = 0;
        continue;
      }
      const d = Math.hypot(x - center[0], y - center[1]);
      let v = 25 + Math.max(0, 1 - d / maxDist) * 110;
      v += Math.min(1, nature[i] * 2.2) * 55;
      v -= w.pollution[i] * 0.55;
      v -= Math.max(0, w.crime[i] - 60) * 0.35;
      w.landValue[i] = clamp(Math.round(v), 1, 250);
    }
  }

  // Crime: density raises it, land value and police lower it.
  const cr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!w.density[i]) continue;
    const v = w.density[i] * 1.1 + (140 - w.landValue[i]) * 0.55 - w.policeCoverage[i] * 0.95;
    cr[i] = Math.max(0, v);
  }
  blur(cr, size, 1);
  for (let i = 0; i < n; i++) w.crime[i] = clamp(Math.round(cr[i]), 0, 250);

  return { center };
}
