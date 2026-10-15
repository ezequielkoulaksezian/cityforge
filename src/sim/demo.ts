import { stepMonth } from "./simulation";
import { T } from "./types";
import { World } from "./world";

/**
 * A planned example town: power plant, road grid, mixed zones, services and parks,
 * simulated for some years so every system is visible.
 */
export function demoCity(name: string, seed = 20261015, years = 16): World {
  const w = new World({ name, seed, difficulty: "easy" });
  w.settings.disasters = false;
  const x0 = 36;
  const y0 = 36;
  const span = 56;
  // Level a building area (keeps the generated river and lakes around it).
  for (let y = y0 - 2; y < y0 + span + 2; y++)
    for (let x = x0 - 2; x < x0 + span + 2; x++) w.terrain[w.idx(x, y)] = T.Land;
  // A lake inside the town raises land value nearby.
  for (let y = y0 + 22; y < y0 + 27; y++) for (let x = x0 + 40; x < x0 + 47; x++) w.terrain[w.idx(x, y)] = T.Water;

  w.funds = 1_000_000;
  w.apply("nuclear", x0 - 6, y0);
  w.apply("coal", x0 - 6, y0 + 6);
  for (let y = y0; y <= y0 + span; y += 4) w.applyMany("road", World.linePath(x0, y, x0 + span, y));
  for (const x of [x0, x0 + 19, x0 + 37, x0 + span]) w.applyMany("road", World.linePath(x, y0, x, y0 + span));
  w.applyMany("rail", World.linePath(x0 - 1, y0 - 1, x0 + span + 1, y0 - 1));
  w.applyMany("power", World.linePath(x0 - 2, y0 + 1, x0 + 1, y0 + 1));
  w.applyMany("power", World.linePath(x0 + 1, y0 + 1, x0 + 1, y0 + span));
  w.applyMany("power", World.linePath(x0 - 2, y0 + 8, x0 + 1, y0 + 8));

  const layout = ["R", "R", "C", "R", "I", "R", "C", "R", "R", "I"] as const;
  let n = 0;
  for (let y = y0 + 1; y < y0 + span - 2; y += 4) {
    for (let x = x0 + 2; x < x0 + span - 2; x += 3) {
      if (w.kind[w.idx(x, y)] !== 0) continue;
      const type = layout[n++ % layout.length];
      if (x > x0 + 38 && y > y0 + 18 && y < y0 + 30) continue;
      w.apply(type, x, y);
    }
  }
  w.apply("police", x0 + 20, y0 + span + 2);
  w.apply("fire", x0 + 24, y0 + span + 2);
  w.apply("stadium", x0 + 30, y0 + span + 2);
  w.applyMany("road", World.linePath(x0 + 20, y0 + span + 1, x0 + 34, y0 + span + 1));
  for (let k = 0; k < 6; k++) w.apply("park", x0 + 40 + k, y0 + 28);

  w.funds = 15_000;
  for (let m = 0; m < years * 12; m++) stepMonth(w);
  w.messages = [];
  return w;
}
