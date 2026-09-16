import * as THREE from "three";
import { placeCamera } from "./camera";
import { perf, recordFrame } from "./debug";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { animateGirl, makeGirl, makeSky } from "./meshes";
import { buildWorld, disposeWorld, type BuiltWorld, type DumplingHandle } from "./world-build";
import {
  bindInput,
  clearInjectedKeys,
  consumeJumpTap,
  consumeLook,
  consumePadHint,
  consumePadInteract,
  consumePadJournal,
  consumePadMap,
  consumePadPause,
  getMoveAxes,
  isDown,
  look,
  padCamLeft,
  padCamRight,
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

import { GRAVITY, JUMP, PLAYER_H, PLAYER_W, WALK } from "./tuning";
const FIXED = 1 / 60;
const COLLECT_R = 2.15;

function pickFleePos(
  homes: [number, number, number][],
  occupied: [number, number, number][],
  playerX: number,
  playerZ: number,
  current: [number, number, number],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): [number, number, number] {
  const order = homes.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const i of order) {
    const h = homes[i]!;
    const x = h[0] + (Math.random() - 0.5) * 5;
    const z = h[2] + (Math.random() - 0.5) * 5;
    if (Math.hypot(x - playerX, z - playerZ) < 16) continue;
    if (Math.hypot(x - current[0], z - current[2]) < 12) continue;
    if (occupied.some((o) => Math.hypot(x - o[0], z - o[2]) < 4.5)) continue;
    const cx = Math.min(bounds.maxX - 3, Math.max(bounds.minX + 3, x));
    const cz = Math.min(bounds.maxZ - 3, Math.max(bounds.minZ + 3, z));
    return [cx, h[1], cz];
  }
  let best = current;
  let bestD = -1;
  for (const h of homes) {
    const dist = Math.hypot(h[0] - playerX, h[2] - playerZ);
    if (dist > bestD) {
      bestD = dist;
      best = h;
    }
  }
  return [best[0], best[1], best[2]];
}

