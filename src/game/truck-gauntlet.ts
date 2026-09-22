import * as THREE from "three";
import { sfx } from "./audio";
import { EMMETT_BASE } from "./emmett-base";
import { glowMaterial } from "./furniture";
import { lam, signBoard } from "./meshes";
import { animateMonsterTruck, makeMonsterTruck, type TruckRig } from "./monster-truck";
import { WALK } from "./tuning";
import { useGame } from "./store";

/**
 * Emmett's monster truck gauntlet, in Sugar Rush Park.
 *
 * Sloan asked: "if sloan beats emmett at his monster truck 5 times shes gets
 * to keep it". Five challenges, and they escalate the way Dalton asked for —
 * rock paper scissors three times, then an obstacle run, then a race:
 *
 *   1-3  Rock paper scissors at his truck. This is the game he already plays
 *        with her, so the first three wins need nothing new: the runtime
 *        counts a friendly win here toward the gauntlet.
 *     4  The obstacle run — eight gates weaving through the yard and round
 *        the ramp, against the clock.
 *     5  The big race — a long lap out round the meadow and back.
 *
 * Neither run is against an AI, and that is on purpose. A racer she has to
 * keep up with is a racer that can get stuck on a lollipop, and losing to a
 * bug is the one way to make a seven-year-old give up. She is racing a time
 * instead — the time Emmett says he did it in — and the time is worked out
 * from the length of the route rather than picked, so moving a gate cannot
 * quietly make it impossible.
 *
 * Losing never takes anything away: a run she does not beat can be started
 * again straight away, and the wins she has are saved.
 */

/** The five, in order, for the board and the notices. */
export const TRUCK_STAGES = [
  "Rock paper scissors",
  "Rock paper scissors again",
  "The decider",
  "The obstacle run",
  "The big race",
] as const;

/** How many of the five are rock paper scissors. */
export const RPS_ROUNDS = 3;

/**
 * How much of her top speed she has to average over the whole route.
 *
 * The two numbers are different because the courses are: the run is short,
 * so the seconds she loses turning are most of it and a low pace would make
 * it a walkover; the race is long and open, so the same pace would be
 * brutal. Both were run end to end through the real collision code
 * (tools/gauntlet.ts) and both leave about half the time spare for a child
 * who has to find the next ring before she can head for it.
 */
const PACE = { run: 0.85, race: 0.62 };
/** a few seconds of grace at the start, for the countdown and getting going */
const GRACE = 4;

type Gate = { x: number; z: number };

/**
 * The two routes, in the yard's own frame: +x runs along the truck's length
 * and the yard is 18 x 14, so anything inside x +-9, z +-7 is on the dirt.
 * The race leaves the yard and loops out over the grass to the south and west.
 */
const RUN_LOCAL: Gate[] = [
  // clear of the toy box at (7.3, 5.0), which she used to drive straight
  // through: it was drawn in both parks but only ever solid in park 1
  { x: 5.2, z: 5.6 },
  { x: -2.0, z: 6.0 },
  { x: -9.5, z: 0.0 },
  { x: -2.0, z: -6.0 },
  { x: 7.5, z: -4.0 },
  { x: 11.0, z: 2.0 },
];

/**
 * The race leaves the yard and runs a long lap out east, down past the
 * village and back up the inside — all on open grass, clear of the meadow's
 * terraces, which are a lovely thing to climb and a miserable thing to be
 * sent through at a run. Written in the yard's frame like the run, so the
 * whole lap follows the den if the den ever moves.
 */
const RACE_LOCAL: Gate[] = [
  { x: 0.0, z: -15.0 },
  { x: -12.0, z: -15.0 },
  { x: -24.0, z: -5.0 },
  { x: -28.0, z: 11.0 },
  { x: -24.0, z: 19.0 },
  { x: -8.0, z: 19.0 },
  { x: 5.0, z: 19.0 },
  { x: 16.0, z: 11.0 },
  { x: 14.0, z: -1.0 },
  { x: 8.0, z: -9.0 },
  { x: 0.0, z: -7.0 },
];

/** Yard-local to world, through the origin this park put the yard on. */
function toWorld(g: Gate): Gate {
  const c = Math.cos(EMMETT_BASE.yaw);
  const s = Math.sin(EMMETT_BASE.yaw);
  return { x: EMMETT_BASE.x + g.x * c + g.z * s, z: EMMETT_BASE.z - g.x * s + g.z * c };
}

/** Where the truck parks once it is hers: on the lawn east of her house. */
export const TRUCK_PARK = { x: 139.5, z: -12, yaw: Math.PI / 2 };

