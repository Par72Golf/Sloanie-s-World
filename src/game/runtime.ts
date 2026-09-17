import { EMMETT_BASE } from "./emmett-base";
import { animateMonsterTruck } from "./monster-truck";
import { HomeWorld } from "./home";
import { useHome } from "./home-store";
import { applyDance, type DanceId } from "./dances";
import { CHANNELS, beatInfo, currentChannel, setChannel } from "./music";
import { QuestWorld } from "./quest";
import { StickerWorld } from "./stickers-world";
import { BOOTHS, CAROUSEL, boothStand, carouselGate, type BoothGame } from "./carnival";
import * as THREE from "three";
import { placeCamera } from "./camera";
import { perf, recordFrame } from "./debug";
import { applyWorn, makePickup, type AccessoryId } from "./accessories";
import { levelGondolas } from "./meshes";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { animateGirl, disposeHands, makeGirl, makeHands, makeSky, setFirstPersonBody, type Hands } from "./meshes";
import { buildWorld, disposeWorld, type BuiltWorld, type DumplingHandle } from "./world-build";
import {
  bindInput,
  clearInjectedKeys,
  camLeftHeld,
  camRightHeld,
  consumeJumpTap,
  consumeLook,
  consumePadHint,
  consumePadInteract,
  consumePadJournal,
  consumePadMap,
  consumePadMusic,
  consumePadView,
  consumePadPause,
  getMoveAxes,
  isDown,
  look,
  pollGamepad,
  setInjectedKeys,
  wantsInteract,
} from "./input";
import { inCircle, moveAndCollide, type Capsule } from "./collision";
import { levelByIndex } from "./levels";
import { makeQuestion, resetQuizBank, tempFromDist } from "./math-quiz";
import { sfx, unlockAudio } from "./audio";
import { noOutline } from "./scenery";
import { resetPose, worldPose } from "./pose";
import { BOOST_MULTIPLIER, BOOST_SECONDS, Emmett, type JuicePickup } from "./emmett";
import { animateFace, makeJuiceBox, type GirlMood } from "./meshes";
import { useGame } from "./store";
import { DRESS, HAIR, type LevelDef } from "./types";

import { BOUNCE, GRAVITY, JUMP, PLAYER_H, PLAYER_W, SUPER_BOUNCE, TRAMPOLINE_TOP, WALK } from "./tuning";
import { GEYSER } from "./splash";
import { pickFleePos } from "./flee";
const FIXED = 1 / 60;
const COLLECT_R = 2.15;
// On the ferris wheel the sky dumpling floats clear above the rim so it stands
// out against the sky, which puts it further from her seat than a normal reach.
// At 2.3m above her this still gives roughly a 4.5 second window at the top.
const RIDE_COLLECT_R = 3.1;

type Puff = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number };

/** An angle folded into -PI..PI. */
function wrapAngle(a: number) {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
}

/** How early before landing a jump press still counts. */
const JUMP_BUFFER = 0.18;

