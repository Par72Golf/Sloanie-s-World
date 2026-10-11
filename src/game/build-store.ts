import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { PieceDef } from "./build-pieces";

/**
 * What she has placed, and the placing controls: one store for the build yard
 * (useBuild, yard-store.ts) and one for the things she puts round her house (useHouseBuild,
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

type BuildSave = {
  pieces: Placed[];
  unlocked: string[];
  /** the world corner the grid was counted from when this was saved */
  origin?: [number, number];
};

/**
 * Where a store's grid sits in the world, for a store whose area can move (the
 * build yard): saved with the pieces, so a save made against an old corner is
 * moved onto the new one and nothing she built shifts on the ground. `legacy`
 * is the corner every save from before this was written used.
 */
type Grid = { origin: [number, number]; legacy: [number, number] };

/**
 * The build yard's corner: SUGAR.buildYard less half its size (tools/placement.ts
 * checks the two agree). Here rather than worked out, because the park's data
 * pulls in every model and this store is loaded long before any of them.
 */
export const YARD_ORIGIN: [number, number] = [62, -27];

function load(KEY: string, PIECE: Map<string, PieceDef>, grid?: Grid): BuildSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as BuildSave | null;
    if (raw && typeof raw === "object") {
      const ok = (q: Placed) =>
        q &&
        PIECE.has(q.p) &&
        [q.x, q.z, q.y, q.c, q.r].every((n) => Number.isInteger(n)) &&
        q.y >= 0;
      let pieces = Array.isArray(raw.pieces) ? raw.pieces.filter(ok).slice(0, MAX_PIECES) : [];
      if (grid) {
        const from = Array.isArray(raw.origin) && raw.origin.length === 2 ? raw.origin : grid.legacy;
        const dx = Math.round(from[0] - grid.origin[0]);
        const dz = Math.round(from[1] - grid.origin[1]);
        if (dx || dz) pieces = pieces.map((q) => ({ ...q, x: q.x + dx, z: q.z + dz })).filter((q) => q.x >= 0 && q.z >= 0);
      }
      return {
        pieces,
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
  /**
   * Playing together as a guest (net.ts): these are the host's pieces, built
   * on together, and nothing is saved over her own yard, which comes back
   * untouched with goHome().
   */
  visiting: boolean;
  visit: (pieces: Placed[]) => void;
  goHome: () => void;
  /** a piece another kid put down or took away (not hers to undo) */
  remoteAdd: (q: Placed) => void;
  remoteDel: (q: Placed) => void;
};

/** Two pieces are the same piece if everything about them is. */
export const samePiece = (a: Placed, b: Placed) => a.p === b.p && a.x === b.x && a.z === b.z && a.y === b.y && a.c === b.c && a.r === b.r;

export type BuildStoreHook = UseBoundStore<StoreApi<BuildStore>>;

/** A placing store over a catalogue, saved under `key`. */
export function makeBuildStore(key: string, catalogue: PieceDef[], grid?: Grid): BuildStoreHook {
  const PIECE = new Map(catalogue.map((p) => [p.id, p]));
  const saved = load(key, PIECE, grid);
  /** what was placed, most recent last, so Undo takes back her last press */
  const history: Placed[] = [];
  /** her own pieces while she is visiting someone else's yard; null at home */
  let home: Placed[] | null = null;
  // while visiting, what is saved is still her own yard, never the host's
  const persistNow = (s: BuildSave) => {
    const out = home ? { ...s, pieces: home } : s;
    persist(key, grid ? { ...out, origin: grid.origin } : out);
  };
  // a save moved onto a new corner is written back at once, so it moves once
  if (grid) persistNow(saved);
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
    visiting: false,
    visit: (pieces) => {
      if (!home) home = get().pieces;
      history.length = 0;
      set({ pieces: pieces.slice(0, MAX_PIECES), visiting: true });
    },
    goHome: () => {
      if (!home) return;
      const pieces = home;
      home = null;
      history.length = 0;
      set({ pieces, visiting: false });
    },
    remoteAdd: (q) => {
      if (get().pieces.length >= MAX_PIECES || get().pieces.some((x) => samePiece(x, q))) return;
      const pieces = [...get().pieces, q];
      set({ pieces });
      persistNow({ pieces, unlocked: get().unlocked });
    },
    remoteDel: (q) => {
      const i = get().pieces.findIndex((x) => samePiece(x, q));
      if (i < 0) return;
      const gone = get().pieces[i]!;
      const pieces = get().pieces.filter((_, k) => k !== i);
      const h = history.lastIndexOf(gone);
      if (h >= 0) history.splice(h, 1);
      set({ pieces });
      persistNow({ pieces, unlocked: get().unlocked });
    },
  }));
}

// The build yard's own store is in yard-store.ts.
