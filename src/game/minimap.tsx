import { useEffect, useRef } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { CANDY, SUGAR } from "./sugar-rush";
import { LEVELS } from "./levels";
import { modelColliders } from "./models";
import { worldPose } from "./pose";
import { useGame } from "./store";
import type { LevelDef, Prop } from "./types";

/**
 * Minimap.
 *
 * The park layout is drawn once per level to an offscreen canvas and then
 * blitted each frame, so the only per-frame work is a handful of markers.
 * Unfound dumplings are deliberately not shown. The map is for orientation,
 * not for answers.
 */

const INK = "#3f3228";

type Palette = {
  ground: string;
  grassDark: string;
  path: string;
  court: string;
  water: string;
  sand: string;
  building: string;
  roof: string;
  tree: string;
  solid: string;
  wall: string;
  /** prop colours this park reads as liquid, wet surface, path, court and wall */
  liquid: string[];
  wet: string[];
  paths: string[];
  courts: string[];
  walls: string[];
};

const PICNIC: Palette = {
  ground: "#cfe0bd",
  grassDark: "#bcd3a6",
  path: "#e6d7b4",
  court: "#9ec4b0",
  water: "#8fc4dd",
  sand: "#e7d3a6",
  building: "#b9a894",
  roof: "#a8695c",
  tree: "#6f9e5e",
  solid: "#a9b39c",
  wall: "#8f8878",
  liquid: ["#5aa8c8", "#6cb8d4", "#9fd4ea", "#6cb4d4", "#5aa0bc", "#7ec4de", "#6f9fb8", "#8fc4d8", "#bfe4ee"],
  wet: ["#e0c48a", "#cbb894", "#b07a4a"],
  paths: ["#d8c49a", "#b6b0a6", "#cfc6b4"],
  courts: ["#3f7fa8", "#4a9a68", "#b07a52", "#5a7f9a", "#c4674a"],
  walls: ["#b3a894", "#9b8f7c", "#c4b48a", "#a89878"],
};

/**
 * Sugar Rush's map, in Sugar Rush's colours. The same drawing with park 1's
 * palette gives her a green field with a blue river running through it, which
 * is the wrong park: the ground here is spearmint, the paths are pink sugar and
 * the river is chocolate.
 */
const SUGAR_MAP: Palette = {
  ground: "#a8e6d6",
  grassDark: "#8ed8c4",
  path: "#f4e0c2",
  court: "#ffc6e0",
  water: CANDY.chocRiver,
  sand: "#f2dfc0",
  building: "#d8a86a",
  roof: "#c4784a",
  tree: CANDY.blush,
  solid: "#d6bfd0",
  wall: "#bf9ab4",
  liquid: [CANDY.chocRiver, CANDY.choc, CANDY.chocLight, "#4a2a16", "#f7efe2"],
  wet: [CANDY.cream],
  paths: [CANDY.sugar, "#d8c49a", "#cfc6b4"],
  courts: [CANDY.stripe, CANDY.lawn],
  walls: [CANDY.licorice, CANDY.icing],
};

function paletteFor(level: LevelDef): Palette {
  return level.id === "sugar" ? SUGAR_MAP : PICNIC;
}

type Bounds = LevelDef["bounds"];

function categorise(p: Prop, COL: Palette): { fill: string; layer: number } | null {
  if (p.kind === "tree") return { fill: COL.tree, layer: 3 };
  if (p.kind === "house") return { fill: COL.roof, layer: 3 };
  if (p.kind === "tent") return { fill: p.color, layer: 3 };
  if (p.kind === "tractor") return { fill: "#c9442f", layer: 3 };
  if (p.kind === "trampoline") return { fill: "#2f6f8f", layer: 3 };
  if (p.kind === "tyre") return { fill: "#2a2724", layer: 3 };
  if (p.kind === "cloud" || p.kind === "lollipop") return null;
  // a model is whatever it is; its footprint reads as an obstacle
  if (p.kind === "model") return { fill: COL.solid, layer: 3 };

  const color = (p as { color?: string }).color?.toLowerCase() ?? "";
  const h = p.kind === "box" ? p.size[1] : p.kind === "cyl" ? p.h : 0;

  // liquid and wet surfaces
  const has = (list: string[]) => list.some((c) => c.toLowerCase() === color);
  if (has(COL.liquid)) return { fill: COL.water, layer: 2 };
  if (has(COL.wet)) return { fill: COL.sand, layer: 2 };
  if (has(COL.paths)) return { fill: COL.path, layer: 1 };
  if (has(COL.courts)) return { fill: COL.court, layer: 2 };
  if (has(COL.walls)) return { fill: COL.wall, layer: 4 };
  // low flat things are ground cover, tall things are obstacles
  if (h <= 0.35) return { fill: COL.grassDark, layer: 1 };
  if (h >= 1.0) return { fill: COL.solid, layer: 3 };
  return { fill: COL.grassDark, layer: 2 };
}

