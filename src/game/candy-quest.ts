import * as THREE from "three";
import { sfx } from "./audio";
import { glowMaterial } from "./furniture";
import { boxGeo, cylGeo, lam, mesh, signBoard, sphereGeo } from "./meshes";
import { CandyCreatures } from "./candy-creatures";
import { SUGAR } from "./sugar-rush";
import { useGame } from "./store";

/**
 * The candy princess, and the three things her factory needs.
 *
 * The park's story: the chocolate factory has stopped, so the river runs
 * white (candy-river.ts) and there are no sweets coming out. The princess
 * stands in her clearing in the Lollipop Forest and tells Sloan what is
 * missing — the big whisk, the bucket of chocolate syrup and the cog — and
 * those three are hidden a long walk apart in three different corners of the
 * park. Carry all three to the factory, pull the big lever inside, and the
 * river floods brown from the factory outward.
 *
 * She is told, not shown: the parts have no map markers. What she gets is the
 * princess naming the region each one is in, the same way the dumpling hints
 * work, because a seven-year-old following a hint is exploring and a
 * seven-year-old following an arrow is not.
 */

const CANDY = {
  icing: "#f6f1e8",
  cream: "#f7ead3",
  pink: "#ff6aa8",
  pinkPale: "#ff93c4",
  blush: "#ffb7d5",
  red: "#e8384f",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  yellow: "#ffc83a",
  choc: "#6b4226",
  chocDark: "#4a2e1c",
  chocLight: "#8a5a34",
  toffee: "#c9924e",
  liquorice: "#2a2430",
};

const gloss = (c: string, roughness = 0.16) => lam(c, { flat: true, roughness });

export type PartId = "whisk" | "syrup" | "cog";

/**
 * Where the three are. Each is a long walk from the others and from anything
 * else hidden — the closest is 12m from the nearest sticker — and each sits on
 * open ground rather than tucked behind something, because a quest item she
 * cannot find is a quest she stops doing.
 */
export const FACTORY_PARTS: { id: PartId; name: string; pos: [number, number]; region: string; hint: string }[] = [
  {
    id: "whisk",
    name: "the big whisk",
    pos: [-30, 108],
    region: "Marshmallow Fields",
    hint: "Out on the soft white fields in the north, where the ground is bouncy.",
  },
  {
    id: "syrup",
    name: "the bucket of chocolate syrup",
    pos: [118, 122],
    region: "the chocolate lake",
    hint: "Down by the chocolate lake, where the river finishes.",
  },
  {
    id: "cog",
    name: "the big cog",
    pos: [74, -84],
    region: "the Licorice Maze",
    hint: "Somewhere round the black and red hedges of the Licorice Maze.",
  },
];

/** Her clearing in the Lollipop Forest. */
export const PRINCESS = { x: SUGAR.forest.x + 3, z: SUGAR.forest.z + 4 };
/** how near she has to stand to be offered a word */
export const TALK_R = 2.8;
const PICK_R = 1.8;

/* ------------------------------------------------------------- the pieces */

/** A wire whisk as tall as she is: a cream handle and six looped wires. */
function makeWhisk(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cylGeo, CANDY.toffee, 0.11, 0.9, 0.11, 0, 0.45, 0));
  g.add(mesh(sphereGeo, CANDY.toffee, 0.14, 0.14, 0.14, 0, 0.94, 0, false));
  const wire = new THREE.TorusGeometry(0.34, 0.035, 5, 16, Math.PI);
  for (let i = 0; i < 6; i++) {
    const loop = new THREE.Mesh(wire, gloss(CANDY.icing, 0.22));
    loop.rotation.z = Math.PI / 2;
    loop.rotation.y = (i / 6) * Math.PI;
    loop.position.y = 1.32;
    loop.castShadow = true;
    g.add(loop);
  }
  g.add(mesh(cylGeo, CANDY.icing, 0.07, 0.3, 0.07, 0, 1.08, 0, false));
  return g;
}

/** A bucket of chocolate syrup, with a dome of it standing proud of the rim. */
function makeSyrup(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.72, 16), gloss(CANDY.cream, 0.4));
  body.position.y = 0.36;
  body.castShadow = true;
  g.add(body);
  for (const y of [0.18, 0.56]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(y > 0.4 ? 0.45 : 0.4, 0.035, 5, 18), gloss(CANDY.pink, 0.3));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const choc = new THREE.Mesh(new THREE.SphereGeometry(0.43, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gloss(CANDY.chocDark, 0.08));
  choc.scale.y = 0.42;
  choc.position.y = 0.7;
  g.add(choc);
  // a dribble down one side, because a full bucket always has one
  const run = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 8), gloss(CANDY.choc, 0.08));
  run.position.set(0.42, 0.5, 0.06);
  g.add(run);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 5, 18, Math.PI), gloss(CANDY.toffee, 0.3));
  handle.position.y = 0.72;
  g.add(handle);
  return g;
}

