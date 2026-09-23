import * as THREE from "three";
import { sfx } from "./audio";
import { PET_QUEST } from "./collectibles";
import { moveAndCollide, type AABB, type Capsule } from "./collision";
import { animatePet, makePet, PETS, type PetKind, type PetMode, type PetRig } from "./pets";
import { animateFarmer, makeFarmer, makeFeatherTrail, makeHidingMarker, makePawTrail, makeTreat, type FarmerRig } from "./quest-mesh";
import { lavaWaitSpot, onLavaCourse } from "./lava";
import { useGame } from "./store";
import type { PetKindId } from "./types";

/**
 * Farmer Joe's three rescues, and the pets she has adopted.
 *
 * He lost a puppy, a kitten and a bunny. Each rescue is one chapter, each
 * ends with her walking the pet back to **Farmer Joe himself**, wherever he
 * is standing, and each ends with her keeping one:
 *
 *   0  The treat hunt.  Five treats around the park, then paw prints from the
 *      barn to the mountain cave, where all three are huddled. She gives them
 *      the treats and walks them back to Joe, and keeps one.
 *   1  The feather trail.  One of the two left drags a pillow out of the barn
 *      and hides in the middle of the hedge maze. A trail of white feathers
 *      leads there. She picks which one to look for.
 *   2  Hide and seek.  The last one is playing on the farm. Three glowing
 *      hiding places to check; it pops out at the third one she looks in.
 *
 * Stages inside a chapter:
 *   none    Farmer Joe asks (talk to him).
 *   treats  chapter 0: five glowing treats appear; they need the backpack.
 *   trail   chapters 0 and 1: a trail leads to where the pet is hiding.
 *   seek    chapter 2: three hiding places to walk into.
 *   escort  they follow her in a line; take them to Farmer Joe.
 *   choose  standing at Joe: he lets her keep one (quest-panel.tsx).
 *   done    all three are hers.
 *
 * Every pet she has adopted follows her at once, in a line behind her, each
 * with its own name, kind and coat. Owned by the runtime, which calls
 * update() every frame and tryInteract() when she presses Collect. Pets move
 * with the real collision code and jump to her side if they fall far behind
 * or get stuck. tools/pets.ts checks the whole herd.
 */

export type Walker = {
  rig: PetRig;
  kind: PetKind;
  cap: Capsule;
  velY: number;
  speed: number;
  heading: number;
  stuck: number;
  happyT: number;
  /** what animatePet should play this frame, written by the follow pass */
  mode: PetMode;
};

const PET_W = 0.22;
const PET_H = 0.55;
const TREAT_R = 1.7;
/** How close she has to get to a hiding place to look in it. */
const SPOT_R = 2.4;
/** How close she has to bring them to Farmer Joe to hand them over. */
const HOME_R = 6;
/** Followers keep this far apart, and this far off her heels. */
const APART = 0.74;
const OFF_HER = 0.8;
/** The most a crowding nudge may shift a pet in one frame, so it never pops through scenery. */
const NUDGE = 0.09;
/**
 * How they line up. The first pet walks a slot behind her; the others walk in
 * her wake, each aiming at a spot `TRAIN_GAP` behind the one in front, facing
 * the way that one is facing. They are a little train, not a fan: aiming every
 * pet at its own slot behind *her* sent the outside two into the hedges in the
 * maze's 2.4m corridors, where they wedged and then telescoped into each other
 * (tools/pets.ts "out of the maze" found both).
 */
export const LEAD_BACK = 1.5;
export const TRAIN_GAP = 1.15;

type Chapter = {
  /** Things to walk into before the pet can be found: treats, or hiding places. */
  spots: { pos: [number, number, number] }[];
  /** The trail she follows, if this chapter has one, and where it leads. */
  trail: [number, number][] | null;
  hideout: [number, number, number] | null;
};

/**
 * The feather trail: out of the farm, south-east onto the open lawn, then down
 * the narrow lane between the walled garden and the west block (the only way
 * through at z -70), and along the ring walkway to the hedge maze's blue posts.
 * Every leg is walked in tools/pets.ts, which fails if any of it is blocked.
 */
