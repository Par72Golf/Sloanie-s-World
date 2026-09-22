import * as THREE from "three";
import type { AABB } from "./collision";
import { setHumLevel, startHum, stopHum } from "./audio";
import { animateEmmett, makeDumpling, makeEmmett, type EmmettMood, type EmmettRig } from "./meshes";
import { navGridFor, type NavGrid, type NavRect } from "./navgrid";

/**
 * Emmett.
 *
 * He is not a threat, he is a little brother. He turns up every few minutes,
 * pedals over at a speed she can outrun, and wants to play rock paper scissors
 * for a dumpling. Tuning notes:
 *   - never appears until she has found a couple, so she learns the game first
 *   - stops taking at 11 of 12, or the last one can ping-pong forever
 *   - slower than walking, so noticing him is always enough to avoid him
 */

// A full first run took 7 minutes and he never showed: 3 minutes plus the
// two-dumpling gate was too late. First visit at 2.5 minutes, after one catch.
const FIRST_DELAY = 150; // seconds before his first appearance
const GAP_MIN = 150;
const GAP_MAX = 240;
const LINGER = 45; // how long he hangs around before pedalling off
const COOLDOWN = 90; // after an encounter, before he can come back
const SPEED = 5.1; // player walk is 6.4
const CATCH_R = 2.6;
const MIN_FOUND = 1;

let humIsOnCached = false;

export type EmmettState = "away" | "home" | "arriving" | "chasing" | "leaving" | "talking";

/** Where he lives: his monster truck yard. He pedals laps round it between outings. */
export type EmmettHome = { x: number; z: number; loop: number; park: [number, number, number] };

/** How far away counts as "arrived near her", when the lingering clock starts. */
const NEAR_HER = 45;
const HOME_SPEED = 2.2;
/**
 * Seconds pedalling home before he just slips out of sight and turns up there.
 * Since he navigates properly this is a last resort that should never fire;
 * tools/emmett-home.ts counts it and fails if it does.
 */
const HOME_GIVE_UP = 30;
/**
 * The park is 320m across, so a ride home from the far corner is a genuine
 * 45 seconds and a flat 30 would teleport him for simply being far away. The
 * budget is the straight-line ride plus most of it again, on top of the 30.
 */
const homeBudget = (distance: number) => Math.min(120, HOME_GIVE_UP + (distance / SPEED) * 1.8);

/* ------------------------------------------------------------- navigation */

/**
 * He used to steer straight at her and sidestep when he hit something, which
 * a park full of buildings, fences, hedges and a lava course is far too much
 * for. Now he plans a route over a coarse grid of the real colliders
 * (navgrid.ts) and rides the waypoints, re-planning when she moves a long way,
 * when the route runs out, or when something has him pinned.
 */
/** His half-width for planning: a shade wider than the box his own steering slides with. */
const RIDE_R = 0.75;
const PLAN_R = RIDE_R + 0.05;
/** How far inside the park edge he is allowed, matching the clamp below. */
const EDGE_MARGIN = 3.2;
/** Within this, with nothing in the way, he just rides at her. */
const NEAR_DIRECT = 9;
/** How close counts as having reached a waypoint. */
const WAY_R = 1.6;
/** She has to move this far from the goal he planned for before he re-thinks. */
const REPLAN_MOVE = 6;
/** A moving target goes stale; refresh the route this often while chasing. */
const REPATH_EVERY = 2.5;
/** Never plan more often than this, so a bad frame cannot become a bad second. */
const PLAN_COOLDOWN = 0.35;
/** Pinned for this long: re-plan. Pinned for this long again: shove him sideways. */
const STUCK_REPLAN = 0.5;
const STUCK_SIDESTEP = 1.5;
/** Waypoints kept per route. A plan longer than this is trimmed; he re-plans anyway. */
const MAX_WAYS = 96;
/** Standing off a place he cannot get into: this close to the best spot and he waits. */
const HOLD_R = 3;
/**
 * Boxes under this he rides over (kerbs, walkway slabs, the flat surfaces);
 * boxes starting above it he rides under. navgrid.ts plans with the same two
 * numbers, and they have to stay in step or he will plan through a wall.
 */
