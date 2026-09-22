import * as THREE from "three";
import { create } from "zustand";
import { sfx } from "./audio";
import type { AABB } from "./collision";
import { glowMaterial } from "./furniture";
import { boxGeo, cylGeo, lam, mesh, signBoard, sphereGeo } from "./meshes";
import { SUGAR } from "./sugar-rush";
import { useGame } from "./store";

/**
 * Sweet Sorter: a conveyor tips sweets onto the floor and she has to get each
 * one into the bin of its own colour before the clock runs out.
 *
 * The one game of the three that gets genuinely harder rather than luckier.
 * The belt speeds up through the round — a sweet every two and a half seconds
 * at the start, every second by the end — so the floor fills faster than she
 * can clear it and the last twenty seconds are a scramble. Nothing is lost
 * when it beats her: the sweets just pile up, and the clock is the only thing
 * that ends it.
 *
 * No buttons. She picks a sweet up by running over it and posts it by running
 * into a bin, because the whole point of moving these games out of their cards
 * was to put her feet in them, and a game about hurrying is a bad place to ask
 * for a button press. A sweet in the wrong bin bounces back out onto the floor,
 * which costs her the run back and nothing else.
 */

const C = {
  choc: "#6b4226",
  chocDark: "#4a2e1c",
  icing: "#f6f1e8",
  cream: "#f7ead3",
  wafer: "#e8b86a",
  steel: "#c8ced4",
  pink: "#ff6aa8",
  mint: "#6fe3c4",
  sun: "#ffc83a",
  lilac: "#b06aff",
};

const gloss = (c: string, roughness = 0.16) => lam(c, { flat: true, roughness });

/** The four colours she sorts into, in the order the bins stand. */
export const SORT_COLOURS = [C.pink, C.mint, C.sun, C.lilac] as const;
export const SORT_NAMES = ["pink", "green", "yellow", "purple"] as const;

/**
 * The floor it is played on: the bunting bay west of the wheel, which is
 * twelve metres by eleven and a half with nothing in it but its own corner
 * poles.
 */
export const SORTER = {
  x: SUGAR.fair.x - 16,
  z: SUGAR.fair.z + 3.75,
  /** the belt's end, and where a dropped sweet lands, as z from the middle */
  beltZ: -4.4,
  dropZ: -2.4,
  /** the bin row */
  binZ: 4.2,
  binPitch: 2.7,
  /** where she stands to start */
  standZ: 6.6,
  seconds: 45,
} as const;

const PICK_R = 1.0;
const BIN_R = 1.35;
const START_R = 2.4;
/** the belt's pace, from the first sweet to the last */
const DROP_FROM = 2.5;
const DROP_TO = 1.0;
/** the floor never holds more than this, so it cannot become a carpet */
const MAX_LOOSE = 12;

type SorterStore = {
  near: boolean;
  playing: boolean;
  left: number;
  score: number;
  /** the colour she is carrying, as an index, or -1 */
  carrying: number;
  card: { score: number; tickets: number; line: string } | null;
  setNear: (v: boolean) => void;
  setRound: (playing: boolean, left: number, score: number, carrying: number) => void;
  setCard: (card: SorterStore["card"]) => void;
  again: number;
  playAgain: () => void;
};

export const useSorter = create<SorterStore>((set) => ({
  near: false,
  playing: false,
  left: 0,
  score: 0,
  carrying: -1,
  card: null,
  setNear: (near) => set((s) => (s.near === near ? s : { near })),
  setRound: (playing, left, score, carrying) =>
    set((s) =>
      s.playing === playing && Math.ceil(s.left) === Math.ceil(left) && s.score === score && s.carrying === carrying
        ? s
        : { playing, left, score, carrying },
    ),
  setCard: (card) => set({ card }),
  again: 0,
  playAgain: () => set((s) => ({ again: s.again + 1, card: null })),
}));

export function sorterTickets(score: number) {
  if (score >= 22) return 15;
  if (score >= 16) return 10;
  if (score >= 9) return 6;
  if (score >= 4) return 3;
  return 1;
}

export function sorterLine(score: number) {
  if (score >= 22) return `${score} sorted! The factory should give you a job.`;
  if (score >= 16) return `${score} sorted — you were everywhere at once.`;
  if (score >= 9) return `${score} sorted. That belt gets quick, doesn't it?`;
  if (score >= 4) return `${score} sorted. Watch which colour you are holding!`;
  return "The belt won that one. Go again — it costs nothing.";
}

/** One cone, shared by every twist of every sweet ever made. */
const twistGeo = new THREE.ConeGeometry(0.16, 0.2, 8);