export const FEATHER_TRAIL: [number, number][] = [
  [-52, -116], [-53, -108], [-55, -100], [-58, -94], [-62, -89], [-66, -84],
  [-70, -79], [-73, -75], [-73, -70], [-73, -64], [-73, -56], [-73, -48],
  [-73, -40], [-73, -32], [-73, -24], [-73, -16], [-72, -9], [-70.5, -3],
  [-68, 1.5], [-62, 3.2], [-54, 3.2], [-47, 3.2], [-43.5, 2.6], [-42, 0.6],
];
/** The heart of the hedge maze, in the long open row, clear of the maze dumpling. */
export const MAZE_HIDEOUT: [number, number, number] = [-34.8, 0, -18];

/**
 * Hide and seek: three places on the farm a small animal would pick. All
 * within half a minute of Farmer Joe, so the last rescue is a quick one.
 */
export const HIDING_SPOTS: { pos: [number, number, number]; name: string }[] = [
  { pos: [-64, 0.03, -118.2], name: "the scarecrow" },
  { pos: [-40, 0.03, -122.6], name: "the windmill" },
  { pos: [-56.3, 0.05, -139.4], name: "the haystacks" },
];

const CHAPTERS: Chapter[] = [
  { spots: PET_QUEST.treats, trail: PET_QUEST.pawTrail, hideout: PET_QUEST.hideout },
  { spots: [], trail: FEATHER_TRAIL, hideout: MAZE_HIDEOUT },
  { spots: HIDING_SPOTS, trail: null, hideout: null },
];

/** Where this chapter's hunt is. Chapter 3 (all done) reads as the last one. */
export function chapterOf(n: number): Chapter {
  return CHAPTERS[Math.min(2, Math.max(0, n))]!;
}

/** The names of the three hiding places, for the farmer's panel and the help card. */
export const HIDING_PLACE_NAMES = HIDING_SPOTS.map((s) => s.name);

export class QuestWorld {
  group = new THREE.Group();
  farmer: FarmerRig;
  treats: { group: THREE.Group; index: number; warned: boolean }[] = [];
  /** The three hiding places of chapter 2, as glowing "?" markers. */
  spots: { group: THREE.Group; index: number }[] = [];
  trails: (THREE.InstancedMesh | null)[] = [];
  lost: Walker[] = [];
  /** Every pet she has adopted, in the order she chose them. */
  mine: Walker[] = [];
  /** Who is walking with her this frame, in line order. Reused, never reallocated. */
  private herd: Walker[] = [];
  private lastKey = "";
  private lastPetKey = "";
  private sniffed = new Set<string>();

