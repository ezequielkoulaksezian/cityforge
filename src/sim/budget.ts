import { DIFFICULTY, TAX_SCALE, UPKEEP } from "./constants";
import { K } from "./types";
import { isRoad, type World } from "./world";

/** Yearly costs requested by each department, before funding is applied. */
export function requestedBudget(w: World): { police: number; fire: number; transport: number } {
  const m = DIFFICULTY[w.difficulty].upkeepMultiplier;
  const c = w.census;
  return {
    police: Math.round(c.policeStations * UPKEEP.police * m),
    fire: Math.round(c.fireStations * UPKEEP.fire * m),
    transport: Math.round(
      (c.roads * UPKEEP.road + c.bridges * UPKEEP.bridge + c.rails * UPKEEP.rail + c.tunnels * UPKEEP.tunnel) * m,
    ),
  };
}

/** Projected yearly tax income with the current census and tax rate. */
export function projectedTaxIncome(w: World): number {
  const c = w.census;
  const base = c.residents + (c.comJobs + c.indJobs) * 0.6;
  const landFactor = 0.5 + c.avgLandValue / 200;
  return Math.round(base * landFactor * (w.tax / 100) * TAX_SCALE * DIFFICULTY[w.difficulty].taxMultiplier);
}

/**
 * January budget: collect taxes, then pay each department its funded share. Deficits are not
 * allowed (manual), so when cash runs short every department is cut proportionally.
 */
export function runYearlyBudget(w: World): void {
  const income = projectedTaxIncome(w);
  const requested = requestedBudget(w);
  const wanted = {
    police: Math.round((requested.police * w.funding.police) / 100),
    fire: Math.round((requested.fire * w.funding.fire) / 100),
    transport: Math.round((requested.transport * w.funding.transport) / 100),
  };
  const totalWanted = wanted.police + wanted.fire + wanted.transport;
  const available = Math.max(0, w.funds + income);
  let spent = wanted;
  if (totalWanted > available) {
    const ratio = totalWanted ? available / totalWanted : 0;
    spent = {
      police: Math.floor(wanted.police * ratio),
      fire: Math.floor(wanted.fire * ratio),
      transport: Math.floor(wanted.transport * ratio),
    };
    const pct = (part: number, req: number) => (req ? Math.floor((part / req) * 100) : 100);
    w.funding = {
      police: pct(spent.police, requested.police),
      fire: pct(spent.fire, requested.fire),
      transport: pct(spent.transport, requested.transport),
    };
    w.notify("fundingCut", "danger", { cooldown: 0 });
  }
  const total = spent.police + spent.fire + spent.transport;
  w.funds = w.funds + income - total;
  w.lastBudget = {
    year: w.year,
    taxIncome: income,
    requested,
    spent,
    cashflow: income - total,
  };
  w.notify("budget", w.lastBudget.cashflow >= 0 ? "info" : "warning", {
    params: { income, expenses: total },
    cooldown: 0,
  });
  if (w.funds < 1000) w.notify("lowFunds", "warning", { cooldown: 12 });
}

/** Underfunded roads deteriorate a little every month (rapidly below 75%). */
export function deteriorateRoads(w: World): void {
  const f = w.funding.transport;
  if (f >= 100 || w.census.roads + w.census.rails === 0) return;
  const rate = f < 75 ? (100 - f) / 100 / 60 : (100 - f) / 100 / 400;
  const n = w.size * w.size;
  let damaged = 0;
  const attempts = Math.ceil((w.census.roads + w.census.rails) * rate);
  for (let a = 0; a < attempts; a++) {
    const i = w.rng.int(n);
    const k = w.kind[i];
    if (isRoad(k) || k === K.Rail || k === K.RailPower) {
      w.kind[i] = k === K.RoadPower || k === K.RailPower ? K.Power : K.Rubble;
      damaged++;
    }
  }
  if (damaged) {
    w.rev.structures++;
    w.notify("roadsDecay", "warning", { cooldown: 12 });
  }
}