/** A sweet: a little glossy pillow, the same in the bin and in her hands. */
function makeSweet(colour: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(sphereGeo, gloss(colour, 0.12));
  body.scale.set(0.3, 0.2, 0.3);
  body.castShadow = true;
  g.add(body);
  // the twist at each end, so it reads as a wrapped sweet rather than a pebble
  for (const s of [-1, 1]) {
    const twist = new THREE.Mesh(twistGeo, gloss(C.icing, 0.3));
    twist.rotation.z = (s * Math.PI) / 2;
    twist.position.x = s * 0.34;
    g.add(twist);
  }
  return g;
}

type Loose = { group: THREE.Group; colour: number; x: number; z: number; bob: number };

export class SorterWorld {
  private group = new THREE.Group();
  private solids: (AABB & { label: string })[] = [];
  private bins: { x: number; z: number; colour: number; mesh: THREE.Group; flash: number }[] = [];
  private loose: Loose[] = [];
  /**
   * One pool of spare sweets per colour. A single pool meant a reused body
   * could be the wrong colour, and repainting one means walking its meshes;
   * four pools means a spare is always the right sweet already.
   */
  private spare: THREE.Group[][] = SORT_COLOURS.map(() => []);
  private carried: THREE.Group | null = null;
  private carrying = -1;
  private belt: THREE.Mesh[] = [];
  private ring: THREE.Mesh;
  private t = 0;
  private left = 0;
  private score = 0;
  private nextDrop = 0;
  private live = false;
  private lastAgain = 0;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    const { x, z } = SORTER;

    // ---- the belt: a chocolate frame, steel rollers and a liquorice band
    const frame = mesh(boxGeo, C.choc, 7.2, 1.0, 1.5, x, 0.5, z + SORTER.beltZ);
    this.group.add(frame);
    this.solids.push({
      minX: x - 3.6,
      maxX: x + 3.6,
      minY: 0,
      maxY: 1.0,
      minZ: z + SORTER.beltZ - 0.75,
      maxZ: z + SORTER.beltZ + 0.75,
      label: "sorter belt",
    });
    for (let i = 0; i < 9; i++) {
      const roller = mesh(cylGeo, C.steel, 0.16, 1.4, 0.16, x - 3.2 + i * 0.8, 1.06, z + SORTER.beltZ, false);
      roller.rotation.x = Math.PI / 2;
      this.group.add(roller);
      this.belt.push(roller);
    }
    // the chute the sweets come down
    const chute = mesh(boxGeo, C.wafer, 1.6, 0.14, 1.9, x, 0.82, z + SORTER.beltZ + 1.3);
    chute.rotation.x = -0.42;
    this.group.add(chute);