type Puff = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number };

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
    this.resize();
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
      d.spark.visible = !got;
      // no permanent sky beam; the shaft is a hint-only effect now
      d.beam.visible = false;
    }
    resetPose();
    this.runAccum = useGame.getState().runSeconds;
    this.spawnJuice();
    if (this.emmett) this.emmett.dispose(this.scene);
    this.emmett = new Emmett(this.scene, this.level.bounds, this.level.emmettKeepOut ?? []);
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
    const busy = st.phase !== "playing" || st.quiz != null || st.rps != null;

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
        if (rps.result === "win") {
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
    d.spark.visible = false;
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
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.disposed = true;
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
    const homes = this.level.dumplings.map((x) => x.pos);
    const next = pickFleePos(
      homes,
      occupied,
      this.cap.x,
      this.cap.z,
      d.def.pos,
      this.level.bounds,
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

  tryCollect() {
    const st = useGame.getState();
    if (st.phase !== "playing") return;
    const d = this.nearestUnfound();
    if (!d) return;
    const dist = Math.hypot(
      d.def.pos[0] - this.cap.x,
      d.def.pos[1] - (this.cap.y + 0.8),
      d.def.pos[2] - this.cap.z,
    );
    if (dist > COLLECT_R) return;
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
    const headX = this.cap.x;
    const headZ = this.cap.z;
    const headY = this.cap.y + 2.6;
    const base = 1.28;

    const g = c.d.group;
    g.visible = true;
    c.d.spark.visible = true;

    if (c.t < RISE) {
      const k = c.t / RISE;
      const e = 1 - Math.pow(1 - k, 3);
      g.position.set(
        THREE.MathUtils.lerp(c.from.x, headX, e),
        THREE.MathUtils.lerp(c.from.y, headY, e) + Math.sin(k * Math.PI) * 0.7,
        THREE.MathUtils.lerp(c.from.z, headZ, e),
      );
      g.scale.setScalar(base * (1 + e * 1.5));
      g.rotation.y += dt * 6;
    } else if (c.t < HOLD) {
      const k = (c.t - RISE) / (HOLD - RISE);
      g.position.set(headX, headY + Math.sin(k * Math.PI * 3) * 0.12, headZ);
      // a little squash-and-stretch pulse while it shows off
      g.scale.setScalar(base * (2.5 + Math.sin(k * Math.PI * 4) * 0.12));
      g.rotation.y += dt * 3.2;
      if (Math.random() < dt * 14) {
        this.burst(headX, headY, headZ, c.d.def.accent);
      }
    } else if (c.t < END) {
      const k = (c.t - HOLD) / (END - HOLD);
      const e = k * k;
      g.position.set(
        headX,
        THREE.MathUtils.lerp(headY, this.cap.y + 1.05, e),
        headZ,
      );
      g.scale.setScalar(base * THREE.MathUtils.lerp(2.5, 0.05, e));
      g.rotation.y += dt * (8 + k * 20);
    } else {
      // done: tuck it away and restore the handle for a possible rehide
      g.visible = false;
      c.d.spark.visible = false;
      g.scale.setScalar(base);
      g.rotation.y = 0;
      g.position.set(c.d.def.pos[0], c.d.def.pos[1], c.d.def.pos[2]);
      this.burst(headX, this.cap.y + 1.05, headZ, c.d.def.color);
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

  syncCamera(snap = false) {
    const title = useGame.getState().phase === "title";
    const desired = this.camPos;
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
    const live = (st.phase === "playing" && st.rps == null) || (st.phase === "title" && qa);
    if (!live) consumeJumpTap();

    const lookDelta = consumeLook();
    if (st.phase === "title" && !qa) {
      this.cameraYaw += dt * 0.18;
    } else {
      this.cameraYaw -= lookDelta.dx * 0.0055;
      if (isDown("KeyQ") || padCamLeft()) this.cameraYaw += dt * 1.6;
      if (isDown("KeyE") || padCamRight()) this.cameraYaw -= dt * 1.6;
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

    if (wishLen > 0.05) {
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
    const jump = live && consumeJumpTap() && !noJump;
    if (jump && this.coyote > 0) {
      this.velY = JUMP;
      this.grounded = false;
      this.coyote = 0;
      sfx.jump();
    }

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
      if (!d.group.visible) continue;
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
    this.updateEmmett(dt);
    this.updateCelebration(dt);

    // run clock: stops for the quiz, rock paper scissors and the pause menu,
    // and only whole seconds reach the store so the HUD is not re-rendering
    {
      const st = useGame.getState();
      const ticking =
        st.runActive && st.phase === "playing" && st.quiz == null && st.rps == null;
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
      temp: tempFromDist(distXZ),
      nearestName: d.def.name,
      nearestDist: distXZ,
      nearCollect: dist3 <= COLLECT_R,
    });
  }

  frame(now: number) {
    if (this.disposed) return;
    // wall time since the previous frame, unclamped: this is what a freeze
    // looks like from the player's chair, whatever caused it
    const frameMs = this.last ? now - this.last : 0;
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.clock += raw;

    const st = useGame.getState();
    if (st.levelIndex !== this.lastLevel) this.loadLevel(st.levelIndex);
    if (st.dress !== this.lastDress || st.hair !== this.lastHair) this.rebuildGirl();
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
    if (st.phase === "playing" && (wantsInteract() || consumePadInteract())) this.tryCollect();
    else consumePadInteract();

    const pauseEdge = consumePadPause();
    if (st.phase === "playing" && (isDown("Escape") || pauseEdge)) st.pause();
    else if (st.phase === "paused" && pauseEdge) st.resumePlay();

    if (st.phase === "playing" && consumePadHint()) st.useHint();
    else consumePadHint();
    if (st.phase === "playing" && consumePadJournal()) st.toggleJournal();
    else consumePadJournal();
    if (st.phase === "playing" && consumePadMap()) st.toggleMap();
    else consumePadMap();

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
          d.spark.visible = true;
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
    // Roblox has no outlines; the bevel highlight does the edge definition now
    this.renderFrame();

    perf.calls = this.renderer.info.render.calls;
    perf.triangles = this.renderer.info.render.triangles;
    perf.puffs = this.puffs.length;
    recordFrame(now, frameMs, () => {
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
        pixelRatio: number;
        size: number[];
      };
      setPixelRatio: (r: number) => void;
      setShadows: (on: boolean, mapSize?: number) => void;
      scene: () => THREE.Scene;
      setBloom: (on: boolean, strength?: number) => void;
      frames: (n: number, dtMs?: number) => number[];
      store: () => typeof useGame;
    };
  }
}