/** A toffee cog, the size of a dustbin lid. */
function makeCog(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.17, 20), gloss(CANDY.toffee, 0.2));
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 0.62;
  disc.castShadow = true;
  g.add(disc);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const tooth = mesh(boxGeo, CANDY.chocLight, 0.22, 0.22, 0.17, Math.cos(a) * 0.68, 0.62 + Math.sin(a) * 0.68, 0, false);
    tooth.rotation.z = a;
    g.add(tooth);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.21, 12), gloss(CANDY.chocDark, 0.14));
  hub.rotation.x = Math.PI / 2;
  hub.position.y = 0.62;
  g.add(hub);
  return g;
}

const MAKE: Record<PartId, () => THREE.Group> = { whisk: makeWhisk, syrup: makeSyrup, cog: makeCog };

/* ---------------------------------------------------------- the princess */

/**
 * The candy princess: a soft-serve swirl of a gown with a girl on top of it.
 *
 * She never moves, so she has no rig and no animation beyond a slow turn of
 * the sceptre — what she has to do is be recognisable as somebody to talk to
 * from the far side of the clearing, which is silhouette and nothing else.
 */
function makePrincess(): THREE.Group {
  const g = new THREE.Group();
  // the gown: three piped tiers, widest at the ground
  const tiers: [number, number, number][] = [
    [0.86, 0.62, 0.0],
    [0.66, 0.5, 0.56],
    [0.46, 0.34, 1.02],
  ];
  for (const [rb, rt, y] of tiers) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 0.6, 18), gloss(CANDY.pinkPale, 0.3));
    tier.position.y = y + 0.3;
    tier.castShadow = true;
    g.add(tier);
    const frill = new THREE.Mesh(new THREE.TorusGeometry(rb * 0.98, 0.09, 6, 20), gloss(CANDY.icing, 0.3));
    frill.rotation.x = Math.PI / 2;
    frill.position.y = y + 0.06;
    g.add(frill);
  }
  // bodice, arms and head
  g.add(mesh(cylGeo, CANDY.pink, 0.27, 0.42, 0.24, 0, 1.55, 0));
  for (const s of [-1, 1]) {
    const arm = mesh(cylGeo, CANDY.blush, 0.075, 0.42, 0.075, s * 0.3, 1.5, 0.02, false);
    arm.rotation.z = s * 0.35;
    g.add(arm);
  }
  g.add(mesh(sphereGeo, "#f3c9a2", 0.26, 0.28, 0.26, 0, 2.02, 0));
  // hair: a swirl of strawberry icing, and a gumdrop crown
  // a half dome, not much more: cut any lower and the strawberry icing comes
  // down over her eyes and she reads as a red blob with a mouth
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), gloss(CANDY.red, 0.36));
  hair.position.y = 2.1;
  g.add(hair);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.5, 8), gloss(CANDY.red, 0.36));
    tail.position.set(s * 0.27, 1.86, -0.05);
    g.add(tail);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 18), gloss(CANDY.yellow, 0.2));
  band.rotation.x = Math.PI / 2;
  band.position.y = 2.3;
  g.add(band);
  const drops = [CANDY.mint, CANDY.lilac, CANDY.yellow, CANDY.pink, CANDY.red];
  drops.forEach((c, i) => {
    const a = (i / drops.length) * Math.PI * 2;
    g.add(mesh(sphereGeo, c, 0.07, 0.09, 0.07, Math.cos(a) * 0.21, 2.37, Math.sin(a) * 0.21, false));
  });
  // eyes and a smile, the same two dots and an arc every face in the park has
  for (const s of [-1, 1]) g.add(mesh(sphereGeo, "#3a2a26", 0.035, 0.045, 0.02, s * 0.1, 2.02, 0.245, false));
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.017, 5, 12, Math.PI), gloss("#c8455f", 0.4));
  smile.rotation.z = Math.PI;
  smile.position.set(0, 1.94, 0.245);
  g.add(smile);
  // the sceptre: a lollipop on a cane
  const sceptre = new THREE.Group();
  sceptre.add(mesh(cylGeo, CANDY.icing, 0.045, 1.5, 0.045, 0, 0.75, 0, false));
  const pop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 18), gloss(CANDY.pink, 0.18));
  pop.rotation.x = Math.PI / 2;
  pop.position.y = 1.56;
  sceptre.add(pop);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 5, 14, Math.PI * 1.5), gloss(CANDY.icing, 0.2));
  swirl.position.set(0, 1.56, 0.05);
  sceptre.add(swirl);
  sceptre.position.set(0.42, 0.62, 0.08);
  sceptre.name = "sceptre";
  g.add(sceptre);
  return g;
}

/* ------------------------------------------------------------- the world */

export type QuestNear = "princess" | null;

export class CandyQuest {
  private group = new THREE.Group();
  private princess = makePrincess();
  private parts = new Map<PartId, { group: THREE.Group; item: THREE.Object3D; ring: THREE.Mesh }>();
  private board: THREE.Mesh;
  private line = 0;
  private lastTalk = -99;