const RIDE_LOW = 0.6;
const RIDE_HIGH = 1.6;
/**
 * He only ever touches what is right beside him, so the per-frame collision
 * test runs over a short list refreshed whenever he has moved this far,
 * instead of all ~1700 park colliders twice a frame.
 */
const NEAR_REFRESH = 2;
const NEAR_CAP = 512;
/** Landmarks he rehides to. Known places, so a loss is an errand not a mystery. */
export type RehideSpot = { name: string; say: string; pos: [number, number, number] };

/** Places a kid on a trike has no business going. */
export type KeepOut = { minX: number; maxX: number; minZ: number; maxZ: number };

export class Emmett {
  rig: EmmettRig;
  group: THREE.Group;
  state: EmmettState = "away";
  /** seconds spent riding home, so a blocked route cannot strand him */
  private ridingHome = 0;
  timer = FIRST_DELAY;
  speed = 0;
  facing = 0;
  private turn = 0;
  private target = new THREE.Vector3();
  private lastX = 0;
  private lastZ = 0;
  private stuckFor = 0;
  /** unbroken seconds of going nowhere, for the worst-wedge figure the tools print */
  private wedgeFor = 0;
  private detour = new THREE.Vector3();
  private detouring = false;
  private detourFor = 0;
  private detourSide = 1;

  // ---- navigation (navgrid.ts)
  private nav: NavGrid | null = null;
  /** the current route as [x, z, x, z, ...]; a fixed buffer, so a re-plan allocates nothing */
  private ways = new Float32Array(MAX_WAYS * 2);
  private wayCount = 0;
  private wayAt = 0;
  private planCool = 0;
  private repathIn = 0;
  private plannedX = 0;
  private plannedZ = 0;
  /** the point he actually turns toward this frame */
  private steerX = 0;
  private steerZ = 0;
  /** the closest spot to the target he can actually reach, when they differ */
  private reachX = 0;
  private reachZ = 0;
  private reachSnapped = false;
  /** a re-plan has already been tried for this wedge; the next step is a shove */
  private stuckPlanned = false;
  /** waiting at that spot because there is no way through to her */
  /** Standing still because she is somewhere he cannot ride to. The tools read it. */
  waiting = false;
  /** seconds he is allowed to spend riding home before the last-resort slip home */
  private homeFor = HOME_GIVE_UP;
  /** indices into the collider array of everything he could bump into from here */
  private nearIdx = new Int32Array(NEAR_CAP);
  private nearCount = 0;
  private nearAtX = Infinity;
  private nearAtZ = Infinity;
  /** counters the tools read; nothing in the game looks at them */
  readonly navStats = {
    plans: 0,
    planMs: 0,
    worstPlanMs: 0,
    worstExpanded: 0,
    truncated: 0,
    worstWedge: 0,
    /** most colliders ever in the near list, against the NEAR_CAP ceiling */
    worstNear: 0,
    homeGiveUps: 0,
    chaseGiveUps: 0,
  };
  mood: EmmettMood = "ride";
  private carried: THREE.Object3D | null = null;
  private bestDist = Infinity;
  private noProgressFor = 0;

  private loopAngle = 0;

  constructor(
    scene: THREE.Object3D,
    private bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    private keepOut: KeepOut[] = [],
    private home: EmmettHome | null = null,
    /**
     * Ground worth preferring, this park's path network (features.ts). It is
     * only a step cost, so a shortcut across the grass still wins when it is a
     * real shortcut, but where the two are close he takes the path, which is
     * what a kid on a trike would do and reads much better than cutting
     * through the flower garden. The grid is cached on this array's identity,
     * so it has to be the park's one array, not a fresh copy.
     */
    private prefer: readonly NavRect[] = [],
    /** which Emmett: park 1's, or the one made of sweets in Sugar Rush */
    look: "park" | "candy" = "park",
  ) {
    this.rig = makeEmmett(look);
    this.group = this.rig.root;
    // so a browser session can find him from __gameTest.scene() and watch a ride
    this.group.userData.emmett = this;
    this.group.visible = false;
    scene.add(this.group);
    if (home) this.goHome(FIRST_DELAY);
  }

