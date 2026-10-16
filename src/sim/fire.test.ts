import { expect, it } from "vitest";
import { demoCity } from "./demo";
import { stepMonth } from "./simulation";
import { K, T } from "./types";
import { World } from "./world";

it("fires stay rare and local in a normal city", () => {
  const w = demoCity("Fire test", 7, 2);
  let burningMonths = 0;
  let maxBurning = 0;
  const rubbleBefore = w.kind.filter((k) => k === K.Rubble).length;
  for (let m = 0; m < 120; m++) {
    stepMonth(w);
    const burning = w.fire.filter((f) => f > 0).length;
    if (burning) burningMonths++;
    maxBurning = Math.max(maxBurning, burning);
  }
  const burned = w.kind.filter((k) => k === K.Rubble).length - rubbleBefore;
  console.log(`months with fire=${burningMonths}/120 maxBurning=${maxBurning} newRubble=${burned}`);
  expect(burningMonths).toBeLessThan(40);
  expect(maxBurning).toBeLessThan(40);
});

it("fire stations put out fires within their range", () => {
  const run = (station: boolean) => {
    let months = 0;
    let lost = 0;
    for (let trial = 0; trial < 20; trial++) {
      const w = new World({ name: "t", seed: trial + 1, difficulty: "medium", size: 64 });
      w.terrain.fill(T.Land);
      w.settings.disasters = false;
      w.funds = 1e6;
      w.apply("coal", 0, 0);
      w.applyMany("power", World.linePath(4, 1, 10, 1));
      w.applyMany("power", World.linePath(10, 1, 10, 3));
      if (station) w.apply("fire", 10, 4);
      for (let k = 0; k < 6; k++) w.placeBuilding("R", 16 + k * 3, 4, 2);
      stepMonth(w);
      const before = w.buildings.size;
      for (let k = 0; k < 6; k++) w.fire[w.idx(17 + (k % 3), 4 + Math.floor(k / 3))] = 6;
      let m = 0;
      while (w.fire.some((f) => f > 0) && m < 40) {
        stepMonth(w);
        m++;
      }
      months += m;
      lost += before - w.buildings.size;
    }
    return { months: months / 20, lost: lost / 20 };
  };
  const without = run(false);
  const withStation = run(true);
  expect(withStation.months).toBeLessThan(without.months / 2);
  expect(withStation.lost).toBeLessThan(without.lost / 4);
});
