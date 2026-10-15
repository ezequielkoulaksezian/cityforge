import {
  AIRPORT_NEEDED_JOBS,
  OPTIMAL_TAX,
  SEAPORT_NEEDED_JOBS,
  STADIUM_NEEDED_POP,
  VALVE_LIMIT,
} from "./constants";
import type { World } from "./world";

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

/**
 * RCI demand valves (section 9): residents follow jobs, commerce follows the internal market
 * (population) and industry follows the external market. Taxes shift all three, and large cities
 * need a stadium, a seaport and an airport to keep growing.
 */
export function updateDemand(w: World): void {
  const c = w.census;
  const labor = c.residents * 0.5;
  const jobs = c.comJobs + c.indJobs;
  w.externalMarket = 200 + w.year * 40;

  let r = ((jobs - labor) / Math.max(labor, 50)) * VALVE_LIMIT.R;
  if (c.residents < 500) r += 900;

  const comTarget = c.residents * 0.2;
  let com = ((comTarget - c.comJobs) / Math.max(comTarget, 20)) * VALVE_LIMIT.C;

  const indTarget = w.externalMarket + c.residents * 0.3;
  let ind = ((indTarget - c.indJobs) / Math.max(indTarget, 20)) * VALVE_LIMIT.I;

  const taxEffect = w.tax > OPTIMAL_TAX ? -(w.tax - OPTIMAL_TAX) * 150 : (OPTIMAL_TAX - w.tax) * 100;
  r += taxEffect;
  com += taxEffect;
  ind += taxEffect;

  if (c.residents > STADIUM_NEEDED_POP && c.stadiums === 0) {
    r = Math.min(r, 0);
    w.notify("needStadium", "warning", { cooldown: 12 });
  }
  if (c.indJobs > SEAPORT_NEEDED_JOBS && c.seaports === 0) {
    ind = Math.min(ind, 0);
    w.notify("needSeaport", "warning", { cooldown: 12 });
  }
  if (c.comJobs > AIRPORT_NEEDED_JOBS && c.airports === 0) {
    com = Math.min(com, 0);
    w.notify("needAirport", "warning", { cooldown: 12 });
  }

  w.valves = {
    R: Math.round(w.valves.R * 0.7 + clamp(r, VALVE_LIMIT.R) * 0.3),
    C: Math.round(w.valves.C * 0.7 + clamp(com, VALVE_LIMIT.C) * 0.3),
    I: Math.round(w.valves.I * 0.7 + clamp(ind, VALVE_LIMIT.I) * 0.3),
  };
}