  /** Park him at home, pedalling laps, until his next outing in `wait` seconds. */
  private goHome(wait: number) {
    const h = this.home!;
    this.state = "home";
    this.timer = wait;
    this.mood = "ride";
    this.dropCarried();
    this.loopAngle = Math.atan2(this.group.position.z - h.z, this.group.position.x - h.x) || 0;
    if (!this.group.visible) this.group.position.set(h.park[0], 0, h.park[2]);
    this.group.visible = true;
    this.forget();
    setHumLevel(0);
  }

  dispose(scene: THREE.Object3D) {
    stopHum();
    humIsOnCached = false;
    scene.remove(this.group);
  }

  /** Show a stolen dumpling riding above his head until he is gone. */
  carry(color: string, accent: string) {
    this.dropCarried();
    const d = makeDumpling(color, accent);
    d.scale.setScalar(0.62);
    this.rig.carry.add(d);
    this.carried = d;
  }

  dropCarried() {
    if (this.carried) {
      this.rig.carry.remove(this.carried);
      this.carried = null;
    }
  }

  reset() {
    this.state = "away";
    this.timer = FIRST_DELAY;
    this.group.visible = false;
    this.mood = "ride";
    this.dropCarried();
    setHumLevel(0);
    if (this.home) this.goHome(FIRST_DELAY);
  }

  /** Send him off after an encounter. */
  leave(cooldown = COOLDOWN) {
    this.state = "leaving";
    this.timer = cooldown;
    this.ridingHome = 0;
    this.forget();
    if (this.home) {
      // pedal back home
      this.target.set(this.home.park[0], 0, this.home.park[2]);
      this.homeFor = homeBudget(
        Math.hypot(this.group.position.x - this.home.park[0], this.group.position.z - this.home.park[2]),
      );
      return;
    }
    const b = this.bounds;
    // ride toward the nearest edge and vanish
    const ex = this.group.position.x > 0 ? b.maxX - 6 : b.minX + 6;
    const ez = this.group.position.z > 0 ? b.maxZ - 6 : b.minZ + 6;
    this.target.set(ex, 0, ez);
  }

  /** Throw away the route and any sidestep: he is somewhere new, or has a new idea. */
  private forget() {
    this.wayCount = 0;
    this.wayAt = 0;
    this.detouring = false;
    this.planCool = 0;
    this.repathIn = 0;
    this.stuckFor = 0;
    this.wedgeFor = 0;
    this.stuckPlanned = false;
    this.waiting = false;
    this.reachSnapped = false;
  }

