import { Random } from "./random";
import type { Building } from "./types";
import { World } from "./world";

const VERSION = 1;

function encode(arr: Uint8Array | Int32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type SaveFile = ReturnType<typeof serialize>;

export function serialize(w: World) {
  return {
    version: VERSION,
    savedAt: new Date().toISOString(),
    name: w.name,
    seed: w.seed,
    difficulty: w.difficulty,
    size: w.size,
    terrain: encode(w.terrain),
    kind: encode(w.kind),
    fire: encode(w.fire),
    flood: encode(w.flood),
    traffic: encode(w.traffic),
    crime: encode(w.crime),
    buildings: [...w.buildings.values()],
    nextBuildingId: w.nextBuildingId,
    funds: w.funds,
    month: w.month,
    tax: w.tax,
    funding: w.funding,
    valves: w.valves,
    history: w.history,
    evaluation: w.evaluation,
    lastBudget: w.lastBudget,
    score: w.score,
    cityClass: w.cityClass,
    settings: w.settings,
    rng: w.rng.getState(),
    tripCursor: w.tripCursor,
  };
}

export function deserialize(data: SaveFile): World {
  if (!data || data.version !== VERSION) throw new Error("Unsupported save file");
  const w = new World({ name: data.name, seed: data.seed, difficulty: data.difficulty, size: data.size });
  w.terrain = decode(data.terrain);
  w.kind = decode(data.kind);
  w.fire = decode(data.fire);
  w.flood = decode(data.flood);
  w.traffic = decode(data.traffic);
  w.crime = decode(data.crime);
  w.bid = new Int32Array(w.size * w.size);
  for (const b of data.buildings as Building[]) {
    w.buildings.set(b.id, { ...b });
    for (let dy = 0; dy < b.size; dy++) for (let dx = 0; dx < b.size; dx++) w.bid[w.idx(b.x + dx, b.y + dy)] = b.id;
  }
  w.nextBuildingId = data.nextBuildingId;
  w.funds = data.funds;
  w.month = data.month;
  w.tax = data.tax;
  w.funding = data.funding;
  w.valves = data.valves;
  w.history = data.history;
  w.evaluation = data.evaluation;
  w.lastBudget = data.lastBudget;
  w.score = data.score;
  w.cityClass = data.cityClass;
  w.settings = data.settings;
  w.rng = new Random(1);
  w.rng.setState(data.rng);
  w.tripCursor = data.tripCursor;
  return w;
}

const SLOT_KEY = (slot: number) => `cityforge.save.${slot}`;
export const AUTOSAVE_SLOT = 0;

export type SlotInfo = { slot: number; name: string; savedAt: string; month: number; population: number } | null;

export function saveToSlot(w: World, slot: number): boolean {
  try {
    localStorage.setItem(SLOT_KEY(slot), JSON.stringify(serialize(w)));
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(slot: number): World | null {
  try {
    const raw = localStorage.getItem(SLOT_KEY(slot));
    return raw ? deserialize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function slotInfo(slot: number): SlotInfo {
  try {
    const raw = localStorage.getItem(SLOT_KEY(slot));
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveFile;
    return {
      slot,
      name: d.name,
      savedAt: d.savedAt,
      month: d.month,
      population: d.history.residents.at(-1) ?? 0,
    };
  } catch {
    return null;
  }
}