  constructor(private scene: THREE.Scene) {
    this.princess.position.set(PRINCESS.x, 0, PRINCESS.z);
    this.princess.rotation.y = Math.PI * 0.15;
    this.group.add(this.princess);

    this.board = signBoard("The Candy Princess", 3.4, 0.7);
    this.board.position.set(PRINCESS.x, 2.9, PRINCESS.z + 2.6);
    this.board.rotation.y = Math.PI;
    this.group.add(this.board);

    for (const def of FACTORY_PARTS) {
      const holder = new THREE.Group();
      holder.position.set(def.pos[0], 0, def.pos[1]);
      const item = MAKE[def.id]();
      item.position.y = 0.95;
      holder.add(item);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 8, 26), glowMaterial("#ffd84a", 1.1, 0.3));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      holder.add(ring);
      this.group.add(holder);
      this.parts.set(def.id, { group: holder, item, ring });
    }
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
  }

  /** Which parts are still out there, in the order the princess lists them. */
  static missing(found: readonly string[]) {
    return FACTORY_PARTS.filter((p) => !found.includes(p.id));
  }

  near(x: number, y: number, z: number): QuestNear {
    if (y > 3) return null;
    return Math.hypot(x - PRINCESS.x, z - PRINCESS.z) < TALK_R ? "princess" : null;
  }

  /**
   * What she says, which depends only on where the quest is. The first two
   * lines are the brief; after that she names what is still missing, and she
   * never says the same thing twice in a row while the same amount is left.
   */
  private speak() {
    const st = useGame.getState();
    if (st.factoryFixed) {
      /*
       * The factory first, her creatures second. Two errands at once is two
       * errands a seven-year-old is holding in her head, so the second one is
       * not mentioned until the first is finished.
       */
      const stuck = CandyCreatures.stillStuck(st.candyCreatures);
      if (stuck.length) {
        const next = stuck[this.line++ % stuck.length]!;
        st.setEmmettNotice(
          st.candyCreatures.length === 0 && this.line === 1
            ? `Now — my three creatures ran off while the factory was quiet. ${next.hint}`
            : `${stuck.length} of my creatures still need you. ${next.hint}`,
        );
        return;
      }
      const done = [
        "You fixed my factory and you found all three. You are the best thing that ever happened to this park.",
        "Look at the river — chocolate all the way to the lake. And look who is following you!",
        "They have decided you are theirs now. Take good care of them.",
      ];
      st.setEmmettNotice(done[this.line++ % done.length]!);
      return;
    }
    const missing = CandyQuest.missing(st.candyParts);
    if (missing.length === 0) {
      st.setEmmettNotice("You have all three! Take them inside the factory and pull the big lever.");
      return;
    }
    if (st.candyParts.length === 0 && this.line === 0) {
      this.line = 1;
      st.setEmmettNotice(
        "Oh no — the chocolate factory has stopped! That is why the river is running white. Three things are missing.",
      );
      return;
    }
    const next = missing[this.line++ % missing.length]!;
    st.setEmmettNotice(
      missing.length === 3
        ? `Find ${next.name}. ${next.hint}`
        : `${missing.length} to go. ${next.name[0]!.toUpperCase()}${next.name.slice(1)}: ${next.hint}`,
    );
  }

  /** Collect at the princess. Returns true if she took the press. */
  tryInteract(x: number, y: number, z: number): boolean {
    if (this.near(x, y, z) !== "princess") return false;
    sfx.click();
    /*
     * The first time she meets the princess, the card that lays out the whole
     * job: the factory, the three parts, the three creatures, the Jobs page.
     * The card says everything the first spoken line would and the world waits
     * behind it, so the line is saved for her next press rather than timing out
     * unread underneath.
     */
    const st = useGame.getState();
    const first = !st.seenHelp.includes("factory");
    st.showHelp("factory");
    if (!first) this.speak();
    this.lastTalk = 0;
    return true;
  }

  update(dt: number, t: number, her: { x: number; y: number; z: number }) {
    void dt;
    const st = useGame.getState();
    const sceptre = this.princess.getObjectByName("sceptre");
    if (sceptre) sceptre.rotation.z = Math.sin(t * 1.1) * 0.12;
    this.princess.position.y = Math.sin(t * 1.4) * 0.03;

    for (const def of FACTORY_PARTS) {
      const p = this.parts.get(def.id)!;
      const had = st.candyParts.includes(def.id);
      p.group.visible = !had;
      if (had) continue;
      p.item.rotation.y += 0.9 * dt;
      p.item.position.y = 0.95 + Math.sin(t * 2 + def.pos[0]) * 0.1;
      p.ring.rotation.z = t * 0.7;
      if (Math.hypot(her.x - def.pos[0], her.z - def.pos[1]) < PICK_R && Math.abs(her.y) < 2.6) {
        sfx.correct();
        st.findCandyPart(def.id);
        const left = CandyQuest.missing(useGame.getState().candyParts);
        st.setEmmettNotice(
          left.length === 0
            ? `You found ${def.name}! That is all three — take them to the factory.`
            : `You found ${def.name}! ${left.length} more for the factory.`,
        );
      }
    }
  }
}