  constructor(private scene: THREE.Scene) {
    this.farmer = makeFarmer();
    const [fx, fy, fz] = PET_QUEST.farmer;
    this.farmer.group.position.set(fx, fy, fz);
    this.group.add(this.farmer.group);

    PET_QUEST.treats.forEach((t, index) => {
      const group = makeTreat();
      group.position.set(t.pos[0], t.pos[1] - 0.9, t.pos[2]);
      group.visible = false;
      this.group.add(group);
      this.treats.push({ group, index, warned: false });
    });

    HIDING_SPOTS.forEach((s, index) => {
      const group = makeHidingMarker();
      group.position.set(s.pos[0], s.pos[1], s.pos[2]);
      group.visible = false;
      this.group.add(group);
      this.spots.push({ group, index });
    });

    // both trails are built once and shown by chapter; they are static
    // instanced meshes, so an unseen one costs nothing but memory
    for (const ch of CHAPTERS) {
      if (!ch.trail) {
        this.trails.push(null);
        continue;
      }
      const mesh = ch.trail === FEATHER_TRAIL ? makeFeatherTrail(ch.trail) : makePawTrail(ch.trail);
      mesh.visible = false;
      this.group.add(mesh);
      this.trails.push(mesh);
    }

    // all three pets exist from the start; where they are depends on the stage
    for (const def of PETS) {
      const rig = makePet(def.kind);
      this.group.add(rig.group);
      this.lost.push(this.walker(rig, def.kind));
    }
    scene.add(this.group);
    this.sync(true);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const t of this.trails) t?.geometry.dispose();
  }

  private walker(rig: PetRig, kind: PetKind): Walker {
    return makeWalker(rig, kind);
  }

  private place(w: Walker, x: number, y: number, z: number) {
    placeWalker(w, x, y, z);
  }

  /** Put everything where the saved chapter and stage say, when either changes. */
  private sync(force = false) {
    const st = useGame.getState();
    const q = st.quest;
    const key = `${q.stage}|${q.chapter}|${q.seek ?? ""}`;
    // a stray empty slot must never take the frame loop down with it
    const mine = st.pets.filter((p) => p && p.kind);
    const petKey = mine.map((p) => `${p.kind}:${p.coat}:${p.name}`).join("|");
    if (!force && key === this.lastKey && petKey === this.lastPetKey) return;
    const moved = force || key !== this.lastKey;
    this.lastKey = key;

    // rebuild her own pets when the list changes: one rig each, its own coat
    if (petKey !== this.lastPetKey) {
      this.lastPetKey = petKey;
      for (const w of this.mine) this.group.remove(w.rig.group);
      this.mine.length = 0;
      for (const p of mine) {
        const rig = makePet(p.kind as PetKind, p.coat || undefined);
        this.group.add(rig.group);
        const w = this.walker(rig, p.kind as PetKind);
        // step in where the lost one of that kind was standing
        const was = this.lost.find((l) => l.kind === p.kind);
        if (was) this.place(w, was.cap.x, was.cap.y, was.cap.z);
        this.mine.push(w);
      }
    }

    const ch = chapterOf(q.chapter);
    const [bx, by, bz] = PET_QUEST.home;
    this.lost.forEach((w, i) => {
      const adopted = mine.some((p) => p.kind === w.kind);
      const wanted = q.seek === w.kind;
      // chapter 0 is about all three; later chapters about the one she is after
      const inPlay = q.chapter === 0 ? q.stage !== "done" : wanted;
      // chapter 2 hides its pet until she finds it
      const hiddenForSeek = q.chapter === 2 && wanted && q.stage === "seek";
      w.rig.group.visible = !adopted && !hiddenForSeek;
      if (!moved) return;
      if (!adopted && inPlay && (q.stage === "trail" || q.stage === "seek") && ch.hideout) {
        // huddled together where the trail leads
        const [hx, hy, hz] = ch.hideout;
        const k = q.chapter === 0 ? i - 1 : 0;
        this.place(w, hx + k * 0.75, hy, hz + (k === 0 ? -0.5 : 0));
        w.heading = Math.PI * 0.25 + i;
      } else if (!adopted && inPlay && (q.stage === "none" || q.stage === "treats")) {
        // still out there, but she has not gone looking yet
        if (q.chapter === 0 && ch.hideout) {
          const [hx, hy, hz] = ch.hideout;
          this.place(w, hx + (i - 1) * 0.75, hy, hz + (i === 1 ? -0.5 : 0));
          w.heading = Math.PI * 0.25 + i;
        } else {
          this.place(w, bx + (i - 1) * 1.1, by, bz + 1.2);
          w.heading = 0;
        }
      } else if (!adopted && q.stage !== "escort") {
        // back on the farm, by the barn door, waiting their turn
        this.place(w, bx + (i - 1) * 1.1, by, bz + 1.2);
        w.heading = 0;
      }
    });
  }

  /** What Collect would do right here, for the HUD's big button. */
  near(x: number, y: number, z: number): "farmer" | "pets" | null {
    const [fx, , fz] = PET_QUEST.farmer;
    if (Math.hypot(x - fx, z - fz) < 2.8 && y < 1.5) return "farmer";
    const q = useGame.getState().quest;
    if (q.stage === "trail") {
      const ch = chapterOf(q.chapter);
      if (!ch.hideout) return null;
      const [hx, hy, hz] = ch.hideout;
      // inside the cave, not standing on the mountain over their heads
      if (Math.hypot(x - hx, z - hz) < 3.2 && Math.abs(y - hy) < 4) return "pets";
    }
    return null;
  }

  /** Collect pressed: talk to the farmer or help the lost pets. Returns true if handled. */
  tryInteract(x: number, y: number, z: number): boolean {
    const st = useGame.getState();
    const what = this.near(x, y, z);
    if (what === "farmer") {
      sfx.click();
      st.setQuestPanel("farmer");
      return true;
    }
    if (what === "pets") {
      sfx.win();
      const q = st.quest;
      for (const w of this.lost) if (q.chapter === 0 || w.kind === q.seek) w.happyT = 1.6;
      st.setQuestStage("escort");
      st.setEmmettNotice(
        q.chapter === 0
          ? "You gave them the treats. They trust you! Take them back to Farmer Joe."
          : "A treat and a cuddle! Now take her back to Farmer Joe.",
      );
      return true;
    }
    return false;
  }

  update(
    dt: number,
    t: number,
    her: { x: number; y: number; z: number; yaw: number; speed: number; carried: boolean; paused: boolean },
    colliders: AABB[],
    groundY: number,
    nearestDumpling: { id: string; x: number; z: number } | null,
  ) {
    this.sync();
    const st = useGame.getState();
    const q = st.quest;
    const stage = q.stage;
    const chapter = q.chapter;
    const ch = chapterOf(chapter);
    const [fx, , fz] = PET_QUEST.farmer;

    // farmer: faces her when she's near, waves when he has something to say
    {
      const d = Math.hypot(her.x - fx, her.z - fz);
      const yaw = Math.atan2(her.x - fx, her.z - fz);
      const asking = stage === "none" || stage === "choose";
      animateFarmer(this.farmer, t, d < 14 ? yaw : 0, d < 10 && asking);
      if (this.farmer.bubble) this.farmer.bubble.visible = asking && d < 34;
    }

    // chapter 0: the five treats
    const hasBag = st.foundAccessories.includes("backpack");
    for (const tr of this.treats) {
      const want = stage === "treats" && chapter === 0 && !q.treats.includes(tr.index);
      tr.group.visible = want;
      if (!want) continue;
      const item = tr.group.userData.item as THREE.Object3D;
      item.rotation.y += dt * 1.6;
      item.position.y = 0.9 + Math.sin(t * 2.4 + tr.index) * 0.1;
      const p = tr.group.position;
      const d = Math.hypot(her.x - p.x, her.z - p.z);
      if (d < TREAT_R && Math.abs(her.y - p.y) < 2.4 && !her.paused) {
        if (!hasBag) {
          if (!tr.warned) {
            tr.warned = true;
            sfx.wrong();
            st.setEmmettNotice("A pet treat! You need a backpack to carry it. Look on the ball field.");
          }
          continue;
        }
        sfx.correct();
        st.collectTreat(tr.index);
        const got = useGame.getState().quest.treats.length;
        if (got >= PET_QUEST.treats.length) {
          st.setQuestStage("trail");
          st.setEmmettNotice("All 5 treats! Now find the paw prints by the farm and follow them.");
        } else {
          st.setEmmettNotice(`Pet treat! ${got} of ${PET_QUEST.treats.length}.`);
        }
      } else if (d > TREAT_R + 1) {
        tr.warned = false;
      }
    }

    // chapter 2: the three hiding places
    const seeking = stage === "seek" && chapter === 2;
    for (const sp of this.spots) {
      const want = seeking && !q.treats.includes(sp.index);
      sp.group.visible = want;
      if (!want) continue;
      const bubble = sp.group.userData.bubble as THREE.Object3D;
      bubble.position.y = 1.7 + Math.sin(t * 2 + sp.index) * 0.07;
      bubble.rotation.y = Math.atan2(her.x - sp.group.position.x, her.z - sp.group.position.z);
      const ring = sp.group.userData.ring as THREE.Mesh;
      ring.rotation.z = t * 0.9;
      const p = sp.group.position;
      if (Math.hypot(her.x - p.x, her.z - p.z) < SPOT_R && Math.abs(her.y - p.y) < 2.4 && !her.paused) {
        st.collectTreat(sp.index);
        const looked = useGame.getState().quest.treats.length;
        const found = this.lost.find((w) => w.kind === q.seek);
        if (looked >= HIDING_SPOTS.length && found) {
          // the last place she looks is where the pet is, so she always wins
          sfx.win();
          this.place(found, p.x + 0.5, p.y, p.z + 0.5);
          found.heading = Math.atan2(her.x - found.cap.x, her.z - found.cap.z);
          found.happyT = 1.8;
          found.rig.group.visible = true;
          st.setQuestStage("escort");
          st.setEmmettNotice("Found you! Take her back to Farmer Joe.");
        } else {
          sfx.correct();
          const left = HIDING_SPOTS.length - looked;
          st.setEmmettNotice(`Not behind ${HIDING_SPOTS[sp.index]!.name}... but there's a tuft of fur! ${left} more place${left === 1 ? "" : "s"} to look.`);
        }
      }
    }

    for (let i = 0; i < this.trails.length; i++) {
      const mesh = this.trails[i];
      if (mesh) mesh.visible = stage === "trail" && i === chapter;
    }

    // who is walking with her: her own pets first, then anyone she is escorting
    const herd = this.herd;
    herd.length = 0;
    for (let i = 0; i < this.mine.length; i++) herd.push(this.mine[i]!);
    if (stage === "escort") {
      for (let i = 0; i < this.lost.length; i++) {
        const w = this.lost[i]!;
        if (w.rig.group.visible && (chapter === 0 || w.kind === q.seek)) herd.push(w);
      }
    }

    // the pets who are not with her: hiding, or sitting about the farm
    for (let i = 0; i < this.lost.length; i++) {
      const w = this.lost[i]!;
      if (!w.rig.group.visible || herd.includes(w)) continue;
      w.happyT = Math.max(0, w.happyT - dt);
      const hiding = (stage === "trail" || stage === "seek") && (chapter === 0 || w.kind === q.seek);
      const d = Math.hypot(her.x - w.cap.x, her.z - w.cap.z);
      let mode: PetMode;
      if (hiding) {
        mode = w.happyT > 0 ? "happy" : "lost";
        if (d < 8) w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
      } else {
        // at the farm: sit, and brighten up when she comes by
        mode = d < 4 ? "happy" : "sit";
        if (d < 10) w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
        // settle back onto their spots after an escort
        const [bx, , bz] = PET_QUEST.home;
        if (d > 20) {
          w.cap.x += (bx + (i - 1) * 1.1 - w.cap.x) * Math.min(1, dt * 2);
          w.cap.z += (bz + 1.2 - w.cap.z) * Math.min(1, dt * 2);
        }
      }
      w.rig.group.position.set(w.cap.x, w.cap.y, w.cap.z);
      w.rig.group.rotation.y = w.heading;
      animatePet(w.rig, mode, w.speed, t, dt);
    }

    // the line behind her: every adopted pet, then whoever she is bringing home
    const frozen = her.carried || her.paused;
    let sniffAt: { id: string; x: number; z: number } | null = null;
    if (!frozen && stage !== "escort" && this.mine.length > 0 && nearestDumpling) {
      const d = Math.hypot(nearestDumpling.x - her.x, nearestDumpling.z - her.z);
      if (d < 22) {
        sniffAt = nearestDumpling;
        const lead = st.pets[0];
        if (!this.sniffed.has(nearestDumpling.id) && lead) {
          this.sniffed.add(nearestDumpling.id);
          st.setEmmettNotice(`${lead.name} smells a dumpling nearby!`);
        }
      }
    }
    for (let j = 0; j < herd.length; j++) {
      const w = herd[j]!;
      w.happyT = Math.max(0, w.happyT - dt);
      if (frozen) {
        w.speed = 0;
        w.mode = "sit";
      } else if (w.happyT > 0) {
        w.speed = 0;
        w.mode = "happy";
      } else if (onLavaCourse(her.x, her.z)) {
        w.mode = waitOffLava(w, j, her, dt, colliders, groundY) ?? "sit";
      } else if (j === 0 && sniffAt) {
        // a dumpling nearby: the lead pet trots ahead of her, nose down
        const d = Math.hypot(sniffAt.x - her.x, sniffAt.z - her.z) || 1;
        const tx = her.x + ((sniffAt.x - her.x) / d) * 2.5;
        const tz = her.z + ((sniffAt.z - her.z) / d) * 2.5;
        walkTo(w, tx, tz, her, dt, colliders, groundY);
        w.mode = "sniff";
      } else if (j === 0) {
        w.mode = followHer(w, her, LEAD_BACK, 0, dt, colliders, groundY);
      } else {
        w.mode = followLead(w, herd[j - 1]!, her, dt, colliders, groundY);
      }
    }
    // keep them out of each other and off her heels, after everyone has moved
    separateHerd(herd, her);
    for (let j = 0; j < herd.length; j++) {
      const w = herd[j]!;
      w.rig.group.position.set(w.cap.x, w.cap.y, w.cap.z);
      w.rig.group.rotation.y = w.heading;
      animatePet(w.rig, w.mode, w.speed, t, dt);
    }

    // home: she has brought them all the way back to the man who lost them
    if (stage === "escort" && Math.hypot(her.x - fx, her.z - fz) < HOME_R) {
      st.setQuestStage("choose");
      st.setEmmettNotice("You found Farmer Joe! Talk to him.");
    }
  }
}

