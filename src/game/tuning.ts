/**
 * Movement constants, kept out of runtime.ts so tools can import them without
 * pulling in the renderer.
 */
export const WALK = 6.4;
export const JUMP = 11.2;
export const GRAVITY = 23;

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
