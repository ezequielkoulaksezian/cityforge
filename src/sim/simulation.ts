import { HISTORY_LENGTH, MS_PER_MONTH, type Speed } from "./constants";
import { deteriorateRoads, runYearlyBudget } from "./budget";
import { cityClassFor, takeCensus } from "./census";
import { updateDemand } from "./demand";
import { stepActors, updateDisasters, updateFires } from "./disasters";
import { stepTrucks } from "./firefighters";
import { evaluateCity } from "./evaluation";
import { updateMaps } from "./maps";
import { updatePower } from "./power";
import { updateTraffic } from "./traffic";
import { K } from "./types";
import { updateZones } from "./zones";
import type { World } from "./world";

const CLASS_ORDER = ["village", "town", "city", "capital", "metropolis", "megalopolis"];

/** One simulated month: the order follows section 4 of the design document. */
export function stepMonth(w: World): { yearEnded: boolean } {
  const { brownout } = updatePower(w);
  const { jammed } = updateTraffic(w);
  updateMaps(w);
  updateZones(w);
  takeCensus(w);
  updateDemand(w);
  updateFires(w);
  updateDisasters(w);
  deteriorateRoads(w);
  advise(w, brownout, jammed);
  recordHistory(w);

  w.month++;
  w.rev.maps++;
  let yearEnded = false;
  if (w.month % 12 === 0) {
    runYearlyBudget(w);
    evaluateCity(w);
    yearEnded = true;
  }

  const cls = cityClassFor(w.census.residents);
  if (CLASS_ORDER.indexOf(cls) > CLASS_ORDER.indexOf(w.cityClass)) {
    w.notify("classUp", "success", { params: { cls }, cooldown: 0 });
  }
  w.cityClass = cls;
  return { yearEnded };
}

function recordHistory(w: World): void {
  const h = w.history;
  const push = (arr: number[], v: number) => {
    arr.push(Math.round(v));
    if (arr.length > HISTORY_LENGTH) arr.shift();
  };
  push(h.residents, w.census.residents);
  push(h.comJobs, w.census.comJobs);
  push(h.indJobs, w.census.indJobs);
  push(h.funds, w.funds);
  push(h.crime, w.census.avgCrime);
  push(h.pollution, w.census.avgPollution);
}

/** Advisor messages about the most common problems. */
function advise(w: World, brownout: boolean, jammed: number): void {
  const c = w.census;
  const zones = c.zones.R + c.zones.C + c.zones.I;
  if (zones > 0 && c.coal + c.nuclear === 0) w.notify("needPower", "warning", { cooldown: 8 });
  else if (brownout) w.notify("brownout", "warning", { cooldown: 8 });

  let roadless = 0;
  let sample: [number, number] | undefined;
  for (const b of w.buildings.values()) {
    if ((b.type === "R" || b.type === "C" || b.type === "I") && b.powered && !b.transport) {
      roadless++;
      sample ??= [b.x + 1, b.y + 1];
    }
  }
  if (roadless >= 2) w.notify("needRoads", "warning", { x: sample?.[0], y: sample?.[1], cooldown: 10 });
  if (c.avgPollution > 90) w.notify("pollution", "warning", { cooldown: 14 });
  if (c.avgCrime > 90) w.notify("crime", "warning", { cooldown: 14 });
  if (jammed > 25) w.notify("traffic", "warning", { cooldown: 14 });
  if (c.residents > 2500 && c.policeStations === 0) w.notify("needPolice", "info", { cooldown: 18 });
  if (c.residents > 2500 && c.fireStations === 0) w.notify("needFire", "info", { cooldown: 18 });
  if (w.funds <= 0) w.notify("noFunds", "danger", { cooldown: 6 });
}

/**
 * Drives the world in real time: months advance according to the speed, and disaster actors
 * move several times per month so they look smooth.
 */
export class Simulation {
  private monthClock = 0;
  private actorClock = 0;
  onYear?: () => void;

  constructor(public world: World) {}

  /** Advances by dt milliseconds of real time. Returns true when the world changed. */
  tick(dt: number, speed: Speed): boolean {
    if (speed === 0) return false;
    let changed = false;
    // Actors (tornadoes, monsters, fire engines) move faster at higher game speeds.
    const actorPeriod = speed === 3 ? 60 : speed === 2 ? 110 : 160;
    this.actorClock += dt;
    while (this.actorClock >= actorPeriod) {
      this.actorClock -= actorPeriod;
      changed = stepActors(this.world) || changed;
      changed = stepTrucks(this.world) || changed;
    }
    this.monthClock += Math.min(dt, 1000);
    const period = MS_PER_MONTH[speed];
    while (this.monthClock >= period) {
      this.monthClock -= period;
      const { yearEnded } = stepMonth(this.world);
      if (yearEnded) this.onYear?.();
      changed = true;
    }
    return changed;
  }

  /** Recomputes power and maps right after the player builds, so overlays react immediately. */
  refresh(): void {
    updatePower(this.world);
    updateTraffic(this.world);
    updateMaps(this.world);
    takeCensus(this.world);
    this.world.rev.maps++;
  }
}

export function hasStructures(w: World): boolean {
  for (let i = 0; i < w.kind.length; i++) if (w.kind[i] !== K.None) return true;
  return false;
}