function courseLength(gates: Gate[], from: Gate) {
  let len = 0;
  let prev = from;
  for (const g of gates) {
    len += Math.hypot(g.x - prev.x, g.z - prev.z);
    prev = g;
  }
  return len;
}

export type TruckCourse = { id: "run" | "race"; name: string; gates: Gate[]; target: number; start: Gate };

/** Both routes in world space, with the time she has to beat. */
export function truckCourses(): TruckCourse[] {
  const start = toWorld({ x: 8.5, z: 6.0 });
  const out: TruckCourse[] = [];
  for (const [id, local, pace] of [
    ["run", RUN_LOCAL, PACE.run],
    ["race", RACE_LOCAL, PACE.race],
  ] as const) {
    const gates = local.map(toWorld);
    const target = Math.round(courseLength(gates, start) / (WALK * pace) + GRACE);
    out.push({ id, name: id === "run" ? "The obstacle run" : "The big race", gates, target, start });
  }
  return out;
}

/** How near the middle of a gate she has to pass. Wide: this is not darts. */
const GATE_R = 2.6;

/**
 * The gates, the start line and the clock.
 *
 * The rings are built once for both courses and shown a course at a time. The
 * next one to run through is lit and turning; the ones behind her go dim, so
 * from anywhere on the route the bright ring is where to go.
 */
export class TruckGauntlet {
  private group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private posts: THREE.Group[] = [];
  private board: THREE.Mesh;
  private courses = truckCourses();
  /** the course she is running, or null */
  private live: TruckCourse | null = null;
  private gate = 0;
  private clock = 0;
  private started = 0;

  constructor(private scene: THREE.Scene) {
    // one ring per gate on the longer course; the shorter one uses the first few
    const most = Math.max(...this.courses.map((c) => c.gates.length));
    for (let i = 0; i < most; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.16, 8, 22),
        glowMaterial("#ffd84a", 1.1, 0.35),
      );
      ring.position.y = 1.7;
      ring.visible = false;
      this.group.add(ring);
      this.rings.push(ring);
      // a candy-cane post each side, so the gate reads as a gate from behind
      const posts = new THREE.Group();
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 1.7, 8),
          lam(s > 0 ? "#e8384f" : "#f6f1e8", { flat: true, roughness: 0.3 }),
        );
        post.position.set(s * 1.5, 0.85, 0);
        post.castShadow = true;
        posts.add(post);
      }
      posts.visible = false;
      this.group.add(posts);
      this.posts.push(posts);
    }

    this.board = signBoard("Emmett's Challenges", 4.2, 0.8);
    const b = toWorld({ x: 9.6, z: 6.6 });
    this.board.position.set(b.x, 2.1, b.z);
    this.board.rotation.y = EMMETT_BASE.yaw;
    this.group.add(this.board);
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    useGame.getState().setTruckRace(null);
  }

  /** The challenge she is up to, or null when the truck is already hers. */
  next(): { index: number; name: string; course: TruckCourse | null } | null {
    const wins = useGame.getState().truckWins;
    if (wins >= TRUCK_STAGES.length) return null;
    const course = wins >= RPS_ROUNDS ? this.courses[wins - RPS_ROUNDS] ?? null : null;
    return { index: wins, name: TRUCK_STAGES[wins]!, course };
  }

  /** Is the next challenge one of the runs rather than a game of hands? */
  get racing() {
    return this.live != null;
  }

  /** Start the run she is up to. Returns false if it is not a run. */
  start(): boolean {
    const next = this.next();
    if (!next?.course) return false;
    this.live = next.course;
    this.gate = 0;
    this.clock = 0;
    sfx.click();
    useGame.getState().setEmmettNotice(
      `${next.course.name}! Run through every ring. Emmett did it in ${next.course.target} seconds.`,
    );
    this.showGates();
    return true;
  }

  private showGates() {
    const gates = this.live?.gates ?? [];
    this.rings.forEach((ring, i) => {
      const g = gates[i];
      const on = !!g && this.live != null;
      ring.visible = on;
      this.posts[i]!.visible = on;
      if (!g) return;
      ring.position.set(g.x, 1.7, g.z);
      this.posts[i]!.position.set(g.x, 0, g.z);
      const done = i < this.gate;
      const mat = ring.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = done ? 0.15 : i === this.gate ? 1.3 : 0.5;
      ring.scale.setScalar(i === this.gate ? 1 : 0.86);
    });
  }

  private finish(won: boolean) {
    const course = this.live!;
    const st = useGame.getState();
    this.live = null;
    this.showGates();
    st.setTruckRace(null);
    if (!won) {
      sfx.wrong();
      st.setEmmettNotice(`So close! ${course.target} seconds to beat. Talk to Emmett to try again.`);
      return;
    }
    sfx.win();
    st.winTruckStage();
    const wins = useGame.getState().truckWins;
    st.addTickets(5);
    if (wins >= TRUCK_STAGES.length) {
      st.setEmmettNotice("You beat Emmett five times — the monster truck is yours! It's parked by your house.");
    } else {
      st.setEmmettNotice(`You beat him! That's ${wins} of ${TRUCK_STAGES.length}. One more challenge to go.`);
    }
  }

  /** Give up on the run she is in, without losing the wins she has. */
  cancel() {
    if (!this.live) return;
    this.live = null;
    this.showGates();
    useGame.getState().setTruckRace(null);
  }

  update(dt: number, t: number, her: { x: number; y: number; z: number }) {
    for (const ring of this.rings) if (ring.visible) ring.rotation.z = t * 0.9;
    if (!this.live) return;
    // she is a long way from the course, or has gone home: let it drop
    this.clock += dt;
    const st = useGame.getState();
    const g = this.live.gates[this.gate]!;
    if (Math.hypot(her.x - g.x, her.z - g.z) < GATE_R && her.y < 3) {
      sfx.correct();
      this.gate++;
      if (this.gate >= this.live.gates.length) {
        this.finish(this.clock <= this.live.target);
        return;
      }
      this.showGates();
    }
    if (this.clock > this.live.target + 12) {
      this.finish(false);
      return;
    }
    st.setTruckRace({
      name: this.live.name,
      gate: this.gate,
      gates: this.live.gates.length,
      time: this.clock,
      target: this.live.target,
      started: this.started,
    });
  }
}


