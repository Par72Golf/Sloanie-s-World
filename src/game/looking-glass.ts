import * as THREE from "three";
import { ICE_CREAM_MOUNTAIN } from "./candy-builds";
import { SUGAR } from "./sugar-rush";
import { useGame } from "./store";

/**
 * The looking glass on the summit of Ice Cream Mountain.
 *
 * She climbs seventeen metres; the view has to be worth it. Standing at the
 * telescope and pressing Collect narrows the camera to a twenty-degree field
 * of view at the eyepiece and pushes the fog to the edge of the world, so the
 * far side of the park comes into reach — and while she is looking, everything
 * she has not done yet sparkles: a coloured beam over each candy she has not
 * found, and a taller gold one over each part of the park she has not walked
 * into. It is the map, except she reads it by looking at the park instead of
 * at a drawing of it.
 *
 * Why it is built this way:
 *
 *   - **It owns the camera for the frames it is active, and nothing else.**
 *     runtime's syncCamera runs inside physics and animateWorld runs after it,
 *     so writing the camera from here is the last word on that frame. No new
 *     branch in syncCamera, no second camera, no render target.
 *   - **It aims off her existing camera yaw and pitch**, remembering the offset
 *     from them at the moment she looked in. Turning the stick turns the
 *     telescope, because turning the stick already turns cameraYaw even while
 *     she is standing still, so no new input has to be plumbed through.
 *   - **The sparkles are built on the first frame of the level and hidden**,
 *     not built on entry: twenty-six little meshes are nothing to draw and
 *     something to stutter over if they are allocated the moment she presses.
 *
 * The sparkles show only through the glass. A candy that glows from across the
 * park all the time is not hidden any more; one she has to climb a mountain
 * and look through a telescope to spot is a clue she earned.
 */

/** How narrow the view goes. Third person is 58 degrees, first person 70. */
const ZOOM_FOV = 20;
/** Seconds to zoom either way, so it reads as a telescope and not as a cut. */
const ZOOM_TIME = 0.45;
/** She has to be this close to the tripod for Collect to mean "look". */
export const REACH = 2.2;
/**
 * How far in front of the tripod the camera sits.
 *
 * The eyepiece is the obvious place for it and the wrong one: the barrel is
 * two metres long, so a camera at the eyepiece is inside the telescope and the
 * whole view is the inside of the objective ring — which is what the first
 * version rendered, a screen of flat yellow. Past the far lens, and past the
 * rail too, so the summit's own candy canes do not fence the view in.
 */
const FORWARD = 1.75;
/** Walking within this of a region's centre counts as having been there. */
const VISITED_R = 26;
/** A candy found this close to a region counts as having been there too. */
const FOUND_R = 32;

/** The parts of the park worth being pointed at. */
const PLACES: { name: string; x: number; z: number }[] = [
  { name: "Peppermint Plaza", x: SUGAR.plaza.x, z: SUGAR.plaza.z },
  { name: "the Candy Factory", x: SUGAR.factory.x, z: SUGAR.factory.z },
  { name: "the Lollipop Forest", x: SUGAR.forest.x, z: SUGAR.forest.z },
  { name: "Gingerbread Village", x: SUGAR.village.x, z: SUGAR.village.z },
  { name: "the Licorice Maze", x: SUGAR.maze.x, z: SUGAR.maze.z },
  { name: "Gumdrop Meadow", x: SUGAR.meadow.x, z: SUGAR.meadow.z },
  { name: "Marshmallow Fields", x: SUGAR.marshmallow.x, z: SUGAR.marshmallow.z },
  { name: "the Fairground", x: SUGAR.fair.x, z: SUGAR.fair.z },
  { name: "Chocolate Lake", x: SUGAR.lake.x, z: SUGAR.lake.z },
  { name: "Emmett's den", x: SUGAR.emmett.x, z: SUGAR.emmett.z },
];

/** What the glass needs of a hidden candy. runtime's own handles already fit. */
export type GlassTarget = { def: { id: string; pos: [number, number, number]; color: string } };

