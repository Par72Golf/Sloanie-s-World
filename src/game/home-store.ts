import { create } from "zustand";
import { FURNITURE, SPOTS, type FurnitureId, type SpotId } from "./furniture";

/**
 * Sloan's house: what's placed at each decoration spot, what she owns, and
 * the house's UI state. Kept in its own small store and save slot so the
 * house can be added (or reset) without touching the main save format.
 *
 * Starter furniture is always owned. Reward furniture is granted by the
 * runtime when its condition is met (the crown, all 30 stickers, adopting a
 * pet). Shop furniture is bought with the main store's tickets.
 */

const KEY = "sloanies-world-home-v1";

type HomeSave = { placed: Partial<Record<SpotId, FurnitureId>>; owned: FurnitureId[] };

function starters(): Record<SpotId, FurnitureId> {
  const out = {} as Record<SpotId, FurnitureId>;
  for (const s of SPOTS) {
    const def = FURNITURE.find((f) => f.spot === s.id && f.source === "starter") ?? FURNITURE.find((f) => f.spot === s.id);
    if (def) out[s.id] = def.id;
  }
  return out;
}

function load(): HomeSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as HomeSave | null;
    if (raw && typeof raw === "object") {
      const known = new Set(FURNITURE.map((f) => f.id));
      return {
        placed: Object.fromEntries(Object.entries(raw.placed ?? {}).filter(([, id]) => known.has(id as string))),
        owned: Array.isArray(raw.owned) ? raw.owned.filter((id) => known.has(id)) : [],
      };
    }
  } catch {
    /* private mode or bad data: start fresh */
  }
  return { placed: {}, owned: [] };
}

function persist(s: HomeSave) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export type HomeNear = SpotId | "door" | "exit" | null;

type HomeStore = {
  /** furniture at each spot (starters fill any gap) */
  placed: Record<SpotId, FurnitureId>;
  /** non-starter furniture she owns */
  owned: FurnitureId[];
  /** she is inside the house */
  inside: boolean;
  setInside: (v: boolean) => void;
  /** what Collect would do here: a decoration spot, the front door outside, or the way out */
  near: HomeNear;
  setNear: (v: HomeNear) => void;
  /** decorate panel open for a spot */
  panel: SpotId | null;
  setPanel: (v: SpotId | null) => void;
  owns: (id: FurnitureId) => boolean;
  place: (spot: SpotId, id: FurnitureId) => void;
  grant: (id: FurnitureId) => boolean;
  reset: () => void;
};

const saved = load();

export const useHome = create<HomeStore>((set, get) => ({
  placed: { ...starters(), ...saved.placed } as Record<SpotId, FurnitureId>,
  owned: saved.owned,
  inside: false,
  setInside: (inside) => set({ inside }),
  near: null,
  setNear: (near) => {
    if (get().near !== near) set({ near });
  },
  panel: null,
  setPanel: (panel) => set({ panel }),
  owns: (id) => FURNITURE.find((f) => f.id === id)?.source === "starter" || get().owned.includes(id),
  place: (spot, id) => {
    if (!get().owns(id)) return;
    set({ placed: { ...get().placed, [spot]: id } });
    persist({ placed: get().placed, owned: get().owned });
  },
  /** add furniture to what she owns; true if it was new */
  grant: (id) => {
    if (get().owned.includes(id)) return false;
    set({ owned: [...get().owned, id] });
    persist({ placed: get().placed, owned: get().owned });
    return true;
  },
  reset: () => {
    set({ placed: starters(), owned: [], inside: false, panel: null, near: null });
    persist({ placed: {}, owned: [] });
  },
}));