export class GameRuntime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  sky: THREE.Mesh;
  blob: THREE.Mesh;
  girl: THREE.Group;
  world: BuiltWorld | null = null;
  level: LevelDef;
  cap: Capsule = { x: 0, y: 0, z: 0, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  yaw = 0;
  cameraYaw = 0;
  velY = 0;
  speed = 0;
  grounded = true;
  coyote = 0;
  /** seconds left in which a jump tap counts toward a super bounce */
  bounceBuffer = 0;
  /** seconds a jump press waits for her to land */
  jumpBuffer = 0;
  acc = 0;
  clock = 0;
  last = performance.now();
  running = false;
  disposed = false;
  hudT = 0;
  stepT = 0;
  lastInteract = 0;
  lastHint = 0;
  lastFlee = 0;
  emmett: Emmett | null = null;
  juice: JuicePickup[] = [];
  boostLeft = 0;
  private lastRpsKey = "";
  private runAccum = 0;
  private indoor = 0;
  private lastYaw = 0;
  private turnRate = 0;
  private mood: GirlMood = "none";
  private moodT = 0;
  /** While Emmett is riding off with one, the real dumpling stays hidden. */
  private stolenId: string | null = null;
  private stolenUntil = 0;
  private celebrating: {
    d: { group: THREE.Group; spark: THREE.PointLight; def: { id: string; name: string; color: string; accent: string; pos: [number, number, number] } };
    t: number;
    from: THREE.Vector3;
  } | null = null;
  lastLevel = -1;
  lastDress = "";
  lastHair = "";
  puffs: Puff[] = [];
  highlightUntil = 0;
  highlighted: DumplingHandle | null = null;
  camPos = new THREE.Vector3();
  composer!: EffectComposer;
  bloom!: UnrealBloomPass;
  /** game-clock time of the last catch, for the hitch log */
  lastCatchClock = -1;
  /** accessory pickups in the current park */
  pickups: { id: AccessoryId; group: THREE.Group; pos: [number, number, number]; phase: number; warned?: boolean }[] = [];
  lastWornGen = -1;
  /** ferris wheel ride in progress: which gondola she is in and how far round */
  ride: { gondola: number; turned: number } | null = null;
  private rideSeat = new THREE.Vector3();
  /** first person: look pitch, the hands viewmodel, and whether it is active */
  firstPerson = false;
  pitch = 0;
  hands!: Hands;
  private fpDir = new THREE.Vector3();
  camTarget = new THREE.Vector3();
  wish = new THREE.Vector3();
  fwd = new THREE.Vector3();
  right = new THREE.Vector3();
  lookAt = new THREE.Vector3();
  pointerId: number | null = null;
  lastPx = 0;
  lastPy = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth || 1280, canvas.clientHeight || 800, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in r186; PCF with a blur radius is the soft
    // shadow now. Neutral tone mapping keeps the toy colours saturated where
    // ACES pulled everything toward grey.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.level = levelByIndex(0);
    this.scene.fog = new THREE.Fog("#c5e0f2", 48, this.level.fogFar);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 620);
    this.sky = makeSky();
    noOutline(this.sky);
    this.scene.add(this.sky);

    // Post-processing: scene -> bloom -> tone map + sRGB. The render target is
    // half-float so bloom has real highlights to work with, and multisampled
    // so the toy edges stay smooth (the canvas antialias flag does nothing
    // once rendering goes through a composer). Bloom is thresholded high so
    // only the glowing dumplings, the sun and specular pops bloom, not lawns.
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Threshold high enough that plain white paint (lines, fences, blossom)
    // stays below it; only emissive finishes, the sun and true speculars bloom.
    this.bloom = new UnrealBloomPass(size, 0.3, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.hemi = new THREE.HemisphereLight("#dff1ff", "#86b860", 1.05);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff1c8", 2.0);
    this.sun.position.set(28, 46, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 4;
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 110;
    this.sun.shadow.camera.left = -38;
    this.sun.shadow.camera.right = 38;
    this.sun.shadow.camera.top = 38;
    this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.fill = new THREE.DirectionalLight("#b7d8ff", 0.32);
    this.fill.position.set(-18, 18, -12);
    this.scene.add(this.fill);
    this.scene.add(new THREE.AmbientLight("#fff4e8", 0.34));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color("#9fd0f0");
    envScene.add(new THREE.HemisphereLight("#e7f4ff", "#88b86a", 1));
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    const st = useGame.getState();
    this.girl = makeGirl("#e8b489", HAIR.brown, DRESS[st.dress]);
    this.girl.castShadow = true;
    this.scene.add(this.girl);
    this.hands = makeHands("#e8b489", DRESS[st.dress]);
    this.hands.group.visible = false;
    this.scene.add(this.hands.group);
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({
        color: "#2a2118",
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.03;
    noOutline(this.blob);
    this.scene.add(this.blob);

    this.lastDress = st.dress;
    this.lastHair = st.hair;

    bindInput();
    this.bindCanvasLook();
    this.loadLevel(st.levelIndex);
    this.installProbe();
    // sets the pixel ratio, composer samples, bloom and shadow map from the
    // saved setting, then sizes everything (it ends in resize())
    this.applyGraphics(st.graphics);
  }

  /** The graphics setting currently applied; null until the first apply. */
  graphics: "sharp" | "smooth" | null = null;

  /**
   * Graphics quality from the pause menu. "sharp" draws at up to 2x on a
   * Retina screen with 4x MSAA, bloom and a 2048 shadow map; "smooth" draws at
   * 1x with 2x MSAA, no bloom, a 1024 shadow map and half the grass. Applied
   * live: anything replaced on the GPU is disposed here.
   */
  applyGraphics(mode: "sharp" | "smooth") {
    const smooth = mode === "smooth";
    this.graphics = mode;
    this.renderer.setPixelRatio(smooth ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    // MSAA samples are fixed when a render target is first allocated, so a
    // change needs new targets; reset() disposes both of the old ones
    const samples = smooth ? 2 : 4;
    const old = this.composer.renderTarget1;
    if (old.samples !== samples) {
      const target = new THREE.WebGLRenderTarget(old.width, old.height, {
        type: THREE.HalfFloatType,
        samples,
      });
      this.composer.reset(target);
    }
    this.bloom.enabled = !smooth;
    const mapSize = smooth ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      // the renderer rebuilds the map at the new size when it is null;
      // dispose() frees the old target and its depth texture
      this.sun.shadow.dispose();
      this.sun.shadow.map = null;
    }
    this.applyGrassDensity();
    this.resize();
  }

  /**
   * Blades and flowers are placed independently at random, so drawing only
   * the first half of each instanced mesh is an even thinning of the field.
   */
  applyGrassDensity() {
    const g = this.world?.grassField?.group;
    if (!g) return;
    const k = this.graphics === "smooth" ? 0.5 : 1;
    for (const o of g.children) {
      if (!(o instanceof THREE.InstancedMesh)) continue;
      if (typeof o.userData.fullCount !== "number") o.userData.fullCount = o.count;
      o.count = Math.round((o.userData.fullCount as number) * k);
    }
  }

  bindCanvasLook() {
    const el = this.canvas;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const st = useGame.getState();
      if (st.phase !== "playing" && st.phase !== "title") return;
      if (e.pointerType === "touch" && e.clientX < window.innerWidth * 0.42) return;
      this.pointerId = e.pointerId;
      this.lastPx = e.clientX;
      this.lastPy = e.clientY;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (this.pointerId !== e.pointerId) return;
      look.dx += e.clientX - this.lastPx;
      look.dy += e.clientY - this.lastPy;
      this.lastPx = e.clientX;
      this.lastPy = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (this.pointerId === e.pointerId) this.pointerId = null;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  installProbe() {
    window.__controlsTest = {
      getYaw: () => this.yaw,
      getSpeed: () => this.speed,
      getGirlRot: () => this.girl.rotation.y,
      getCamYaw: () => this.cameraYaw,
      setKeys: (codes: string[]) => {
        if (codes.length === 0) clearInjectedKeys();
        else setInjectedKeys(codes);
      },
    };
    window.__gameTest = {
      teleport: (x: number, y: number, z: number) => {
        this.cap.x = x;
        this.cap.y = y;
        this.cap.z = z;
      },
      getPos: () => ({ x: this.cap.x, y: this.cap.y, z: this.cap.z }),
      nearest: () => this.nearestUnfound()?.def.id ?? null,
      // Perf probes. renderOnce forces the GPU to finish so the time is the
      // real cost of a frame, not just the cost of issuing it. Works while the
      // tab is hidden, which the animation loop does not.
      renderOnce: (sync = true) => {
        const gl = this.renderer.getContext();
        const t0 = performance.now();
        this.renderFrame();
        const submit = performance.now() - t0;
        if (sync) gl.finish();
        return sync ? performance.now() - t0 : submit;
      },
      info: () => {
        const r = this.renderer.info;
        return {
          calls: r.render.calls,
          triangles: r.render.triangles,
          geometries: r.memory.geometries,
          textures: r.memory.textures,
          programs: r.programs?.length ?? 0,
          graphics: this.graphics,
          bloom: this.bloom.enabled,
          samples: this.composer.renderTarget1.samples,
          shadowMapSize: this.sun.shadow.mapSize.x,
          pixelRatio: this.renderer.getPixelRatio(),
          size: (() => {
            const v = new THREE.Vector2();
            this.renderer.getDrawingBufferSize(v);
            return [v.x, v.y];
          })(),
        };
      },
      setPixelRatio: (r: number) => {
        this.renderer.setPixelRatio(r);
        this.resize();
      },
      setShadows: (on: boolean, mapSize?: number) => {
        this.renderer.shadowMap.enabled = on;
        if (mapSize) {
          this.sun.shadow.mapSize.set(mapSize, mapSize);
          this.sun.shadow.map?.dispose();
          this.sun.shadow.map = null;
        }
        this.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!m) return;
          for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
        });
      },
      scene: () => this.scene,
      // Park the camera at a point looking at another, for photographing a
      // spot without walking there; null hands the camera back to the game.
      // Fog is pushed out while parked so aerial shots are not washed out.
      lookAt: (pos: [number, number, number] | null, target?: [number, number, number]) => {
        if (!pos) {
          this.camOverride = null;
          if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = this.level.fogFar;
          return;
        }
        const t = target ?? [pos[0], 0, pos[2] - 1];
        this.camOverride = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...t) };
        if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = 2000;
      },
      setBloom: (on: boolean, strength?: number) => {
        this.bloom.enabled = on;
        if (strength != null) this.bloom.strength = strength;
      },
      // Step the real game loop by hand: n frames of dtMs each. Works while the
      // tab is hidden (when requestAnimationFrame does not fire) and returns
      // the wall-clock cost of every frame, so spikes can be found offline.
      frames: (n: number, dtMs = 1000 / 60) => {
        const costs: number[] = [];
        let now = this.last;
        for (let i = 0; i < n; i++) {
          now += dtMs;
          const t0 = performance.now();
          this.frame(now);
          costs.push(+(performance.now() - t0).toFixed(2));
        }
        return costs;
      },
      store: () => useGame,
    };
  }

  loadLevel(index: number) {
    if (this.world) {
      this.scene.remove(this.world.group);
      disposeWorld(this.world);
    }
    this.level = levelByIndex(index);
    resetQuizBank();
    this.level = { ...this.level, layout: useGame.getState().layout };
    this.world = buildWorld(this.level);
    this.scene.add(this.world.group);
    this.applyGrassDensity();
    noOutline(this.world.ground);
    this.scene.fog = new THREE.Fog("#c5e0f2", 48, this.level.fogFar);
    this.cap.x = this.level.spawn[0];
    this.cap.y = this.level.spawn[1];
    this.cap.z = this.level.spawn[2];
    this.yaw = this.level.spawnYaw;
    this.cameraYaw = this.level.spawnYaw;
    this.velY = 0;
    this.speed = 0;
    this.grounded = true;
    this.lastLevel = index;
    const collected = useGame.getState().collected[index] ?? [];
    for (const d of this.world.dumplings) {
      const got = collected.includes(d.def.id);
      d.group.visible = !got;
      // Lights are dimmed, never hidden: toggling a light's visibility changes
      // the light count in every shader and recompiles all of them (~2s).
      d.spark.intensity = got ? 0 : 0.7;
      // no permanent sky beam; the shaft is a hint-only effect now
      d.beam.visible = false;
    }
    resetPose();
    this.runAccum = useGame.getState().runSeconds;
    this.spawnJuice();
    this.spawnPickups();
    // the lost pet quest and the stickers live in the first park only
    this.questWorld?.dispose();
    this.stickerWorld?.dispose();
    this.questWorld = this.level.id === "picnic" ? new QuestWorld(this.scene) : null;
    this.stickerWorld = this.level.id === "picnic" ? new StickerWorld(this.scene) : null;
    this.homeWorld?.dispose();
    this.homeWorld = this.level.id === "picnic" && this.world ? new HomeWorld(this.scene, this.world.colliders) : null;
    this.ride = null;
    useGame.getState().setRiding(false);
    if (this.emmett) this.emmett.dispose(this.scene);
    const base = this.level.emmettBase
      ? { x: EMMETT_BASE.x, z: EMMETT_BASE.z, loop: EMMETT_BASE.loop, park: EMMETT_BASE.trikePark }
      : null;
    this.emmett = new Emmett(this.scene, this.level.bounds, this.level.emmettKeepOut ?? [], base);
    this.boostLeft = 0;
    useGame.getState().setBoost(0);
    this.lastRpsKey = "";

    this.syncCamera(true);
  }

  spawnJuice() {
    for (const j of this.juice) this.scene.remove(j.group);
    this.juice = [];
    const flavours = ["#d4494f", "#e08a2a", "#5aa84a", "#8a5ac4", "#d46aa0"];
    (this.level.juice ?? []).forEach(([x, z], i) => {
      const g = makeJuiceBox(flavours[i % flavours.length]!);
      g.position.set(x, 0.1, z);
      noOutline(g);
      this.scene.add(g);
      this.juice.push({ group: g, pos: [x, 0.1, z], taken: false, respawn: 0, phase: i * 0.8 });
    });
  }

  /** Accessory pickups: only the ones not found yet. */
  spawnPickups() {
    for (const p of this.pickups) this.scene.remove(p.group);
    this.pickups = [];
    const found = useGame.getState().foundAccessories;
    (this.level.accessories ?? []).forEach((a, i) => {
      const id = a.id as AccessoryId;
      if (found.includes(id)) return;
      const g = makePickup(id);
      g.position.set(a.pos[0], a.pos[1], a.pos[2]);
      noOutline(g);
      this.scene.add(g);
      this.pickups.push({ id, group: g, pos: [a.pos[0], a.pos[1], a.pos[2]], phase: i * 1.1 });
    });
  }

  updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      const item = p.group.userData.item as THREE.Object3D;
      item.rotation.y += dt * 1.4;
      item.position.y = 1.05 + Math.sin(this.clock * 2.2 + p.phase) * 0.1;
      const ring = p.group.userData.ring as THREE.Mesh;
      ring.rotation.z += dt * 0.8;
      const d = Math.hypot(this.cap.x - p.pos[0], this.cap.z - p.pos[2]);
      if (d < 1.7 && Math.abs(this.cap.y - p.pos[1]) < 2.4) {
        // Nothing can be carried until she has the backpack. The item stays
        // put and she is told where the bag is, once per visit.
        const st = useGame.getState();
        if (p.id !== "backpack" && !st.foundAccessories.includes("backpack")) {
          if (!p.warned) {
            p.warned = true;
            sfx.wrong();
            st.setEmmettNotice("You need a backpack to carry that! Look for it out on the ball field.");
          }
          continue;
        }
        this.burst(p.pos[0], p.pos[1] + 1, p.pos[2], "#ffd34a");
        sfx.correct();
        this.scene.remove(p.group);
        this.pickups.splice(i, 1);
        useGame.getState().findAccessory(p.id);
        if (p.id === "backpack") {
          useGame.getState().setEmmettNotice("You found the backpack! Now you can carry things.");
          useGame.getState().showHelp("backpack");
        }
      } else {
        p.warned = false;
      }
    }
  }

  /** Feed the minimap. Plain object writes, so no React work per frame. */
  publishPose() {
    worldPose.x = this.cap.x;
    worldPose.z = this.cap.z;
    worldPose.yaw = this.yaw;
    if (this.emmett) {
      worldPose.emmettOut = this.emmett.group.visible;
      worldPose.emmettX = this.emmett.group.position.x;
      worldPose.emmettZ = this.emmett.group.position.z;
    } else {
      worldPose.emmettOut = false;
    }
    for (let i = 0; i < this.juice.length; i++) {
      const j = this.juice[i]!;
      const m = worldPose.juice[i];
      if (m) {
        m.x = j.pos[0];
        m.z = j.pos[2];
        m.on = !j.taken;
      } else {
        worldPose.juice[i] = { x: j.pos[0], z: j.pos[2], on: !j.taken };
      }
    }
    worldPose.juice.length = this.juice.length;

    if (this.world) {
      const collected = useGame.getState().collected[useGame.getState().levelIndex] ?? [];
      worldPose.found.length = 0;
      for (const d of this.world.dumplings) {
        if (collected.includes(d.def.id)) {
          worldPose.found.push({ x: d.def.pos[0], z: d.def.pos[2], on: true });
        }
      }
    }
  }

  updateJuice(dt: number) {
    const boosted = this.boostLeft > 0;
    for (const j of this.juice) {
      if (j.taken) {
        j.respawn -= dt;
        if (j.respawn <= 0) {
          j.taken = false;
          j.group.visible = true;
        }
        continue;
      }
      j.group.rotation.y += dt * 1.6;
      j.group.position.y = j.pos[1] + Math.sin(this.clock * 2.4 + j.phase) * 0.12;

      const d = Math.hypot(this.cap.x - j.pos[0], this.cap.z - j.pos[2]);
      if (d < 1.9 && Math.abs(this.cap.y - j.pos[1]) < 2.4) {
        j.taken = true;
        j.respawn = 45;
        j.group.visible = false;
        this.burst(j.pos[0], j.pos[1] + 0.4, j.pos[2], "#ffd34a");
        sfx.collect();
        // drinking a second one tops the timer back up rather than stacking
        this.boostLeft = BOOST_SECONDS;
        useGame.getState().setBoost(BOOST_SECONDS);
        if (!boosted) useGame.getState().setEmmettNotice("Juice box! Zoom!");
      }
    }
  }

  updateEmmett(dt: number) {
    if (!this.emmett || !this.world) return;
    const st = useGame.getState();
    const busy =
      st.phase !== "playing" ||
      st.quiz != null ||
      st.rps != null ||
      st.carnival != null ||
      st.questPanel != null ||
      st.helpCard != null ||
      useHome.getState().inside ||
      st.riding;

    const collected = st.collected[st.levelIndex] ?? [];
    const caught = this.emmett.update(
      dt,
      this.clock,
      this.cap.x,
      this.cap.z,
      collected.length,
      this.level.dumplings.length,
      this.world.colliders,
      busy,
    );

    if (caught) {
      sfx.click();
      st.setEmmettNotice("Rock, paper, scissors for a dumpling!");
      st.openRps();
    }

    // resolve a finished round exactly once
    const rps = st.rps;
    if (rps?.result) {
      const key = `${rps.round}:${rps.result}`;
      if (key !== this.lastRpsKey) {
        this.lastRpsKey = key;
        if (rps.friendly) {
          if (rps.result === "win") {
            sfx.win();
            st.addTickets(3);
            st.setEmmettNotice("You win 3 tickets!");
            this.emmett.mood = "lose";
          } else if (rps.result === "lose") {
            sfx.click();
            st.setEmmettNotice("I win! Play again any time.");
            this.emmett.mood = "win";
          }
        } else if (rps.result === "win") {
          sfx.correct();
          st.setEmmettNotice("Aw, you win! Keep it.");
          this.emmett.mood = "lose";
          this.emmett.leave();
        } else if (rps.result === "lose") {
          sfx.wrong();
          this.mood = "sad";
          this.moodT = 2.2;
          this.emmett.mood = "win";
          this.emmettTakesOne();
          this.emmett.leave();
        }
      }
    }
  }

  emmettTakesOne() {
    const st = useGame.getState();
    const collected = st.collected[st.levelIndex] ?? [];
    if (!collected.length || !this.world) {
      st.setEmmettNotice("Ha! Next time.");
      return;
    }
    const id = collected[Math.floor(Math.random() * collected.length)]!;
    const spots = this.level.rehideSpots ?? [];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    const d = this.world.dumplings.find((x) => x.def.id === id);
    if (!d || !spot) return;

    st.uncollectDumpling(id);
    this.burst(this.cap.x, 1.2, this.cap.z, d.def.color);
    // he carries it away over his head rather than it teleporting, so the real
    // one stays out of sight until he is gone
    this.emmett?.carry(d.def.color, d.def.accent);
    this.stolenId = id;
    this.stolenUntil = this.clock + 9;

    // nudge off the exact landmark centre so repeats are not identical
    const nx = spot.pos[0] + (Math.random() - 0.5) * 3.5;
    const nz = spot.pos[2] + (Math.random() - 0.5) * 3.5;
    d.def.pos[0] = nx;
    d.def.pos[1] = spot.pos[1];
    d.def.pos[2] = nz;
    d.def.hide = "medium";
    d.def.region = spot.name;
    d.def.hint = `Emmett hid it at ${spot.name}.`;
    d.group.position.set(nx, spot.pos[1], nz);
    d.group.visible = false;
    d.spark.intensity = 0;
    d.spark.position.set(nx, spot.pos[1] + 0.6, nz);
    d.beam.position.set(nx, spot.pos[1] + 3, nz);
    this.highlighted = null;
    this.highlightUntil = 0;
    st.setEmmettNotice(`${d.def.name}! ${spot.say}`);
  }

  rebuildGirl() {
    const st = useGame.getState();
    this.scene.remove(this.girl);
    this.girl = makeGirl("#e8b489", HAIR.brown, DRESS[st.dress]);
    this.scene.add(this.girl);
    this.lastDress = st.dress;
    this.lastHair = st.hair;
    applyWorn(this.girl, st.worn);
    this.lastWornGen = st.wornGen;
    setFirstPersonBody(this.girl, this.firstPerson);
    this.scene.remove(this.hands.group);
    disposeHands(this.hands);
    this.hands = makeHands("#e8b489", DRESS[st.dress]);
    this.hands.group.visible = this.firstPerson;
    this.scene.add(this.hands.group);
  }

  /** Switch camera modes: body parts, hands, field of view. */
  setFirstPerson(on: boolean) {
    if (this.firstPerson === on) return;
    this.firstPerson = on;
    setFirstPersonBody(this.girl, on);
    this.hands.group.visible = on;
    this.camera.fov = on ? 70 : 58;
    this.camera.updateProjectionMatrix();
    this.pitch = 0;
    if (on) this.cameraYaw = this.yaw;
    this.syncCamera(true);
  }

  /** Hands follow the camera, with a walk bob and a lean into turns. */
  updateHands() {
    const g = this.hands.group;
    // holding something else: the iPod goes away rather than being in both
    // her hand in third person and her hand in first person at the same time
    const ipod = this.hands.right.getObjectByName("fp-ipod");
    if (ipod) ipod.visible = !useGame.getState().worn.hand;
    g.position.copy(this.camera.position);
    g.quaternion.copy(this.camera.quaternion);
    const pace = THREE.MathUtils.clamp(this.speed / WALK, 0, 1.6);
    const bob = Math.sin(this.clock * 9.5) * 0.018 * pace;
    const sway = Math.cos(this.clock * 4.75) * 0.012 * pace;
    g.translateY(bob - (this.grounded ? 0 : 0.03));
    g.translateX(sway);
    g.rotateZ(-this.turnRate * 0.08);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    // One thrown error inside the loop would otherwise end the animation loop
    // for good, with no way back short of a reload. Log it and keep going.
    this.renderer.setAnimationLoop((t) => {
      try {
        this.frame(t);
      } catch (err) {
        this.frameErrors++;
        if (this.frameErrors <= 5) console.error("[game] frame error", err);
        this.last = t;
      }
    });
  }

  frameErrors = 0;

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  questWorld: QuestWorld | null = null;
  stickerWorld: StickerWorld | null = null;
  homeWorld: HomeWorld | null = null;

  dispose() {
    this.disposed = true;
    this.questWorld?.dispose();
    this.stickerWorld?.dispose();
    this.homeWorld?.dispose();
    this.stop();
    if (this.world) disposeWorld(this.world);
    this.composer.dispose();
    this.renderer.dispose();
    delete window.__controlsTest;
    delete window.__gameTest;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.camera.aspect = Math.max(0.4, w / Math.max(1, h));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    perf.bufW = buf.x;
    perf.bufH = buf.y;
    perf.pixelRatio = this.renderer.getPixelRatio();
  }

  /** One frame through the post-processing chain. */
  renderFrame() {
    // the composer makes several render() calls per frame; count them all so
    // the info() probe reports the real draw-call total, not the last pass
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.composer.render();
  }

  nearestUnfound(): DumplingHandle | null {
    if (!this.world) return null;
    const collected = useGame.getState().collected[useGame.getState().levelIndex] ?? [];
    let best: DumplingHandle | null = null;
    let bestD = Infinity;
    for (const d of this.world.dumplings) {
      if (collected.includes(d.def.id) || !d.group.visible) continue;
      const dx = d.def.pos[0] - this.cap.x;
      const dz = d.def.pos[2] - this.cap.z;
      const dy = d.def.pos[1] - this.cap.y;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  applyHint() {
    const d = this.nearestUnfound();
    if (!d) {
      useGame.getState().setHint("You already found every dumpling here.", null);
      return;
    }
    this.highlighted = d;
    this.highlightUntil = this.clock + 22;
    (d.beam.material as THREE.MeshStandardMaterial).opacity = 0.55;
    d.spark.intensity = 2.2;
    d.spark.distance = 9;
    useGame.getState().setHint(d.def.hint, d.def.id);
    sfx.hint();
  }

  relocateDumpling(id: string) {
    if (!this.world) return;
    const d = this.world.dumplings.find((x) => x.def.id === id);
    if (!d) return;
    const collected = useGame.getState().collected[useGame.getState().levelIndex] ?? [];
    const occupied = this.world.dumplings
      .filter((x) => x.def.id !== id && !collected.includes(x.def.id))
      .map((x) => x.def.pos);
    // Somewhere authored to run to: every home and alternate spot, but never
    // back onto a spot she has already cleared (the home of a dumpling she has
    // collected, or where she found it). The alternates matter: each unfound
    // dumpling sits on its own home, so without them layout 0 has nowhere left.
    const spots = this.level.dumplings.flatMap((x) => [
      ...(collected.includes(x.id) ? [] : [x.pos]),
      ...(x.alts ?? []).map((a) => a.pos),
    ]);
    const cleared = [
      ...this.level.dumplings.filter((x) => collected.includes(x.id)).map((x) => x.pos),
      ...this.world.dumplings.filter((x) => collected.includes(x.def.id)).map((x) => x.def.pos),
    ];
    const next = pickFleePos(
      spots,
      cleared,
      occupied,
      this.cap.x,
      this.cap.z,
      d.def.pos,
      this.level.bounds,
      this.level.spawn,
    );
    this.burst(d.def.pos[0], d.def.pos[1], d.def.pos[2], d.def.color);
    d.def.pos[0] = next[0];
    d.def.pos[1] = next[1];
    d.def.pos[2] = next[2];
    d.def.hint = "It dashed to a new hiding spot. Follow hot and cold.";
    d.group.position.set(next[0], next[1], next[2]);
    d.spark.position.set(next[0], next[1] + 0.6, next[2]);
    d.beam.position.set(next[0], next[1] + 3, next[2]);
    d.spark.intensity = 0.8;
    (d.beam.material as THREE.MeshStandardMaterial).opacity = 0.28;
    this.highlighted = null;
    this.highlightUntil = 0;
  }

  /**
   * Splash pad. Ground jets fire in a chase around the rings (inner, then
   * outer), and standing on one as it fires launches her; the tipping bucket
   * fills for a while, tips, pours and rights itself, soaking anyone under
   * it; droplets circle the sprinkler flowers.
   */
  updateSplash(dt: number) {
    const s = this.world?.splash;
    const at = this.level.splash;
    if (!s || !at) return;
    const t = this.clock;
    const lx = this.cap.x - at.x;
    const lz = this.cap.z - at.z;
    const near = lx * lx + lz * lz < 30 * 30;
    const st = useGame.getState();
    const playing = st.phase === "playing" && !st.quiz && !st.rps && !st.carnival && !this.ride && !this.carouselRide;

    const PERIOD = 7;
    s.jets.forEach((j, i) => {
      const ph = (((t / PERIOD + j.def.phase) % 1) + 1) % 1;
      const k = ph < 0.05 ? ph / 0.05 : ph < 0.2 ? 1 : ph < 0.27 ? 1 - (ph - 0.2) / 0.07 : 0;
      const h = j.def.max * k * (1 + Math.sin(t * 15 + i) * 0.05);
      j.column.visible = k > 0.02;
      j.cap.visible = k > 0.02;
      if (k > 0.02) {
        j.column.scale.y = h;
        j.column.position.y = 0.08 + h / 2;
        j.cap.position.y = 0.08 + h;
        const puff = 0.3 + 0.12 * Math.sin(t * 20 + i);
        j.cap.scale.set(puff, puff * 0.6, puff);
      }
      j.cooldown = Math.max(0, j.cooldown - dt);
      if (playing && k > 0.6 && j.cooldown === 0 && this.grounded && this.cap.y < 0.4) {
        if (Math.hypot(lx - j.def.x, lz - j.def.z) < 0.75) {
          this.velY = GEYSER;
          this.grounded = false;
          this.coyote = 0;
          j.cooldown = 1.2;
          this.burst(this.cap.x, 0.2, this.cap.z, "#e2f6ff");
          sfx.splash(false);
          this.mood = "cheer";
          this.moodT = 1.2;
        }
      }
    });

    // bucket: 9s filling, tip over 0.6s, pour 1.4s, right itself over 1s
    const b = s.bucket;
    const cyc = ((t % 12) + 12) % 12;
    let tilt = 0;
    if (cyc < 9) tilt = Math.sin(t * 2.2) * 0.03;
    else if (cyc < 9.6) tilt = ((cyc - 9) / 0.6) * 2.1;
    else if (cyc < 11) tilt = 2.1;
    else tilt = 2.1 * (1 - (cyc - 11));
    b.pivot.rotation.z = -tilt;
    const pouring = cyc >= 9.5 && cyc < 11;
    b.sheet.visible = pouring;
    if (pouring) {
      const k = Math.min(1, (cyc - 9.5) / 0.25) * Math.min(1, (11 - cyc) / 0.3);
      b.sheet.scale.set(0.6 + 0.4 * k, 3.2, 0.6 + 0.4 * k);
    }
    if (pouring && !b.poured) {
      b.poured = true;
      if (near) sfx.splash(true);
      if (playing && Math.hypot(lx - b.pourX, lz - b.pourZ) < 1.9) {
        this.burst(this.cap.x, 1.2, this.cap.z, "#e2f6ff");
        this.burst(this.cap.x, 0.4, this.cap.z, "#bfe8f6");
        this.mood = "cheer";
        this.moodT = 1.6;
        st.setEmmettNotice("SPLASH! You got soaked!");
      }
    }
    if (!pouring) b.poured = false;

    // sprinkler droplets
    for (const sp of s.sprinklers) {
      sp.drops.forEach((d, i) => {
        const a = t * 2.6 + (i / sp.drops.length) * Math.PI * 2;
        const life = (((t * 1.3 + i / sp.drops.length) % 1) + 1) % 1;
        const r = 0.35 + life * 0.9;
        d.position.set(sp.x + Math.cos(a) * r, 1.8 + Math.sin(life * Math.PI) * 0.7 - life * 0.9, sp.z + Math.sin(a) * r);
      });
    }
  }

  /* ---------------------------------------------------------- carnival */

  carouselAngle = 0;
  carouselRide: {
    horse: number;
    turned: number;
    pass: number;
    inWindow: boolean;
    grabbed: boolean;
    missNoted: boolean;
  } | null = null;
  lastCarnival: BoothGame | null = null;
  /** seconds during which Collect will not reopen a booth that just closed */
  carnivalBlock = 0;

  /** Collect at the carnival: grab the ring while riding, open a booth, or board. */
  tryCarnival(): boolean {
    if (!this.world?.carnival) return false;
    const r = this.carouselRide;
    if (r) {
      if (r.inWindow && !r.grabbed) this.grabRing();
      return true;
    }
    if (this.carnivalBlock > 0) return false;
    const st = useGame.getState();
    const near = st.carnivalNear;
    if (!near) return false;
    if (near === "carousel") {
      this.boardCarousel();
    } else {
      sfx.click();
      st.openCarnival(near);
    }
    return true;
  }

  boardCarousel() {
    const rig = this.world?.carnival;
    if (!rig || this.carouselRide) return;
    // the horse nearest the gate, which is due south of the centre
    let best = 0;
    let bestD = Infinity;
    rig.horses.forEach((h, i) => {
      const a = (h.userData.angle as number) + this.carouselAngle;
      const d = Math.abs(wrapAngle(a + Math.PI / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.carouselRide = { horse: best, turned: 0, pass: 0, inWindow: false, grabbed: false, missNoted: false };
    this.velY = 0;
    this.speed = 0;
    sfx.click();
    const st = useGame.getState();
    st.setRiding(true);
    st.setEmmettNotice("Giddy up! Grab the gold ring as you ride past the arm.");
  }

  grabRing() {
    const r = this.carouselRide;
    const rig = this.world?.carnival;
    if (!r || !rig) return;
    r.grabbed = true;
    const st = useGame.getState();
    const gold = r.pass === CAROUSEL.goldPass;
    this.burst(rig.ring.position.x, rig.ring.position.y, rig.ring.position.z, gold ? "#ffd23a" : "#d8dde4");
    if (gold) {
      sfx.win();
      this.mood = "cheer";
      this.moodT = 2;
      st.addTickets(5);
      if (st.foundAccessories.includes("unicorn")) st.setEmmettNotice("Another gold ring! +5 tickets. You're a carousel champion.");
      else st.winPrize("unicorn");
    } else {
      sfx.correct();
      st.addTickets(1);
      st.setEmmettNotice("A silver ring! +1 ticket. Keep riding, the gold one is coming.");
    }
  }

  /**
   * The carousel turns slowly all the time and at ride speed while she is on
   * it. On a horse she is carried round; each time she passes the ring arm
   * there is a short window to grab its ring, which is gold on one pass.
   */
  updateCarousel(dt: number) {
    const rig = this.world?.carnival;
    if (!rig) return;
    const c = CAROUSEL;
    const r = this.carouselRide;
    const speed = (Math.PI * 2) / (r ? c.period : 24);
    this.carouselAngle += dt * speed;
    rig.spin.rotation.y = -this.carouselAngle;
    rig.horses.forEach((h, i) => {
      h.position.y = 1.35 + Math.sin(this.carouselAngle * 3 + i * 1.7) * 0.18;
    });
    const st = useGame.getState();
    if (!r) {
      rig.ring.material = rig.silver;
      rig.ring.visible = true;
      return;
    }
    r.turned += dt * speed;
    const h = rig.horses[r.horse]!;
    const a = (h.userData.angle as number) + this.carouselAngle;
    this.cap.x = c.x + Math.cos(a) * c.seatRadius;
    this.cap.z = c.z + Math.sin(a) * c.seatRadius;
    this.cap.y = h.position.y - 0.25;
    this.yaw = Math.PI - a;

    // about 1.2 seconds to grab each ring as she passes
    const inWin = Math.abs(wrapAngle(a - c.armAngle)) < CAROUSEL.grabHalfAngle;
    if (inWin && !r.inWindow) {
      r.pass++;
      r.grabbed = false;
    }
    if (!inWin && r.inWindow && r.pass === c.goldPass && !r.grabbed && !r.missNoted) {
      r.missNoted = true;
      st.setEmmettNotice("The gold ring got away! Ride again for another go.");
    }
    r.inWindow = inWin;
    const upcoming = inWin ? r.pass : r.pass + 1;
    rig.ring.material = upcoming === c.goldPass ? rig.gold : rig.silver;
    rig.ring.visible = !(inWin && r.grabbed);
    st.setCarouselRing(inWin && !r.grabbed ? (r.pass === c.goldPass ? "gold" : "silver") : null);

    if (r.turned >= c.laps * Math.PI * 2) {
      this.carouselRide = null;
      const [gx, gz] = carouselGate();
      this.cap.x = gx;
      this.cap.y = 0.05;
      this.cap.z = gz;
      this.yaw = Math.PI;
      st.setRiding(false);
      st.setCarouselRing(null);
      if (!r.missNoted) st.setEmmettNotice("What a ride!");
    }
  }

  /* ------------------------------------------------------------ iPod */

  /** Seconds on the current channel, and how far into a dance she is (0..1). */
  channelTime = 0;
  danceWeight = 0;
  lastChannelGen = -1;
  lastMusicGen = 0;

  /** Next channel: off, then each channel in turn, then off again. Plays whatever she is holding. */
  nextChannel() {
    const st = useGame.getState();
    const cur = currentChannel();
    const i = cur ? CHANNELS.findIndex((c) => c.id === cur) : -1;
    const next = i + 1 < CHANNELS.length ? CHANNELS[i + 1]!.id : null;
    unlockAudio();
    setChannel(next);
    st.setChannelPlaying(next);
  }

  /**
   * After a few seconds on a channel, standing still, she dances to it; walking
   * eases her out. Dance poses go on after animateGirl, and keep being applied
   * until the weight is back to zero so no joint is left mid-move.
   */
  updateDance(dt: number) {
    const st = useGame.getState();
    if (st.channelGen !== this.lastChannelGen) {
      this.lastChannelGen = st.channelGen;
      this.channelTime = 0;
    }
    // back on the title screen the music stops
    if (st.channel && st.phase === "title") {
      setChannel(null);
      st.setChannelPlaying(null);
    }
    this.channelTime += dt;
    const beat = beatInfo();
    const idle =
      !!st.channel &&
      !!beat &&
      this.channelTime > 3 &&
      this.speed < 0.3 &&
      this.grounded &&
      !this.ride &&
      !this.carouselRide &&
      st.phase === "playing" &&
      !st.quiz &&
      !st.rps &&
      !st.carnival &&
      !st.questPanel;
    this.danceWeight = THREE.MathUtils.clamp(this.danceWeight + (idle ? dt : -dt) / 0.4, 0, 1);
    if (this.danceWeight > 0 || this.danceYaw !== 0) {
      const id = (st.channel ?? this.lastDance) as DanceId;
      this.lastDance = id;
      const yaw = applyDance(this.girl, id, beat?.beat ?? 0, this.danceWeight);
      this.girl.rotation.y += yaw;
      this.danceYaw = this.danceWeight > 0 ? yaw : 0;
    }
  }
  lastDance: DanceId = "pop";
  danceYaw = 0;

  wasInCave = false;
  /** Inside the mountain cave's footprint, low enough to be in the tunnels. */
  inCave(): boolean {
    const z = this.level.caveZone;
    if (!z) return false;
    return this.cap.x > z.minX && this.cap.x < z.maxX && this.cap.z > z.minZ && this.cap.z < z.maxZ && this.cap.y < 7;
  }

  /** On the wheel's boarding spot and not already riding: Collect would board. */
  onBoardSpot(): boolean {
    const wheel = this.world?.ride;
    if (!wheel || this.ride) return false;
    const bx = wheel.origin.x + wheel.boardLocal.x;
    const bz = wheel.origin.z + wheel.boardLocal.z;
    return Math.hypot(this.cap.x - bx, this.cap.z - bz) <= 2.4 && this.cap.y <= 1.4;
  }

  /** Standing on the boarding platform and pressing Collect starts a ride. */
  tryBoard(): boolean {
    const wheel = this.world?.ride;
    if (!wheel || !this.onBoardSpot()) return false;
    // the gondola nearest the bottom of the wheel is the one she steps into
    let best = 0;
    let bestY = Infinity;
    wheel.gondolas.forEach((g, i) => {
      const a = (i / wheel.gondolas.length) * Math.PI * 2 + wheel.hub.rotation.z;
      const y = Math.sin(a);
      if (y < bestY) {
        bestY = y;
        best = i;
      }
    });
    this.ride = { gondola: best, turned: 0 };
    this.velY = 0;
    this.speed = 0;
    sfx.click();
    const st = useGame.getState();
    st.setRiding(true);
    st.setEmmettNotice("Wheee! Hold on tight!");
    return true;
  }

  /** Turns the wheel: slowly when idle, one full lap when she is aboard. */
  updateRide(dt: number) {
    const wheel = this.world?.ride;
    if (!wheel) return;
    const IDLE = (Math.PI * 2) / 140;
    const RIDE = (Math.PI * 2) / 42;
    if (this.ride) {
      const step = dt * RIDE;
      wheel.hub.rotation.z += step;
      this.ride.turned += step;
      levelGondolas(wheel);
      wheel.group.updateMatrixWorld(true);
      const g = wheel.gondolas[this.ride.gondola]!;
      g.getWorldPosition(this.rideSeat);
      this.cap.x = this.rideSeat.x;
      this.cap.y = this.rideSeat.y + (g.userData.seatY as number);
      this.cap.z = this.rideSeat.z;
      if (this.ride.turned >= Math.PI * 2) {
        // back at the bottom: step off onto the platform
        this.ride = null;
        this.cap.x = wheel.origin.x + wheel.boardLocal.x;
        this.cap.y = wheel.boardLocal.y + 0.01;
        this.cap.z = wheel.origin.z + wheel.boardLocal.z;
        const st = useGame.getState();
        st.setRiding(false);
        st.setEmmettNotice("What a view! Ride again any time.");
      }
    } else {
      wheel.hub.rotation.z += dt * IDLE;
      levelGondolas(wheel);
    }
  }

  emmettPlayedAt = -Infinity;
  /** At his truck while he's home: close to the talk spot, or close to him on his laps. */
  emmettTalkReady() {
    const e = this.emmett;
    if (!e || !this.level.emmettBase || e.state !== "home" || this.ride || this.carouselRide || this.cap.y > 2) return false;
    // while he is resting between games there is nothing to press
    if (this.clock - this.emmettPlayedAt < 40) return false;
    const [tx, , tz] = EMMETT_BASE.talkSpot;
    return (
      Math.hypot(this.cap.x - tx, this.cap.z - tz) < 2.4 ||
      Math.hypot(this.cap.x - e.group.position.x, this.cap.z - e.group.position.z) < 2.6
    );
  }

  tryCollect() {
    const st = useGame.getState();
    if (st.phase !== "playing") return;
    if (this.emmettTalkReady() && st.rps == null) {
      sfx.click();
      // a breather between games, so the truck isn't a ticket machine
      if (this.clock - this.emmettPlayedAt < 40) {
        const rest = [
          "Vroom! I'm fixing my truck. Come back soon to play!",
          "I need a snack break. Play again in a little bit!",
          "My truck is the best, right? Let's play again soon!",
        ];
        st.setEmmettNotice(rest[Math.floor(Math.random() * rest.length)]!);
        return;
      }
      this.emmettPlayedAt = this.clock;
      const lines = [
        "Welcome to my monster truck! Want to play?",
        "This is my house! Rock, paper, scissors?",
        "Vroom vroom! Best truck ever. Let's play!",
        "You found my truck! Play for tickets?",
      ];
      st.setEmmettNotice(lines[Math.floor(Math.random() * lines.length)]!);
      st.openRps(true);
      return;
    }
    const home = this.homeWorld?.tryInteract();
    if (home) {
      if (typeof home === "object") {
        [this.cap.x, this.cap.y, this.cap.z] = home.teleport;
        this.velY = 0;
        this.yaw = home.yaw;
        this.cameraYaw = home.yaw;
        this.syncCamera(true);
      }
      return;
    }
    if (this.questWorld?.tryInteract(this.cap.x, this.cap.y, this.cap.z)) return;
    if (this.tryCarnival()) return;
    if (this.tryBoard()) return;
    const d = this.nearestUnfound();
    if (!d) return;
    const dist = Math.hypot(
      d.def.pos[0] - this.cap.x,
      d.def.pos[1] - (this.cap.y + 0.8),
      d.def.pos[2] - this.cap.z,
    );
    if (dist > (this.ride ? RIDE_COLLECT_R : COLLECT_R)) return;
    const found = (st.collected[st.levelIndex] ?? []).length;
    st.openQuiz(d.def.id, makeQuestion(st.levelIndex, found));
  }

  /**
   * Confetti puffs. One shared geometry and one cached material per colour:
   * this used to allocate both per burst and never dispose them, and the catch
   * celebration bursts ~14 times a second, so every catch leaked a few hundred
   * GPU buffers for the browser to reclaim later, all at once.
   */
  private static puffGeo = new THREE.SphereGeometry(0.1, 6, 6);
  private static puffMats = new Map<string, THREE.MeshBasicMaterial>();
  private static readonly MAX_PUFFS = 220;

  burst(x: number, y: number, z: number, color: string) {
    const geo = GameRuntime.puffGeo;
    let mat = GameRuntime.puffMats.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      GameRuntime.puffMats.set(color, mat);
    }
    // never let a long celebration pile up thousands of live meshes
    while (this.puffs.length > GameRuntime.MAX_PUFFS - 14) {
      const old = this.puffs.shift()!;
      this.scene.remove(old.mesh);
    }
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 0.3, z);
      this.scene.add(mesh);
      this.puffs.push({
        mesh,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 4,
        life: 0.7 + Math.random() * 0.3,
      });
    }
  }

  private celebrateDir = new THREE.Vector3();

  onCollected(id: string) {
    if (!this.world) return;
    const d = this.world.dumplings.find((x) => x.def.id === id);
    if (!d) return;
    d.beam.visible = false;
    this.burst(d.def.pos[0], d.def.pos[1], d.def.pos[2], d.def.color);
    sfx.collect();
    this.mood = "cheer";
    this.moodT = 1.9;
    this.lastCatchClock = this.clock;

    // it floats up over her head, shows off its name, then shrinks into her
    this.celebrating = {
      d,
      t: 0,
      from: new THREE.Vector3(d.def.pos[0], d.def.pos[1], d.def.pos[2]),
    };
    useGame.getState().setCelebrate({
      name: d.def.name,
      color: d.def.color,
      accent: d.def.accent,
    });
  }

  /** Runs the catch celebration. Level completion waits until it finishes. */
  updateCelebration(dt: number) {
    const c = this.celebrating;
    if (!c) return;
    c.t += dt;

    const RISE = 0.55;
    const HOLD = 1.65;
    const END = 2.25;
    let headX = this.cap.x;
    let headZ = this.cap.z;
    let headY = this.cap.y + 2.6;
    let peak = 2.5;
    // where it shrinks away to at the end: into her in third person
    let endY = this.cap.y + 1.05;
    if (this.firstPerson) {
      // over her head is out of view in first person: show it off in front of
      // her eyes instead, a little below centre so the name card stays clear,
      // and tuck it down toward her hands at the end
      const fwd = this.camera.getWorldDirection(this.celebrateDir);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      fwd.normalize();
      headX = this.camera.position.x + fwd.x * 2.4;
      headZ = this.camera.position.z + fwd.z * 2.4;
      headY = this.camera.position.y - 0.15;
      endY = this.camera.position.y - 1.1;
      peak = 1.35;
    }
    const base = 1.28;

    const g = c.d.group;
    g.visible = true;
    c.d.spark.intensity = 0.9;

    if (c.t < RISE) {
      const k = c.t / RISE;
      const e = 1 - Math.pow(1 - k, 3);
      g.position.set(
        THREE.MathUtils.lerp(c.from.x, headX, e),
        THREE.MathUtils.lerp(c.from.y, headY, e) + Math.sin(k * Math.PI) * 0.7,
        THREE.MathUtils.lerp(c.from.z, headZ, e),
      );
      g.scale.setScalar(base * (1 + e * (peak - 1)));
      g.rotation.y += dt * 6;
    } else if (c.t < HOLD) {
      const k = (c.t - RISE) / (HOLD - RISE);
      g.position.set(headX, headY + Math.sin(k * Math.PI * 3) * 0.12, headZ);
      // a little squash-and-stretch pulse while it shows off
      g.scale.setScalar(base * (peak + Math.sin(k * Math.PI * 4) * 0.12));
      g.rotation.y += dt * 3.2;
      if (Math.random() < dt * 14) {
        this.burst(headX, headY, headZ, c.d.def.accent);
      }
    } else if (c.t < END) {
      const k = (c.t - HOLD) / (END - HOLD);
      const e = k * k;
      g.position.set(
        headX,
        THREE.MathUtils.lerp(headY, endY, e),
        headZ,
      );
      g.scale.setScalar(base * THREE.MathUtils.lerp(peak, 0.05, e));
      g.rotation.y += dt * (8 + k * 20);
    } else {
      // done: tuck it away and restore the handle for a possible rehide
      g.visible = false;
      c.d.spark.intensity = 0;
      g.scale.setScalar(base);
      g.rotation.y = 0;
      g.position.set(c.d.def.pos[0], c.d.def.pos[1], c.d.def.pos[2]);
      this.burst(headX, endY, headZ, c.d.def.color);
      this.celebrating = null;

      const st = useGame.getState();
      st.setCelebrate(null);
      const have = (st.collected[st.levelIndex] ?? []).length;
      if (have >= this.level.dumplings.length) {
        sfx.win();
        st.completeLevel();
      }
    }

    c.d.spark.position.set(g.position.x, g.position.y + 0.3, g.position.z);
  }

  /** Test hook: a fixed camera for inspecting a spot (see __gameTest.lookAt). */
  camOverride: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  syncCamera(snap = false) {
    if (this.camOverride) {
      this.camera.position.copy(this.camOverride.pos);
      this.camera.lookAt(this.camOverride.target);
      return;
    }
    const title = useGame.getState().phase === "title";
    const desired = this.camPos;
    if (this.ride && this.world?.ride) {
      // On the wheel the normal boom would sit inside the rim looking through
      // the spokes. Watch from the platform side instead, rising with her.
      const w = this.world.ride;
      desired.set(w.origin.x + 2.5, this.cap.y + 3.0, w.origin.z + 14.5);
    } else if (this.carouselRide) {
      // watch the carousel go round from outside the fence, by the ring arm
      desired.set(CAROUSEL.x + 10, 5, CAROUSEL.z - 11);
    } else if (this.firstPerson && !title) {
      // eyes: a touch forward of the capsule centre, with a little walk bob
      const pace = THREE.MathUtils.clamp(this.speed / WALK, 0, 1.6);
      const bob = Math.sin(this.clock * 9.5) * 0.02 * pace;
      this.fpDir.set(-Math.sin(this.cameraYaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.cameraYaw) * Math.cos(this.pitch));
      desired.set(this.cap.x - Math.sin(this.cameraYaw) * 0.1, this.cap.y + 1.42 + bob, this.cap.z - Math.cos(this.cameraYaw) * 0.1);
      this.camera.position.copy(desired);
      this.lookAt.copy(desired).add(this.fpDir);
      this.camera.lookAt(this.lookAt);
      return;
    } else {
      // Placement lives in camera.ts so tools/camera.ts can walk routes with it.
      const res = placeCamera(
        {
          boxes: this.world?.colliders ?? [],
          cap: this.cap,
          cameraYaw: this.cameraYaw,
          indoor: this.indoor,
          title,
          snap,
          dt: FIXED,
        },
        desired,
      );
      this.indoor = res.indoor;
    }

    if (snap) this.camera.position.copy(desired);
    else {
      // ease in faster than out, so pushing past a pillar does not lurch
      const closer = desired.distanceTo(this.camera.position) > 0 &&
        desired.distanceToSquared(this.lookAt) < this.camera.position.distanceToSquared(this.lookAt);
      const rate = closer ? 11 : 5.2;
      const k = 1 - Math.exp(-rate * FIXED);
      this.camera.position.lerp(desired, k);
    }
    this.lookAt.set(
      this.cap.x,
      this.cap.y + (title ? 0.2 : THREE.MathUtils.lerp(1.25, 1.0, this.indoor)),
      this.cap.z,
    );
    this.camera.lookAt(this.lookAt);
  }

  physics(dt: number) {
    const st = useGame.getState();
    const qa = Boolean(window.__controlsTest && (isDown("KeyW") || isDown("KeyA") || isDown("KeyD") || isDown("KeyS")));
    // rock paper scissors freezes her in place, like the quiz does
    const live =
      // the journal takes the stick for turning pages, so she stands still
      ((st.phase === "playing" &&
        st.rps == null &&
        st.carnival == null &&
        st.questPanel == null &&
        st.helpCard == null &&
        useHome.getState().panel == null &&
        !st.journalOpen) ||
        (st.phase === "title" && qa)) &&
      !this.ride &&
      !this.carouselRide;
    if (!live) {
      consumeJumpTap();
      this.jumpBuffer = 0;
    }

    const lookDelta = consumeLook();
    if (st.phase === "title" && !qa) {
      this.cameraYaw += dt * 0.18;
    } else {
      this.cameraYaw -= lookDelta.dx * 0.0055;
      // E is Collect, so the camera turns right on C (input.ts records every
      // key in isDown; GAME_CODES only decides which ones preventDefault)
      if (camLeftHeld()) this.cameraYaw += dt * 1.6;
      if (camRightHeld()) this.cameraYaw -= dt * 1.6;
      if (this.firstPerson) {
        this.pitch = THREE.MathUtils.clamp(this.pitch - lookDelta.dy * 0.0045, -1.15, 1.0);
      }
    }

    const axes = getMoveAxes();
    pollGamepad(axes);

    this.fwd.set(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    this.right.set(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
    this.wish.set(0, 0, 0);
    if (live) {
      this.wish.addScaledVector(this.fwd, axes.z);
      this.wish.addScaledVector(this.right, axes.x);
    }
    const wishLen = this.wish.length();
    if (wishLen > 1) this.wish.multiplyScalar(1 / wishLen);

    if (this.firstPerson) {
      // she faces wherever the camera looks; strafing does not turn her
      this.yaw = this.cameraYaw;
    } else if (wishLen > 0.05) {
      const targetYaw = Math.atan2(-this.wish.x, -this.wish.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = 1 - Math.exp(-14 * dt);
      this.yaw += diff * turn;
    }

    // how hard she is turning, smoothed, for the lean
    let dy = this.yaw - this.lastYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.lastYaw = this.yaw;
    const instant = dt > 0 ? THREE.MathUtils.clamp(dy / dt / 3.2, -1, 1) : 0;
    this.turnRate = THREE.MathUtils.lerp(this.turnRate, instant, 0.18);

    let vx = 0;
    let vz = 0;
    const inWater = (this.level.water ?? []).some((w) =>
      inCircle(this.cap.x, this.cap.z, w.x, w.z, w.r),
    );
    const speedMul = (inWater ? 0.48 : 1) * (this.boostLeft > 0 ? BOOST_MULTIPLIER : 1);
    if (wishLen > 0.05) {
      vx = this.wish.x * WALK * speedMul;
      vz = this.wish.z * WALK * speedMul;
    }
    this.speed = Math.hypot(vx, vz);

    if (this.grounded) this.coyote = 0.12;
    else this.coyote = Math.max(0, this.coyote - dt);

    // No-jump zones: the hedge maze is 1.7m and she jumps 2.7m, so without
    // this she hops onto the hedges and walks over the puzzle.
    const noJump = this.level.noJump?.some(
      (z) => this.cap.x >= z.minX && this.cap.x <= z.maxX && this.cap.z >= z.minZ && this.cap.z <= z.maxZ,
    );
    const tap = live && consumeJumpTap();
    // a tap a moment before she lands still counts, so she can hop again the
    // instant her feet touch down instead of the press being swallowed mid-air
    this.jumpBuffer = tap ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    const jump = this.jumpBuffer > 0 && !noJump;
    // a tap just before landing on a trampoline turns the bounce into a big one
    this.bounceBuffer = tap ? 0.35 : Math.max(0, this.bounceBuffer - dt);
    if (jump && this.coyote > 0) {
      this.velY = JUMP;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      sfx.jump();
    }

    if (this.ride || this.carouselRide) {
      // the wheel or the carousel carries her; their updates set the capsule
      this.velY = 0;
      this.grounded = true;
      this.speed = 0;
    } else {
      this.velY -= GRAVITY * dt;
      const moved = moveAndCollide(
        this.cap,
        vx,
        this.velY,
        vz,
        this.world?.colliders ?? [],
        dt,
        this.level.groundY,
      );
      this.velY = moved.vy;
      this.grounded = moved.grounded;
      // trampolines: landing on the mat launches her again
      if (this.grounded && Math.abs(this.cap.y - TRAMPOLINE_TOP) < 0.08) {
        const onMat = this.world?.bouncers.some(
          (b) => this.cap.x >= b.minX && this.cap.x <= b.maxX && this.cap.z >= b.minZ && this.cap.z <= b.maxZ,
        );
        if (onMat) {
          const big = this.bounceBuffer > 0;
          this.velY = big ? SUPER_BOUNCE : BOUNCE;
          this.grounded = false;
          this.coyote = 0;
          this.bounceBuffer = 0;
          sfx.boing(big);
        }
      }
    }

    this.sun.position.set(this.cap.x + 24, 48, this.cap.z + 14);
    this.sun.target.position.set(this.cap.x, 1, this.cap.z);
    this.sun.target.updateMatrixWorld();
    this.blob.position.set(this.cap.x, this.cap.y + 0.03, this.cap.z);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = this.grounded ? 0.22 : 0.08;

    const b = this.level.bounds;
    this.cap.x = Math.min(b.maxX, Math.max(b.minX, this.cap.x));
    this.cap.z = Math.min(b.maxZ, Math.max(b.minZ, this.cap.z));

    if (this.level.voidY != null && this.cap.y < this.level.voidY) {
      this.cap.x = this.level.spawn[0];
      this.cap.y = this.level.spawn[1] + 0.4;
      this.cap.z = this.level.spawn[2];
      this.velY = 0;
    }

    this.girl.position.set(this.cap.x, this.cap.y, this.cap.z);
    this.girl.rotation.y =
      st.phase === "title" && !qa ? this.cameraYaw : this.yaw + Math.PI;
    if (this.moodT > 0) {
      this.moodT -= dt;
      if (this.moodT <= 0) this.mood = "none";
    }
    // running on a juice box is its own posture, but only while actually moving
    const mood: GirlMood =
      this.mood !== "none" ? this.mood : this.boostLeft > 0 && this.speed > 2 ? "boost" : "none";
    const moodT = this.mood !== "none" ? this.moodT : 1;

    animateGirl(this.girl, this.speed > 0.4 && this.grounded, this.grounded, this.clock, dt, {
      speed01: THREE.MathUtils.clamp(this.speed / 6.4, 0, 1.6),
      turn: this.turnRate,
      mood,
      moodT,
    });

    this.updateDance(dt);

    // held items: the balloon floats steady above her rather than whipping
    // round with her arm swing, and the pinwheel spins faster as she runs
    {
      const arm = this.girl.userData.rightArm as THREE.Group | undefined;
      if (arm) {
        for (const grip of arm.children) {
          const held = grip.userData.accessory;
          if (!held) continue;
          if (held === "balloon") {
            grip.rotation.x = -arm.rotation.x * 0.85;
            grip.rotation.z = -arm.rotation.z * 0.85;
          } else if (held === "pinwheel") {
            grip.traverse((o) => {
              if (o.userData.spin) o.rotation.z += dt * (1.5 + this.speed * 2.2);
            });
          }
        }
      }
    }

    if (this.speed > 1 && this.grounded) {
      this.stepT += dt;
      if (this.stepT > 0.34) {
        this.stepT = 0;
        sfx.step();
      }
    }

    this.syncCamera(false);
    this.sun.position.set(this.cap.x + 28, 42, this.cap.z + 16);
    this.sun.target.position.set(this.cap.x, 0, this.cap.z);
    this.sun.target.updateMatrixWorld();
  }

  animateWorld(dt: number) {
    if (!this.world) return;
    const collected = useGame.getState().collected[useGame.getState().levelIndex] ?? [];
    for (const d of this.world.dumplings) {
      if (!d.group.visible) {
        d.spark.intensity = 0;
        continue;
      }
      if (d.face) {
        // glance toward her, offset by the group's own spin so the face keeps
        // pointing the right way while the body turns
        const dx = this.cap.x - d.group.position.x;
        const dz = this.cap.z - d.group.position.z;
        const near = dx * dx + dz * dz < 900;
        const look = near ? Math.atan2(dx, dz) - d.group.rotation.y : null;
        animateFace(d.face, this.clock, d.phase, this.celebrating?.d === d, look);
      }
      if (this.celebrating?.d === d) {
        d.finish.update(this.clock);
        continue;
      }
      d.group.position.y = d.def.pos[1] + Math.sin(this.clock * 2.3 + d.phase) * 0.1;
      d.finish.update(this.clock);
      d.group.rotation.y += dt * 0.7;
      const dx = d.def.pos[0] - this.cap.x;
      const dz = d.def.pos[2] - this.cap.z;
      const dist = Math.hypot(dx, dz);
      const easy = d.def.hide === "easy";
      const mid = d.def.hide === "medium";
      const sparkleRange = easy ? 28 : mid ? 11 : 4.5;
      const highlighted = this.highlighted === d && this.clock < this.highlightUntil;
      d.spark.position.copy(d.group.position);
      d.spark.position.y += 0.55;
      d.spark.intensity = highlighted ? 2.4 : 0.7;
      const beamMat = d.beam.material as THREE.MeshStandardMaterial;
      d.beam.visible = highlighted;
      beamMat.opacity = highlighted ? 0.5 : 0;
      if (collected.includes(d.def.id)) d.group.visible = false;
    }
    if (this.highlighted && this.clock > this.highlightUntil) {
      this.highlighted = null;
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.life -= dt;
      p.vy -= 6 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.max(0.01, p.life));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.puffs.splice(i, 1);
      }
    }

    for (const mat of this.world.waterMats) {
      mat.uniforms.uTime.value = this.clock;
    }
    // splash pad arches spray in sequence: each arch on for a beat in turn
    if (this.world.spray) {
      const arches = this.world.spray.columns;
      const period = 2.2;
      for (let a = 0; a < arches.length; a++) {
        const phase = ((this.clock / period + a / arches.length) % 1 + 1) % 1;
        const on = phase < 0.55 ? 1 : Math.max(0.08, 1 - (phase - 0.55) / 0.15);
        const wobble = 1 + Math.sin(this.clock * 9 + a) * 0.06;
        for (const c of arches[a]!) {
          c.scale.y = 3.0 * on * wobble;
          c.position.y = 3.35 - (3.0 * on * wobble) / 2;
        }
      }
    }
    this.updateSplash(dt);
    {
      const st = useGame.getState();
      const paused =
        st.phase !== "playing" || !!st.quiz || !!st.rps || !!st.carnival || !!st.questPanel || !!st.helpCard || st.journalOpen || useHome.getState().panel != null;
      if (this.stickerWorld) this.stickerWorld.update(dt, this.clock, { x: this.cap.x, y: this.cap.y, z: this.cap.z, paused });
      this.homeWorld?.update(this.clock, { x: this.cap.x, y: this.cap.y, z: this.cap.z });
      if (this.questWorld) {
        const d = this.nearestUnfound();
        this.questWorld.update(
          dt,
          this.clock,
          {
            x: this.cap.x,
            y: this.cap.y,
            z: this.cap.z,
            yaw: this.yaw,
            speed: this.speed,
            carried: !!this.ride || !!this.carouselRide,
            paused,
          },
          this.world.colliders,
          this.level.groundY,
          d ? { id: d.def.id, x: d.def.pos[0], z: d.def.pos[2] } : null,
        );
      }
    }
    if (this.world.truck) {
      const e = this.emmett;
      const excited = !!e && e.state === "home" && Math.hypot(this.cap.x - EMMETT_BASE.x, this.cap.z - EMMETT_BASE.z) < 14;
      animateMonsterTruck(this.world.truck, this.clock, excited);
    }
    if (this.world.campfire) {
      const f = this.world.campfire;
      for (let i = 0; i < f.flames.length; i++) {
        const fl = f.flames[i]!;
        const s = 1 + Math.sin(this.clock * (7 + i * 2.3) + i) * 0.16;
        fl.scale.y = (0.9 - i * 0.15) * s;
        fl.rotation.y += dt * (1.5 + i);
      }
      f.light.intensity = 1.2 + Math.sin(this.clock * 11) * 0.25 + Math.sin(this.clock * 5.3) * 0.15;
    }
    if (this.world?.grassField) {
      this.world.grassField.update(this.clock);
    }

    if (this.boostLeft > 0) {
      this.boostLeft = Math.max(0, this.boostLeft - dt);
      const st = useGame.getState();
      // only push whole seconds into the store so the HUD is not re-rendering constantly
      const shown = Math.ceil(this.boostLeft);
      if (shown !== Math.ceil(st.boostLeft)) st.setBoost(this.boostLeft);
      if (this.boostLeft === 0) st.setBoost(0);
      if (this.speed > 0.4 && Math.random() < dt * 22) {
        this.burst(this.cap.x, 0.15, this.cap.z, "#ffe08a");
      }
    }
    this.updateJuice(dt);
    this.updatePickups(dt);
    this.updateRide(dt);
    this.updateCarousel(dt);
    this.updateEmmett(dt);
    this.updateCelebration(dt);

    // run clock: stops for the quiz, rock paper scissors and the pause menu,
    // and only whole seconds reach the store so the HUD is not re-rendering
    {
      const st = useGame.getState();
      const ticking =
        st.runActive &&
        st.phase === "playing" &&
        st.quiz == null &&
        st.rps == null &&
        st.carnival == null &&
        st.questPanel == null &&
        st.helpCard == null &&
        !st.riding;
      if (ticking) {
        this.runAccum += dt;
        if (Math.floor(this.runAccum) !== Math.floor(st.runSeconds)) {
          st.addRunTime(Math.floor(this.runAccum));
        }
      } else if (!st.runActive) {
        this.runAccum = st.runSeconds;
      }
    }
    this.publishPose();

    this.world.group.traverse((obj) => {
      if (obj.userData.cloudDrift) {
        obj.position.x += Math.sin(this.clock * 0.15 + obj.position.z) * dt * 0.15;
      }
    });
  }

  hud(dt: number) {
    this.hudT += dt;
    if (this.hudT < 0.12) return;
    this.hudT = 0;
    // near the wheel's platform and not riding: show how to ride
    {
      const w = this.world?.ride;
      const near =
        !!w &&
        !this.ride &&
        Math.hypot(this.cap.x - (w.origin.x + w.boardLocal.x), this.cap.z - (w.origin.z + w.boardLocal.z)) < 9 &&
        this.cap.y < 2;
      useGame.getState().setRideNear(near);
      useGame.getState().setBoardReady(this.onBoardSpot());
    }
    // at a carnival booth's counter, or the carousel gate
    {
      let near: BoothGame | "carousel" | null = null;
      if (this.world?.carnival && !this.carouselRide && !this.ride && this.cap.y < 1.2) {
        for (const b of BOOTHS) {
          const [sx, sz] = boothStand(b);
          if (Math.hypot(this.cap.x - sx, this.cap.z - sz) < 1.9) near = b.game;
        }
        const [gx, gz] = carouselGate();
        if (Math.hypot(this.cap.x - gx, this.cap.z - gz) < 2.1) near = "carousel";
      }
      useGame.getState().setCarnivalNear(near);
      // the first walk into the carnival explains it
      if (this.world?.carnival && Math.hypot(this.cap.x - CAROUSEL.x, this.cap.z - (CAROUSEL.z + 4)) < 15) {
        useGame.getState().showHelp("carnival");
      }
      useGame
        .getState()
        .setQuestNear(this.questWorld && !this.carouselRide && !this.ride ? this.questWorld.near(this.cap.x, this.cap.y, this.cap.z) : null);
      useGame.getState().setEmmettTalkNear(this.emmettTalkReady());
    }
    const d = this.nearestUnfound();
    if (!d) {
      useGame.getState().setHud({
        temp: "burning",
        nearestName: null,
        nearestDist: 0,
        nearCollect: false,
      });
      return;
    }
    const distXZ = Math.hypot(d.def.pos[0] - this.cap.x, d.def.pos[2] - this.cap.z);
    const dist3 = Math.hypot(
      d.def.pos[0] - this.cap.x,
      d.def.pos[1] - (this.cap.y + 0.8),
      d.def.pos[2] - this.cap.z,
    );
    useGame.getState().setHud({
      // height counts once it is more than a step-up away, or standing under
      // the ferris wheel dumpling reads "burning" from the ground
      temp: tempFromDist(Math.max(distXZ, Math.abs(d.def.pos[1] - this.cap.y) > 1.6 ? dist3 : 0)),
      nearestName: d.def.name,
      nearestDist: distXZ,
      nearCollect: dist3 <= (this.ride ? RIDE_COLLECT_R : COLLECT_R),
    });
  }

  frame(now: number) {
    if (this.disposed) return;
    const workStart = performance.now();
    // wall time since the previous frame, unclamped: this is what a freeze
    // looks like from the player's chair, whatever caused it
    const frameMs = this.last ? now - this.last : 0;
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.clock += raw;

    const st = useGame.getState();
    if (st.graphics !== this.graphics) this.applyGraphics(st.graphics);
    if (st.levelIndex !== this.lastLevel) this.loadLevel(st.levelIndex);
    if (st.dress !== this.lastDress || st.hair !== this.lastHair) this.rebuildGirl();
    if (st.wornGen !== this.lastWornGen) {
      this.lastWornGen = st.wornGen;
      applyWorn(this.girl, st.worn);
    }
    if (st.interactGen !== this.lastInteract) {
      this.lastInteract = st.interactGen;
      this.tryCollect();
    }
    if (st.hintGen !== this.lastHint) {
      this.lastHint = st.hintGen;
      this.applyHint();
    }
    if (st.fleeGen !== this.lastFlee) {
      this.lastFlee = st.fleeGen;
      if (st.fleeId) this.relocateDumpling(st.fleeId);
    }
    if (st.carnival !== this.lastCarnival) {
      if (!st.carnival) this.carnivalBlock = 0.6;
      this.lastCarnival = st.carnival;
    }
    this.carnivalBlock = Math.max(0, this.carnivalBlock - FIXED);
    // while a panel is open its own keys and buttons are for the panel: none of
    // these play actions (collect, pause, map, journal...) may fire behind it
    const panel =
      st.quiz != null ||
      st.rps != null ||
      st.carnival != null ||
      st.questPanel != null ||
      st.helpCard != null ||
      st.journalOpen ||
      useHome.getState().panel != null;
    const play = st.phase === "playing" && !panel;
    if (play && (wantsInteract() || consumePadInteract())) this.tryCollect();
    else consumePadInteract();

    const pauseEdge = consumePadPause();
    if (play && pauseEdge) st.pause();
    else if (st.phase === "paused" && pauseEdge) st.resumePlay();

    if (play && consumePadHint()) st.useHint();
    else consumePadHint();
    if (st.phase === "playing" && !panel && consumePadJournal()) st.toggleJournal();
    else consumePadJournal();
    if (play && consumePadMap()) st.toggleMap();
    else consumePadMap();
    if (st.musicGen !== this.lastMusicGen) {
      this.lastMusicGen = st.musicGen;
      if (st.phase === "playing") this.nextChannel();
    }
    if (play && consumePadMusic()) this.nextChannel();
    else consumePadMusic();
    if (play && consumePadView()) st.toggleView();
    else consumePadView();
    // Inside the mountain's tunnels the view is always first person, whatever
    // is saved; stepping back out restores her own choice.
    const inCave = this.inCave();
    if (inCave && !this.wasInCave && st.phase === "playing" && st.view !== "first") {
      st.setEmmettNotice("Into the cave! Look around to explore.");
    }
    this.wasInCave = inCave;
    // her house's room is small too: third person would jam against the walls
    this.setFirstPerson((st.view === "first" || inCave || useHome.getState().inside) && st.phase !== "title");

    const collectedNow = st.collected[st.levelIndex] ?? [];
    if (this.world) {
      for (const d of this.world.dumplings) {
        const got = collectedNow.includes(d.def.id);
        // the one mid-celebration is still visible on purpose, so do not
        // re-trigger it every frame
        if (got && d.group.visible && this.celebrating?.d !== d) this.onCollected(d.def.id);
        const hidden = this.stolenId === d.def.id && this.clock < this.stolenUntil;
        if (!got && !d.group.visible && !hidden) {
          d.group.visible = true;
          d.spark.intensity = 0.7;
          d.beam.visible = true;
          if (this.stolenId === d.def.id) this.stolenId = null;
        }
      }
    }

    this.acc += raw;
    let steps = 0;
    while (this.acc >= FIXED && steps < 5) {
      this.physics(FIXED);
      this.acc -= FIXED;
      steps++;
    }
    this.animateWorld(raw);
    this.hud(raw);
    const carried = this.ride || this.carouselRide;
    if (this.firstPerson && !carried) this.updateHands();
    else this.hands.group.visible = false;
    if (this.firstPerson && !carried) this.hands.group.visible = true;
    // Roblox has no outlines; the bevel highlight does the edge definition now
    this.renderFrame();

    perf.calls = this.renderer.info.render.calls;
    perf.triangles = this.renderer.info.render.triangles;
    perf.puffs = this.puffs.length;
    recordFrame(now, frameMs, performance.now() - workStart, () => {
      const s = useGame.getState();
      const sinceCatch = this.lastCatchClock >= 0 ? `${(this.clock - this.lastCatchClock).toFixed(1)}s after catch` : "no catch yet";
      return `${s.phase}${s.quiz ? " quiz" : ""}${s.rps ? " rps" : ""}, ${sinceCatch}, celebrating=${this.celebrating ? "yes" : "no"}, puffs=${this.puffs.length}, emmett=${this.emmett?.state ?? "none"}`;
    });
  }
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getGirlRot: () => number;
      getCamYaw: () => number;
      setKeys: (codes: string[]) => void;
    };
    __gameTest?: {
      teleport: (x: number, y: number, z: number) => void;
      getPos: () => { x: number; y: number; z: number };
      nearest: () => string | null;
      renderOnce: (sync?: boolean) => number;
      info: () => {
        calls: number;
        triangles: number;
        geometries: number;
        textures: number;
        programs: number;
        graphics: "sharp" | "smooth" | null;
        bloom: boolean;
        samples: number;
        shadowMapSize: number;
        pixelRatio: number;
        size: number[];
      };
      setPixelRatio: (r: number) => void;
      setShadows: (on: boolean, mapSize?: number) => void;
      scene: () => THREE.Scene;
      lookAt: (pos: [number, number, number] | null, target?: [number, number, number]) => void;
      setBloom: (on: boolean, strength?: number) => void;
      frames: (n: number, dtMs?: number) => number[];
      store: () => typeof useGame;
    };
  }
}