/**
 * The truck once it is hers.
 *
 * It parks on the lawn beside her house and she gets in by walking up and
 * pressing Collect. Driving it is riding it: her own capsule is still what
 * the world collides with, so nothing about the physics changes — the truck
 * is drawn where she is, she is hidden inside it, and she goes at the speed a
 * cotton-candy boost gives her, which is exactly what she asked for. Getting
 * out leaves it where she stopped, because that is where a seven-year-old
 * expects to find it again.
 */
export class PlayerTruck {
  /**
   * Her name on the side of it, because she won it. The board is repainted
   * from the name she chose at the start, which is what every other sign in
   * the game with her name on it does.
   */
  private rig: TruckRig = makeMonsterTruck("candy", `${(useGame.getState().playerName || "SLOAN").toUpperCase()}'S`);
  private glow: THREE.Mesh;
  /** where it is standing while she is not in it */
  private at = { x: TRUCK_PARK.x, z: TRUCK_PARK.z, yaw: TRUCK_PARK.yaw };

  constructor(private scene: THREE.Scene) {
    this.rig.group.position.set(this.at.x, 0, this.at.z);
    this.rig.group.rotation.y = this.at.yaw;
    scene.add(this.rig.group);
    this.glow = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.07, 8, 30),
      glowMaterial("#ffd84a", 1.1, 0.3),
    );
    this.glow.rotation.x = Math.PI / 2;
    this.glow.position.set(this.at.x, 0.1, this.at.z);
    scene.add(this.glow);
  }

  dispose() {
    this.scene.remove(this.rig.group, this.glow);
    useGame.getState().setDriving(false);
  }

  /** Close enough to climb in, and not already in it. */
  near(x: number, y: number, z: number) {
    if (useGame.getState().driving) return false;
    return y < 3 && Math.hypot(x - this.at.x, z - this.at.z) < 3.4;
  }

  /** Get in, or get out and leave it where she stopped. */
  toggle(x: number, y: number, z: number, yaw: number): boolean {
    const st = useGame.getState();
    if (st.driving) {
      sfx.click();
      st.setDriving(false);
      this.at = { x, z, yaw };
      st.setEmmettNotice("Parked! Walk up to it any time to drive again.");
      return true;
    }
    if (!this.near(x, y, z)) return false;
    sfx.boing();
    st.setDriving(true);
    st.setEmmettNotice("Vroom! You're driving Emmett's monster truck.");
    return true;
  }

  update(t: number, her: { x: number; y: number; z: number }, yaw: number, moving: boolean) {
    const driving = useGame.getState().driving;
    if (driving) {
      this.at = { x: her.x, z: her.z, yaw };
      this.rig.group.position.set(her.x, 0, her.z);
      this.rig.group.rotation.y = yaw;
    } else {
      this.rig.group.position.set(this.at.x, 0, this.at.z);
      this.rig.group.rotation.y = this.at.yaw;
    }
    this.glow.visible = !driving;
    this.glow.position.set(this.at.x, 0.1, this.at.z);
    animateMonsterTruck(this.rig, t, driving && moving);
  }
}
