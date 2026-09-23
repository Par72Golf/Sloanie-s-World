import * as THREE from "three";
import { SUGAR } from "./sugar-rush";

/**
 * The flyover: a slow camera tour of a park, with nobody flying it.
 *
 * It is a grown-up's tool first — the fastest way to see what a park looks
 * like after a morning's building without walking the whole thing — but it is
 * also just nice to watch, so it is written to be watchable rather than to be
 * efficient: the camera glides along a spline through the landmarks instead of
 * cutting between them, and it never points at empty grass.
 *
 * Two splines, not one. The camera's position and the point it looks at are
 * each their own curve, so the camera can swing round a thing while still
 * looking at it. One curve with a fixed forward vector gives you a drone on a
 * rail, which is what the first version was.
 */

export type FlyLeg = {
  /** where the camera is */
  at: [number, number, number];
  /** what it is pointed at */
  look: [number, number, number];
};

/** Sugar Rush: the plaza, then anticlockwise round the park and home. */
function sugarLegs(): FlyLeg[] {
  const S = SUGAR;
  const high = (x: number, z: number, y: number, tx: number, tz: number, ty = 2): FlyLeg => ({
    at: [x, y, z],
    look: [tx, ty, tz],
  });
  return [
    // in over the gates, dropping toward the plaza
    high(S.spawn[0], S.spawn[2] + 78, 46, S.plaza.x, S.plaza.z, 4),
    high(S.plaza.x + 6, S.plaza.z + 26, 22, S.plaza.x, S.plaza.z, 3),
    // north-west to the factory, then the mountain behind it
    high(S.factory.x + 34, S.factory.z + 26, 26, S.factory.x, S.factory.z, 7),
    high(S.mountain.x + 48, S.mountain.z + 40, 34, S.mountain.x, S.mountain.z, 11),
    // down the west side: the forest and its clearing
    high(S.forest.x + 30, S.forest.z - 26, 28, S.forest.x, S.forest.z, 5),
    // the fairground in the north-west corner
    high(S.fair.x + 36, S.fair.z + 34, 30, S.fair.x, S.fair.z, 6),
    // east across the marshmallow fields to the meadow's hills
    high(S.marshmallow.x - 14, S.marshmallow.z + 30, 26, S.marshmallow.x, S.marshmallow.z, 3),
    high(S.meadow.x - 34, S.meadow.z + 30, 28, S.meadow.x, S.meadow.z, 5),
    // the lake, then down the east side to the village and her house
    high(S.lake.x - 26, S.lake.z + 24, 26, S.lake.x, S.lake.z, 2),
    high(S.village.x + 30, S.village.z + 34, 26, S.village.x, S.village.z - 8, 6),
    // Emmett's den, the maze, and back over the plaza
    high(S.emmett.x + 22, S.emmett.z + 22, 20, S.emmett.x, S.emmett.z, 3),
    high(S.maze.x + 30, S.maze.z + 30, 30, S.maze.x, S.maze.z, 3),
    high(S.plaza.x + 30, S.plaza.z - 40, 34, S.plaza.x, S.plaza.z, 4),
  ];
}

/** Sunny Picnic Park, the same idea round its own landmarks. */
function picnicLegs(): FlyLeg[] {
  const leg = (x: number, y: number, z: number, tx: number, tz: number, ty = 2): FlyLeg => ({
    at: [x, y, z],
    look: [tx, ty, tz],
  });
  return [
    leg(0, 48, 96, 0, 20, 4),
    leg(12, 24, 34, 8, -6, 4),
    leg(-16, 26, 74, -16, 46, 5),
    leg(-48, 28, 6, -15, -136 + 118, 4),
    leg(24, 30, -96, 20, -132, 4),
    leg(62, 34, -104, 73, -128, 10),
    leg(76, 26, -14, 50.5, -9, 4),
    leg(96, 28, 62, 97, 92, 3),
    leg(30, 26, 118, 8, 136, 4),
    leg(-30, 26, 96, -9, 110, 4),
    leg(0, 44, 84, 0, 20, 4),
  ];
}

export function flyoverFor(levelId: string): FlyLeg[] {
  return levelId === "sugar" ? sugarLegs() : picnicLegs();
}

/** How long a whole tour takes, and how long the fade in and out are. */
export const FLYOVER_SECONDS = 52;
const FADE = 1.2;

/**
 * One tour. `update` returns where to put the camera this frame; when `done`
 * comes back true the tour has finished and the caller should hand the camera
 * back.
 */
export class Flyover {
  private path: THREE.CatmullRomCurve3;
  private aim: THREE.CatmullRomCurve3;
  private t = 0;
  readonly seconds: number;
  readonly pos = new THREE.Vector3();
  readonly target = new THREE.Vector3();

  constructor(legs: FlyLeg[], seconds = FLYOVER_SECONDS) {
    this.seconds = seconds;
    this.path = new THREE.CatmullRomCurve3(
      legs.map((l) => new THREE.Vector3(...l.at)),
      false,
      "catmullrom",
      0.4,
    );
    this.aim = new THREE.CatmullRomCurve3(
      legs.map((l) => new THREE.Vector3(...l.look)),
      false,
      "catmullrom",
      0.4,
    );
    this.sample(0);
  }

  /** 0 at the start, 1 at the end. */
  get progress() {
    return Math.min(1, this.t / this.seconds);
  }

  /** Eased in and out, so it does not start and stop with a jerk. */
  private sample(t: number) {
    const u = Math.min(1, Math.max(0, t / this.seconds));
    const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    this.path.getPointAt(eased, this.pos);
    this.aim.getPointAt(eased, this.target);
  }

  update(dt: number) {
    this.t += dt;
    this.sample(this.t);
    return this.t >= this.seconds;
  }

  /** How much to dim the screen at each end of the tour, 0 to 1. */
  get fade() {
    const inAt = Math.min(1, this.t / FADE);
    const outAt = Math.min(1, Math.max(0, this.seconds - this.t) / FADE);
    return 1 - Math.min(inAt, outAt);
  }
}