/** A fresh follower: a rig, its kind, and the capsule the collision code moves. */
export function makeWalker(rig: PetRig, kind: PetKind): Walker {
  return { rig, kind, cap: { x: 0, y: 0, z: 0, hw: PET_W, h: PET_H, hd: PET_W }, velY: 0, speed: 0, heading: 0, stuck: 0, happyT: 0, mode: "follow" };
}

/** Drop a follower straight onto a spot, clearing any fall. */
export function placeWalker(w: Walker, x: number, y: number, z: number) {
  w.cap.x = x;
  w.cap.y = y;
  w.cap.z = z;
  w.velY = 0;
  w.rig.group.position.set(x, y, z);
}

/** The kinds she has not adopted yet, in the game's order. */
export function petsLeft(taken: { kind: string }[]): PetKindId[] {
  return PETS.map((p) => p.kind).filter((k) => !taken.some((t) => t.kind === k));
}

/**
 * Walk in the wake of the pet in front: aim at the spot TRAIN_GAP behind it,
 * measured the way that pet is facing. The target is always a step from
 * somewhere a pet has just walked, so a line of them threads a corridor.
 */
export function followLead(
  w: Walker,
  lead: Walker,
  her: { x: number; y: number; z: number; yaw: number; speed: number },
  dt: number,
  colliders: AABB[],
  groundY: number,
): PetMode {
  const dx = lead.cap.x - w.cap.x;
  const dz = lead.cap.z - w.cap.z;
  const toLead = Math.hypot(dx, dz);
  let tx: number;
  let tz: number;
  let pace = lead.speed;
  if (toLead > TRAIN_GAP + 2.5) {
    // Out of the wake, because the one in front turned a corner or she ran
    // off: walk straight at that pet instead, stopping a nose short. Cutting
    // to a slot behind *her* instead sent two pets grinding into the same
    // hedge in the maze, where they piled up on top of one another.
    const k = (toLead - TRAIN_GAP) / toLead;
    tx = w.cap.x + dx * k;
    tz = w.cap.z + dz * k;
    pace = Math.max(lead.speed, her.speed);
  } else {
    tx = lead.cap.x - Math.sin(lead.heading) * TRAIN_GAP;
    tz = lead.cap.z - Math.cos(lead.heading) * TRAIN_GAP;
  }
  const moved = walkTo(w, tx, tz, her, dt, colliders, groundY, pace);
  if (moved < 0.05 && her.speed < 0.3) {
    w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
    return "sit";
  }
  return "follow";
}

