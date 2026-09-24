import * as THREE from "three";
import { create } from "zustand";
import { sfx } from "./audio";
import type { AABB } from "./collision";
import { glowMaterial } from "./furniture";
import { lam, mesh, signBoard, sphereGeo } from "./meshes";
import { SUGAR } from "./sugar-rush";
import { useGame } from "./store";

/**
 * Whack-a-Gummy: the fairground game she already knows how to play, moved out
 * of a menu and onto the grass.
 *
 * Park 1's Whack-a-Mole is a grid of buttons in a card. This is the same idea
 * with her feet in it: eight holes in a chocolate box laid out in a ring eight
 * metres across, gummy bears popping up out of them, and she has to RUN to
 * whichever one is up and press Collect before it drops. Reaction plus
 * legwork, which is a different game from reaction alone — and the reason it
 * is worth the extra work is that a seven-year-old chasing something round a
 * ring is laughing, and a seven-year-old tapping a grid is concentrating.
 *
 * It never takes her controls. There is no camera to hand over and no meter
 * to hold: she is just in the park, running, with a clock on the HUD. The only
 * thing it adds to Collect is that when a bear is up beside her, Collect whacks
 * it instead of doing whatever it would have done.
 *
 * Nothing about it can be failed. The round ends on a clock, every bear she
 * misses is simply one she missed, and the tickets start at one.
 */

const C = {
  choc: "#6b4226",
  chocDark: "#4a2e1c",
  chocLight: "#8a5a34",
  icing: "#f6f1e8",
  cream: "#f7ead3",
  pink: "#ff6aa8",
  red: "#e8384f",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  sun: "#ffc83a",
  orange: "#ff8a3a",
  lime: "#7fd94a",
};

const gloss = (c: string, roughness = 0.16) => lam(c, { flat: true, roughness });

/**
 * Where the box stands, and the shape of the game.
 *
 * The fairground is strung with bunting on a grid — poles every twelve metres
 * at z 102 and 113.5 — and the box sits in the middle of one of those bays,
 * which is why the numbers look arbitrary. The first site put a bunting pole
 * straight through the middle of the chocolate.
 */
export const WHACK = {
  x: SUGAR.fair.x + 8,
  z: SUGAR.fair.z + 3.75,
  /** the ring the holes sit on, and how many */
  ring: 3.0,
  holes: 8,
  /** the box she runs about on: a low chocolate slab she can step up onto */
  deck: 4.9,
  deckTop: 0.3,
  /** where she stands to start a round */
  standD: 6.6,
  /** how long a round lasts */
  seconds: 30,
} as const;

/** How near a bear she has to be for Collect to whack it. Generous on purpose. */
const WHACK_R = 2.1;
export const START_R = 2.4;

/** How long a bear stays up, from the first one to the last. */
const UP_FROM = 1.7;
const UP_TO = 0.85;
/** and how long between one going down and the next coming up */
const GAP_FROM = 0.75;
const GAP_TO = 0.28;

type WhackStore = {
  near: boolean;
  /** a bear is up beside her, so Collect would whack it */
  hit: boolean;
  playing: boolean;
  left: number;
  score: number;
  card: { score: number; tickets: number; line: string } | null;
  setNear: (v: boolean) => void;
  setHit: (v: boolean) => void;
  setRound: (playing: boolean, left: number, score: number) => void;
  setCard: (card: WhackStore["card"]) => void;
  /**
   * Bumped by the tray's "Again" button. The box watches it rather than the
   * tray calling in, because at the end of a round she is standing in the
   * middle of the box and not on the mat, so the ordinary way to start one
   * would refuse her.
   */
  again: number;
  playAgain: () => void;
};

/** Its own little store, so store.ts does not grow another near/playing pair. */
export const useWhack = create<WhackStore>((set) => ({
  near: false,
  hit: false,
  playing: false,
  left: 0,
  score: 0,
  card: null,
  setNear: (near) => set((s) => (s.near === near ? s : { near })),
  setHit: (hit) => set((s) => (s.hit === hit ? s : { hit })),
  setRound: (playing, left, score) =>
    set((s) => (s.playing === playing && Math.ceil(s.left) === Math.ceil(left) && s.score === score ? s : { playing, left, score })),
  setCard: (card) => set({ card }),
  again: 0,
  playAgain: () => set((s) => ({ again: s.again + 1, card: null })),
}));

