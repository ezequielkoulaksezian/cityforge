import { describe, expect, it } from "vitest";
import { stepMonth } from "./simulation";
import { updatePower } from "./power";
import { deserialize, serialize } from "./save";
import { demoCity } from "./demo";
import { K, T } from "./types";
import { World } from "./world";

/** A flat, empty world so tests do not depend on generated terrain. */
function flatWorld(difficulty: "easy" | "medium" | "hard" = "easy"): World {
  const w = new World({ name: "Test", seed: 1, difficulty, size: 64 });
  w.terrain.fill(T.Land);
  w.settings.disasters = false;
  return w;
}

/**
 * A small planned town: a coal plant, a road grid and alternating R/C/I zones,
 * each zone touching a road.
 */
function buildTown(w: World): void {
  w.funds = 1_000_000;
  w.apply("coal", 2, 2);
  // Horizontal roads every 4 rows, vertical road on the left.
  for (let y = 7; y < 60; y += 4) w.applyMany("road", World.linePath(6, y, 60, y));
  w.applyMany("road", World.linePath(6, 7, 6, 59));
  // Power line from the plant down a column that touches the first zone of every row.
  w.applyMany("power", World.linePath(4, 6, 7, 6));
  w.applyMany("power", World.linePath(7, 6, 7, 59));
  let n = 0;
  for (let y = 8; y < 58; y += 4) {
    for (let x = 8; x < 58; x += 3) {
      const type = ["R", "R", "I", "C", "R"][n++ % 5] as "R" | "C" | "I";
      w.apply(type, x, y);
    }
  }
  w.apply("police", 20, 60);
  w.apply("fire", 30, 60);
  w.funds = 20_000;
}

describe("construction rules", () => {
  it("charges manual prices and rejects invalid placements", () => {
    const w = flatWorld();
    const start = w.funds;
    expect(w.apply("road", 1, 1)).toBe(10);
    expect(w.apply("R", 2, 2)).toBe(100);
    expect(w.check("C", 3, 3).ok).toBe(false);
    w.terrain[w.idx(20, 20)] = T.Water;
    expect(w.check("road", 20, 20).cost).toBe(50);
    expect(w.check("I", 19, 19).reason).toBe("water");
    expect(w.funds).toBe(start - 110);
  });

  it("lets power lines cross roads and bulldozes whole buildings", () => {
    const w = flatWorld();
    w.apply("road", 5, 5);
    w.apply("power", 5, 5);
    expect(w.kind[w.idx(5, 5)]).toBe(K.RoadPower);
    w.apply("police", 10, 10);
    w.apply("bulldoze", 11, 11);
    expect(w.buildings.size).toBe(0);
  });
});

describe("power", () => {
  it("powers zones connected to a plant and leaves the rest dark", () => {
    const w = flatWorld();
    w.funds = 100000;
    w.apply("coal", 0, 0);
    const near = w.placeBuilding("R", 4, 0);
    const far = w.placeBuilding("R", 30, 30);
    updatePower(w);
    expect(near.powered).toBe(true);
    expect(far.powered).toBe(false);
  });

  it("causes a brownout when demand exceeds capacity", () => {
    const w = flatWorld();
    w.placeBuilding("coal", 0, 0);
    for (let i = 0; i < 52; i++) w.placeBuilding("R", 4 + (i % 18) * 3, (i / 18 | 0) * 3);
    const { brownout } = updatePower(w);
    expect(brownout).toBe(true);
  });
});

describe("city growth", () => {
  it("grows a planned town over twenty years and keeps a positive budget", () => {
    const w = flatWorld("easy");
    buildTown(w);
    for (let m = 0; m < 240; m++) stepMonth(w);
    const c = w.census;
    console.log(
      `after 20y: residents=${c.residents} com=${c.comJobs} ind=${c.indJobs} funds=${w.funds} ` +
        `valves=${JSON.stringify(w.valves)} land=${c.avgLandValue.toFixed(0)} crime=${c.avgCrime.toFixed(0)} ` +
        `pollution=${c.avgPollution.toFixed(0)} score=${w.score} class=${w.cityClass} budget=${JSON.stringify(w.lastBudget)}`,
    );
    expect(c.residents).toBeGreaterThan(5000);
    expect(c.indJobs).toBeGreaterThan(0);
    expect(c.comJobs).toBeGreaterThan(0);
    expect(w.lastBudget!.taxIncome).toBeGreaterThan(0);
  });

  it("does not grow zones without power", () => {
    const w = flatWorld();
    w.applyMany("road", World.linePath(0, 4, 40, 4));
    w.apply("R", 2, 5);
    w.apply("I", 6, 5);
    for (let m = 0; m < 36; m++) stepMonth(w);
    expect(w.census.residents).toBe(0);
  });
});

describe("save files", () => {
  it("round-trips a running city", () => {
    const w = flatWorld();
    buildTown(w);
    for (let m = 0; m < 30; m++) stepMonth(w);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect(copy.buildings.size).toBe(w.buildings.size);
    expect(copy.funds).toBe(w.funds);
    expect([...copy.kind]).toEqual([...w.kind]);
    stepMonth(copy);
    expect(copy.month).toBe(w.month + 1);
  });
});

describe("example city", () => {
  it("is a healthy town where almost every zone has power", () => {
    const w = demoCity("Demo");
    const c = w.census;
    console.log(`demo: residents=${c.residents} unpowered=${c.unpoweredZones}/${c.zones.R + c.zones.C + c.zones.I} capacity=${c.powerCapacity} demand=${c.powerDemand} funds=${w.funds} score=${w.score}`);
    // Fires can cut a few zone chains; nearly everything else must stay powered.
    expect(c.unpoweredZones / (c.zones.R + c.zones.C + c.zones.I)).toBeLessThan(0.1);
    expect(c.residents).toBeGreaterThan(5000);
    for (const b of w.buildings.values())
      if (b.type === "police" || b.type === "fire" || b.type === "stadium") expect(b.powered).toBe(true);
  });
});
