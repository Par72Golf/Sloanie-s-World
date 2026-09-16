import { useEffect, useRef, useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { LEVELS } from "./levels";
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

const COL = {
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
};

type Bounds = LevelDef["bounds"];

function categorise(p: Prop): { fill: string; layer: number } | null {
  if (p.kind === "tree") return { fill: COL.tree, layer: 3 };
  if (p.kind === "house") return { fill: COL.roof, layer: 3 };
  if (p.kind === "cloud" || p.kind === "lollipop") return null;

  const color = (p as { color?: string }).color?.toLowerCase() ?? "";
  const h = p.kind === "box" ? p.size[1] : p.kind === "cyl" ? p.h : 0;

  // liquid and wet surfaces
  if (["#5aa8c8", "#6cb8d4", "#9fd4ea", "#6cb4d4", "#5aa0bc", "#7ec4de", "#6f9fb8", "#8fc4d8", "#bfe4ee"].includes(color)) {
    return { fill: COL.water, layer: 2 };
  }
  if (color === "#e0c48a" || color === "#cbb894" || color === "#b07a4a") {
    return { fill: COL.sand, layer: 2 };
  }
  if (color === "#d8c49a" || color === "#b6b0a6" || color === "#cfc6b4") {
    return { fill: COL.path, layer: 1 };
  }
  if (color === "#3f7fa8" || color === "#4a9a68" || color === "#b07a52" || color === "#5a7f9a" || color === "#c4674a") {
    return { fill: COL.court, layer: 2 };
  }
  if (color === "#b3a894" || color === "#9b8f7c" || color === "#c4b48a" || color === "#a89878") {
    return { fill: COL.wall, layer: 4 };
  }
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

  g.fillStyle = COL.ground;
  g.fillRect(0, 0, px, px);

  const buckets: Prop[][] = [[], [], [], [], []];
  for (const p of level.props) {
    const cat = categorise(p);
    if (cat) buckets[cat.layer]!.push(p);
  }

  for (let layer = 0; layer < buckets.length; layer++) {
    for (const p of buckets[layer]!) {
      const cat = categorise(p)!;
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

  return c;
}

export function MiniMap() {
  const phase = useGame((s) => s.phase);
  const levelIndex = useGame((s) => s.levelIndex);
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const level = LEVELS[levelIndex]!;

  useEffect(() => {
    staticRef.current = drawStatic(level, 900);
  }, [level]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") setOpen((v) => !v);
      else if (e.key === "Escape" && openRef.current) setOpen(false);
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
          g.rect(0, 0, size, size);
          g.clip();

          // sample only the visible slice of the cached layer rather than
          // scaling the whole 900px image every frame
          g.imageSmoothingEnabled = true;
          if (expanded) {
            g.drawImage(base, 0, 0, base.width, base.height, 0, 0, size, size);
          } else {
            const view = span / zoom;
            const perWorld = base.width / span;
            const sx = (b.maxX - (worldPose.x + view / 2)) * perWorld;
            const sy = (b.maxZ - (worldPose.z + view / 2)) * perWorld;
            const sw = view * perWorld;
            g.fillStyle = COL.ground;
            g.fillRect(0, 0, size, size);
            g.drawImage(base, sx, sy, sw, sw, 0, 0, size, size);
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
            ? "pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/40 p-4"
            : // On phones the bottom right corner is Collect, Hint and Jump, so
              // the map sits under the icon row instead. Desktop keeps it low.
              "pointer-events-auto absolute right-3 top-[4.75rem] z-20 sm:bottom-3 sm:right-3 sm:top-auto"
        }
        onClick={() => open && setOpen(false)}
      >
        <div
          className="relative"
          onClick={(e) => e.stopPropagation()}
        >
          <canvas
            ref={canvasRef}
            width={open ? 620 : 168}
            height={open ? 620 : 168}
            onClick={() => !open && setOpen(true)}
            className={
              open
                ? "h-[min(86vw,86vh,620px)] w-[min(86vw,86vh,620px)] rounded-xl border-2 border-line bg-surface shadow-[0_18px_40px_-24px_rgb(42_33_24_/_0.6)]"
                : "size-[112px] cursor-pointer rounded-lg border-2 border-line bg-surface/90 shadow-[0_10px_24px_-16px_rgb(42_33_24_/_0.6)] sm:size-[168px]"
            }
          />
          {open ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -right-2 -top-2 rounded-full border border-line bg-surface p-1.5 text-ink shadow"
              aria-label="Close map"
            >
              <X className="size-4" />
            </button>
          ) : (
            <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-surface/85 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
              <MapIcon className="size-3" />M
            </span>
          )}
        </div>
      </div>
    </>
  );
}