/** Tickets for a score. Everybody wins something; twenty is a very good round. */
export function whackTickets(score: number) {
  if (score >= 20) return 15;
  if (score >= 14) return 10;
  if (score >= 8) return 6;
  if (score >= 3) return 3;
  return 1;
}

export function whackLine(score: number) {
  if (score >= 20) return `${score} gummy bears! Nobody is faster than you.`;
  if (score >= 14) return `${score} gummy bears — brilliant running.`;
  if (score >= 8) return `${score} gummy bears. That is a good round.`;
  if (score >= 3) return `${score} gummy bears. Try the far side next time!`;
  return "One or two got away. Have another go — it is free.";
}

/** Where hole `i` is, in the box's own frame. */
export function holeAt(i: number) {
  const a = (i / WHACK.holes) * Math.PI * 2;
  return { x: Math.cos(a) * WHACK.ring, z: Math.sin(a) * WHACK.ring };
}

type Hole = {
  i: number;
  x: number;
  z: number;
  bear: THREE.Group;
  /** 0 down, 1 fully up */
  up: number;
  /** seconds left of being up, or 0 */
  timer: number;
  whacked: number;
};

/** A gummy bear: the same rounded shape the creatures use, at hole size. */
function makeBear(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(sphereGeo, gloss(color, 0.14));
  body.scale.set(0.42, 0.52, 0.36);
  body.position.y = 0.5;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(sphereGeo, gloss(color, 0.14));
  head.scale.setScalar(0.32);
  head.position.y = 1.0;
  head.castShadow = true;
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(sphereGeo, gloss(color, 0.14));
    ear.scale.setScalar(0.13);
    ear.position.set(s * 0.22, 1.2, 0);
    g.add(ear);
    const arm = new THREE.Mesh(sphereGeo, gloss(color, 0.14));
    arm.scale.set(0.13, 0.2, 0.13);
    arm.position.set(s * 0.42, 0.62, 0.02);
    g.add(arm);
  }
  // a face, so a bear that is up reads as a bear and not a blob
  for (const s of [-1, 1]) g.add(mesh(sphereGeo, "#3a2a26", 0.045, 0.055, 0.03, s * 0.11, 1.05, 0.29, false));
  g.add(mesh(sphereGeo, "#3a2a26", 0.05, 0.04, 0.03, 0, 0.96, 0.31, false));
  g.name = "gummy";
  return g;
}

/** The burst a whack makes: gold stars flying out of the hole and a ring spreading across it. */
const STAR_GEO = new THREE.OctahedronGeometry(0.11, 0);
const STAR_MAT = glowMaterial("#ffd84a", 1.4, 0.2);
const POW_GEO = new THREE.RingGeometry(0.55, 0.75, 28);
type Spark = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number };
type Pow = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number };

export class WhackWorld {
  private group = new THREE.Group();
  private sparks: Spark[] = [];
  private pows: Pow[] = [];
  private holes: Hole[] = [];
  private solids: (AABB & { label: string })[] = [];
  private board: THREE.Mesh;
  private ring: THREE.Mesh;
  private t = 0;
  private left = 0;
  private score = 0;
  private nextUp = 0;
  private live = false;
  private lastAgain = 0;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    const { x, z } = WHACK;