  /**
   * The short list of colliders near him, rebuilt whenever he has ridden
   * NEAR_REFRESH metres. The radius covers everything his box could reach
   * before the next rebuild, so nothing he could hit is ever missed.
   */
  private refreshNear(colliders: AABB[]) {
    const pos = this.group.position;
    const dx = pos.x - this.nearAtX;
    const dz = pos.z - this.nearAtZ;
    if (dx * dx + dz * dz < NEAR_REFRESH * NEAR_REFRESH) return;
    this.nearAtX = pos.x;
    this.nearAtZ = pos.z;
    const r = NEAR_REFRESH + RIDE_R + 1.5;
    let n = 0;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i]!;
      if (b.maxY < RIDE_LOW || b.minY > RIDE_HIGH) continue;
      if (pos.x + r < b.minX || pos.x - r > b.maxX || pos.z + r < b.minZ || pos.z - r > b.maxZ) continue;
      if (n >= NEAR_CAP) break;
      this.nearIdx[n++] = i;
    }
    this.nearCount = n;
    if (n > this.navStats.worstNear) this.navStats.worstNear = n;
  }

  /** Would his box at (x, z) be inside something, or somewhere he must not go? */
  private blocked(colliders: AABB[], x: number, z: number) {
    if (this.inKeepOut(x, z)) return true;
    const r = RIDE_R;
    for (let k = 0; k < this.nearCount; k++) {
      const b = colliders[this.nearIdx[k]!]!;
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  /**
   * Put him in the park at (x, z) and send him after her, as if his timer had
   * just run out at home. The game uses the timer; this is for the tools, so
   * they can start him anywhere and time the ride.
   */
  sendOut(x: number, z: number, linger = LINGER) {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.state = "arriving";
    this.timer = linger;
    this.mood = "ride";
    this.bestDist = Infinity;
    this.noProgressFor = 0;
    this.lastX = x;
    this.lastZ = z;
    this.facing = 0;
    this.nearAtX = Infinity;
    this.nearAtZ = Infinity;
    this.forget();
  }

  /**
   * The grid for this world. navGridFor caches on the collider array, so this
   * is a WeakMap lookup every frame after the first and a one-off build when
   * the world is rebuilt.
   */
  private ensureNav(colliders: AABB[]) {
    this.nav = navGridFor(this.bounds, colliders, this.keepOut, PLAN_R, EDGE_MARGIN, this.prefer);
  }

  /**
   * Keep the route fresh and choose this frame's steering point. All of the
   * thinking is behind PLAN_COOLDOWN; the rest is a couple of distance checks.
   */
  private navigate(dt: number) {
    const nav = this.nav;
    const pos = this.group.position;
    // laps round the yard are a circle he already knows is clear
    if (!nav || this.state === "home") {
      this.wayCount = 0;
      this.steerX = this.target.x;
      this.steerZ = this.target.z;
      return;
    }
    this.planCool -= dt;
    this.repathIn -= dt;

    const tx = this.target.x;
    const tz = this.target.z;
    // close and in plain sight: ride straight at her, so he never circles a
    // waypoint while she is standing next to him
    const straight = Math.hypot(tx - pos.x, tz - pos.z);
    const direct = straight < NEAR_DIRECT && nav.lineClear(pos.x, pos.z, tx, tz);

    if (direct) {
      this.wayCount = 0;
      this.reachSnapped = false;
    } else {
      // One re-plan per wedge. Planning again every cooldown would keep
      // resetting the wedge clock and the shove below would never come.
      const wedged = this.stuckFor > STUCK_REPLAN && !this.stuckPlanned;
      const stale =
        this.wayCount === 0 ||
        this.wayAt >= this.wayCount ||
        this.repathIn <= 0 ||
        wedged ||
        Math.hypot(tx - this.plannedX, tz - this.plannedZ) > REPLAN_MOVE;
      if (stale && this.planCool <= 0) {
        if (wedged) this.stuckPlanned = true;
        this.plan(tx, tz);
      }
    }

    // drop waypoints he has reached, and skip one ahead when it is already in
    // plain sight, which rounds the corners off instead of clipping them
    while (this.wayAt < this.wayCount) {
      const wx = this.ways[this.wayAt * 2]!;
      const wz = this.ways[this.wayAt * 2 + 1]!;
      if (Math.hypot(wx - pos.x, wz - pos.z) < WAY_R) this.wayAt++;
      else break;
    }
    if (this.wayAt + 1 < this.wayCount) {
      const ax = this.ways[(this.wayAt + 1) * 2]!;
      const az = this.ways[(this.wayAt + 1) * 2 + 1]!;
      if (nav.lineClear(pos.x, pos.z, ax, az)) this.wayAt++;
    }

    if (this.wayAt < this.wayCount) {
      this.steerX = this.ways[this.wayAt * 2]!;
      this.steerZ = this.ways[this.wayAt * 2 + 1]!;
      this.waiting = false;
    } else if (this.reachSnapped) {
      // There is no way through to her: the fence round the carousel, the
      // hedges of the maze, the stair up the lookout. Ride to the nearest spot
      // he can get to and wait there looking at her, rather than grinding on
      // whatever is between them until the give-up timer notices.
      this.steerX = this.reachX;
      this.steerZ = this.reachZ;
      this.waiting = Math.hypot(this.reachX - pos.x, this.reachZ - pos.z) < HOLD_R;
    } else {
      this.steerX = tx;
      this.steerZ = tz;
      this.waiting = false;
    }
  }

  /** One A* over the grid, written into the fixed waypoint buffer. */
  private plan(tx: number, tz: number) {
    const nav = this.nav!;
    const pos = this.group.position;
    this.wayCount = nav.findPath(pos.x, pos.z, tx, tz, this.ways);
    this.wayAt = 0;
    this.reachSnapped = nav.goalSnapped;
    this.reachX = nav.goalX;
    this.reachZ = nav.goalZ;
    this.plannedX = tx;
    this.plannedZ = tz;
    this.planCool = PLAN_COOLDOWN;
    this.repathIn = REPATH_EVERY;
    const st = this.navStats;
    st.plans++;
    st.planMs += nav.stats.ms;
    if (nav.stats.ms > st.worstPlanMs) st.worstPlanMs = nav.stats.ms;
    if (nav.stats.expanded > st.worstExpanded) st.worstExpanded = nav.stats.expanded;
    if (nav.stats.truncated) st.truncated++;
  }

  private inKeepOut(x: number, z: number, pad = 0) {
    for (const k of this.keepOut) {
      if (x > k.minX - pad && x < k.maxX + pad && z > k.minZ - pad && z < k.maxZ + pad) return true;
    }
    return false;
  }

  private spawnNear(px: number, pz: number) {
    if (!humIsOnCached) {
      startHum();
      humIsOnCached = true;
    }
    this.mood = "ride";
    const b = this.bounds;
    let x = px;
    let z = pz;
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 34 + Math.random() * 10;
      x = THREE.MathUtils.clamp(px + Math.cos(a) * r, b.minX + 5, b.maxX - 5);
      z = THREE.MathUtils.clamp(pz + Math.sin(a) * r, b.minZ + 5, b.maxZ - 5);
      if (!this.inKeepOut(x, z, 3)) break;
    }
    this.bestDist = Infinity;
    this.noProgressFor = 0;
    this.forget();
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.state = "arriving";
    this.timer = LINGER;
    this.stuckFor = 0;
  }

  /**
   * @returns true on the frame he catches her
   */
  update(
    dt: number,
    t: number,
    px: number,
    pz: number,
    found: number,
    total: number,
    colliders: AABB[],
    paused: boolean,
  ): boolean {
    // a zero-length frame would make the lean 0/0 and NaN hides him for good
    if (paused || !(dt > 0)) return false;

    if (this.state === "home" && this.home) {
      // laps round the truck yard; when it's time, off he goes to find her
      const h = this.home;
      this.timer -= dt;
      this.loopAngle += (dt * HOME_SPEED) / h.loop;
      this.target.set(h.x + Math.cos(this.loopAngle) * h.loop, 0, h.z + Math.sin(this.loopAngle) * h.loop);
      setHumLevel(0);
      if (this.timer <= 0 && found >= MIN_FOUND && found < total - 1) {
        if (!humIsOnCached) {
          startHum();
          humIsOnCached = true;
        }
        this.state = "arriving";
        this.timer = LINGER;
        this.bestDist = Infinity;
        this.noProgressFor = 0;
        this.forget();
      }
    } else if (this.state === "away") {
      setHumLevel(0);
      this.timer -= dt;
      // he only starts turning up once she is into the game, and he leaves the
      // last one alone so she can always finish
      if (this.timer <= 0 && found >= MIN_FOUND && found < total - 1) {
        this.spawnNear(px, pz);
      }
      return false;
    }

    if (this.state === "talking") {
      setHumLevel(0.25);
      return false;
    }

    // audible well before he is visible, so noticing him is enough to escape
    const away = Math.hypot(px - this.group.position.x, pz - this.group.position.z);
    if (this.state !== "home") setHumLevel(THREE.MathUtils.clamp(1 - (away - 4) / 34, 0, 1));

    // riding out from home, the lingering clock only starts once he's near her
    if (this.state !== "home" && !(this.state === "arriving" && this.home && away > NEAR_HER)) this.timer -= dt;

    if (this.state === "arriving" && this.home && away > NEAR_HER) {
      this.target.set(px, 0, pz);
    } else if (this.state === "arriving" || this.state === "chasing") {
      this.state = "chasing";
      // if she ducks into the maze or the walled garden he waits outside,
      // circling near the edge rather than trying to follow her in
      if (this.inKeepOut(px, pz, 1.5)) {
        const k = this.keepOut.find(
          (z2) => px > z2.minX - 1.5 && px < z2.maxX + 1.5 && pz > z2.minZ - 1.5 && pz < z2.maxZ + 1.5,
        )!;
        const cxk = (k.minX + k.maxX) / 2;
        const czk = (k.minZ + k.maxZ) / 2;
        const dx0 = px - cxk;
        const dz0 = pz - czk;
        const len = Math.hypot(dx0, dz0) || 1;
        const outX = cxk + (dx0 / len) * (Math.max(k.maxX - k.minX, k.maxZ - k.minZ) / 2 + 6);
        const outZ = czk + (dz0 / len) * (Math.max(k.maxX - k.minX, k.maxZ - k.minZ) / 2 + 6);
        this.target.set(outX, 0, outZ);
      } else {
        this.target.set(px, 0, pz);
      }
      if (this.timer <= 0) this.leave(GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN) - LINGER);
    }

    if (this.state === "leaving" && this.home) {
      this.ridingHome += dt;
      const away = Math.hypot(this.group.position.x - this.home.park[0], this.group.position.z - this.home.park[2]);
      if (away < 3) {
        this.goHome(Math.max(this.timer, GAP_MIN * 0.5));
        return false;
      }
      /*
       * Berms and buildings can leave him circling: the park has a stepped
       * berm between the middle of the park and his yard, and his sidestep
       * can oscillate in front of it. Rather than have him stuck out there
       * for the rest of the game (with his truck game gone with him), after
       * a while he pedals out of sight and turns up back at the yard.
       */
      if (this.ridingHome > this.homeFor) {
        this.navStats.homeGiveUps++;
        this.group.visible = false;
        this.goHome(Math.max(this.timer, GAP_MIN * 0.5));
        return false;
      }
    } else if (this.state === "leaving" && this.timer <= LINGER * 0.2) {
      // far enough away, park him until next time
      this.group.visible = false;
      this.state = "away";
      this.mood = "ride";
      this.dropCarried();
      setHumLevel(0);
      this.timer = Math.max(this.timer, GAP_MIN * 0.5);
      return false;
    }

    // ---- steering
    const pos = this.group.position;

    // How far he actually got last frame. Moving nowhere is the only reliable
    // sign of a wedge: a plan can look perfect and still leave him on a kerb.
    const moved = Math.hypot(pos.x - this.lastX, pos.z - this.lastZ);
    this.lastX = pos.x;
    this.lastZ = pos.z;
    if (moved < SPEED * dt * 0.25 && !this.waiting) {
      this.stuckFor += dt;
      this.wedgeFor += dt;
      if (this.wedgeFor > this.navStats.worstWedge) this.navStats.worstWedge = this.wedgeFor;
    } else {
      this.stuckFor = Math.max(0, this.stuckFor - dt * 2);
      if (this.stuckFor === 0) this.stuckPlanned = false;
      this.wedgeFor = 0;
    }

    // plan (or keep following) a route, and pick this frame's steering point
    this.ensureNav(colliders);
    this.refreshNear(colliders);
    this.navigate(dt);

    let dx = this.steerX - pos.x;
    let dz = this.steerZ - pos.z;

    // Last resort. The route is fine but something the grid is too coarse to
    // see has him pinned, so shove him sideways for a moment and then think
    // again from wherever that leaves him.
    if (this.stuckFor > STUCK_SIDESTEP && !this.detouring) {
      // alternate sides, so repeated attempts do not retrace the same failure
      this.detourSide *= -1;
      const len = Math.hypot(dx, dz) || 1;
      this.detour.set(pos.x + (-dz / len) * this.detourSide * 7, 0, pos.z + (dx / len) * this.detourSide * 7);
      this.detouring = true;
      this.detourFor = 1;
      this.stuckFor = 0;
      this.stuckPlanned = false;
      this.wayCount = 0;
    }
    if (this.detouring) {
      this.detourFor -= dt;
      dx = this.detour.x - pos.x;
      dz = this.detour.z - pos.z;
      if (this.detourFor <= 0 || Math.hypot(dx, dz) < 1.5) this.detouring = false;
    }

    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;

    const want = Math.atan2(nx, nz);
    let delta = want - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const turnRate = 2.6 * dt;
    const applied = THREE.MathUtils.clamp(delta, -turnRate, turnRate);
    this.facing += applied;
    this.turn = THREE.MathUtils.lerp(this.turn, applied / turnRate, 0.2);
    if (!Number.isFinite(this.turn)) this.turn = 0;

    // ease off as he arrives so he does not jitter on top of her; dawdle at
    // home. Measured to her, not to the next waypoint, which may be right
    // under his wheels.
    const toTarget = Math.hypot(this.target.x - pos.x, this.target.z - pos.z);
    const approach = this.state === "chasing" ? THREE.MathUtils.clamp(toTarget / 6, 0.35, 1) : 1;
    this.speed = this.state === "home" ? HOME_SPEED : SPEED * approach;
    // parked at the edge of somewhere he cannot follow her into, watching
    if (this.waiting) this.speed = 0;

    const stepX = Math.sin(this.facing) * this.speed * dt;
    const stepZ = Math.cos(this.facing) * this.speed * dt;

    // Simple slide: try both axes separately so he follows walls instead of
    // sticking. If he is somehow already inside something (a prop rebuilt on
    // top of him, a bad spawn) both tests would fail for ever and he would be
    // a statue, so while he is inside he may move freely until he is out.
    if (this.blocked(colliders, pos.x, pos.z)) {
      pos.x += stepX;
      pos.z += stepZ;
    } else {
      if (!this.blocked(colliders, pos.x + stepX, pos.z)) pos.x += stepX;
      if (!this.blocked(colliders, pos.x, pos.z + stepZ)) pos.z += stepZ;
    }

    pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.minX + 3, this.bounds.maxX - 3);
    pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.minZ + 3, this.bounds.maxZ - 3);

    this.group.rotation.y = this.facing;
    // he glances over at her while he rides
    const look =
      this.state === "chasing"
        ? Math.atan2(px - pos.x, pz - pos.z) - this.facing
        : null;
    animateEmmett(this.rig, this.speed, t, this.turn, { mood: this.mood, lookAt: look });

    if (this.state === "chasing") {
      const toPlayer = Math.hypot(px - pos.x, pz - pos.z);

      // Safety net: if he cannot get meaningfully closer for a while he is
      // wedged on something, so he gives up and pedals off instead of
      // vibrating against a hedge for the rest of the level.
      // Safety net, second half: getting no closer is fine if he is covering
      // ground (she is simply walking away, and LINGER will end it). Only
      // going nowhere at all counts as failing.
      if (toPlayer < this.bestDist - 0.5) {
        this.bestDist = toPlayer;
        this.noProgressFor = 0;
      } else if (moved > SPEED * dt * 0.4) {
        this.noProgressFor = Math.max(0, this.noProgressFor - dt);
      } else {
        this.noProgressFor += dt;
        if (this.noProgressFor > 8) {
          this.navStats.chaseGiveUps++;
          this.leave(GAP_MIN * 0.6);
          return false;
        }
      }

      if (toPlayer < CATCH_R && !this.inKeepOut(px, pz, 1)) {
        this.state = "talking";
        return true;
      }
    }
    return false;
  }
}

/* --------------------------------------------------------------- juice */

export type JuicePickup = {
  group: THREE.Group;
  /** the glowing ring on the ground under a candy-floss boost; it does not bob */
  ring?: THREE.Object3D;
  pos: [number, number, number];
  taken: boolean;
  respawn: number;
  phase: number;
};

export const BOOST_SECONDS = 20;
export const BOOST_MULTIPLIER = 1.85;
