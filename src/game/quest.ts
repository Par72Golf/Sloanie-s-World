import * as THREE from "three";
import { sfx } from "./audio";
import { PET_QUEST } from "./collectibles";
import { moveAndCollide, type AABB, type Capsule } from "./collision";
import { animatePet, makePet, PETS, type PetKind, type PetMode, type PetRig } from "./pets";
import { animateFarmer, makeFarmer, makePawTrail, makeTreat, type FarmerRig } from "./quest-mesh";
import { useGame } from "./store";

/**
 * The lost pet quest, and her pet once she has one.
 *
 *   none    Farmer Joe at the farm asks for help (talk to him).
 *   treats  five glowing treats appear around the park; they need the backpack.
 *   trail   paw prints lead from the farm to the mountain cave, where the
 *           puppy, kitten and bunny are huddled, scared, in the great cavern.
 *   escort  after she gives them the treats they follow her home in a line.
 *   choose  home at the farm: Farmer Joe lets her keep one (quest-panel.tsx).
 *   done    her pet follows her everywhere; the other two live at the farm.
 *
 * Owned by the runtime, which calls update() every frame and tryInteract()
 * when she presses Collect. Pets move with the real collision code, and jump
 * to her side if they fall far behind or get stuck.
 */

type Walker = {
  rig: PetRig;
  cap: Capsule;
  velY: number;
  speed: number;
  heading: number;
  stuck: number;
  happyT: number;
};

const PET_W = 0.22;
const PET_H = 0.55;
const TREAT_R = 1.7;

export class QuestWorld {
  group = new THREE.Group();
  farmer: FarmerRig;
  treats: { group: THREE.Group; index: number; warned: boolean }[] = [];
  trail: THREE.InstancedMesh;
  lost: Walker[] = [];
  mine: Walker | null = null;
  private lastStage = "";
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

    this.trail = makePawTrail(PET_QUEST.pawTrail);
    this.trail.visible = false;
    this.group.add(this.trail);

