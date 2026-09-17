/**
 * The app icon, drawn in code and written straight to PNG.
 *
 * Everything else in this project is procedural, and so is this: there is no
 * image editor here and no asset pipeline, so the icon is rasterised into a
 * pixel buffer (4x supersampled for smooth edges) and encoded as PNG with
 * node's own zlib. Run it after changing the design:
 *
 *   npx jiti tools/icons.ts
 *
 * It writes public/icon-<size>.png for the web app manifest, the Apple touch
 * icon, and favicon.png, plus public/icon.iconset for macOS:
 *
 *   iconutil -c icns icons/icon.iconset -o icons/Sloanie.icns
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");

type RGB = [number, number, number];
const hex = (h: string): RGB => [
  Number.parseInt(h.slice(1, 3), 16),
  Number.parseInt(h.slice(3, 5), 16),
  Number.parseInt(h.slice(5, 7), 16),
];

// the jewel palette from src/styles.css
const PLUM = hex("#2e1856");
const PINK = hex("#ff6aa8");
const GRAPE = hex("#a452f2");
const DOUGH = hex("#f7ead3");
const DOUGH_SHADE = hex("#e8d3b2");
const EYE = hex("#2b2118");
const BLUSH = hex("#f4a0a8");
const LEAF = hex("#3fa35c");
const GOLD = hex("#ffc83a");

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Signed distance to a rounded square, negative inside. */
function roundRect(x: number, y: number, half: number, r: number) {
  const dx = Math.abs(x) - (half - r);
  const dy = Math.abs(y) - (half - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Signed distance to an ellipse, near enough for drawing. */
function ellipse(x: number, y: number, rx: number, ry: number) {
  const k = Math.hypot(x / rx, y / ry);
  return (k - 1) * Math.min(rx, ry);
}

/**
 * The icon in a unit square: x and y run -1..1, y down. Returns the colour at
 * a point, or null for transparent.
 */
function shade(x: number, y: number): RGB | null {
  const outer = roundRect(x, y, 1, 0.42);
  if (outer > 0) return null;

  // background: a jewel gradient, pink at the top left to grape at the bottom
  const t = (x + y + 2) / 4;
  let c = mix(PINK, GRAPE, t);
  // a soft sheen across the top
  const sheen = Math.max(0, 1 - Math.hypot(x + 0.35, y + 0.95) / 1.25);
  c = mix(c, [255, 255, 255], sheen * 0.3);
  // the plum rim
  if (outer > -0.13) c = mix(c, PLUM, Math.min(1, (outer + 0.13) / 0.05));

  // ---- the dumpling: body, pleats, face
  const by = y + 0.06;
  const body = ellipse(x, by, 0.66, 0.6);
  if (body < 0) {
    // rounder at the bottom, with a little shading up the sides
    const lift = Math.max(0, -by - 0.1);
    c = mix(DOUGH, DOUGH_SHADE, Math.min(1, Math.max(0, (Math.abs(x) - 0.18) / 0.55) + lift * 0.3));
    // pleats along the top, fading out at the sides and downwards
    if (by < -0.18) {
      const pleat = Math.cos(x * 11) * 0.5 + 0.5;
      const fade = Math.min(1, (-by - 0.18) / 0.12) * Math.max(0, 1 - Math.abs(x) / 0.62);
      c = mix(c, DOUGH_SHADE, pleat * 0.7 * fade);
    }
    // blush cheeks
    for (const sx of [-1, 1]) {
      const d = ellipse(x - sx * 0.38, by - 0.16, 0.14, 0.09);
      if (d < 0) c = mix(c, BLUSH, 0.55 * Math.min(1, -d / 0.05));
    }
    // eyes, with a highlight each
    for (const sx of [-1, 1]) {
      const d = ellipse(x - sx * 0.22, by - 0.06, 0.1, 0.13);
      if (d < 0) c = mix(c, EYE, Math.min(1, -d / 0.02));
      const h = ellipse(x - sx * 0.19, by - 0.11, 0.035, 0.045);
      if (h < 0) c = [255, 255, 255];
    }
    // smile: the lower arc of a circle's rim, with round ends
    const W = 0.037;
    const ang = Math.atan2(by - 0.05, x);
    const onArc = ang > 0.5 && ang < Math.PI - 0.5;
    const sm = Math.abs(Math.hypot(x, by - 0.05) - 0.3) - W;
    const cap = Math.min(
      Math.hypot(x - Math.cos(0.5) * 0.3, by - 0.05 - Math.sin(0.5) * 0.3),
      Math.hypot(x + Math.cos(0.5) * 0.3, by - 0.05 - Math.sin(0.5) * 0.3),
    ) - W;
    const mouth = Math.min(onArc ? sm : 1, cap);
    if (mouth < 0) c = mix(c, EYE, Math.min(1, -mouth / 0.012));
    // the herb leaf on top
    const lx = (x - 0.22) * Math.SQRT1_2 + (by + 0.42) * Math.SQRT1_2;
    const ly = -(x - 0.22) * Math.SQRT1_2 + (by + 0.42) * Math.SQRT1_2;
    const leaf = ellipse(lx, ly, 0.22, 0.085);
    if (leaf < 0) {
      c = mix(c, LEAF, Math.min(1, -leaf / 0.03));
      // the leaf's vein
      if (Math.abs(ly) < 0.012) c = mix(c, [255, 255, 255], 0.35);
    }
    // the edge of the bun
    if (body > -0.03) c = mix(c, PLUM, Math.min(1, (body + 0.03) / 0.02) * 0.85);
  }

  // a gold sparkle, top right
  const sp = (px: number, py: number, s: number) => {
    const dx = (x - px) / s;
    const dy = (y - py) / s;
    const star = Math.abs(dx) ** 0.6 + Math.abs(dy) ** 0.6;
    if (star < 1) c = mix(c, GOLD, Math.min(1, (1 - star) * 4));
  };
  sp(0.6, -0.62, 0.17);
  sp(-0.68, 0.5, 0.1);

  return c;
}

/** Render at `size` with 4x supersampling. */
function render(size: number) {
  const SS = 4;
  const n = size * SS;
  const px = new Float32Array(size * size * 4);
  for (let j = 0; j < n; j++) {
    const y = ((j + 0.5) / n) * 2 - 1;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * 2 - 1;
      const c = shade(x, y);
      if (!c) continue;
      const o = (Math.floor(j / SS) * size + Math.floor(i / SS)) * 4;
      px[o] += c[0];
      px[o + 1] += c[1];
      px[o + 2] += c[2];
      px[o + 3] += 255;
    }
  }
  const out = Buffer.alloc(size * size * 4);
  const per = SS * SS;
  for (let p = 0; p < size * size; p++) {
    const a = px[p * 4 + 3]! / per;
    // straight alpha: average the colour over the covered samples only
    const cover = Math.max(1e-6, px[p * 4 + 3]! / 255);
    out[p * 4] = Math.round(px[p * 4]! / cover);
    out[p * 4 + 1] = Math.round(px[p * 4 + 1]! / cover);
    out[p * 4 + 2] = Math.round(px[p * 4 + 2]! / cover);
    out[p * 4 + 3] = Math.round(a);
  }
  return out;
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, rgba: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // each scanline is prefixed with its filter type (0 = none)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const WEB = [32, 180, 192, 512, 1024];
mkdirSync(OUT, { recursive: true });
for (const size of WEB) {
  const file = join(OUT, size === 32 ? "favicon.png" : size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`${file.replace(ROOT + "/", "")}  ${size}x${size}`);
}

// macOS .icns source: every size Finder asks for, at 1x and 2x
// not in public/: this is only the source for a macOS .icns, not a web asset
const ICONSET = join(ROOT, "icons", "icon.iconset");
mkdirSync(ICONSET, { recursive: true });
for (const base of [16, 32, 128, 256, 512]) {
  writeFileSync(join(ICONSET, `icon_${base}x${base}.png`), png(base, render(base)));
  writeFileSync(join(ICONSET, `icon_${base}x${base}@2x.png`), png(base * 2, render(base * 2)));
}
console.log(`${ICONSET.replace(ROOT + "/", "")}  (run: iconutil -c icns icons/icon.iconset -o icons/Sloanie.icns)`);
