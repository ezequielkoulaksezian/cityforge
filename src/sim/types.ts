import type { BuildingType, Difficulty, Speed } from "./constants";

/** Terrain under each tile. */
export const T = { Land: 0, Water: 1, Forest: 2 } as const;
export type TerrainKind = (typeof T)[keyof typeof T];

/** What is built on a tile. */
export const K = {
  None: 0,
  Road: 1,
  Rail: 2,
  Power: 3,
  RoadPower: 4,
  RailPower: 5,
  Park: 6,
  Building: 7,
  Rubble: 8,
  Radioactive: 9,
} as const;
export type TileKind = (typeof K)[keyof typeof K];

export type Building = {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  size: number;
  /** Density level for zones (0 = empty lot); always 1 for service buildings. */
  level: number;
  powered: boolean;
  /** Zones only: has road/rail on its perimeter and a reachable destination. */
  transport: boolean;
  /** Visual variation seed. */
  seed: number;
  /** Months since built, used for animations and stats. */
  age: number;
};

export type Funding = { police: number; fire: number; transport: number };

export type Valves = { R: number; C: number; I: number };

export type Census = {
  residents: number;
  comJobs: number;
  indJobs: number;
  zones: { R: number; C: number; I: number };
  unpoweredZones: number;
  policeStations: number;
  fireStations: number;
  stadiums: number;
  seaports: number;
  airports: number;
  coal: number;
  nuclear: number;
  roads: number;
  bridges: number;
  rails: number;
  tunnels: number;
  powerCapacity: number;
  powerDemand: number;
  avgLandValue: number;
  avgPollution: number;
  avgCrime: number;
  avgTraffic: number;
  fires: number;
};

export type BudgetReport = {
  year: number;
  taxIncome: number;
  requested: { police: number; fire: number; transport: number };
  spent: { police: number; fire: number; transport: number };
  cashflow: number;
};

export type Evaluation = {
  year: number;
  score: number;
  approval: number;
  problems: { id: ProblemId; percent: number }[];
  population: number;
  delta: number;
  assessedValue: number;
  cityClass: string;
};

export type ProblemId =
  | "crime"
  | "pollution"
  | "housing"
  | "taxes"
  | "traffic"
  | "unemployment"
  | "fire"
  | "power";

export type MessageId =
  | "needPower"
  | "brownout"
  | "needRoads"
  | "pollution"
  | "crime"
  | "traffic"
  | "needStadium"
  | "needSeaport"
  | "needAirport"
  | "lowFunds"
  | "noFunds"
  | "budget"
  | "fundingCut"
  | "classUp"
  | "fire"
  | "flood"
  | "tornado"
  | "earthquake"
  | "monster"
  | "planeCrash"
  | "meltdown"
  | "welcome"
  | "roadsDecay"
  | "needPolice"
  | "needFire";

export type Message = {
  id: number;
  key: MessageId;
  params?: Record<string, string | number>;
  x?: number;
  y?: number;
  month: number;
  severity: "info" | "warning" | "danger" | "success";
};

export type History = {
  residents: number[];
  comJobs: number[];
  indJobs: number[];
  funds: number[];
  crime: number[];
  pollution: number[];
};

/** A moving disaster actor (tornado or monster). */
export type Actor = {
  kind: "tornado" | "monster";
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Simulation steps left. */
  life: number;
};

export type GameSettings = {
  disasters: boolean;
  shadows: boolean;
};

export type { Difficulty, Speed };