    // ---- the bins
    for (let i = 0; i < SORT_COLOURS.length; i++) {
      const bx = x + (i - (SORT_COLOURS.length - 1) / 2) * SORTER.binPitch;
      const bz = z + SORTER.binZ;
      const bin = new THREE.Group();
      const colour = SORT_COLOURS[i]!;
      const body = mesh(boxGeo, colour, 1.5, 1.0, 1.1, 0, 0.5, 0);
      bin.add(body);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.09, 6, 16), gloss(C.icing, 0.3));
      lip.rotation.x = Math.PI / 2;
      lip.scale.set(1, 0.78, 1);
      lip.position.y = 1.0;
      bin.add(lip);
      // a sweet of its own colour on the front, which is the only label a
      // child who cannot read the sign needs
      const badge = makeSweet(colour);
      badge.scale.setScalar(0.9);
      badge.position.set(0, 0.55, 0.58);
      bin.add(badge);
      bin.position.set(bx, 0, bz);
      this.group.add(bin);
      this.bins.push({ x: bx, z: bz, colour: i, mesh: bin, flash: 0 });
      this.solids.push({
        minX: bx - 0.75,
        maxX: bx + 0.75,
        minY: 0,
        maxY: 1.0,
        minZ: bz - 0.55,
        maxZ: bz + 0.55,
        label: "sorter bin",
      });
    }

    // behind the belt, not over the bins: at the near end it hung in front of
    // the row she is running at, and read as a beam across the game
    const board = signBoard("Sweet Sorter", 4.0, 0.8);
    board.position.set(x, 3.1, z + SORTER.beltZ - 1.1);
    this.group.add(board);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 26), glowMaterial("#ffd84a", 1.1, 0.3));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.set(x, 0.12, z + SORTER.standZ);
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
    useSorter.getState().setRound(false, 0, 0, -1);
    useSorter.getState().setCard(null);
  }

  get playing() {
    return this.live;
  }

  near(x: number, y: number, z: number) {
    if (this.live || useSorter.getState().card) return false;
    return y < 2 && Math.hypot(x - SORTER.x, z - (SORTER.z + SORTER.standZ)) < START_R;
  }

  tryInteract(x: number, y: number, z: number) {
    if (!this.near(x, y, z)) return false;
    this.start();
    return true;
  }

  start() {
    sfx.click();
    this.live = true;
    this.left = SORTER.seconds;
    this.score = 0;
    this.nextDrop = 1;
    this.clearFloor();
    useSorter.getState().setCard(null);
    useGame.getState().setEmmettNotice("Run over a sweet to pick it up, then run into the bin that matches it!");
  }

  private clearFloor() {
    for (const l of this.loose) this.give(l.colour, l.group);
    this.loose = [];
  }

  private give(colour: number, g: THREE.Group) {
    g.visible = false;
    this.spare[colour]!.push(g);
  }

  /** Put the carried sweet back, or hide it. `colour` -1 means drop nothing. */
  /** Put down whatever she is holding. `colour` -1 means put it away. */
  private drop(colour: number, x = 0, z = 0) {
    if (this.carried && this.carrying >= 0) this.give(this.carrying, this.carried);
    this.carried = null;
    this.carrying = -1;
    if (colour >= 0) this.spawn(colour, x, z);
  }

  private spawn(colour: number, x: number, z: number) {
    let g = this.spare[colour]!.pop();
    if (!g) {
      g = makeSweet(SORT_COLOURS[colour]!);
      this.group.add(g);
    }
    g.visible = true;
    g.position.set(x, 0.32, z);
    this.loose.push({ group: g, colour, x, z, bob: Math.random() * 6 });
  }

  private finish() {
    this.live = false;
    this.drop(-1);
    this.clearFloor();
    useSorter.getState().setNear(false);
    const tickets = sorterTickets(this.score);
    useGame.getState().addTickets(tickets);
    sfx.win();
    useSorter.getState().setRound(false, 0, this.score, -1);
    useSorter.getState().setCard({ score: this.score, tickets, line: sorterLine(this.score) });
  }

  update(dt: number, her: { x: number; y: number; z: number }) {
    // a frame can arrive with a negative delta when the page's own loop and a
    // stepped test frame interleave, and anything integrating time then runs
    // backwards; the park's older movers guard the same way
    if (!(dt > 0)) return;
    this.t += dt;
    const again = useSorter.getState().again;
    if (again !== this.lastAgain) {
      this.lastAgain = again;
      if (!this.live) this.start();
    }
    this.ring.visible = !this.live;
    this.ring.rotation.z = this.t * 0.6;
    useSorter.getState().setNear(this.near(her.x, her.y, her.z));
    // the rollers turn whether or not anyone is playing: a dead belt reads as
    // a broken machine rather than a game waiting for her
    for (const r of this.belt) r.rotation.y = this.t * (this.live ? 7 : 2);
    for (const b of this.bins) {
      b.flash = Math.max(0, b.flash - dt * 3);
      b.mesh.position.y = b.flash * 0.12;
    }

    if (this.live) {
      this.left -= dt;
      if (this.left <= 0) {
        this.left = 0;
        this.finish();
      } else {
        const through = 1 - this.left / SORTER.seconds;
        this.nextDrop -= dt;
        if (this.nextDrop <= 0) {
          if (this.loose.length < MAX_LOOSE) {
            const colour = Math.floor(Math.random() * SORT_COLOURS.length);
            const spread = 2.4;
            this.spawn(
              colour,
              SORTER.x + (Math.random() - 0.5) * spread * 2,
              SORTER.z + SORTER.dropZ + (Math.random() - 0.5) * spread,
            );
            sfx.click();
          }
          this.nextDrop = DROP_FROM + (DROP_TO - DROP_FROM) * through;
        }
      }
    }

    // pick one up by running over it
    if (this.live && this.carrying < 0) {
      for (let i = 0; i < this.loose.length; i++) {
        const l = this.loose[i]!;
        if (Math.hypot(her.x - l.x, her.z - l.z) > PICK_R) continue;
        this.loose.splice(i, 1);
        this.carried = l.group;
        this.carrying = l.colour;
        sfx.correct();
        break;
      }
    }

    // post it by running into a bin
    if (this.live && this.carrying >= 0) {
      for (const b of this.bins) {
        if (Math.hypot(her.x - b.x, her.z - b.z) > BIN_R) continue;
        const right = b.colour === this.carrying;
        b.flash = 1;
        if (right) {
          this.score++;
          sfx.win();
          this.drop(-1);
        } else {
          sfx.wrong();
          // back onto the floor in front of the bin she tried
          this.drop(this.carrying, b.x + (Math.random() - 0.5) * 1.6, b.z - 2.2);
        }
        break;
      }
    }

    // the loose ones bob where they landed; the carried one rides over her head
    for (const l of this.loose) {
      l.group.position.set(l.x, 0.32 + Math.sin(this.t * 2.4 + l.bob) * 0.06, l.z);
      l.group.rotation.y += dt * 0.8;
    }
    if (this.carried) {
      this.carried.position.set(her.x, her.y + 2.1 + Math.sin(this.t * 3) * 0.05, her.z);
      this.carried.rotation.y += dt * 2.2;
    }

    if (this.live) useSorter.getState().setRound(true, this.left, this.score, this.carrying);
  }
}
