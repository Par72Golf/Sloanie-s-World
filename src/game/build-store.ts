import { create, type StoreApi, type UseBoundStore } from "zustand";
import { PIECES, type PieceDef } from "./build-pieces";
import { SIDE_SAVES } from "./save";

/**
 * What she has placed, and the placing controls: one store for the build yard
 * (useBuild) and one for the things she puts round her house (useHouseBuild,
 * house-items.ts), made by the same factory.
 *
 * Each has its own small save slot, like the house: a big build is a lot of
 * pieces, and the main save should not grow with it or be put at risk by it.
 */

/** One piece in the yard: grid square (x, z), level y (half metres), colour and quarter turns. */
export type Placed = { p: string; x: number; z: number; y: number; c: number; r: number };

/**
 * How many pieces a yard holds. Measured, not guessed: twelve hundred mixed
 * pieces took a fast laptop from 60 frames a second to under 40, and a tablet
 * has less to spare. A thousand is still a village.
 */
export const MAX_PIECES = 1000;

type BuildSave = { pieces: Placed[]; unlocked: string[] };

function load(KEY: string, PIECE: Map<string, PieceDef>): BuildSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as BuildSave | null;
    if (raw && typeof raw === "object") {
      const ok = (q: Placed) =>
        q &&
        PIECE.has(q.p) &&
        [q.x, q.z, q.y, q.c, q.r].every((n) => Number.isInteger(n)) &&
        q.y >= 0;
      return {
        pieces: Array.isArray(raw.pieces) ? raw.pieces.filter(ok).slice(0, MAX_PIECES) : [],
        unlocked: Array.isArray(raw.unlocked)
          ? raw.unlocked.filter((id) => PIECE.get(id)?.prize || PIECE.get(id)?.price)
          : [],
      };
    }
  } catch {
    /* private mode or bad data: an empty yard */
  }
  return { pieces: [], unlocked: [] };
}

function persist(KEY: string, s: BuildSave) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore: the yard still works this session */
  }
}

export type BuildStore = {
  pieces: Placed[];
  /** prize pieces a gumball machine has given her */
  unlocked: string[];
  unlock: (id: string) => void;
  /** she is in the yard with the building controls up */
  building: boolean;
  setBuilding: (v: boolean) => void;
  /** she is standing in the yard (so the Build button can show) */
  inYard: boolean;
  setInYard: (v: boolean) => void;
  /** what the next press of Place puts down */
  piece: string;
  color: number;
  rot: number;
  select: (piece: string) => void;
  setColor: (c: number) => void;
  turn: () => void;
  /** Place / Remove / Undo, pressed on the HUD; the yard reads and clears it */
  request: "place" | "remove" | "undo" | null;
  ask: (r: "place" | "remove" | "undo") => void;
  take: () => "place" | "remove" | "undo" | null;
  add: (q: Placed) => void;
  removeAt: (i: number) => Placed | null;
  undo: () => void;
};

export type BuildStoreHook = UseBoundStore<StoreApi<BuildStore>>;

/** A placing store over a catalogue, saved under `key`. */
export function makeBuildStore(key: string, catalogue: PieceDef[]): BuildStoreHook {
  const PIECE = new Map(catalogue.map((p) => [p.id, p]));
  const saved = load(key, PIECE);
  /** what was placed, most recent last, so Undo takes back her last press */
  const history: Placed[] = [];
  const persistNow = (s: BuildSave) => persist(key, s);
  return create<BuildStore>((set, get) => ({
    pieces: saved.pieces,
    unlocked: saved.unlocked,
    unlock: (id) => {
      if (get().unlocked.includes(id)) return;
      const unlocked = [...get().unlocked, id];
      set({ unlocked });
      persistNow({ pieces: get().pieces, unlocked });
    },
    building: false,
    setBuilding: (building) => set((s) => (s.building === building ? s : { building })),
    inYard: false,
    setInYard: (inYard) => set((s) => (s.inYard === inYard ? s : { inYard })),
    piece: catalogue[0]!.id,
    color: 0,
    rot: 0,
    select: (piece) => set({ piece }),
    setColor: (color) => set({ color }),
    turn: () => set({ rot: (get().rot + 1) % 4 }),
    request: null,
    ask: (request) => set({ request }),
    take: () => {
      const r = get().request;
      if (r) set({ request: null });
      return r;
    },
    add: (q) => {
      if (get().pieces.length >= MAX_PIECES) return;
      const pieces = [...get().pieces, q];
      history.push(q);
      set({ pieces });
      persistNow({ pieces, unlocked: get().unlocked });
    },
    removeAt: (i) => {
      const q = get().pieces[i];
      if (!q) return null;
      const pieces = get().pieces.filter((_, k) => k !== i);
      const h = history.lastIndexOf(q);
      if (h >= 0) history.splice(h, 1);
      set({ pieces });
      persistNow({ pieces, unlocked: get().unlocked });
      return q;
    },
    undo: () => {
      const q = history.pop();
      if (!q) return;
      const pieces = get().pieces.filter((x) => x !== q);
      set({ pieces });
      persistNow({ pieces, unlocked: get().unlocked });
    },
  }));
}

/** The build yard's. */
export const useBuild = makeBuildStore(SIDE_SAVES.builds, PIECES);