/**
 * Push followers apart so three pets never stand inside one another or
 * inside her. Fixed small nudges, capped so nothing is ever shoved through
 * scenery; the next frame's walk resolves anything left over.
 */
export function separateHerd(herd: Walker[], her: { x: number; y: number; z: number }) {
  // twice: one pass leaves a three-way pile-up still overlapping
  for (let pass = 0; pass < 2; pass++) separatePass(herd, her);
}

function separatePass(herd: Walker[], her: { x: number; y: number; z: number }) {
  for (let i = 0; i < herd.length; i++) {
    const a = herd[i]!;
    let dx = a.cap.x - her.x;
    let dz = a.cap.z - her.z;
    let d = Math.hypot(dx, dz);
    if (d > 1e-3 && d < OFF_HER && Math.abs(a.cap.y - her.y) < 1.2) {
      // she walks faster than a nudge can push, so getting out from under her
      // feet is allowed to be twice as quick as getting out of another pet's
      const k = Math.min(NUDGE * 2, OFF_HER - d) / d;
      a.cap.x += dx * k;
      a.cap.z += dz * k;
    }
    for (let j = i + 1; j < herd.length; j++) {
      const b = herd[j]!;
      dx = b.cap.x - a.cap.x;
      dz = b.cap.z - a.cap.z;
      d = Math.hypot(dx, dz);
      if (d >= APART || Math.abs(a.cap.y - b.cap.y) > 0.7) continue;
      if (d < 1e-3) {
        b.cap.x += 0.02;
        continue;
      }
      const k = Math.min(NUDGE, (APART - d) * 0.6) / d;
      a.cap.x -= dx * k;
      a.cap.z -= dz * k;
      b.cap.x += dx * k;
      b.cap.z += dz * k;
    }
  }
}