export type GlassContext = {
  /** her capsule */
  x: number;
  y: number;
  z: number;
  /** runtime's cameraYaw and pitch, which the stick already moves */
  yaw: number;
  pitch: number;
  /** the park's hidden candies, found and unfound alike */
  targets: readonly GlassTarget[];
  /** true while a panel has the screen: the glass holds still */
  paused: boolean;
};

/** One shared soft dot, drawn once on a canvas and tinted per sparkle. */
let dotTexture: THREE.Texture | null = null;
function sparkTexture() {
  if (dotTexture) return dotTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  // a soft core with two spikes across it: the core says "here" from a long
  // way off, the spikes say "sparkle" rather than "smudge on the lens"
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.28, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(255,255,255,0.8)";
  g.lineWidth = 2.5;
  for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
    g.beginPath();
    g.moveTo(32 - dx * 30, 32 - dy * 30);
    g.lineTo(32 + dx * 30, 32 + dy * 30);
    g.stroke();
  }
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

type Mark = {
  group: THREE.Group;
  beam: THREE.Mesh;
  spark: THREE.Sprite;
  size: number;
  /** so every mark twinkles out of step with its neighbours, the same every run */
  phase: number;
  /** a candy id, or null for a place */
  id: string | null;
  /** a place name, or null for a candy */
  place: string | null;
  x: number;
  z: number;
};

export class LookingGlass {
  /** true while she is looking through it */
  active = false;

  /** where the eyepiece is, in world space */
  readonly at: { x: number; y: number; z: number };

  private scene: THREE.Scene;
  private marks = new THREE.Group();
  private made: Mark[] = [];
  private beamGeo = new THREE.PlaneGeometry(1, 1);
  private mats: THREE.Material[] = [];
  private built = false;
  private clock = 0;
  private facing: number;

  /** the yaw and pitch the glass adds to hers, fixed when she looks in */
  private yawOffset = 0;
  private pitchOffset = 0;
  /** 0 wide, 1 fully zoomed; eased so the zoom is a move rather than a jump */
  private zoom = 0;
  private baseFov = 58;
  private fogFar = 0;

  /** region centres she has walked into, this session and from her save */
  private visited = new Set<string>();

  private eye = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private aim = new THREE.Vector3();

  constructor(scene: THREE.Scene, origin: { x: number; z: number } = SUGAR.mountain) {
    this.scene = scene;
    const g = ICE_CREAM_MOUNTAIN.glass;
    this.at = { x: origin.x + g.x, y: g.eyeY, z: origin.z + g.z };
    this.facing = g.facing;
    this.marks.visible = false;
    // drawn last and never writing depth, so two overlapping sparkles add up
    // into a brighter one instead of punching a hole in each other
    this.marks.renderOrder = 6;
    scene.add(this.marks);
  }

  /** Is she standing at the telescope? */
  near(x: number, y: number, z: number) {
    if (Math.abs(y - ICE_CREAM_MOUNTAIN.summitY) > 1.2) return false;
    return Math.hypot(x - this.at.x, z - this.at.z) <= REACH;
  }