function drawStatic(level: LevelDef, px: number): HTMLCanvasElement {
  const b: Bounds = level.bounds;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d");
  if (!g) return c;

  // map is drawn rotated 180 degrees from raw world axes so it lines up with
  // what she is looking at
  const s = px / span;
  const wx = (x: number) => (b.maxX - x) * s;
  const wz = (z: number) => (b.maxZ - z) * s;

  const COL = paletteFor(level);
  g.fillStyle = COL.ground;
  g.fillRect(0, 0, px, px);

  const buckets: Prop[][] = [[], [], [], [], []];
  for (const p of level.props) {
    const cat = categorise(p, COL);
    if (cat) buckets[cat.layer]!.push(p);
  }

  for (let layer = 0; layer < buckets.length; layer++) {
    for (const p of buckets[layer]!) {
      const cat = categorise(p, COL)!;
      g.fillStyle = cat.fill;
      if (p.kind === "tree") {
        const r = Math.max(1, 1.5 * (p.scale ?? 1) * s);
        g.beginPath();
        g.arc(wx(p.x), wz(p.z), r, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === "house") {
        const w = (p.w ?? 6) * s;
        const d = (p.d ?? 5) * s;
        g.fillRect(wx(p.x) - w / 2, wz(p.z) - d / 2, w, d);
      } else if (p.kind === "tent") {
        const w = 2.6 * s;
        g.fillRect(wx(p.x) - w / 2, wz(p.z) - w / 2, w, w);
      } else if (p.kind === "trampoline") {
        g.fillRect(wx(p.x) - (p.w * s) / 2, wz(p.z) - (p.d * s) / 2, p.w * s, p.d * s);
      } else if (p.kind === "tyre") {
        g.beginPath();
        g.arc(wx(p.x), wz(p.z), Math.max(1, p.r * s), 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === "model") {
        // the model's own boxes, already turned and scaled into the world
        for (const b of modelColliders(p)) {
          g.fillRect(wx(b.maxX), wz(b.maxZ), (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
        }
      } else if (p.kind === "tractor") {
        const w = 3.6 * s;
        g.fillRect(wx(p.x) - w / 2, wz(p.z) - w / 2, w, w);
      } else if (p.kind === "cyl") {
        g.beginPath();
        g.arc(wx(p.pos[0]), wz(p.pos[2]), Math.max(1, p.r * s), 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === "box") {
        const rot = p.ry ?? 0;
        const w = p.size[0] * s;
        const d = p.size[2] * s;
        if (rot) {
          g.save();
          g.translate(wx(p.pos[0]), wz(p.pos[2]));
          g.rotate(rot);
          g.fillRect(-w / 2, -d / 2, w, d);
          g.restore();
        } else {
          g.fillRect(wx(p.pos[0]) - w / 2, wz(p.pos[2]) - d / 2, w, d);
        }
      }
    }
  }

  // ponds sit on top of their banks
  for (const w of level.water ?? []) {
    g.fillStyle = COL.water;
    g.beginPath();
    g.arc(wx(w.x), wz(w.z), w.r * s, 0, Math.PI * 2);
    g.fill();
  }

  // the build yard (build-yard.ts draws it, not a prop), in its own waffle colour
  if (level.id === "sugar") {
    const b = SUGAR.buildYard;
    g.fillStyle = "#f3d3a8";
    g.strokeStyle = "#ff93c4";
    g.lineWidth = Math.max(1, s * 0.6);
    // the map runs both axes backwards, so the square's top-left is its far corner
    const x = wx(b.x + b.cells / 2);
    const z = wz(b.z + b.cells / 2);
    g.fillRect(x, z, b.cells * s, b.cells * s);
    g.strokeRect(x, z, b.cells * s, b.cells * s);
  }

  return c;
}

/**
 * Compass. On the turning corner map a red N rides round the rim to show
 * where north is, with small E, S and W marks; on the expanded map (always
 * north-up) it is a little rose in the top-left corner.
 */
function drawCompass(g: CanvasRenderingContext2D, size: number, north: number, expanded: boolean) {
  // top-left on the expanded map: the close button sits top-right
  const cx = expanded ? 34 : size / 2;
  const cy = expanded ? 34 : size / 2;
  const r = expanded ? 22 : size / 2 - 12;
  // `north` is the screen angle of north, clockwise from straight up
  const at = (k: number) => {
    const a = north + (k * Math.PI) / 2;
    return [cx + Math.sin(a) * r, cy - Math.cos(a) * r] as const;
  };
  g.save();
  if (expanded) {
    g.fillStyle = "rgba(255,250,240,0.92)";
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, r + 10, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  const small = expanded ? 11 : Math.max(8, size * 0.06);
  for (const [k, label] of [
    [1, "E"],
    [2, "S"],
    [3, "W"],
  ] as const) {
    const [x, y] = at(k);
    g.font = `700 ${small}px system-ui, sans-serif`;
    g.fillStyle = "rgba(58,43,32,0.7)";
    g.fillText(label, x, y);
  }
  const [nx, ny] = at(0);
  const big = expanded ? 13 : Math.max(10, size * 0.085);
  g.fillStyle = "#d4494f";
  g.strokeStyle = "#fdf7ea";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(nx, ny, big * 0.85, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = "#fffaf0";
  g.font = `800 ${big}px system-ui, sans-serif`;
  g.fillText("N", nx, ny + 0.5);
  g.restore();
}

export function MiniMap() {
  const phase = useGame((s) => s.phase);
  const levelIndex = useGame((s) => s.levelIndex);
  const open = useGame((s) => s.mapOpen);
  const setOpen = useGame((s) => s.setMap);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const level = LEVELS[levelIndex]!;

  useEffect(() => {
    staticRef.current = drawStatic(level, 900);
  }, [level]);

  useEffect(() => {
    // M is handled with the pad's B button in input.ts -> runtime, so it
    // toggles once; a second handler here would toggle it straight back.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openRef.current) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const base = staticRef.current;
      if (canvas && base) {
        const g = canvas.getContext("2d");
        if (g) {
          const size = canvas.width;
          const b = level.bounds;
          const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
          const expanded = openRef.current;

          // corner view follows her at 3.2x; expanded fits the whole park
          const zoom = expanded ? 1 : 3.2;
          const scale = (size / span) * zoom;
          const toX = (x: number) =>
            expanded
              ? (b.maxX - x) * (size / span)
              : size / 2 + (worldPose.x - x) * scale;
          const toZ = (z: number) =>
            expanded
              ? (b.maxZ - z) * (size / span)
              : size / 2 + (worldPose.z - z) * scale;

          g.clearRect(0, 0, size, size);
          g.save();
          g.beginPath();
          // the corner map is a round window that turns with her
          if (expanded) g.rect(0, 0, size, size);
          else g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
          g.clip();

          // The layer is laid out with +z up and +x left, where her heading
          // points at (sin yaw, cos yaw). North is -z (she starts the park
          // facing north), which on that layout is straight down.
          // Corner map: forward is always up, by turning the drawing yaw - PI
          // about her. Expanded map: turned a half turn, so north is up.
          const turn = expanded ? Math.PI : worldPose.yaw - Math.PI;
          g.translate(size / 2, size / 2);
          g.rotate(turn);
          g.translate(-size / 2, -size / 2);

          // sample only the visible slice of the cached layer rather than
          // scaling the whole 900px image every frame
          g.imageSmoothingEnabled = true;
          if (expanded) {
            g.drawImage(base, 0, 0, base.width, base.height, 0, 0, size, size);
          } else {
            // a slice ~1.5x wider than the window, so turning never shows
            // its corners
            const pad = 1.5;
            const view = (span / zoom) * pad;
            const perWorld = base.width / span;
            const sx = (b.maxX - (worldPose.x + view / 2)) * perWorld;
            const sy = (b.maxZ - (worldPose.z + view / 2)) * perWorld;
            const sw = view * perWorld;
            const dw = size * pad;
            g.fillStyle = paletteFor(level).ground;
            g.fillRect(-size, -size, size * 3, size * 3);
            g.drawImage(base, sx, sy, sw, sw, (size - dw) / 2, (size - dw) / 2, dw, dw);
          }

          // juice boxes
          for (const j of worldPose.juice) {
            if (!j.on) continue;
            g.fillStyle = "#e8613f";
            g.beginPath();
            g.arc(toX(j.x), toZ(j.z), expanded ? 3.5 : 4.5, 0, Math.PI * 2);
            g.fill();
          }

          // dumplings she has already found
          for (const f of worldPose.found) {
            g.fillStyle = "#f0c44a";
            g.strokeStyle = INK;
            g.lineWidth = 1.2;
            g.beginPath();
            g.arc(toX(f.x), toZ(f.z), expanded ? 4 : 5, 0, Math.PI * 2);
            g.fill();
            g.stroke();
          }

          // Emmett
          if (worldPose.emmettOut) {
            const ex = toX(worldPose.emmettX);
            const ez = toZ(worldPose.emmettZ);
            g.fillStyle = "#4f93c4";
            g.strokeStyle = INK;
            g.lineWidth = 1.5;
            g.beginPath();
            g.arc(ex, ez, expanded ? 5 : 6, 0, Math.PI * 2);
            g.fill();
            g.stroke();
            g.fillStyle = "#22242a";
            g.fillRect(ex - 4, ez - 6, 8, 3);
          }

          // Sloan, as an arrow pointing the way she faces
          const px = toX(worldPose.x);
          const pz = toZ(worldPose.z);
          g.save();
          g.translate(px, pz);
          // The 180 rotation applies to the terrain, not to her heading. When
          // I flipped the map I dropped this half turn as well, which rotated
          // the arrow too and left it moving with the terrain instead of
          // against it: walk north, arrow pointed south.
          // her heading on the layer; drawn inside the turned frame, so on the
          // corner map it always ends up pointing straight up
          g.rotate(-worldPose.yaw + Math.PI);
          g.beginPath();
          g.moveTo(0, -9);
          g.lineTo(6.5, 7);
          g.lineTo(0, 3.5);
          g.lineTo(-6.5, 7);
          g.closePath();
          g.fillStyle = "#d4494f";
          g.strokeStyle = "#fdf7ea";
          g.lineWidth = 2;
          g.fill();
          g.stroke();
          g.restore();

          g.restore();
          // north is straight down on the layer, so it sits half a turn on
          drawCompass(g, size, turn + Math.PI, expanded);
        }
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [level]);

  if (phase !== "playing" && phase !== "quiz") return null;

  return (
    <>
      <div
        className={
          open
            ? "ui-backdrop animate-ui-fade pointer-events-auto absolute inset-0 z-30 flex items-center justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]"
            : /*
               * On a touch screen the bottom right corner is Collect, Hint and
               * Jump, so the map sits under the icon row instead. A mouse keeps
               * it low. A phone held sideways is wide but short, which put the
               * map on top of those buttons, so a short screen keeps it high
               * whatever its width.
               */
              "pointer-events-auto absolute right-[max(1rem,calc(env(safe-area-inset-right)+0.5rem))] top-[calc(5rem+env(safe-area-inset-top))] z-20 sm:bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] sm:top-auto [@media(max-height:560px)]:bottom-auto [@media(max-height:560px)]:top-[calc(4.5rem+env(safe-area-inset-top))]"
        }
        onClick={() => open && setOpen(false)}
      >
        <div
          className={open ? "chunk animate-ui-pop relative w-min overflow-hidden bg-surface" : "relative"}
          onClick={(e) => e.stopPropagation()}
        >
          {open && (
            <div className="ui-ribbon flex items-center gap-3 bg-leaf py-2 pl-3 pr-2 [@media(max-height:480px)]:py-1">
              <span className="chunk-sm grid size-10 shrink-0 place-items-center rounded-full bg-surface text-leaf sm:size-11">
                <MapIcon className="size-6" strokeWidth={2.5} />
              </span>
              <h2 className="ui-title w-0 min-w-0 flex-1 truncate py-1 text-2xl leading-tight sm:text-3xl [@media(max-height:480px)]:text-lg">{level.name}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="chunk-sm press grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink sm:size-12"
                aria-label="Close map"
              >
                <X className="size-6" strokeWidth={3} />
              </button>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={open ? 620 : 168}
            height={open ? 620 : 168}
            onClick={() => !open && setOpen(true)}
            className={
              open
                ? "block size-[min(88vw,calc(88dvh-5.5rem),620px)] bg-surface [@media(max-height:480px)]:size-[min(88vw,calc(90dvh-4rem),620px)]"
                : // a bezel: navy rim, white ring, navy ring, and a hard base shadow like the other chunky pieces
                  "block size-[112px] cursor-pointer rounded-full border-[3px] border-edge bg-surface shadow-[0_0_0_4px_#fff,0_0_0_7px_var(--color-edge),0_9px_0_4px_var(--color-edge),0_20px_30px_-12px_rgb(29_36_82/0.55)] sm:size-[168px]"
            }
          />
          {!open && (
            // outside the round map's lower left, clear of the compass letters
            <span className="ui-chip pointer-events-none absolute -bottom-1 -left-3 bg-surface px-2 text-sm text-ink">
              <MapIcon className="size-4" strokeWidth={2.5} />M
            </span>
          )}
        </div>
      </div>
    </>
  );
}