/**
 * While she is on the floor-is-lava course, a follower waits beside the foot
 * of its steps, sitting and watching her, and picks up following again when
 * she comes off. Returns the mode, or null when she is not on the course.
 */
export function waitOffLava(
  w: Walker,
  slot: number,
  her: { x: number; y: number; z: number; yaw: number; speed: number },
  dt: number,
  colliders: AABB[],
  groundY: number,
): PetMode | null {
  if (!onLavaCourse(her.x, her.z)) return null;
  const [sx, sz] = lavaWaitSpot(slot);
  // walked to as if she were standing there, so a follower that is stuck or
  // far behind is popped on to its spot, not on to the course behind her
  const spot = { x: sx, y: groundY, z: sz, yaw: her.yaw, speed: 0 };
  const left = walkTo(w, sx, sz, spot, dt, colliders, groundY);
  if (left > 0.4) return "follow";
  w.speed = 0;
  w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
  return "sit";
}

/** Follow a spot behind and beside her. Returns the animation mode. */
export function followHer(
  w: Walker,
  her: { x: number; y: number; z: number; yaw: number; speed: number },
  back: number,
  side: number,
  dt: number,
  colliders: AABB[],
  groundY: number,
): PetMode {
  // her forward is (-sin yaw, -cos yaw); stand behind and a little to the side
  const fx = -Math.sin(her.yaw);
  const fz = -Math.cos(her.yaw);
  const tx = her.x - fx * back + -fz * side;
  const tz = her.z - fz * back + fx * side;
  const moved = walkTo(w, tx, tz, her, dt, colliders, groundY, her.speed);
  if (moved < 0.05 && her.speed < 0.3) {
    w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
    return "sit";
  }
  return "follow";
}

