import type { DressId, HairId } from "./types";

const KEY = "sloanies-world-v1";
const SAVE_VERSION = 2;

/** One completed run. Kept per explorer name so siblings can take turns. */
export type RunRecord = {
  name: string;
  seconds: number;
  hintsUsed: number;
  at: number;
};

export type SaveData = {
  version: number;
  playerName: string;
  dress: DressId;
  hair: HairId;
  unlocked: number;
  collected: string[][];
  muted: boolean;
  levelIndex: number;
  /** Which set of hiding spots the current run is using. */
  layout: number;
  /** Best runs per park, fastest first. */
  leaderboard: RunRecord[][];
};

const DEFAULT: SaveData = {
  version: SAVE_VERSION,
  playerName: "Sloan",
  dress: "coral",
  hair: "brown",
  unlocked: 0,
  collected: [[], [], []],
  muted: false,
  levelIndex: 0,
  leaderboard: [[], [], []],
  layout: 0,
};

function migrate(raw: SaveData): SaveData {
  const s = { ...DEFAULT, ...raw };
  if (!Array.isArray(s.collected) || s.collected.length < 3) {
    s.collected = [[], [], []];
  }
  s.collected = [0, 1, 2].map((i) =>
    Array.isArray(s.collected[i]) ? s.collected[i]!.slice() : [],
  );
  if (!Array.isArray(s.leaderboard) || s.leaderboard.length < 3) {
    s.leaderboard = [[], [], []];
  }
  s.leaderboard = [0, 1, 2].map((i) =>
    Array.isArray(s.leaderboard[i]) ? s.leaderboard[i]!.slice() : [],
  );
  if (typeof s.layout !== "number") s.layout = 0;
  s.version = SAVE_VERSION;
  return s;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, collected: [[], [], []], leaderboard: [[], [], []], layout: 0 };
    const parsed = JSON.parse(raw) as SaveData;
    return migrate(parsed);
  } catch {
    return { ...DEFAULT, collected: [[], [], []], leaderboard: [[], [], []], layout: 0 };
  }
}

export function persistSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
