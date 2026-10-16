import { expect, it } from "vitest";
import { demoCity } from "./demo";
import { stepMonth } from "./simulation";
import { K } from "./types";

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
