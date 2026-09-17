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
const padPrev = new Uint8Array(16);

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
  return keys.has("KeyE") || keys.has("KeyF");
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
      if (GAME_CODES.has(e.code)) e.preventDefault();
      return;
    }
    held.add(e.code);
    if (e.code === "Space") jumpTap = true;
    if (e.code === "KeyM") padMap = true;
    if (e.code === "KeyV") padView = true;
    if (e.code === "KeyN") padMusic = true;
    if (GAME_CODES.has(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    held.delete(e.code);
  });
  const clear = () => held.clear();
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clear();
  });
}

export function pollGamepad(axes: { x: number; z: number }) {
  padCamQ = false;
  padCamE = false;
  const pads = navigator.getGamepads?.() ?? [];
  let used = false;
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.mapping !== "standard" && (pad.axes.length < 2 || pad.buttons.length < 1)) continue;
    used = true;

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
    look.dx += rs.x * 10;
    // up/down only matters in first person, where it pitches the view
    look.dy += rs.y * 7;

    if (pad.buttons[14]?.pressed) axes.x -= 1;
    if (pad.buttons[15]?.pressed) axes.x += 1;
    if (pad.buttons[12]?.pressed) axes.z += 1;
    if (pad.buttons[13]?.pressed) axes.z -= 1;

    const down = (i: number) => Boolean(pad.buttons[i]?.pressed);
    const edge = (i: number) => down(i) && !padPrev[i];
    if (edge(0)) jumpTap = true;
    if (edge(1)) padMap = true;
    if (edge(6)) padView = true;
    if (edge(7)) padMusic = true;
    if (edge(2)) padInteract = true;
    if (edge(3)) padHint = true;
    if (edge(8)) padJournal = true;
    if (edge(9)) padPause = true;
    padCamQ = down(4);
    padCamE = down(5);
    for (let i = 0; i < 16; i++) padPrev[i] = down(i) ? 1 : 0;
    break;
  }
  if (!used) padPrev.fill(0);

  const m = Math.hypot(axes.x, axes.z);
  if (m > 1) {
    axes.x /= m;
    axes.z /= m;
  }
  return axes;
}
