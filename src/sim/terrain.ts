import { hash2, Random } from "./random";
import { T } from "./types";

/** Smooth value noise in [0, 1). */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fractal(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Generates terrain: a meandering river, sometimes a coastline, a few lakes and forests.
 * Returns one terrain value per tile.
 */
export function generateTerrain(size: number, seed: number): Uint8Array {
  const rng = new Random(seed);
  const terrain = new Uint8Array(size * size);
  const idx = (x: number, y: number) => y * size + x;

  // Coastline on one edge, in about half of the maps.
  const coast = rng.chance(0.55) ? rng.int(4) : -1;
  const coastDepth = 6 + rng.int(8);

  // River: a noisy path from one edge to the opposite one.
  const horizontal = rng.chance(0.5);
  const riverWidth = 2 + rng.int(2);
  let offset = size * (0.3 + rng.next() * 0.4);
  const riverSeed = rng.int(1e6);

  for (let i = 0; i < size; i++) {
    offset += (fractal(i * 0.05, 0, riverSeed, 2) - 0.5) * 2.2;
    offset = Math.max(10, Math.min(size - 10, offset));
    for (let w = -riverWidth; w <= riverWidth; w++) {
      const p = Math.round(offset + w);
      if (p < 0 || p >= size) continue;
      const [x, y] = horizontal ? [i, p] : [p, i];
      terrain[idx(x, y)] = T.Water;
    }
  }

  const lakeSeed = rng.int(1e6);
  const forestSeed = rng.int(1e6);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, y);
      if (coast >= 0) {
        const d = [y, size - 1 - x, size - 1 - y, x][coast];
        const wobble = fractal(x * 0.06, y * 0.06, lakeSeed + 7, 3) * 8;
        if (d < coastDepth + wobble - 4) {
          terrain[i] = T.Water;
          continue;
        }
      }
      if (terrain[i] === T.Water) continue;
      const lake = fractal(x * 0.045, y * 0.045, lakeSeed, 4);
      if (lake > 0.74) {
        terrain[i] = T.Water;
        continue;
      }
      const forest = fractal(x * 0.08, y * 0.08, forestSeed, 4);
      if (forest > 0.6) terrain[i] = T.Forest;
    }
  }

  return terrain;
}
