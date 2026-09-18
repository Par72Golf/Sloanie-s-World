import type { DressId, HairId, PetSave, QuestSave } from "./types";

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
  /** Dumplings that ran off or were stolen, by id, so a reload keeps them there. */
  movedSpots: Record<string, [number, number, number]>;
  /** Best runs per park, fastest first. */
  leaderboard: RunRecord[][];
  /** Accessories found so far, across all parks. */
  foundAccessories: string[];
  /** What she is wearing, by slot. */
  worn: Record<string, string | null>;
  /** Camera: third person by default, first person opt-in. */
  view: "third" | "first";
  /** Frame-rate readout, switched on from the pause menu. */
  showFps: boolean;
  /** Render quality: "sharp" (full resolution, bloom) or "smooth" (lighter, for a slow screen). */
  graphics: "sharp" | "smooth";
  /** Carnival tickets, spent at the prize booth. */
  tickets: number;
  /** Best mini golf round for the five-hole course, in strokes. */
  golfBest: number | null;
  /** Whether she has found the sticker book (stickers need it), and her stickers. */
  stickerBook: boolean;
  stickers: string[];
  quest: QuestSave;
  pet: PetSave | null;
  /** Read HUD messages and panels aloud (speech.ts). */
  readAloud: boolean;
  /** Instruction cards already shown (help-cards.tsx). */
  seenHelp: string[];
  /** Read-aloud voice by name; empty means the best installed one. */
  voice: string;
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
  movedSpots: {},
  foundAccessories: [],
  worn: { head: null, hair: null, face: null, back: null },
  view: "third",
  showFps: false,
  graphics: "sharp",
  tickets: 0,
  golfBest: null,
  stickerBook: false,
  stickers: [],
  quest: { stage: "none", treats: [] },
  pet: null,
  readAloud: true,
  seenHelp: [],
  voice: "",
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
  if (!s.movedSpots || typeof s.movedSpots !== "object") s.movedSpots = {};
  s.movedSpots = Object.fromEntries(
    Object.entries(s.movedSpots).filter(
      ([, p]) => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === "number" && Number.isFinite(n)),
    ),
  ) as SaveData["movedSpots"];
  if (!Array.isArray(s.foundAccessories)) s.foundAccessories = [];
  s.foundAccessories = s.foundAccessories.filter((x) => typeof x === "string");
  if (!s.worn || typeof s.worn !== "object") s.worn = {};
  s.worn = {
    head: typeof s.worn.head === "string" ? s.worn.head : null,
    hair: typeof s.worn.hair === "string" ? s.worn.hair : null,
    face: typeof s.worn.face === "string" ? s.worn.face : null,
    back: typeof s.worn.back === "string" ? s.worn.back : null,
    hand: typeof s.worn.hand === "string" ? s.worn.hand : null,
  };
  if (s.view !== "first") s.view = "third";
  s.showFps = s.showFps === true;
  if (s.graphics !== "smooth") s.graphics = "sharp";
  s.readAloud = s.readAloud !== false;
  s.voice = typeof s.voice === "string" ? s.voice : "";
  s.seenHelp = Array.isArray(s.seenHelp) ? s.seenHelp.filter((x) => typeof x === "string") : [];
  s.tickets = Number.isFinite(s.tickets) && s.tickets > 0 ? Math.floor(s.tickets) : 0;
  s.stickerBook = s.stickerBook === true;
  s.golfBest = Number.isFinite(s.golfBest) && (s.golfBest as number) > 0 ? Math.floor(s.golfBest as number) : null;
  s.stickers = Array.isArray(s.stickers) ? s.stickers.filter((x) => typeof x === "string") : [];
  const stages = ["none", "treats", "trail", "escort", "choose", "done"];
  s.quest =
    s.quest && stages.includes(s.quest.stage)
      ? { stage: s.quest.stage, treats: Array.isArray(s.quest.treats) ? s.quest.treats.filter((x) => Number.isInteger(x)) : [] }
      : { stage: "none", treats: [] };
  // escorting a pet home cannot resume mid-walk; it waits in the cave again
  if (s.quest.stage === "escort") s.quest.stage = "trail";
  s.pet =
    s.pet && ["puppy", "kitten", "bunny"].includes(s.pet.kind) && typeof s.pet.name === "string"
      ? { kind: s.pet.kind, coat: typeof s.pet.coat === "string" ? s.pet.coat : "", name: s.pet.name.slice(0, 16) }
      : null;
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