    // the box: a slab of chocolate with a lid rim, low enough to step onto
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(WHACK.deck, WHACK.deck - 0.15, WHACK.deckTop, 26),
      lam(C.choc, { tex: "dough", repeat: 5, roughness: 0.5 }),
    );
    deck.position.set(x, WHACK.deckTop / 2, z);
    deck.receiveShadow = true;
    this.group.add(deck);
    this.solids.push({
      minX: x - WHACK.deck,
      maxX: x + WHACK.deck,
      minY: 0,
      maxY: WHACK.deckTop,
      minZ: z - WHACK.deck,
      maxZ: z + WHACK.deck,
      label: "gummy box",
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WHACK.deck - 0.08, 0.16, 6, 30), gloss(C.chocDark, 0.2));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, WHACK.deckTop, z);
    this.group.add(rim);

    // the holes, each a dark cup sunk into the lid with a paper case round it
    const colours = [C.red, C.sun, C.mint, C.lilac, C.orange, C.pink, C.lime, C.cream];
    for (let i = 0; i < WHACK.holes; i++) {
      const at = holeAt(i);
      const hx = x + at.x;
      const hz = z + at.z;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.5, 0.22, 16), gloss(C.chocDark, 0.3));
      cup.position.set(hx, WHACK.deckTop - 0.05, hz);
      this.group.add(cup);
      const caseRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 6, 18), gloss(C.icing, 0.35));
      caseRing.rotation.x = Math.PI / 2;
      caseRing.position.set(hx, WHACK.deckTop + 0.03, hz);
      this.group.add(caseRing);

      const bear = makeBear(colours[i % colours.length]!);
      bear.position.set(hx, WHACK.deckTop - 1.35, hz);
      bear.scale.setScalar(0.95);
      this.group.add(bear);
      this.holes.push({ i, x: hx, z: hz, bear, up: 0, timer: 0, whacked: 0 });
    }

    this.board = signBoard("Whack-a-Gummy", 4.2, 0.82);
    this.board.position.set(x, 3.0, z + WHACK.standD - 1.4);
    this.board.rotation.y = Math.PI;
    this.group.add(this.board);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 26), glowMaterial("#ffd84a", 1.1, 0.3));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.set(x, 0.12, z + WHACK.standD);
    this.group.add(this.ring);

    this.worldColliders.push(...this.solids);
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const s of this.solids) {
      const i = this.worldColliders.indexOf(s);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.solids = [];
    useWhack.getState().setRound(false, 0, 0);
    useWhack.getState().setCard(null);
  }

  get playing() {
    return this.live;
  }

  /** Standing on the mat, with no round running. */
  near(x: number, y: number, z: number) {
    if (this.live || useWhack.getState().card) return false;
    return y < 2 && Math.hypot(x - WHACK.x, z - (WHACK.z + WHACK.standD)) < START_R;
  }

  /** The bear beside her that is far enough up to be hit. */
  private hittable(x: number, z: number) {
    if (!this.live) return null;
    let best: Hole | null = null;
    let bestD = WHACK_R;
    for (const h of this.holes) {
      if (h.up < 0.55 || h.whacked > 0) continue;
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  /** Whether Collect would do something here: start a round, or whack a bear. */
  canPress(x: number, y: number, z: number) {
    return this.near(x, y, z) || this.hittable(x, z) != null;
  }

  tryInteract(x: number, y: number, z: number) {
    const hit = this.hittable(x, z);
    if (hit) {
      sfx.boing();
      sfx.correct();
      hit.whacked = 0.35;
      hit.timer = 0;
      this.score++;
      this.burst(hit);
      return true;
    }
    if (!this.near(x, y, z)) return false;
    this.start();
    return true;
  }

  /**
   * A hit you can see: eight gold stars thrown up out of the hole and a white
   * ring spreading across it. The bear used to just drop, which from behind
   * her looked the same as it going down on its own.
   */
  private burst(h: Hole) {
    const y = WHACK.deckTop + 0.9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const m = new THREE.Mesh(STAR_GEO, STAR_MAT);
      m.position.set(h.x, y, h.z);
      this.group.add(m);
      this.sparks.push({ mesh: m, vx: Math.cos(a) * 2.6, vy: 3.2 + Math.random() * 1.5, vz: Math.sin(a) * 2.6, life: 0.6 });
    }
    const mat = new THREE.MeshBasicMaterial({ color: "#fff6d8", transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(POW_GEO, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(h.x, WHACK.deckTop + 0.12, h.z);
    this.group.add(ring);
    this.pows.push({ mesh: ring, mat, life: 0.4 });
  }

  private updateBursts(dt: number) {
    this.sparks = this.sparks.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        return false;
      }
      p.vy -= 12 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.y += dt * 9;
      p.mesh.scale.setScalar(Math.min(1, p.life / 0.25));
      return true;
    });
    this.pows = this.pows.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        p.mat.dispose();
        return false;
      }
      const k = 1 - p.life / 0.4;
      p.mesh.scale.setScalar(1 + k * 1.6);
      p.mat.opacity = 0.95 * (1 - k);
      return true;
    });
  }

  start() {
    sfx.click();
    this.live = true;
    this.left = WHACK.seconds;
    this.score = 0;
    this.nextUp = 0.6;
    for (const h of this.holes) {
      h.up = 0;
      h.timer = 0;
      h.whacked = 0;
    }
    useWhack.getState().setCard(null);
    useGame.getState().setEmmettNotice("Run round the box and whack every gummy bear that pops up!");
  }

  /** End the round, hand over the tickets and show the tray. */
  private finish() {
    this.live = false;
    for (const h of this.holes) {
      h.timer = 0;
      h.whacked = 0;
    }
    const tickets = whackTickets(this.score);
    useGame.getState().addTickets(tickets);
    sfx.win();
    useWhack.getState().setRound(false, 0, this.score);
    useWhack.getState().setCard({ score: this.score, tickets, line: whackLine(this.score) });
  }

  /** Leave the tray. */
  clearCard() {
    useWhack.getState().setCard(null);
  }

  update(dt: number, her: { x: number; y: number; z: number }) {
    // a frame can arrive with a negative delta when the page's own loop and a
    // stepped test frame interleave, and anything integrating time then runs
    // backwards; the park's older movers guard the same way
    if (!(dt > 0)) return;
    this.t += dt;
    const again = useWhack.getState().again;
    if (again !== this.lastAgain) {
      this.lastAgain = again;
      if (!this.live) this.start();
    }
    this.ring.visible = !this.live;
    this.ring.rotation.z = this.t * 0.6;
    useWhack.getState().setNear(this.near(her.x, her.y, her.z));
    useWhack.getState().setHit(this.hittable(her.x, her.z) != null);

    if (this.live) {
      this.left -= dt;
      if (this.left <= 0) {
        this.left = 0;
        this.finish();
      } else {
        // the round speeds up as it goes: by the end a bear is up for less
        // than a second and the next one is already coming
        const through = 1 - this.left / WHACK.seconds;
        const upFor = UP_FROM + (UP_TO - UP_FROM) * through;
        const gap = GAP_FROM + (GAP_TO - GAP_FROM) * through;
        this.nextUp -= dt;
        if (this.nextUp <= 0) {
          const down = this.holes.filter((h) => h.timer <= 0 && h.up < 0.05 && h.whacked <= 0);
          if (down.length) {
            const pick = down[Math.floor(Math.random() * down.length)]!;
            pick.timer = upFor;
          }
          this.nextUp = gap;
        }
        useWhack.getState().setRound(true, this.left, this.score);
      }
    }

    this.updateBursts(dt);
    for (const h of this.holes) {
      if (h.whacked > 0) {
        h.whacked = Math.max(0, h.whacked - dt);
        // squashed flat with a wobble, then gone
        h.up = Math.max(0, h.up - dt * 4);
        const k = h.whacked / 0.35;
        const wob = Math.sin((1 - k) * 18) * 0.12 * k;
        h.bear.scale.set(1.3 + wob, 0.5 - wob, 1.3 + wob);
      } else {
        if (h.timer > 0) {
          h.timer = Math.max(0, h.timer - dt);
          h.up = Math.min(1, h.up + dt * 4.5);
        } else {
          h.up = Math.max(0, h.up - dt * 4.5);
        }
        h.bear.scale.setScalar(0.95);
      }
      const rise = -1.35 + h.up * 1.5;
      h.bear.position.y = WHACK.deckTop + rise;
      h.bear.visible = h.up > 0.02;
      // they look at her while they are up, which is most of the joke
      if (h.up > 0.2) h.bear.rotation.y = Math.atan2(her.x - h.x, her.z - h.z);
    }
  }
}
