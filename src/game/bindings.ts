import { create } from "zustand";

/**
 * Remappable controls. Each play action has one controller button and one or
 * more keyboard keys. Moving (sticks, WASD, arrows) and the menu buttons (A to
 * choose, B to go back, Escape) are fixed, so nobody can remap themselves out
 * of a menu. Saved in its own slot so a reset of the game's progress keeps a
 * grown-up's button layout.
 *
 * The controller layout is Minecraft's (Bedrock, Xbox), because that is the
 * game the kids already know with these controllers — 8BitDo Ultimates, which
 * report themselves as Xbox pads: A jump, LT use and place, RT break, LB/RB
 * through the hotbar, Y the inventory (her backpack), X the crafting button
 * (start and finish building), D-pad up the camera, D-pad left the emote (her
 * dance), D-pad right the chat (a hint), D-pad down to undo, left stick in to
 * sprint, Menu to pause. The D-pad no longer walks her, as in Minecraft.
 */

export type Action =
  | "jump"
  | "collect"
  | "break"
  | "build"
  | "undo"
  | "sprint"
  | "hint"
  | "map"
  | "journal"
  | "pause"
  | "music"
  | "view"
  | "camLeft"
  | "camRight";

export const ACTIONS: { id: Action; label: string; detail: string }[] = [
  { id: "jump", label: "Jump", detail: "Hop — and double-tap while building to fly" },
  { id: "collect", label: "Use / Place", detail: "Grab, talk, ride and play — and place a piece when building" },
  { id: "break", label: "Break", detail: "Take a piece away when building (and grabs things too)" },
  { id: "build", label: "Build", detail: "Start or finish building, in the Build Yard or your house" },
  { id: "camLeft", label: "Hotbar left", detail: "The piece before, when building; turns the camera otherwise" },
  { id: "camRight", label: "Hotbar right", detail: "The next piece, when building; turns the camera otherwise" },
  { id: "undo", label: "Undo", detail: "Take back the last piece you placed" },
  { id: "journal", label: "Backpack", detail: "Sweets, stickers and your things" },
  { id: "map", label: "Big map", detail: "Open or close the map" },
  { id: "hint", label: "Hint", detail: "Ask where a sweet is" },
  { id: "music", label: "Dance", detail: "Music on your iPod, and a dance" },
  { id: "view", label: "Camera view", detail: "See through her eyes, or from behind" },
  { id: "sprint", label: "Sprint", detail: "Run faster until you stop" },
  { id: "pause", label: "Pause", detail: "Pause menu" },
];

/**
 * Standard gamepad mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT,
 * 8 View, 9 Menu, 10 left stick in, 11 right stick in, 12-15 D-pad up, down,
 * left, right. B is left free: it is Back in every menu, and while building
 * it flies her down.
 */
export const DEFAULT_PAD: Record<Action, number> = {
  jump: 0,
  collect: 6,
  break: 7,
  build: 2,
  journal: 3,
  camLeft: 4,
  camRight: 5,
  view: 12,
  undo: 13,
  music: 14,
  hint: 15,
  map: 8,
  sprint: 10,
  pause: 9,
};

export const DEFAULT_KEYS: Record<Action, string[]> = {
  jump: ["Space"],
  collect: ["KeyE", "KeyF"],
  break: ["KeyX"],
  build: ["KeyB"],
  undo: ["KeyZ"],
  sprint: ["ControlLeft"],
  hint: ["KeyH"],
  map: ["KeyM"],
  journal: ["KeyJ"],
  pause: ["KeyP"],
  music: ["KeyN"],
  view: ["KeyV"],
  camLeft: ["KeyQ"],
  camRight: ["KeyC"],
};

/** Buttons that can't be given to an action: B is Back, in every menu and while building. */
export const PAD_RESERVED = new Set([1]);
/** Keys that can't be given to an action: moving, and the keys menus need. */
export const KEY_RESERVED = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Escape",
  "Tab",
  "Enter",
  "Backspace",
  "MetaLeft",
  "MetaRight",
]);

export const PAD_NAMES: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "View",
  9: "Menu",
  10: "L-stick press",
  11: "R-stick press",
  12: "D-pad up",
  13: "D-pad down",
  14: "D-pad left",
  15: "D-pad right",
  16: "Home",
};

export function padName(i: number) {
  return PAD_NAMES[i] ?? `Button ${i}`;
}

export function keyName(code: string) {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Option",
    AltRight: "Right Option",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
  };
  return named[code] ?? code;
}

// v2: the Minecraft layout. An older saved layout is left behind rather than
// mixed into it, since half its buttons now mean something else.
const KEY = "sloanies-world-controls-v2";

type Saved = { pad: Record<Action, number>; keys: Record<Action, string[]> };

function load(): Saved {
  const fresh = { pad: { ...DEFAULT_PAD }, keys: structuredClone(DEFAULT_KEYS) };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    if (!raw) return fresh;
    for (const a of Object.keys(DEFAULT_PAD) as Action[]) {
      const p = raw.pad?.[a];
      if (typeof p === "number" && p >= 0 && p < 20 && !PAD_RESERVED.has(p)) fresh.pad[a] = p;
      const k = raw.keys?.[a];
      if (Array.isArray(k) && k.length && k.every((c) => typeof c === "string" && !KEY_RESERVED.has(c))) fresh.keys[a] = k;
    }
  } catch {
    /* private mode or bad data: defaults */
  }
  return fresh;
}

function persist(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

type BindingStore = Saved & {
  /** Give an action a controller button; whatever had it takes this action's old button. */
  setPad: (action: Action, button: number) => void;
  /** Give an action a keyboard key; whatever had it takes this action's old key. */
  setKey: (action: Action, code: string) => void;
  resetDefaults: () => void;
};

export const useBindings = create<BindingStore>((set, get) => ({
  ...load(),
  setPad: (action, button) => {
    if (PAD_RESERVED.has(button)) return;
    const pad = { ...get().pad };
    const old = pad[action];
    for (const a of Object.keys(pad) as Action[]) if (a !== action && pad[a] === button) pad[a] = old;
    pad[action] = button;
    set({ pad });
    persist({ pad, keys: get().keys });
  },
  setKey: (action, code) => {
    if (KEY_RESERVED.has(code)) return;
    const keys = structuredClone(get().keys);
    const old = keys[action][0]!;
    for (const a of Object.keys(keys) as Action[]) {
      if (a === action || !keys[a].includes(code)) continue;
      const rest = keys[a].filter((c) => c !== code);
      keys[a] = rest.length ? rest : [old];
    }
    keys[action] = [code];
    set({ keys });
    persist({ pad: get().pad, keys });
  },
  resetDefaults: () => {
    const fresh = { pad: { ...DEFAULT_PAD }, keys: structuredClone(DEFAULT_KEYS) };
    set(fresh);
    persist(fresh);
  },
}));

/** Keyboard action for a key code, if any. */
export function actionForKey(code: string): Action | null {
  const keys = useBindings.getState().keys;
  for (const a of Object.keys(keys) as Action[]) if (keys[a].includes(code)) return a;
  return null;
}

/** "X · E · F" style label for an action, pad first. */
export function bindingLabel(action: Action) {
  const s = useBindings.getState();
  return [padName(s.pad[action]), ...s.keys[action].map(keyName)].join(" · ");
}