  /**
   * What Collect does here: look in, or stop looking. Returns true when the
   * glass took the press, so the caller stops looking for something else to
   * do with it.
   */
  toggle(x: number, y: number, z: number) {
    if (this.active) {
      this.exit();
      return true;
    }
    if (!this.near(x, y, z)) return false;
    this.enter();
    return true;
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.marks.visible = true;
    // the far corner of the park is 300m from here and the park's fog ends at
    // 185, so without this the telescope would look into a pink wall
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) {
      this.fogFar = fog.far;
      fog.far = 2200;
    }
  }

  /** Back, Collect again, or anything that takes the screen away from her. */
  exit() {
    if (!this.active) return;
    this.active = false;
    this.marks.visible = false;
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog && this.fogFar) fog.far = this.fogFar;
  }

  /**
   * Run every frame, active or not: the unvisited places are only honest if
   * something is watching where she walks the rest of the time.
   *
   * Call it after syncCamera — runtime's animateWorld is — because on the
   * frames she is looking, this takes the camera over.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, ctx: GlassContext) {
    this.clock += dt;
    if (!this.built) this.build(ctx.targets);
    for (const p of PLACES) {
      if (Math.hypot(ctx.x - p.x, ctx.z - p.z) <= VISITED_R) this.visited.add(p.name);
    }
    // Anything that takes the screen — pause, the journal, a quiz — puts the
    // glass down. Not a `return`: the zoom still has to ease back out and
    // hand the camera over, or she would unpause into a 20-degree view of
    // nothing with no way to widen it again.
    if (ctx.paused) this.exit();

    const first = this.active && this.zoom === 0;
    if (first) {
      // remember where the camera was so it can be handed back, and line the
      // barrel up with the park rather than with whichever way she happened
      // to be facing when she pressed the button
      this.baseFov = camera.fov;
      this.yawOffset = Math.atan2(-Math.cos(this.facing), -Math.sin(this.facing)) - ctx.yaw;
      this.pitchOffset = -0.12 - ctx.pitch;
      this.refresh(ctx.targets);
    }

    // ease both ways, so leaving is as smooth as arriving and an exit halfway
    // through picks up from wherever the zoom had got to
    const want = this.active ? 1 : 0;
    if (this.zoom !== want) {
      const step = dt / ZOOM_TIME;
      this.zoom = want > this.zoom ? Math.min(1, this.zoom + step) : Math.max(0, this.zoom - step);
    }
    if (!this.active && this.zoom === 0) {
      if (camera.fov !== this.baseFov) {
        camera.fov = this.baseFov;
        camera.updateProjectionMatrix();
      }
      return;
    }

    const k = this.zoom * this.zoom * (3 - 2 * this.zoom);
    camera.fov = this.baseFov + (ZOOM_FOV - this.baseFov) * k;
    camera.updateProjectionMatrix();

    const yaw = ctx.yaw + this.yawOffset;
    const pitch = THREE.MathUtils.clamp(ctx.pitch + this.pitchOffset, -0.85, 0.45);
    const cp = Math.cos(pitch);
    this.dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    this.eye.set(this.at.x, this.at.y, this.at.z).addScaledVector(this.dir, FORWARD);
    camera.position.lerp(this.eye, k);
    this.aim.copy(camera.position).addScaledVector(this.dir, 60);
    camera.lookAt(this.aim);

    this.twinkle(camera);
  }

  /** The name of whatever the glass is pointed at, for a caption. */
  get aimedAt(): string | null {
    if (!this.active) return null;
    let best: Mark | null = null;
    let bestDot = 0.985;
    for (const m of this.made) {
      if (!m.group.visible) continue;
      const dx = m.x - this.eye.x;
      const dz = m.z - this.eye.z;
      const len = Math.hypot(dx, dz) || 1;
      const dot = (dx / len) * this.dir.x + (dz / len) * this.dir.z;
      if (dot > bestDot) {
        bestDot = dot;
        best = m;
      }
    }
    return best ? (best.place ?? best.group.name) : null;
  }

  /** Which candies are still hidden, and which places she has not seen. */
  private refresh(targets: readonly GlassTarget[]) {
    const st = useGame.getState();
    const found = new Set(st.collected[st.levelIndex] ?? []);
    // a place she has picked a candy up in is a place she has been, so her
    // save carries that across sessions even though the walking does not
    for (const t of targets) {
      if (!found.has(t.def.id)) continue;
      for (const p of PLACES) {
        if (Math.hypot(t.def.pos[0] - p.x, t.def.pos[2] - p.z) <= FOUND_R) this.visited.add(p.name);
      }
    }
    for (const m of this.made) {
      m.group.visible = m.id ? !found.has(m.id) : !this.visited.has(m.place!);
    }
  }

  /** Every mark, once, hidden: pressing the button then allocates nothing. */
  private build(targets: readonly GlassTarget[]) {
    this.built = true;
    const add = (name: string, id: string | null, place: string | null, x: number, y: number, z: number, color: string, height: number, size: number) => {
      const group = new THREE.Group();
      group.name = name;
      group.position.set(x, y, z);
      /*
       * Plain blending, not additive.
       *
       * Additive is the obvious choice for a sparkle and it is the wrong one
       * here: this park is pastel mint and blossom pink at full brightness,
       * and adding light to something already that close to white does
       * nothing. The first version was invisible from the summit. A solid
       * ribbon of the candy's own colour reads against mint grass and against
       * a pink sky both.
       */
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.mats.push(mat);
      const beam = new THREE.Mesh(this.beamGeo, mat);
      beam.scale.set(size * 0.9, height, 1);
      beam.position.y = height / 2;
      group.add(beam);
      const sm = new THREE.SpriteMaterial({
        map: sparkTexture(),
        color,
        transparent: true,
        // always drawn: a sparkle hidden behind the lollipop wood is no use
        // for deciding where to walk next, which is the whole point of it
        depthTest: false,
        depthWrite: false,
      });
      this.mats.push(sm);
      const spark = new THREE.Sprite(sm);
      spark.scale.setScalar(size * 2.4);
      spark.position.y = height;
      group.add(spark);
      this.marks.add(group);
      this.made.push({ group, beam, spark, size, phase: this.made.length * 1.37, id, place, x, z });
    };

    // candies: their own colour, so the sparkle says which sweet it is, and
    // tall enough that the beam clears the planting it is hidden in
    for (const t of targets) {
      // tall enough that the sparkle clears the lollipop canopy it is hiding
      // under: a beam that stops inside the wood is a beam she cannot see
      add(t.def.id, t.def.id, null, t.def.pos[0], t.def.pos[1], t.def.pos[2], t.def.color, 12, 0.85);
    }
    // places: amber, and three times as tall again, so the sparkle sits well
    // clear of the skyline and a region reads as a direction to walk in rather
    // than as one more thing to pick up
    for (const p of PLACES) add(p.name, null, p.name, p.x, 0, p.z, "#ffb01f", 19, 1.7);
  }

  /**
   * Billboard, twinkle, and grow with distance.
   *
   * Everything worth sparkling about is between 60 and 300 metres away, and a
   * mark that is honestly scaled at 300m is four pixels of sugar-pink on a
   * sugar-pink park. Widening it with distance keeps every mark about as easy
   * to see as every other, which is what she is using it for — comparing them
   * to decide where to walk. Only the frames she is looking.
   */
  private twinkle(camera: THREE.PerspectiveCamera) {
    for (const m of this.made) {
      if (!m.group.visible) continue;
      // yaw-only billboard: a beam that tips toward the camera stops looking
      // like something standing on the ground
      m.group.rotation.y = Math.atan2(camera.position.x - m.x, camera.position.z - m.z);
      const far = THREE.MathUtils.clamp(Math.hypot(camera.position.x - m.x, camera.position.z - m.z) / 70, 1, 4.5);
      const t = 0.72 + 0.28 * Math.sin(this.clock * 3.1 + m.phase);
      // the beam stays nearly its real width — a beam that fattens with
      // distance stops being a beam and becomes a column of fog — while the
      // sparkle on top of it takes the whole of the distance allowance
      m.beam.scale.x = m.size * 0.9 * Math.sqrt(far);
      (m.beam.material as THREE.Material).opacity = 0.7 * t * this.zoom;
      m.spark.scale.setScalar(m.size * 2.2 * far * t);
      (m.spark.material as THREE.Material).opacity = t * this.zoom;
    }
  }

  dispose() {
    this.exit();
    this.scene.remove(this.marks);
    for (const mat of this.mats) mat.dispose();
    this.mats = [];
    this.beamGeo.dispose();
    this.made = [];
  }
}
