import { actionForKey, useBindings, type Action } from "./bindings";
import { useHome } from "./home-store";
import { useGame } from "./store";

const held = new Set<string>();
let injected: string[] | null = null;

export const look = { dx: 0, dy: 0 };
export const touchMove = { x: 0, z: 0 };
export let jumpTap = false;
export let padInteract = false;
export let padHint = false;
export let padPause = false;
export let padJournal = false;
/** Big map toggle: B on the pad, M on the keyboard. */
export let padMap = false;
/** First-person toggle: left trigger on the pad, V on the keyboard. */
export let padView = false;
/** RT on the pad, N on the keyboard: next iPod channel. */
export let padMusic = false;
let padCamQ = false;
let padCamE = false;
const PAD_BUTTONS = 20;
const padPrev = new Uint8Array(PAD_BUTTONS);

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyH",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Escape",
  "KeyP",
  "KeyJ",
  "KeyF",
  "KeyE",
  "KeyM",
  "KeyV",
  "KeyN",
]);

function activeSet(): Set<string> {
  if (injected) return new Set(injected);
  return held;
}

export function setInjectedKeys(codes: string[]) {
  injected = codes;
}

export function clearInjectedKeys() {
  injected = null;
}

export function isDown(code: string) {
  return activeSet().has(code);
}

export function consumeJumpTap() {
  const v = jumpTap;
  jumpTap = false;
  return v;
}

export function triggerJump() {
  jumpTap = true;
}

export function getMoveAxes() {
  const keys = activeSet();
  let x = 0;
  let z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z -= 1;
  x += touchMove.x;
  z += touchMove.z;
  const m = Math.hypot(x, z);
  if (m > 1) {
    x /= m;
    z /= m;
  }
  return { x, z };
}

export function consumeLook() {
  const dx = look.dx;
  const dy = look.dy;
  look.dx = 0;
  look.dy = 0;
  return { dx, dy };
}

export function wantsInteract() {
  const keys = activeSet();
  return useBindings.getState().keys.collect.some((c) => keys.has(c));
}

function keyHeld(action: Action) {
  const keys = activeSet();
  return useBindings.getState().keys[action].some((c) => keys.has(c));
}

/** Turning the camera: held on the pad or the keyboard (both remappable). */
export function camLeftHeld() {
  return padCamQ || keyHeld("camLeft");
}

export function camRightHeld() {
  return padCamE || keyHeld("camRight");
}

export function consumePadInteract() {
  const v = padInteract;
  padInteract = false;
  return v;
}

export function consumePadHint() {
  const v = padHint;
  padHint = false;
  return v;
}

export function consumePadPause() {
  const v = padPause;
  padPause = false;
  return v;
}

export function consumePadJournal() {
  const v = padJournal;
  padJournal = false;
  return v;
}

export function consumePadMap() {
  const v = padMap;
  padMap = false;
  return v;
}

export function consumePadMusic() {
  const v = padMusic;
  padMusic = false;
  return v;
}

export function consumePadView() {
  const v = padView;
  padView = false;
  return v;
}

export function padCamLeft() {
  return padCamQ;
}

export function padCamRight() {
  return padCamE;
}

/*
 * Panels with their own pad loop (booths, the farmer, instruction cards, the
 * journal) claim the pad while they are up, and Emmett's rock paper scissors
 * has it too. Meanwhile presses are not turned into play actions: B in a booth
 * does not open the big map, Y does not spend a hint, Back does not open the
 * journal on top. Buttons are still tracked, so nothing fires late.
 */
let padClaims = 0;

/** Take the pad for a panel; call the returned function to hand it back. */
export function claimPad() {
  padClaims++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    padClaims = Math.max(0, padClaims - 1);
    if (!padClaims) swallowHeldPad();
  };
}

export function padClaimed() {
  return padClaims > 0;
}

function padBusy() {
  return padClaims > 0 || useGame.getState().rps != null;
}

/** The controller every part of the game reads, so menus and play agree on one device. */
export function activePad() {
  return usablePad();
}

function usablePad() {
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    if (pad.mapping !== "standard" && (pad.axes.length < 2 || pad.buttons.length < 1)) continue;
    return pad;
  }
  return null;
}

/**
 * Whatever is held right now counts as already seen, so the press that closed
 * a panel or a menu does nothing in play: A does not jump, B does not open the
 * map, Back does not reopen the journal.
 */