    // all three pets exist from the start; where they are depends on the stage
    for (const def of PETS) {
      const rig = makePet(def.kind);
      this.group.add(rig.group);
      this.lost.push(this.walker(rig));
    }
    scene.add(this.group);
    this.sync(true);
  }

  dispose() {
    this.scene.remove(this.group);
    this.trail.geometry.dispose();
  }

  private walker(rig: PetRig): Walker {
    return { rig, cap: { x: 0, y: 0, z: 0, hw: PET_W, h: PET_H, hd: PET_W }, velY: 0, speed: 0, heading: 0, stuck: 0, happyT: 0 };
  }

  private place(w: Walker, x: number, y: number, z: number) {
    w.cap.x = x;
    w.cap.y = y;
    w.cap.z = z;
    w.velY = 0;
    w.rig.group.position.set(x, y, z);
  }

  /** Put everything where the saved stage says, when the stage or pet changes. */
  private sync(force = false) {
    const st = useGame.getState();
    const stage = st.quest.stage;
    const petKey = st.pet ? `${st.pet.kind}|${st.pet.coat}|${st.pet.name}` : "";
    if (!force && stage === this.lastStage && petKey === this.lastPetKey) return;
    const stageChanged = stage !== this.lastStage;
    this.lastStage = stage;

    if (petKey !== this.lastPetKey) {
      this.lastPetKey = petKey;
      if (this.mine) {
        this.group.remove(this.mine.rig.group);
        this.mine = null;
      }
      if (st.pet) {
        const rig = makePet(st.pet.kind as PetKind, st.pet.coat);
        this.group.add(rig.group);
        this.mine = this.walker(rig);
      }
    }

    const [hx, hy, hz] = PET_QUEST.hideout;
    const [mx, my, mz] = PET_QUEST.home;
    this.lost.forEach((w, i) => {
      const kind = PETS[i]!.kind;
      const adopted = st.pet?.kind === kind;
      w.rig.group.visible = !(stage === "done" && adopted);
      if (!stageChanged && !force) return;
      if (stage === "none" || stage === "treats" || stage === "trail") {
        // huddled together in the cavern corner
        this.place(w, hx + (i - 1) * 0.75, hy, hz + (i === 1 ? -0.5 : 0));
        w.heading = Math.PI * 0.25 + i;
      } else if (stage === "choose" || stage === "done") {
        this.place(w, mx + (i - 1) * 1.1, my, mz + 1.2);
        w.heading = 0;
      }
    });
    if (this.mine && (force || stageChanged)) {
      const lead = this.lost[0]!;
      this.place(this.mine, lead.cap.x, lead.cap.y, lead.cap.z);
    }
  }

  /** What Collect would do right here, for the HUD's big button. */
  near(x: number, y: number, z: number): "farmer" | "pets" | null {
    const [fx, , fz] = PET_QUEST.farmer;
    if (Math.hypot(x - fx, z - fz) < 2.8 && y < 1.5) return "farmer";
    const st = useGame.getState();
    if (st.quest.stage === "trail") {
      const [hx, , hz] = PET_QUEST.hideout;
      if (Math.hypot(x - hx, z - hz) < 3.2) return "pets";
    }
    return null;
  }

  /** Collect pressed: talk to the farmer or help the pets. Returns true if handled. */
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
      for (const w of this.lost) w.happyT = 1.6;
      st.setQuestStage("escort");
      st.setEmmettNotice("You gave them the treats. They trust you! Lead them home to the farm.");
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
    const stage = st.quest.stage;

    // farmer: faces her when she's near, waves when she's close and hasn't helped yet
    {
      const [fx, , fz] = PET_QUEST.farmer;
      const d = Math.hypot(her.x - fx, her.z - fz);
      const yaw = Math.atan2(her.x - fx, her.z - fz);
      animateFarmer(this.farmer, t, d < 14 ? yaw : 0, d < 10 && (stage === "none" || stage === "choose"));
    }

    // treats
    const hasBag = st.foundAccessories.includes("backpack");
    for (const tr of this.treats) {
      const want = stage === "treats" && !st.quest.treats.includes(tr.index);
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

    this.trail.visible = stage === "trail";

    // the three pets
    const [hx, , hz] = PET_QUEST.hideout;
    const [mx, , mz] = PET_QUEST.home;
    this.lost.forEach((w, i) => {
      if (!w.rig.group.visible) return;
      w.happyT = Math.max(0, w.happyT - dt);
      let mode: PetMode = "sit";
      if (stage === "none" || stage === "treats" || stage === "trail") {
        mode = w.happyT > 0 ? "happy" : "lost";
        // they peek at her when she's close
        const d = Math.hypot(her.x - w.cap.x, her.z - w.cap.z);
        if (d < 8) w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
      } else if (stage === "escort") {
        mode = w.happyT > 0 ? "happy" : this.follow(w, her, 1.8 + i * 1.3, (i - 1) * 0.9, dt, colliders, groundY);
        if (Math.hypot(her.x - mx, her.z - mz) < 7 && i === this.lost.length - 1) {
          st.setQuestStage("choose");
          st.setEmmettNotice("You're home! Talk to Farmer Joe.");
        }
      } else {
        // at the farm: sit, and brighten up when she comes by
        const d = Math.hypot(her.x - w.cap.x, her.z - w.cap.z);
        mode = d < 4 ? "happy" : "sit";
        if (d < 10) w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
        if (stage === "done" && d > 20) {
          // settle back on their spots after the escort
          w.cap.x += (mx + (i - 1) * 1.1 - w.cap.x) * Math.min(1, dt * 2);
          w.cap.z += (mz + 1.2 - w.cap.z) * Math.min(1, dt * 2);
        }
      }
      w.rig.group.position.set(w.cap.x, w.cap.y, w.cap.z);
      w.rig.group.rotation.y = w.heading;
      animatePet(w.rig, mode, w.speed, t, dt);
    });
    void hx;
    void hz;

    // her own pet
    if (this.mine && stage === "done") {
      const w = this.mine;
      let mode: PetMode;
      if (her.carried || her.paused) {
        w.speed = 0;
        mode = "sit";
      } else {
        // a dumpling nearby: trot a little ahead toward it, nose down
        let ahead = 0;
        if (nearestDumpling) {
          const d = Math.hypot(nearestDumpling.x - her.x, nearestDumpling.z - her.z);
          if (d < 22) {
            ahead = 1;
            if (!this.sniffed.has(nearestDumpling.id) && st.pet) {
              this.sniffed.add(nearestDumpling.id);
              st.setEmmettNotice(`${st.pet.name} smells a dumpling nearby!`);
            }
          }
        }
        if (ahead && nearestDumpling) {
          const d = Math.hypot(nearestDumpling.x - her.x, nearestDumpling.z - her.z) || 1;
          const tx = her.x + ((nearestDumpling.x - her.x) / d) * 2.5;
          const tz = her.z + ((nearestDumpling.z - her.z) / d) * 2.5;
          const moved = this.goTo(w, tx, tz, her, dt, colliders, groundY);
          mode = moved > 0.3 ? "sniff" : "sniff";
        } else {
          mode = this.follow(w, her, 1.6, 0.7, dt, colliders, groundY);
        }
      }
      w.rig.group.position.set(w.cap.x, w.cap.y, w.cap.z);
      w.rig.group.rotation.y = w.heading;
      animatePet(w.rig, mode, w.speed, t, dt);
    }
  }

  /** Follow a spot behind and beside her. Returns the animation mode. */
  private follow(
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
    const moved = this.goTo(w, tx, tz, her, dt, colliders, groundY);
    if (moved < 0.05 && her.speed < 0.3) {
      w.heading = Math.atan2(her.x - w.cap.x, her.z - w.cap.z);
      return "sit";
    }
    return "follow";
  }

  /** Walk toward a point with collision; teleport beside her if hopelessly behind. Returns distance to go. */
  private goTo(
    w: Walker,
    tx: number,
    tz: number,
    her: { x: number; y: number; z: number; yaw: number; speed: number },
    dt: number,
    colliders: AABB[],
    groundY: number,
  ) {
    const dx = tx - w.cap.x;
    const dz = tz - w.cap.z;
    const d = Math.hypot(dx, dz);
    const far = Math.hypot(her.x - w.cap.x, her.z - w.cap.z);
    if (far > 18 || Math.abs(her.y - w.cap.y) > 4 || w.stuck > 1.2) {
      // pop in right behind her, facing the same way
      this.place(w, tx, her.y, tz);
      w.stuck = 0;
      w.heading = Math.atan2(-Math.sin(her.yaw), -Math.cos(her.yaw));
      return 0;
    }
    const want = d < 0.25 ? 0 : Math.min(8.5, Math.max(1.5, d * 2.2));
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
}
