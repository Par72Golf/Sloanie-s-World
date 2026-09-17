/**
 * Movement constants, kept out of runtime.ts so tools can import them without
 * pulling in the renderer.
 */
export const WALK = 6.4;
export const JUMP = 11.2;
export const GRAVITY = 23;
/** Trampolines: mat height (low enough to walk onto), and launch speeds. */
export const TRAMPOLINE_TOP = 0.55;
export const BOUNCE = 13.5;
/** Tapping jump just before landing on the mat: about 6.5m up. */
export const SUPER_BOUNCE = 17.2;

/** Her capsule: half-width and full height. */
export const PLAYER_W = 0.34;
export const PLAYER_H = 1.62;

/** Peak height of a standing jump, metres. */
export function jumpHeight() {
  return (JUMP * JUMP) / (2 * GRAVITY);
}

/**
 * How far she travels horizontally before descending through `top` metres,
 * i.e. the furthest she can start from a ledge of that height and still land
 * on it. `speed` is her horizontal speed.
 */
export function jumpReach(top: number, speed: number) {
  const a = GRAVITY / 2;
  const disc = JUMP * JUMP - 4 * a * top;
  if (disc < 0) return 0;
  const tDescend = (JUMP + Math.sqrt(disc)) / (2 * a);
  return speed * tDescend;
}
