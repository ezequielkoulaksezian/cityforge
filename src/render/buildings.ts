import type { Building } from "../sim/types";
import { Random } from "../sim/random";
import type { Part } from "./pool";

const pick = <T>(r: Random, items: T[]): T => items[r.int(items.length)];

const HOUSE_WALLS = ["#efe6d2", "#e8d3b0", "#d9e3e8", "#f2efe9", "#e6c9a8", "#cfe0c9", "#f0d9d0"];
const ROOFS = ["#a5432f", "#8c4a32", "#5e5a57", "#7b3b2f", "#455a64", "#9b6b43"];
const APARTMENT = ["#c9a27e", "#b98c6b", "#d8c3a5", "#a9a39b", "#c4b39a", "#9e8577"];
const OFFICE = ["#8fb3c9", "#7da1b8", "#a7c4d4", "#6f93ad", "#b9cfd9", "#8aa4b0"];
const SHOP = ["#e6d5b8", "#d8c4a8", "#efe2cc", "#cdbba1"];
const AWNING = ["#c0392b", "#2e86c1", "#27ae60", "#f39c12", "#8e44ad", "#16a085"];
const FACTORY = ["#9aa0a6", "#8c8f86", "#a39e93", "#7f8a8f", "#b0a99a"];

/**
 * Builds the parts of a building inside its footprint. ox/oz are the world coordinates of the
 * footprint's top-left corner; everything is placed relative to it.
 */