export function swallowHeldPad() {
  const pad = usablePad();
  if (!pad) return;
  const b = useBindings.getState().pad;
  for (let i = 0; i < PAD_BUTTONS; i++) {
    const down = Boolean(pad.buttons[i]?.pressed);
    if (!down && !padPrev[i]) continue;
    if (down) padPrev[i] = 1;
    if (i === b.jump) jumpTap = false;
    else if (i === b.map) padMap = false;
    else if (i === b.collect) padInteract = false;
    else if (i === b.hint) padHint = false;
    else if (i === b.view) padView = false;
    else if (i === b.music) padMusic = false;
    else if (i === b.journal) padJournal = false;
    else if (i === b.pause) padPause = false;
  }
}

let bound = false;

export function bindInput() {
  if (bound) return;
  bound = true;

  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      return;
    }
    if (e.repeat) {
      if (GAME_CODES.has(e.code) || actionForKey(e.code)) e.preventDefault();
      return;
    }
    held.add(e.code);
    if (e.code === "Escape") escape();
    // keys come from the remappable bindings (bindings.ts)
    const action = actionForKey(e.code);
    if (action === "jump") jumpTap = true;
    else if (action === "map") padMap = true;
    else if (action === "journal") padJournal = true;
    else if (action === "hint") padHint = true;
    else if (action === "pause") padPause = true;
    else if (action === "view") padView = true;
    else if (action === "music") padMusic = true;
    if (GAME_CODES.has(e.code) || action) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    held.delete(e.code);
  });
  const clear = () => held.clear();
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clear();
  });
  // back to play from a menu or a panel, however it closed
  const menu = (s: ReturnType<typeof useGame.getState>) =>
    s.phase !== "playing" || s.quiz != null || s.rps != null || s.carnival != null || s.questPanel != null || s.helpCard != null || s.journalOpen;
  /*
   * Esc, decided once from what is open at the moment of the press. This
   * listener is added before any panel mounts, so it runs before a panel's
   * own Esc handler closes it: a panel that is open eats the Esc, and the
   * frame after it closes does not see "nothing open" and pause the game.
   */
  const escape = () => {
    const s = useGame.getState();
    if (s.controlsOpen) {
      s.setControls(false);
    } else if (s.wardrobeOpen) {
      s.setWardrobe(false);
    } else if (s.phase === "paused") {
      padPause = true;
    } else if (s.mapOpen && s.phase === "playing") {
      useGame.setState({ mapOpen: false });
    } else if (s.phase === "playing" && !menu(s) && !useHome.getState().panel) {
      padPause = true;
    }
  };
  useGame.subscribe((s, p) => {
    if (menu(p) && !menu(s)) swallowHeldPad();
  });
}

export function pollGamepad(axes: { x: number; z: number }) {
  padCamQ = false;
  padCamE = false;
  const pad = usablePad();
  const busy = padBusy();
  if (pad) {
    const stick = (ax: number, ay: number, dz: number) => {
      const x = pad.axes[ax] ?? 0;
      const y = pad.axes[ay] ?? 0;
      const m = Math.hypot(x, y);
      if (m < dz) return { x: 0, y: 0 };
      const scale = ((m - dz) / (1 - dz)) / m;
      return { x: x * scale, y: y * scale };
    };

    const ls = stick(0, 1, 0.18);
    axes.x += ls.x;
    axes.z += -ls.y;

    const rs = stick(2, 3, 0.2);
    if (!busy) {
      look.dx += rs.x * 10;
      // up/down only matters in first person, where it pitches the view
      look.dy += rs.y * 7;
    }

    if (pad.buttons[14]?.pressed) axes.x -= 1;
    if (pad.buttons[15]?.pressed) axes.x += 1;
    if (pad.buttons[12]?.pressed) axes.z += 1;
    if (pad.buttons[13]?.pressed) axes.z -= 1;

    const down = (i: number) => Boolean(pad.buttons[i]?.pressed);
    const edge = (i: number) => !busy && down(i) && !padPrev[i];
    // buttons come from the remappable bindings (bindings.ts)
    const b = useBindings.getState().pad;
    if (edge(b.jump)) jumpTap = true;
    if (edge(b.map)) padMap = true;
    if (edge(b.view)) padView = true;
    if (edge(b.music)) padMusic = true;
    if (edge(b.collect)) padInteract = true;
    if (edge(b.hint)) padHint = true;
    if (edge(b.journal)) padJournal = true;
    if (edge(b.pause)) padPause = true;
    padCamQ = !busy && down(b.camLeft);
    padCamE = !busy && down(b.camRight);
    for (let i = 0; i < PAD_BUTTONS; i++) padPrev[i] = down(i) ? 1 : 0;
  } else {
    padPrev.fill(0);
  }

  const m = Math.hypot(axes.x, axes.z);
  if (m > 1) {
    axes.x /= m;
    axes.z /= m;
  }
  return axes;
}
