import { describe, expect, it } from "vitest";
import { demoCity } from "./demo";
import { stepActors } from "./disasters";
import { stepTrucks } from "./firefighters";
import { stepMonth } from "./simulation";
import { K, T } from "./types";
import { World } from "./world";

/** One month at normal speed: the fast actor clock ticks about 14 times per month. */
function month(w: World, onStep?: () => void): void {
  for (let k = 0; k < 14; k++) {
    stepActors(w);
    stepTrucks(w);
    onStep?.();
  }
  stepMonth(w);
}

/** Plant, fire station and a row of houses along a road. */
function street(seed: number, opts: { station: boolean; road: boolean }): World {
  const w = new World({ name: "t", seed, difficulty: "medium", size: 64 });
  w.terrain.fill(T.Land);
  w.settings.disasters = false;
  w.funds = 1e6;
  w.apply("coal", 0, 0);
  w.applyMany("power", World.linePath(4, 1, 10, 1));
  w.applyMany("power", World.linePath(10, 1, 10, 3));
  if (opts.station) w.apply("fire", 10, 4);
  if (opts.road) w.applyMany("road", World.linePath(9, 7, 40, 7));
  for (let k = 0; k < 6; k++) w.placeBuilding("R", 16 + k * 3, 4, 2);
  stepMonth(w);
  return w;
}

function burnHouse(w: World): void {
  for (let k = 0; k < 6; k++) w.fire[w.idx(23 + (k % 3), 4 + Math.floor(k / 3))] = 4;
}

describe("fires", () => {
  it("stay rare and local in a normal city", () => {
    const w = demoCity("Fire test", 7, 2);
    let burningMonths = 0;
    let maxBurning = 0;
    for (let m = 0; m < 120; m++) {
      month(w);
      const burning = w.fire.filter((f) => f > 0).length;
      if (burning) burningMonths++;
      maxBurning = Math.max(maxBurning, burning);
    }
    expect(burningMonths).toBeLessThan(40);
    expect(maxBurning).toBeLessThan(40);
  });

  it("are reached by a fire engine that puts them out and drives back", () => {
    for (let trial = 0; trial < 10; trial++) {
      const w = street(trial + 1, { station: true, road: true });
      const house = w.buildingAt(23, 4)!;
      burnHouse(w);
      const states = new Set<string>();
      for (let m = 0; m < 8; m++) month(w, () => w.trucks.forEach((t) => states.add(t.state)));
      // The engine drove out, fought the fire, and headed home.
      expect([...states].sort()).toEqual(["fighting", "going", "returning"]);
      // The house survived and its fire is out (other random fires may start meanwhile).
      expect(w.buildings.has(house.id)).toBe(true);
      for (let k = 0; k < 9; k++) expect(w.fire[w.idx(23 + (k % 3), 4 + Math.floor(k / 3))]).toBe(0);
    }
  });

  it("burn down buildings when no fire station can help", () => {
    let lost = 0;
    for (let trial = 0; trial < 10; trial++) {
      const w = street(trial + 1, { station: false, road: true });
      const before = w.buildings.size;
      burnHouse(w);
      for (let m = 0; m < 8; m++) month(w);
      lost += before - w.buildings.size;
    }
    expect(lost).toBeGreaterThan(5);
  });

  it("warn when no road leads to the fire", () => {
    const w = street(3, { station: true, road: false });
    burnHouse(w);
    month(w);
    expect(w.trucks.length).toBe(0);
    expect(w.messages.some((m) => m.key === "fireUnreachable")).toBe(true);
    expect(w.kind.includes(K.Building)).toBe(true);
  });
});
