// Every rule number used by the simulation. See docs/DISENO_DEL_JUEGO.md for the sources.

export const MAP_SIZE = 128;

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY: Record<
  Difficulty,
  { funds: number; taxMultiplier: number; upkeepMultiplier: number; disasterChance: number; fireChance: number }
> = {
  easy: { funds: 20000, taxMultiplier: 1.4, upkeepMultiplier: 0.7, disasterChance: 0.004, fireChance: 0.25 },
  medium: { funds: 10000, taxMultiplier: 1.2, upkeepMultiplier: 1.0, disasterChance: 0.008, fireChance: 0.4 },
  hard: { funds: 5000, taxMultiplier: 0.8, upkeepMultiplier: 1.2, disasterChance: 0.014, fireChance: 0.6 },
};

export type BuildingType = "R" | "C" | "I" | "police" | "fire" | "stadium" | "coal" | "nuclear" | "seaport" | "airport";

export type ToolId =
  | "query"
  | "bulldoze"
  | "road"
  | "rail"
  | "power"
  | "park"
  | BuildingType;

export type ToolDef = {
  id: ToolId;
  cost: number;
  /** Footprint size in tiles for buildings; 1 for network tools. */
  size: number;
  /** Network tools are dragged as lines, bulldoze as a rectangle. */
  drag: "line" | "rect" | "none";
  key: string;
};

export const TOOLS: ToolDef[] = [
  { id: "query", cost: 0, size: 1, drag: "none", key: "?" },
  { id: "bulldoze", cost: 1, size: 1, drag: "rect", key: "b" },
  { id: "road", cost: 10, size: 1, drag: "line", key: "r" },
  { id: "rail", cost: 20, size: 1, drag: "line", key: "t" },
  { id: "power", cost: 5, size: 1, drag: "line", key: "l" },
  { id: "park", cost: 10, size: 1, drag: "rect", key: "p" },
  { id: "R", cost: 100, size: 3, drag: "none", key: "1" },
  { id: "C", cost: 100, size: 3, drag: "none", key: "2" },
  { id: "I", cost: 100, size: 3, drag: "none", key: "3" },
  { id: "police", cost: 500, size: 3, drag: "none", key: "4" },
  { id: "fire", cost: 500, size: 3, drag: "none", key: "5" },
  { id: "stadium", cost: 3000, size: 4, drag: "none", key: "6" },
  { id: "coal", cost: 3000, size: 4, drag: "none", key: "7" },
  { id: "nuclear", cost: 5000, size: 4, drag: "none", key: "8" },
  { id: "seaport", cost: 5000, size: 4, drag: "none", key: "9" },
  { id: "airport", cost: 10000, size: 6, drag: "none", key: "0" },
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;

/** Extra cost when a network tile is built over water (bridge, tunnel, cable). */
export const WATER_COST: Partial<Record<ToolId, number>> = { road: 50, rail: 100, power: 25 };

export const BULLDOZE_COST = 1;

// ---- Power -----------------------------------------------------------------

export const POWER_CAPACITY: Partial<Record<BuildingType, number>> = { coal: 50, nuclear: 150 };
export const POWER_DEMAND: Record<BuildingType, number> = {
  R: 1,
  C: 1,
  I: 1,
  police: 1,
  fire: 1,
  stadium: 2,
  coal: 0,
  nuclear: 0,
  seaport: 2,
  airport: 3,
};

// ---- Zones -------------------------------------------------------------------

/** Residents (R) or jobs (C, I) per density level; index = level. */
export const ZONE_LEVELS: Record<"R" | "C" | "I", number[]> = {
  R: [0, 40, 120, 280, 520, 860],
  C: [0, 20, 60, 130, 220, 340],
  I: [0, 40, 100, 180, 280],
};

export const MAX_LEVEL = { R: 5, C: 5, I: 4 } as const;

/** Land value needed to grow beyond level 3. */
export const HIGH_DENSITY_LAND_VALUE = { R: 80, C: 60, I: 0 } as const;

export const TRIP_MAX_DISTANCE = 40;

// ---- Demand valves -------------------------------------------------------------

export const VALVE_LIMIT = { R: 2000, C: 1500, I: 1500 } as const;
export const OPTIMAL_TAX = 7;
export const STADIUM_NEEDED_POP = 15000;
export const SEAPORT_NEEDED_JOBS = 3000;
export const AIRPORT_NEEDED_JOBS = 3000;

// ---- Budget ---------------------------------------------------------------------

export const DEFAULT_TAX = 7;
export const MAX_TAX = 20;
export const TAX_SCALE = 2.2;
export const UPKEEP = {
  police: 100,
  fire: 100,
  road: 1,
  bridge: 4,
  rail: 4,
  tunnel: 10,
} as const;

// ---- Services ----------------------------------------------------------------------

export const SERVICE_RADIUS = 16;

// ---- City classes (manual) ----------------------------------------------------------

export const CITY_CLASSES = [
  { id: "village", min: 0 },
  { id: "town", min: 2000 },
  { id: "city", min: 10000 },
  { id: "capital", min: 50000 },
  { id: "metropolis", min: 100000 },
  { id: "megalopolis", min: 500000 },
] as const;

export type CityClass = (typeof CITY_CLASSES)[number]["id"];

// ---- Time -----------------------------------------------------------------------------

export type Speed = 0 | 1 | 2 | 3;
/** Milliseconds per simulated month for each speed (0 = paused). */
export const MS_PER_MONTH: Record<Speed, number> = { 0: Infinity, 1: 4000, 2: 1500, 3: 500 };

export const START_YEAR = 1900;
export const HISTORY_LENGTH = 240;
