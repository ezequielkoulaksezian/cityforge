import { TOOL_BY_ID } from "./constants";
import { cityClassFor } from "./census";
import type { Evaluation, ProblemId } from "./types";
import type { World } from "./world";

const WEIGHTS: Record<ProblemId, number> = {
  crime: 1.5,
  pollution: 1.5,
  housing: 1,
  taxes: 1.3,
  traffic: 1.3,
  unemployment: 1.8,
  fire: 1,
  power: 1.8,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Share of citizens (0-100) that name each problem, from its severity. */
export function problemPercents(w: World): Record<ProblemId, number> {
  const c = w.census;
  const labor = c.residents * 0.5;
  const jobs = c.comJobs + c.indJobs;
  const zones = c.zones.R + c.zones.C + c.zones.I;
  const builtUp = c.residents + jobs;
  return {
    crime: clamp(c.avgCrime / 2.2, 0, 100),
    pollution: clamp(c.avgPollution / 2.2, 0, 100),
    housing: clamp((c.avgLandValue - 60) / 2, 0, 100),
    taxes: clamp((w.tax - 5) * 6, 0, 100),
    traffic: clamp(c.avgTraffic / 1.6, 0, 100),
    unemployment: labor > 0 ? clamp(((labor - jobs) / labor) * 120, 0, 100) : 0,
    fire: clamp(c.fires * 4 + (builtUp > 2000 && c.fireStations === 0 ? 25 : 0), 0, 100),
    power: zones ? clamp((c.unpoweredZones / zones) * 140, 0, 100) : 0,
  };
}

/** Yearly evaluation (section 12): score 0-1000, approval, top problems and city class. */
export function evaluateCity(w: World): Evaluation {
  const problems = problemPercents(w);
  let penalty = 0;
  let weightSum = 0;
  for (const id of Object.keys(problems) as ProblemId[]) {
    penalty += problems[id] * WEIGHTS[id];
    weightSum += WEIGHTS[id];
  }
  const population = w.census.residents;
  const previous = w.evaluation?.population ?? 0;
  const delta = population - previous;
  const growth = previous > 0 ? clamp((delta / previous) * 400, -150, 150) : population > 0 ? 50 : 0;
  const raw = clamp(1000 - (penalty / weightSum) * 14 + growth, 0, 1000);
  w.score = Math.round(w.evaluation ? w.score * 0.5 + raw * 0.5 : raw);

  const approval = Math.round(clamp(w.score / 10 + 5, 0, 100));
  const sorted = (Object.keys(problems) as ProblemId[])
    .map((id) => ({ id, percent: Math.round(problems[id]) }))
    .filter((p) => p.percent > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);

  let assessed = 0;
  for (const b of w.buildings.values()) assessed += TOOL_BY_ID[b.type].cost;
  const c = w.census;
  assessed += c.roads * 10 + c.bridges * 50 + c.rails * 20 + c.tunnels * 100;

  const evaluation: Evaluation = {
    year: w.year,
    score: w.score,
    approval,
    problems: sorted,
    population,
    delta,
    assessedValue: assessed,
    cityClass: cityClassFor(population),
  };
  w.evaluation = evaluation;
  return evaluation;
}
