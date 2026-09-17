/**
 * Splash pad layout, shared by the props (park.ts), the animated composite
 * (makeSplashPad) and the runtime, so the painted targets, the water and the
 * launch spots can never drift apart. Positions are relative to the pad
 * centre (level.splash).
 */

export type Jet = { x: number; z: number; max: number; phase: number };

/** Ground jets: an inner ring of four and an outer ring, firing in a chase. */
export function splashJets(): Jet[] {
  const jets: Jet[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    jets.push({ x: Math.cos(a) * 4.6, z: Math.sin(a) * 4.6, max: 2.8, phase: (i / 4) * 0.5 });
  }
  // the outer ring is turned off the arch line, and skips the spot where the
  // tipping bucket's pole stands
  const outer: Jet[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 9.2;
    const z = Math.sin(a) * 9.2;
    if (Math.hypot(x - SPLASH_BUCKET.x, z - SPLASH_BUCKET.z) < 2.5) continue;
    outer.push({ x, z, max: 2.2, phase: 0 });
  }
  outer.forEach((j, i) => (j.phase = 0.5 + (i / outer.length) * 0.5));
  return [...jets, ...outer];
}

/** The tipping bucket's pole; the bucket hangs off an arm toward +x. */
export const SPLASH_BUCKET = { x: -8.5, z: -3.5, arm: 1.4 };

/** Toddler sprinkler flowers: position and petal colour. */
export const SPLASH_FLOWERS: [number, number, string][] = [
  [7.5, 5.5, "#e8697d"],
  [-6.5, 6.5, "#f6d75e"],
  [5.5, -7.5, "#b98ce0"],
];

export const SPLASH_RADIUS = 13;
/** How fast a ground jet launches her if she is standing on it. */
export const GEYSER = 12.5;