export function buildingParts(b: Building, ox: number, oz: number): Part[] {
  const r = new Random(b.seed + b.level * 7919);
  const parts: Part[] = [];
  const s = b.size;
  const cx = ox + s / 2;
  const cz = oz + s / 2;
  /** Center of one of the 3x3 cells of a zone. */
  const cell = (i: number) => [ox + (i % 3) + 0.5, oz + Math.floor(i / 3) + 0.5] as const;

  const house = (x: number, z: number, scale = 1) => {
    const w = (0.55 + r.next() * 0.2) * scale;
    const d = (0.5 + r.next() * 0.2) * scale;
    const h = (0.32 + r.next() * 0.15) * scale;
    const rot = r.chance(0.5) ? 0 : Math.PI / 2;
    parts.push({ shape: "box", x, y: 0, z, sx: w, sy: h, sz: d, rot, color: pick(r, HOUSE_WALLS) });
    parts.push({ shape: "roof", x, y: h, z, sx: w * 1.08, sy: 0.25 * scale, sz: d * 1.1, rot, color: pick(r, ROOFS) });
  };
  const tree = (x: number, z: number, h = 0.5) => {
    parts.push({ shape: "cyl", x, y: 0, z, sx: 0.07, sy: h * 0.4, sz: 0.07, color: "#6b4f2e" });
    parts.push({ shape: "cone", x, y: h * 0.3, z, sx: h * 0.6, sy: h, sz: h * 0.6, color: pick(r, ["#3f7d3a", "#4c8c3f", "#2f6b34"]) });
  };
  const tower = (x: number, z: number, w: number, d: number, h: number, colors: string[], rooftop = true) => {
    const color = pick(r, colors);
    parts.push({ shape: "box", x, y: 0, z, sx: w, sy: h, sz: d, color, windows: true });
    if (rooftop) {
      parts.push({ shape: "box", x: x + (r.next() - 0.5) * w * 0.3, y: h, z: z + (r.next() - 0.5) * d * 0.3, sx: w * 0.35, sy: 0.18, sz: d * 0.3, color: "#8a8f94" });
    }
  };

  switch (b.type) {
    case "R": {
      if (b.level === 0) break;
      const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => r.next() - 0.5);
      if (b.level === 1) {
        for (let k = 0; k < 4; k++) house(...cell(cells[k]));
        for (let k = 4; k < 6; k++) tree(...cell(cells[k]), 0.45);
      } else if (b.level === 2) {
        for (let k = 0; k < 8; k++) house(...cell(cells[k]));
        tree(...cell(cells[8]), 0.5);
      } else if (b.level === 3) {
        // Low-rise apartment blocks.
        const n = 3 + r.int(2);
        for (let k = 0; k < n; k++) {
          const [x, z] = cell(cells[k]);
          tower(x, z, 0.85, 0.85, 0.9 + r.next() * 0.5, APARTMENT, false);
        }
        for (let k = n; k < n + 2; k++) tree(...cell(cells[k]), 0.45);
      } else if (b.level === 4) {
        tower(cx - 0.7, cz - 0.6, 1.2, 1.1, 2.2 + r.next() * 0.8, APARTMENT);
        tower(cx + 0.7, cz + 0.6, 1.1, 1.2, 1.8 + r.next() * 0.9, APARTMENT);
        tree(cx + 0.9, cz - 0.9, 0.5);
        tree(cx - 0.9, cz + 0.9, 0.5);
      } else {
        tower(cx - 0.55, cz, 1.25, 1.6, 4.5 + r.next() * 2, APARTMENT);
        tower(cx + 0.8, cz + 0.2, 0.9, 1.2, 3 + r.next() * 1.5, APARTMENT);
      }
      break;
    }
    case "C": {
      if (b.level === 0) break;
      if (b.level <= 2) {
        const n = b.level === 1 ? 3 : 6;
        const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => r.next() - 0.5);
        for (let k = 0; k < n; k++) {
          const [x, z] = cell(cells[k]);
          const h = b.level === 1 ? 0.45 : 0.6 + r.next() * 0.4;
          parts.push({ shape: "box", x, y: 0, z, sx: 0.85, sy: h, sz: 0.8, color: pick(r, SHOP), windows: b.level === 2 });
          parts.push({ shape: "box", x, y: 0.28, z: z + 0.42, sx: 0.8, sy: 0.06, sz: 0.12, color: pick(r, AWNING) });
        }
      } else if (b.level === 3) {
        tower(cx - 0.6, cz - 0.5, 1.4, 1.5, 1.6 + r.next(), OFFICE);
        tower(cx + 0.75, cz + 0.6, 1.1, 1.1, 1.2 + r.next(), SHOP);
      } else if (b.level === 4) {
        tower(cx, cz, 2.0, 1.7, 3.2 + r.next() * 1.5, OFFICE);
        tower(cx + 1, cz + 1, 0.8, 0.8, 1.2, SHOP, false);
      } else {
        const h = 6 + r.next() * 3;
        tower(cx, cz, 2.2, 2.2, h, OFFICE, false);
        parts.push({ shape: "box", x: cx, y: h, z: cz, sx: 1.4, sy: 1, sz: 1.4, color: pick(r, OFFICE), windows: true });
        parts.push({ shape: "cyl", x: cx, y: h + 1, z: cz, sx: 0.08, sy: 1.4, sz: 0.08, color: "#c8cdd2" });
      }
      break;
    }
    case "I": {
      if (b.level === 0) break;
      const color = pick(r, FACTORY);
      if (b.level === 1) {
        parts.push({ shape: "box", x: cx - 0.4, y: 0, z: cz, sx: 1.6, sy: 0.55, sz: 1.3, color });
        parts.push({ shape: "box", x: cx + 0.9, y: 0, z: cz + 0.8, sx: 0.6, sy: 0.35, sz: 0.6, color: "#b89b6a" });
      } else {
        const hall = 0.6 + b.level * 0.2;
        parts.push({ shape: "box", x: cx - 0.3, y: 0, z: cz - 0.2, sx: 2.1, sy: hall, sz: 1.8, color });
        // Saw-tooth roof.
        for (let k = 0; k < 3; k++)
          parts.push({ shape: "roof", x: cx - 1 + k * 0.7, y: hall, z: cz - 0.2, sx: 0.7, sy: 0.3, sz: 1.8, rot: Math.PI / 2, color: "#6f767b" });
        const chimneys = b.level - 1;
        for (let k = 0; k < chimneys; k++)
          parts.push({ shape: "cyl", x: cx + 1 - k * 0.35, y: 0, z: cz + 1, sx: 0.22, sy: 1.6 + b.level * 0.4, sz: 0.22, color: "#8b5e4a" });
        if (b.level >= 3) {
          parts.push({ shape: "cyl", x: cx - 1, y: 0, z: cz + 1, sx: 0.7, sy: 0.7, sz: 0.7, color: "#c7c2b4" });
        }
      }
      break;
    }
    case "police": {
      parts.push({ shape: "box", x: cx, y: 0, z: cz - 0.3, sx: 2.2, sy: 0.9, sz: 1.6, color: "#5d7fa3", windows: true });
      parts.push({ shape: "box", x: cx, y: 0.9, z: cz - 0.3, sx: 0.7, sy: 0.12, sz: 0.25, color: "#4fc3f7", glow: true });
      parts.push({ shape: "box", x: cx - 0.7, y: 0, z: cz + 1, sx: 0.5, sy: 0.25, sz: 0.3, color: "#e8e8e8" });
      parts.push({ shape: "box", x: cx + 0.2, y: 0, z: cz + 1, sx: 0.5, sy: 0.25, sz: 0.3, color: "#e8e8e8" });
      break;
    }
    case "fire": {
      parts.push({ shape: "box", x: cx, y: 0, z: cz - 0.3, sx: 2.3, sy: 1.0, sz: 1.6, color: "#b23a2f", windows: true });
      parts.push({ shape: "box", x: cx + 0.8, y: 0, z: cz - 0.5, sx: 0.5, sy: 1.8, sz: 0.5, color: "#a03328" });
      for (let k = 0; k < 3; k++)
        parts.push({ shape: "box", x: cx - 0.7 + k * 0.6, y: 0, z: cz + 0.52, sx: 0.45, sy: 0.6, sz: 0.04, color: "#ececec" });
      parts.push({ shape: "box", x: cx - 0.4, y: 0, z: cz + 1.1, sx: 0.8, sy: 0.3, sz: 0.32, color: "#d32f2f" });
      break;
    }
    case "stadium": {
      parts.push({ shape: "cyl", x: cx, y: 0, z: cz, sx: 3.8, sy: 0.9, sz: 3.4, color: "#c9c4b8" });
      parts.push({ shape: "box", x: cx, y: 0.9, z: cz, sx: 2.2, sy: 0.02, sz: 1.6, color: "#3f9b46" });
      parts.push({ shape: "box", x: cx, y: 0.92, z: cz, sx: 0.04, sy: 0.01, sz: 1.5, color: "#ffffff" });
      for (const [dx, dz] of [
        [-1.7, -1.5],
        [1.7, -1.5],
        [-1.7, 1.5],
        [1.7, 1.5],
      ])
        parts.push({ shape: "cyl", x: cx + dx, y: 0, z: cz + dz, sx: 0.08, sy: 2.2, sz: 0.08, color: "#9aa0a6" });
      break;
    }
    case "coal": {
      parts.push({ shape: "box", x: cx - 0.5, y: 0, z: cz - 0.4, sx: 2.4, sy: 1.4, sz: 2.2, color: "#7d7f80", windows: true });
      parts.push({ shape: "cyl", x: cx + 1.2, y: 0, z: cz - 1.1, sx: 0.5, sy: 4.2, sz: 0.5, color: "#9b6a55" });
      parts.push({ shape: "cyl", x: cx + 1.2, y: 0, z: cz + 0.2, sx: 0.5, sy: 3.6, sz: 0.5, color: "#9b6a55" });
      parts.push({ shape: "cone", x: cx - 0.6, y: 0, z: cz + 1.4, sx: 1.6, sy: 0.6, sz: 1, color: "#2b2b2b" });
      break;
    }
    case "nuclear": {
      parts.push({ shape: "tower", x: cx - 0.85, y: 0, z: cz - 0.85, sx: 1.7, sy: 2.8, sz: 1.7, color: "#d7d3cc" });
      parts.push({ shape: "tower", x: cx + 0.9, y: 0, z: cz - 0.85, sx: 1.5, sy: 2.5, sz: 1.5, color: "#d7d3cc" });
      parts.push({ shape: "cyl", x: cx - 0.5, y: 0, z: cz + 1, sx: 1.2, sy: 1.1, sz: 1.2, color: "#e9e6df" });
      parts.push({ shape: "sphere", x: cx - 0.5, y: 0.5, z: cz + 1, sx: 1.2, sy: 1.2, sz: 1.2, color: "#e9e6df" });
      parts.push({ shape: "box", x: cx + 1, y: 0, z: cz + 1.1, sx: 1.4, sy: 0.7, sz: 1.2, color: "#9aa5ab", windows: true });
      break;
    }
    case "seaport": {
      parts.push({ shape: "box", x: cx, y: 0, z: cz, sx: 3.9, sy: 0.12, sz: 3.9, color: "#8d8f8a" });
      parts.push({ shape: "box", x: cx - 1.1, y: 0.12, z: cz - 1, sx: 1.4, sy: 0.7, sz: 1.2, color: "#a8a39a", windows: true });
      const colors = ["#c0392b", "#2980b9", "#27ae60", "#f39c12", "#7f8c8d"];
      for (let k = 0; k < 8; k++)
        parts.push({
          shape: "box",
          x: cx + 0.2 + (k % 4) * 0.42,
          y: 0.12 + Math.floor(k / 4) * 0.28,
          z: cz - 1.2 + (k % 2) * 0.3,
          sx: 0.38,
          sy: 0.26,
          sz: 0.26,
          color: colors[k % colors.length],
        });
      // Cranes.
      for (const dx of [-0.6, 0.8]) {
        parts.push({ shape: "box", x: cx + dx, y: 0.12, z: cz + 1.3, sx: 0.12, sy: 2.2, sz: 0.12, color: "#e0a526" });
        parts.push({ shape: "box", x: cx + dx, y: 2.3, z: cz + 1.1, sx: 0.12, sy: 0.12, sz: 1.8, color: "#e0a526" });
      }
      break;
    }
    case "airport": {
      parts.push({ shape: "box", x: cx, y: 0, z: cz + 1.2, sx: 5.8, sy: 0.04, sz: 1.1, color: "#4a4d50" });
      for (let k = 0; k < 7; k++)
        parts.push({ shape: "box", x: cx - 2.4 + k * 0.8, y: 0.04, z: cz + 1.2, sx: 0.35, sy: 0.01, sz: 0.06, color: "#f5f5f5" });
      parts.push({ shape: "box", x: cx - 1, y: 0, z: cz - 1.6, sx: 3, sy: 0.9, sz: 1.4, color: "#cfd8dc", windows: true });
      parts.push({ shape: "cyl", x: cx + 1.8, y: 0, z: cz - 1.6, sx: 0.4, sy: 2.6, sz: 0.4, color: "#b0bec5" });
      parts.push({ shape: "cyl", x: cx + 1.8, y: 2.6, z: cz - 1.6, sx: 0.8, sy: 0.4, sz: 0.8, color: "#4fc3f7", glow: true });
      // A parked plane.
      parts.push({ shape: "box", x: cx + 0.8, y: 0.15, z: cz - 0.2, sx: 1.4, sy: 0.18, sz: 0.2, color: "#fafafa" });
      parts.push({ shape: "box", x: cx + 0.8, y: 0.2, z: cz - 0.2, sx: 0.25, sy: 0.04, sz: 1.3, color: "#fafafa" });
      break;
    }
  }
  return parts;
}

/** Positions of smoke emitters (chimney tops) for a building. */
export function chimneyTops(b: Building, ox: number, oz: number): [number, number, number][] {
  const cx = ox + b.size / 2;
  const cz = oz + b.size / 2;
  if (b.type === "coal") return [
    [cx + 1.2, 4.2, cz - 1.1],
    [cx + 1.2, 3.6, cz + 0.2],
  ];
  if (b.type === "nuclear") return [
    [cx - 0.85, 2.8, cz - 0.85],
    [cx + 0.9, 2.5, cz - 0.85],
  ];
  if (b.type === "I" && b.level >= 2) {
    const out: [number, number, number][] = [];
    for (let k = 0; k < b.level - 1; k++) out.push([cx + 1 - k * 0.35, 1.6 + b.level * 0.4, cz + 1]);
    return out;
  }
  return [];
}