/**
 * Walk toward a point with collision; teleport beside her if hopelessly
 * behind. Returns distance to go.
 *
 * `pace` is how fast the thing being followed is moving. Without it a
 * follower only hurries in proportion to the gap, so it settles at whatever
 * distance makes it match: a line of three lagged nine metres behind a running
 * girl. Matching her pace keeps the line the length it was drawn to be.
 */
export function walkTo(
  w: Walker,
  tx: number,
  tz: number,
  her: { x: number; y: number; z: number; yaw: number; speed: number },
  dt: number,
  colliders: AABB[],
  groundY: number,
  pace = 0,
) {
  const dx = tx - w.cap.x;
  const dz = tz - w.cap.z;
  const d = Math.hypot(dx, dz);
  const far = Math.hypot(her.x - w.cap.x, her.z - w.cap.z);
  if (far > 18 || Math.abs(her.y - w.cap.y) > 4 || w.stuck > 1.2) {
    // pop in right behind her, facing the same way
    placeWalker(w, tx, her.y, tz);
    w.stuck = 0;
    w.heading = Math.atan2(-Math.sin(her.yaw), -Math.cos(her.yaw));
    return 0;
  }
  const want = d < 0.25 ? 0 : Math.min(8.5, Math.max(1.5, Math.max(pace * 1.06, d * 2.2)));
  w.speed += (want - w.speed) * Math.min(1, dt * 8);
  const vx = d > 0.001 ? (dx / d) * w.speed : 0;
  const vz = d > 0.001 ? (dz / d) * w.speed : 0;
  const px = w.cap.x;
  const pz = w.cap.z;
  w.velY -= 23 * dt;
  const r = moveAndCollide(w.cap, vx, w.velY, vz, colliders, dt, groundY);
  w.velY = r.vy;
  // a low ledge: hop it
  const progressed = Math.hypot(w.cap.x - px, w.cap.z - pz);
  if (w.speed > 1 && progressed < w.speed * dt * 0.3) {
    w.stuck += dt;
    if (r.grounded) w.velY = 6.5;
  } else {
    w.stuck = Math.max(0, w.stuck - dt);
  }
  if (w.speed > 0.2) w.heading = Math.atan2(vx, vz);
  return d;
}
