import * as THREE from "three";
import type { AABB } from "./collision";
import { setHumLevel, startHum, stopHum } from "./audio";
import { animateEmmett, makeDumpling, makeEmmett, type EmmettMood, type EmmettRig } from "./meshes";

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

/** Landmarks he rehides to. Known places, so a loss is an errand not a mystery. */
export type RehideSpot = { name: string; say: string; pos: [number, number, number] };

/** Places a kid on a trike has no business going. */
export type KeepOut = { minX: number; maxX: number; minZ: number; maxZ: number };

export class Emmett {
  rig: EmmettRig;
  group: THREE.Group;
  state: EmmettState = "away";
  timer = FIRST_DELAY;
  speed = 0;
  facing = 0;
  private turn = 0;
  private target = new THREE.Vector3();
  private lastX = 0;
  private lastZ = 0;
  private stuckFor = 0;
  private detour: THREE.Vector3 | null = null;
  private detourFor = 0;
  private detourSide = 1;
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
  ) {
    this.rig = makeEmmett();
    this.group = this.rig.root;
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
    this.detour = null;
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
    if (this.home) {
      // pedal back home
      this.target.set(this.home.park[0], 0, this.home.park[2]);
      return;
    }
    const b = this.bounds;
    // ride toward the nearest edge and vanish
    const ex = this.group.position.x > 0 ? b.maxX - 6 : b.minX + 6;
    const ez = this.group.position.z > 0 ? b.maxZ - 6 : b.minZ + 6;
    this.target.set(ex, 0, ez);
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
    this.detour = null;
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
    if (paused) return false;

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
        this.detour = null;
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
      if (Math.hypot(this.group.position.x - this.home.park[0], this.group.position.z - this.home.park[2]) < 3) {
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
    let dx = this.target.x - pos.x;
    let dz = this.target.z - pos.z;

    // if he has been shoved against something, pick a side and go around it
    const moved = Math.hypot(pos.x - this.lastX, pos.z - this.lastZ);
    this.lastX = pos.x;
    this.lastZ = pos.z;
    if (moved < SPEED * dt * 0.25) this.stuckFor += dt;
    else this.stuckFor = Math.max(0, this.stuckFor - dt * 2);

    if (this.stuckFor > 0.45 && !this.detour) {
      // alternate sides, so repeated attempts do not retrace the same failure
      this.detourSide *= -1;
      const len = Math.hypot(dx, dz) || 1;
      this.detour = new THREE.Vector3(
        pos.x + (-dz / len) * this.detourSide * 11,
        0,
        pos.z + (dx / len) * this.detourSide * 11,
      );
      this.detourFor = 2.6;
      this.stuckFor = 0;
    }
    if (this.detour) {
      this.detourFor -= dt;
      dx = this.detour.x - pos.x;
      dz = this.detour.z - pos.z;
      if (this.detourFor <= 0 || Math.hypot(dx, dz) < 2) this.detour = null;
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

    // ease off as he arrives so he does not jitter on top of her; dawdle at home
    const approach = this.state === "chasing" ? THREE.MathUtils.clamp(dist / 6, 0.35, 1) : 1;
    this.speed = this.state === "home" ? HOME_SPEED : SPEED * approach;

    const stepX = Math.sin(this.facing) * this.speed * dt;
    const stepZ = Math.cos(this.facing) * this.speed * dt;

    // simple slide: try both axes separately so he follows walls instead of sticking
    const r = 0.75;
    const blocked = (x: number, z: number) => {
      if (this.inKeepOut(x, z)) return true;
      for (const b of colliders) {
        if (b.maxY < 0.6) continue;
        if (b.minY > 1.6) continue;
        if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
      }
      return false;
    };

    if (!blocked(pos.x + stepX, pos.z)) pos.x += stepX;
    if (!blocked(pos.x, pos.z + stepZ)) pos.z += stepZ;

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
      if (toPlayer < this.bestDist - 0.5) {
        this.bestDist = toPlayer;
        this.noProgressFor = 0;
      } else {
        this.noProgressFor += dt;
        if (this.noProgressFor > 6) {
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
  pos: [number, number, number];
  taken: boolean;
  respawn: number;
  phase: number;
};

export const BOOST_SECONDS = 20;
export const BOOST_MULTIPLIER = 1.85;
