import { CITY_CLASSES, ZONE_LEVELS, type CityClass } from "./constants";
import { K, T } from "./types";
import { emptyCensus, type World } from "./world";

/** Counts population, jobs, buildings and network tiles, and averages the maps over the city. */
export function takeCensus(w: World): void {
  const c = emptyCensus();
  c.powerCapacity = w.census.powerCapacity;
  c.powerDemand = w.census.powerDemand;

  for (const b of w.buildings.values()) {
    switch (b.type) {
      case "R":
        c.residents += ZONE_LEVELS.R[b.level];
        c.zones.R++;
        break;
      case "C":
        c.comJobs += ZONE_LEVELS.C[b.level];
        c.zones.C++;
        break;
      case "I":
        c.indJobs += ZONE_LEVELS.I[b.level];
        c.zones.I++;
        break;
      case "police":
        c.policeStations++;
        break;
      case "fire":
        c.fireStations++;
        break;
      case "stadium":
        c.stadiums++;
        break;
      case "seaport":
        c.seaports++;
        break;
      case "airport":
        c.airports++;
        break;
      case "coal":
        c.coal++;
        break;
      case "nuclear":
        c.nuclear++;
        break;
    }
    if ((b.type === "R" || b.type === "C" || b.type === "I") && !b.powered) c.unpoweredZones++;
  }

  let landSum = 0;
  let pollutionSum = 0;
  let crimeSum = 0;
  let developed = 0;
  let trafficSum = 0;
  let roads = 0;
  const n = w.size * w.size;
  for (let i = 0; i < n; i++) {
    const k = w.kind[i];
    const water = w.terrain[i] === T.Water;
    if (k === K.Road || k === K.RoadPower) {
      if (water) c.bridges++;
      else c.roads++;
      trafficSum += w.traffic[i];
      roads++;
    } else if (k === K.Rail || k === K.RailPower) {
      if (water) c.tunnels++;
      else c.rails++;
    }
    if (w.fire[i]) c.fires++;
    if (w.density[i] > 0) {
      developed++;
      landSum += w.landValue[i];
      pollutionSum += w.pollution[i];
      crimeSum += w.crime[i];
    }
  }
  c.avgLandValue = developed ? landSum / developed : 0;
  c.avgPollution = developed ? pollutionSum / developed : 0;
  c.avgCrime = developed ? crimeSum / developed : 0;
  c.avgTraffic = roads ? trafficSum / roads : 0;
  w.census = c;
}

export function cityClassFor(population: number): CityClass {
  let id: CityClass = "village";
  for (const cls of CITY_CLASSES) if (population >= cls.min) id = cls.id;
  return id;
}
