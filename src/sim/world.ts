import {
  BULLDOZE_COST,
  DEFAULT_TAX,
  DIFFICULTY,
  MAP_SIZE,
  TOOL_BY_ID,
  WATER_COST,
  type BuildingType,
  type Difficulty,
  type ToolId,
} from "./constants";
import { Random } from "./random";
import { generateTerrain } from "./terrain";
import {
  K,
  T,
  type Actor,
  type Building,
  type BudgetReport,
  type Census,
  type Evaluation,
  type FireTruck,
  type Funding,
  type GameSettings,
  type History,
  type Message,
  type MessageId,
  type TileKind,
  type Valves,
} from "./types";

export type PlaceCheck = { ok: boolean; cost: number; reason?: PlaceError };
export type PlaceError = "bounds" | "water" | "occupied" | "funds" | "needsWater" | "nothing";

export const emptyCensus = (): Census => ({
  residents: 0,
  comJobs: 0,
  indJobs: 0,
  zones: { R: 0, C: 0, I: 0 },
  unpoweredZones: 0,
  policeStations: 0,
  fireStations: 0,
  stadiums: 0,
  seaports: 0,
  airports: 0,
  coal: 0,
  nuclear: 0,
  roads: 0,
  bridges: 0,
  rails: 0,
  tunnels: 0,
  powerCapacity: 0,
  powerDemand: 0,
  avgLandValue: 0,
  avgPollution: 0,
  avgCrime: 0,
  avgTraffic: 0,
  fires: 0,
});

export const isRoad = (k: number) => k === K.Road || k === K.RoadPower;
export const isRail = (k: number) => k === K.Rail || k === K.RailPower;
export const isTransport = (k: number) => isRoad(k) || isRail(k);
export const isConductor = (k: number) =>
  k === K.Power || k === K.RoadPower || k === K.RailPower || k === K.Building;

/**
 * The complete game state. The simulation modules read and write it; the renderer only reads it
 * and redraws when one of the revision counters changes.
 */
export class World {
  readonly size: number;
  name: string;
  seed: number;
  difficulty: Difficulty;

  terrain: Uint8Array;
  kind: Uint8Array;
  /** Building id per tile (0 = none). */
  bid: Int32Array;
  buildings = new Map<number, Building>();
  nextBuildingId = 1;

  /** Months a tile keeps burning (0 = not burning). */
  fire: Uint8Array;
  /** Months of flood water left on a tile that is normally land. */
  flood: Uint8Array;

  // Simulation maps, 0-255 per tile.
  power: Uint8Array;
  pollution: Uint8Array;
  landValue: Uint8Array;
  crime: Uint8Array;
  traffic: Uint8Array;
  density: Uint8Array;
  policeCoverage: Uint8Array;
  fireCoverage: Uint8Array;

  funds: number;
  /** Months elapsed since January of the start year. */
  month = 0;
  tax = DEFAULT_TAX;
  funding: Funding = { police: 100, fire: 100, transport: 100 };
  valves: Valves = { R: 0, C: 0, I: 0 };
  census: Census = emptyCensus();
  history: History = { residents: [], comJobs: [], indJobs: [], funds: [], crime: [], pollution: [] };
  evaluation: Evaluation | null = null;
  lastBudget: BudgetReport | null = null;
  score = 500;
  cityClass = "village";
  messages: Message[] = [];
  nextMessageId = 1;
  /** Month when each message key was last shown, to avoid spamming. */
  messageCooldown: Partial<Record<MessageId, number>> = {};
  actors: Actor[] = [];
  trucks: FireTruck[] = [];
  nextTruckId = 1;
  settings: GameSettings = { disasters: true, shadows: true };
  rng: Random;
  /** Round-robin cursor for traffic trips. */
  tripCursor = 0;
  externalMarket = 0;

  /** Revision counters: the renderer redraws a layer when its counter changes. */
  rev = { terrain: 0, structures: 0, buildings: 0, maps: 0, fire: 0 };

