import { create } from "zustand";
import type { Avatar } from "./meshes";

/**
 * Who this device's player is drawn as (meshes.ts makeGirl): the girl, a boy
 * or a grown-up. Its own small slot, like the controls, so it never touches
 * the game's progress; on Dad's laptop it says grown-up, on Sloan's tablet
 * it stays the girl.
 */
const KEY = "sloanies-world-avatar";
const ALL: Avatar[] = ["girl", "boy", "grownup"];

function load(): Avatar {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (ALL as string[]).includes(v)) return v as Avatar;
  } catch {
    /* private mode: the girl */
  }
  return "girl";
}

export const useAvatar = create<{ avatar: Avatar; setAvatar: (a: Avatar) => void }>((set) => ({
  avatar: load(),
  setAvatar: (avatar) => {
    set({ avatar });
    try {
      localStorage.setItem(KEY, avatar);
    } catch {
      /* this session only */
    }
  },
}));