  constructor(opts: { name: string; seed: number; difficulty: Difficulty; size?: number }) {
    this.size = opts.size ?? MAP_SIZE;
    this.name = opts.name;
    this.seed = opts.seed;
    this.difficulty = opts.difficulty;
    this.funds = DIFFICULTY[opts.difficulty].funds;
    this.rng = new Random(opts.seed ^ 0x5bd1e995);
    const n = this.size * this.size;
    this.terrain = generateTerrain(this.size, opts.seed);
    this.kind = new Uint8Array(n);
    this.bid = new Int32Array(n);
    this.fire = new Uint8Array(n);
    this.flood = new Uint8Array(n);
    this.power = new Uint8Array(n);
    this.pollution = new Uint8Array(n);
    this.landValue = new Uint8Array(n);
    this.crime = new Uint8Array(n);
    this.traffic = new Uint8Array(n);
    this.density = new Uint8Array(n);
    this.policeCoverage = new Uint8Array(n);
    this.fireCoverage = new Uint8Array(n);
  }

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  isWater(x: number, y: number): boolean {
    const i = this.idx(x, y);
    return this.terrain[i] === T.Water || this.flood[i] > 0;
  }

  buildingAt(x: number, y: number): Building | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const id = this.bid[this.idx(x, y)];
    return id ? this.buildings.get(id) : undefined;
  }

  get year(): number {
    return Math.floor(this.month / 12);
  }

  // ---- Messages -------------------------------------------------------------------------

  notify(
    key: MessageId,
    severity: Message["severity"],
    opts: { params?: Message["params"]; x?: number; y?: number; cooldown?: number } = {},
  ): void {
    const cooldown = opts.cooldown ?? 6;
    const last = this.messageCooldown[key];
    if (last !== undefined && this.month - last < cooldown) return;
    this.messageCooldown[key] = this.month;
    this.messages.push({
      id: this.nextMessageId++,
      key,
      params: opts.params,
      x: opts.x,
      y: opts.y,
      month: this.month,
      severity,
    });
    if (this.messages.length > 60) this.messages.splice(0, this.messages.length - 60);
  }

  // ---- Construction rules ------------------------------------------------------------------

  /** Cost and validity of applying a tool to a single tile (network tools) or a footprint origin (buildings). */
  check(tool: ToolId, x: number, y: number): PlaceCheck {
    const def = TOOL_BY_ID[tool];
    if (tool === "query") return { ok: true, cost: 0 };
    if (tool === "bulldoze") return this.checkBulldoze(x, y);
    if (def.size === 1) return this.checkTile(tool, x, y);
    return this.checkFootprint(tool as BuildingType, x, y);
  }

  private checkTile(tool: ToolId, x: number, y: number): PlaceCheck {
    if (!this.inBounds(x, y)) return { ok: false, cost: 0, reason: "bounds" };
    const i = this.idx(x, y);
    const k = this.kind[i];
    const water = this.isWater(x, y);
    const base = TOOL_BY_ID[tool].cost;
    if (this.flood[i] > 0 || this.fire[i] > 0) return { ok: false, cost: 0, reason: "occupied" };
    if (tool === "park") {
      if (water) return { ok: false, cost: 0, reason: "water" };
      if (k !== K.None && k !== K.Rubble) return { ok: false, cost: 0, reason: k === K.Park ? "nothing" : "occupied" };
      return this.withFunds(base);
    }
    const cost = water ? (WATER_COST[tool] ?? base) : base;
    if (tool === "road") {
      if (isRoad(k)) return { ok: false, cost: 0, reason: "nothing" };
      if (k === K.None || k === K.Rubble) return this.withFunds(cost);
      // A road can cross a straight power line on land.
      if (k === K.Power && !water) return this.withFunds(cost);
      return { ok: false, cost: 0, reason: "occupied" };
    }
    if (tool === "rail") {
      if (isRail(k)) return { ok: false, cost: 0, reason: "nothing" };
      if (k === K.None || k === K.Rubble) return this.withFunds(cost);
      if (k === K.Power && !water) return this.withFunds(cost);
      return { ok: false, cost: 0, reason: "occupied" };
    }
    if (tool === "power") {
      if (k === K.Power || k === K.RoadPower || k === K.RailPower || k === K.Building)
        return { ok: false, cost: 0, reason: "nothing" };
      if (k === K.None || k === K.Rubble) return this.withFunds(cost);
      if ((k === K.Road || k === K.Rail) && !water) return this.withFunds(cost);
      return { ok: false, cost: 0, reason: "occupied" };
    }
    return { ok: false, cost: 0, reason: "occupied" };
  }

  private checkFootprint(type: BuildingType, x: number, y: number): PlaceCheck {
    const { size, cost } = TOOL_BY_ID[type];
    let touchesWater = false;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!this.inBounds(tx, ty)) return { ok: false, cost, reason: "bounds" };
        if (this.isWater(tx, ty)) return { ok: false, cost, reason: "water" };
        const i = this.idx(tx, ty);
        const k = this.kind[i];
        if ((k !== K.None && k !== K.Rubble) || this.fire[i] > 0) return { ok: false, cost, reason: "occupied" };
      }
    }
    if (type === "seaport") {
      for (let d = -1; d <= size && !touchesWater; d++) {
        for (const [tx, ty] of [
          [x + d, y - 1],
          [x + d, y + size],
          [x - 1, y + d],
          [x + size, y + d],
        ]) {
          if (this.inBounds(tx, ty) && this.terrain[this.idx(tx, ty)] === T.Water) touchesWater = true;
        }
      }
      if (!touchesWater) return { ok: false, cost, reason: "needsWater" };
    }
    return this.withFunds(cost);
  }

  private checkBulldoze(x: number, y: number): PlaceCheck {
    if (!this.inBounds(x, y)) return { ok: false, cost: 0, reason: "bounds" };
    const i = this.idx(x, y);
    const b = this.buildingAt(x, y);
    if (b) return this.withFunds(BULLDOZE_COST * b.size * b.size);
    if (this.kind[i] === K.Radioactive) return { ok: false, cost: 0, reason: "occupied" };
    if (this.kind[i] !== K.None || this.terrain[i] === T.Forest) return this.withFunds(BULLDOZE_COST);
    return { ok: false, cost: 0, reason: "nothing" };
  }

  private withFunds(cost: number): PlaceCheck {
    return cost > this.funds ? { ok: false, cost, reason: "funds" } : { ok: true, cost };
  }

  /** Applies a tool at one tile / footprint origin. Returns the money spent (0 when nothing happened). */
  apply(tool: ToolId, x: number, y: number): number {
    const res = this.check(tool, x, y);
    if (!res.ok) return 0;
    if (tool === "bulldoze") {
      this.bulldoze(x, y);
    } else if (TOOL_BY_ID[tool].size === 1) {
      this.placeTile(tool, x, y);
    } else {
      this.placeBuilding(tool as BuildingType, x, y);
    }
    this.funds -= res.cost;
    return res.cost;
  }

  private placeTile(tool: ToolId, x: number, y: number): void {
    const i = this.idx(x, y);
    const k = this.kind[i];
    if (this.terrain[i] === T.Forest) this.terrain[i] = T.Land;
    if (tool === "road") this.kind[i] = k === K.Power ? K.RoadPower : K.Road;
    else if (tool === "rail") this.kind[i] = k === K.Power ? K.RailPower : K.Rail;
    else if (tool === "power") this.kind[i] = k === K.Road ? K.RoadPower : k === K.Rail ? K.RailPower : K.Power;
    else if (tool === "park") this.kind[i] = K.Park;
    this.traffic[i] = 0;
    this.rev.structures++;
    this.rev.terrain++;
  }

  placeBuilding(type: BuildingType, x: number, y: number, level?: number): Building {
    const size = TOOL_BY_ID[type].size;
    const zone = type === "R" || type === "C" || type === "I";
    const b: Building = {
      id: this.nextBuildingId++,
      type,
      x,
      y,
      size,
      level: level ?? (zone ? 0 : 1),
      powered: false,
      transport: false,
      seed: this.rng.int(1 << 30),
      age: 0,
    };
    this.buildings.set(b.id, b);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const i = this.idx(x + dx, y + dy);
        this.kind[i] = K.Building;
        this.bid[i] = b.id;
        if (this.terrain[i] === T.Forest) this.terrain[i] = T.Land;
      }
    }
    this.rev.structures++;
    this.rev.buildings++;
    this.rev.terrain++;
    return b;
  }

  bulldoze(x: number, y: number): void {
    const b = this.buildingAt(x, y);
    if (b) {
      this.removeBuilding(b, false);
      return;
    }
    const i = this.idx(x, y);
    if (this.terrain[i] === T.Forest && this.kind[i] === K.None) this.terrain[i] = T.Land;
    this.kind[i] = K.None;
    this.traffic[i] = 0;
    this.rev.structures++;
    this.rev.terrain++;
  }

  /** Removes a building, optionally leaving rubble behind (fires, disasters). */
  removeBuilding(b: Building, rubble: boolean): void {
    for (let dy = 0; dy < b.size; dy++) {
      for (let dx = 0; dx < b.size; dx++) {
        const i = this.idx(b.x + dx, b.y + dy);
        this.kind[i] = rubble ? K.Rubble : K.None;
        this.bid[i] = 0;
        this.power[i] = 0;
      }
    }
    this.buildings.delete(b.id);
    this.rev.structures++;
    this.rev.buildings++;
    this.rev.terrain++;
  }

  /** Destroys whatever is on a tile (disasters). Buildings are destroyed as a whole. */
  destroyTile(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const b = this.buildingAt(x, y);
    if (b) {
      this.removeBuilding(b, true);
      return;
    }
    const i = this.idx(x, y);
    const k = this.kind[i];
    if (k === K.Radioactive) return;
    if (k !== K.None) {
      this.kind[i] = K.Rubble;
      this.traffic[i] = 0;
      this.rev.structures++;
    }
    if (this.terrain[i] === T.Forest) {
      this.terrain[i] = T.Land;
      this.rev.terrain++;
    }
  }

  /** Tiles of a line drag: an L-shaped path that follows the dominant axis first. */
  static linePath(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    const path: [number, number][] = [];
    const sx = x1 >= x0 ? 1 : -1;
    const sy = y1 >= y0 ? 1 : -1;
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
      for (let x = x0; ; x += sx) {
        path.push([x, y0]);
        if (x === x1) break;
      }
      for (let y = y0; y !== y1; ) {
        y += sy;
        path.push([x1, y]);
      }
    } else {
      for (let y = y0; ; y += sy) {
        path.push([x0, y]);
        if (y === y1) break;
      }
      for (let x = x0; x !== x1; ) {
        x += sx;
        path.push([x, y1]);
      }
    }
    return path;
  }

  static rectTiles(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    const tiles: [number, number][] = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles.push([x, y]);
    return tiles;
  }

  /** Total cost and validity of a multi-tile operation (drag). */
  checkMany(tool: ToolId, tiles: [number, number][]): { cost: number; valid: boolean[]; count: number } {
    let cost = 0;
    let count = 0;
    const valid: boolean[] = [];
    const seen = new Set<number>();
    const fundsBefore = this.funds;
    for (const [x, y] of tiles) {
      let res = this.check(tool, x, y);
      // Bulldozing several tiles of one building only charges once.
      if (tool === "bulldoze" && res.ok) {
        const b = this.buildingAt(x, y);
        if (b) {
          if (seen.has(b.id)) res = { ok: false, cost: 0 };
          seen.add(b.id);
        }
      }
      const affordable = res.ok || res.reason === "funds";
      const ok = affordable && cost + res.cost <= fundsBefore;
      valid.push(ok);
      if (ok) {
        cost += res.cost;
        count++;
      }
    }
    return { cost, valid, count };
  }

  applyMany(tool: ToolId, tiles: [number, number][]): number {
    let spent = 0;
    for (const [x, y] of tiles) spent += this.apply(tool, x, y);
    return spent;
  }

  setTileKind(x: number, y: number, k: TileKind): void {
    this.kind[this.idx(x, y)] = k;
    this.rev.structures++;
  }
}
