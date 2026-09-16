import * as THREE from "three";

/**
 * Procedural surface textures.
 *
 * All generated on a canvas at load time, so there are no files to ship and
 * nothing to go missing offline. Each kind takes the prop's own colour and
 * tints itself, so one generator serves every wood colour in the park.
 *
 * Which colour gets which texture is an explicit table below. Inferring it
 * from the colour channels is how the hedges ended up being treated as water.
 */

export type TexKind =
  | "planks"
  | "bark"
  | "masonry"
  | "plaster"
  | "shingles"
  | "sand"
  | "rubber"
  | "court"
  | "gravel"
  | "fabric"
  | "hedge"
  | "metal"
  | "dough";

const SIZE = 256;

function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0, 1));
  return `#${c.getHexString()}`;
}

function noise(g: CanvasRenderingContext2D, n: number, alpha: number, size = 2) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = Math.random() * alpha;
    g.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
    g.fillRect(Math.random() * SIZE, Math.random() * SIZE, size, size);
  }
  g.globalAlpha = 1;
}

function draw(kind: TexKind, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, SIZE, SIZE);

  switch (kind) {
    case "planks": {
      const rows = 6;
      const h = SIZE / rows;
      for (let i = 0; i < rows; i++) {
        g.fillStyle = shade(color, (i % 2 ? 0.02 : -0.02) + (Math.random() - 0.5) * 0.03);
        g.fillRect(0, i * h, SIZE, h - 1);
        // seam
        g.fillStyle = shade(color, -0.16);
        g.fillRect(0, i * h + h - 2, SIZE, 2);
        // grain
        g.strokeStyle = shade(color, -0.06);
        g.lineWidth = 1;
        for (let k = 0; k < 7; k++) {
          const y = i * h + 3 + Math.random() * (h - 6);
          g.beginPath();
          g.moveTo(0, y);
          for (let x = 0; x <= SIZE; x += 16) {
            g.lineTo(x, y + Math.sin(x * 0.05 + k) * 1.6);
          }
          g.stroke();
        }
        // a knot now and then
        if (Math.random() < 0.4) {
          const kx = Math.random() * SIZE;
          const ky = i * h + h / 2;
          g.fillStyle = shade(color, -0.14);
          g.beginPath();
          g.ellipse(kx, ky, 4, 2.6, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      noise(g, 900, 0.05);
      break;
    }
    case "bark": {
      for (let i = 0; i < 46; i++) {
        const x = Math.random() * SIZE;
        const w = 3 + Math.random() * 8;
        g.fillStyle = shade(color, (Math.random() - 0.55) * 0.14);
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= SIZE; y += 12) {
          g.lineTo(x + Math.sin(y * 0.06 + i) * 3, y);
        }
        for (let y = SIZE; y >= 0; y -= 12) {
          g.lineTo(x + w + Math.sin(y * 0.06 + i) * 3, y);
        }
        g.closePath();
        g.fill();
      }
      noise(g, 1400, 0.09);
      break;
    }
    case "masonry": {
      const rows = 7;
      const h = SIZE / rows;
      g.fillStyle = shade(color, -0.2);
      g.fillRect(0, 0, SIZE, SIZE);
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (SIZE / 8);
        for (let b = -1; b < 5; b++) {
          const w = SIZE / 4;
          const x = b * w + offset;
          g.fillStyle = shade(color, (Math.random() - 0.5) * 0.09);
          g.fillRect(x + 1.5, r * h + 1.5, w - 3, h - 3);
        }
      }
      noise(g, 1100, 0.07);
      break;
    }
    case "plaster": {
      noise(g, 5200, 0.05, 3);
      g.strokeStyle = shade(color, -0.05);
      g.lineWidth = 1;
      for (let i = 0; i < 30; i++) {
        g.beginPath();
        const x = Math.random() * SIZE;
        const y = Math.random() * SIZE;
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
        g.stroke();
      }
      break;
    }
    case "shingles": {
      const rows = 8;
      const h = SIZE / rows;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (SIZE / 12);
        g.fillStyle = shade(color, -0.12);
        g.fillRect(0, r * h, SIZE, h);
        for (let b = -1; b < 7; b++) {
          const w = SIZE / 6;
          const x = b * w + offset;
          g.fillStyle = shade(color, (Math.random() - 0.4) * 0.1);
          g.beginPath();
          g.moveTo(x + 1, r * h);
          g.lineTo(x + w - 1, r * h);
          g.lineTo(x + w - 1, r * h + h - 2.5);
          g.lineTo(x + 1, r * h + h - 2.5);
          g.closePath();
          g.fill();
        }
      }
      noise(g, 700, 0.05);
      break;
    }
    case "sand": {
      noise(g, 9000, 0.12, 2);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = shade(color, -0.07);
        g.lineWidth = 1 + Math.random();
        g.beginPath();
        const y = Math.random() * SIZE;
        g.moveTo(0, y);
        for (let x = 0; x <= SIZE; x += 20) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 4);
        g.stroke();
      }
      break;
    }
    case "gravel": {
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = shade(color, (Math.random() - 0.5) * 0.22);
        const r = 1 + Math.random() * 2.6;
        g.beginPath();
        g.ellipse(Math.random() * SIZE, Math.random() * SIZE, r, r * 0.75, Math.random(), 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "rubber": {
      noise(g, 7000, 0.07, 2);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = shade(color, (Math.random() - 0.5) * 0.14);
        g.beginPath();
        g.arc(Math.random() * SIZE, Math.random() * SIZE, 1.4 + Math.random() * 1.6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "court": {
      noise(g, 5200, 0.04, 2);
      g.strokeStyle = shade(color, -0.04);
      g.lineWidth = 1;
      for (let i = 0; i < SIZE; i += 6) {
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(SIZE, i);
        g.stroke();
      }
      break;
    }
    case "hedge": {
      // dense leafy clumps, so a hedge does not read as a painted block
      for (let i = 0; i < 520; i++) {
        const x = Math.random() * SIZE;
        const y = Math.random() * SIZE;
        const r = 3 + Math.random() * 7;
        g.fillStyle = shade(color, (Math.random() - 0.45) * 0.2);
        g.beginPath();
        g.ellipse(x, y, r, r * 0.72, Math.random() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      // a few darker gaps for depth
      for (let i = 0; i < 90; i++) {
        g.fillStyle = shade(color, -0.24);
        g.beginPath();
        g.arc(Math.random() * SIZE, Math.random() * SIZE, 1 + Math.random() * 2.4, 0, Math.PI * 2);
        g.fill();
      }
      noise(g, 1200, 0.07);
      break;
    }
    case "dough": {
      // soft steamed-bun surface: gentle mottling plus flour speckle
      for (let i = 0; i < 260; i++) {
        g.fillStyle = shade(color, (Math.random() - 0.5) * 0.07);
        g.beginPath();
        g.ellipse(
          Math.random() * SIZE,
          Math.random() * SIZE,
          8 + Math.random() * 22,
          8 + Math.random() * 18,
          Math.random() * Math.PI,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
      for (let i = 0; i < 1500; i++) {
        g.globalAlpha = 0.25 + Math.random() * 0.4;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(Math.random() * SIZE, Math.random() * SIZE, 0.6 + Math.random(), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      noise(g, 800, 0.05);
      break;
    }
    case "metal": {
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = shade(color, (Math.random() - 0.5) * 0.12);
        g.lineWidth = 0.6 + Math.random();
        const x = Math.random() * SIZE;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + (Math.random() - 0.5) * 6, SIZE);
        g.stroke();
      }
      noise(g, 700, 0.04);
      break;
    }
    case "fabric": {
      const step = 5;
      for (let y = 0; y < SIZE; y += step) {
        g.fillStyle = shade(color, y % (step * 2) === 0 ? 0.035 : -0.035);
        g.fillRect(0, y, SIZE, step);
      }
      for (let x = 0; x < SIZE; x += step) {
        g.globalAlpha = 0.45;
        g.fillStyle = shade(color, x % (step * 2) === 0 ? 0.035 : -0.035);
        g.fillRect(x, 0, step, SIZE);
      }
      g.globalAlpha = 1;
      noise(g, 1400, 0.04);
      break;
    }
  }
  return c;
}

/**
 * Colour to texture. Anything not listed stays flat, which is deliberate:
 * small painted details look better clean.
 */
const TABLE: Record<string, TexKind> = {};
const put = (kind: TexKind, ...colors: string[]) => {
  for (const c of colors) TABLE[c.toLowerCase()] = kind;
};

put("planks", "#c49a62", "#b98d58", "#d8b07a", "#c4a06a", "#a07848", "#e8d7b8", "#d4c09a", "#b8a890", "#c4b48a");
put("bark", "#8a5a32", "#6a3a22", "#5a3a28", "#7a4a2a");
put("masonry", "#b3a894", "#9b8f7c", "#a89878", "#d9d2c6", "#bdb4a4", "#8f8878", "#9a948a", "#b0a89a", "#877f74");
put("plaster", "#e0cbb0", "#cfe0e8", "#e8d8b8", "#d8c4d0", "#cfe0cf", "#eed8c4", "#fff6ee", "#cfc6b4");
put("shingles", "#8a4a3a", "#50606a", "#7a5a3a", "#6a4a5a", "#4a6a4a", "#9a5a3a", "#b8453c", "#a33c34", "#d45a4a", "#d43a3a");
put("sand", "#e0c48a", "#cbb894", "#b07a4a", "#d8c49a");
put("gravel", "#b6b0a6", "#9a6a4a");
put("rubber", "#5a7f9a", "#c4674a", "#2f3a40");
put("court", "#3f7fa8", "#4a9a68", "#b07a52", "#4f93c4");
put("fabric", "#f4f0ea", "#f2ead8");
put("hedge", "#5aaa62", "#3f7a42", "#4f9a52", "#4a8a4a", "#6fa85e", "#68a058", "#5f9852", "#58904c", "#8aba6a", "#7aaa62", "#6e9e58", "#649454");
put("metal", "#6f8288", "#b8c2c8", "#8a9aa4", "#6a7a80", "#8fa3a8", "#5a6a70", "#c8ced4", "#3a4448");
put("planks", "#d4b07a", "#c48a5a", "#d4894a", "#e8c46a", "#b98d58");
// tree trunks and canopies
put("bark", "#5c3a22", "#7a4a2a");
put("hedge", "#2f6e38", "#3d7a38", "#3f8a48", "#4e9448", "#4e9a46", "#6bb85a", "#7ec85a", "#8aaa5a", "#5aa85c", "#478a48", "#4f9a52", "#3f9a6b");

export function texKindFor(color: string): TexKind | null {
  return TABLE[color.toLowerCase()] ?? null;
}

const cache = new Map<string, { map: THREE.CanvasTexture; normal: THREE.CanvasTexture | null }>();

/** Build (or reuse) the base texture and its derived normal map for a colour. */
function baseFor(kind: TexKind, color: string) {
  const key = `${kind}|${color}`;
  let entry = cache.get(key);
  if (!entry) {
    const canvas = draw(kind, color);
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    entry = { map, normal: normalFrom(canvas) };
    cache.set(key, entry);
  }
  return entry;
}

/** Sobel the luminance into a normal map so surfaces catch the light. */
function normalFrom(src: HTMLCanvasElement, strength = 1.6): THREE.CanvasTexture | null {
  const w = src.width;
  const h = src.height;
  const rg = src.getContext("2d");
  if (!rg) return null;
  const data = rg.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114) / 255;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const og = out.getContext("2d");
  if (!og) return null;
  const img = og.createImageData(w, h);
  const at = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength;
      let ny = dy * strength;
      const len = Math.hypot(nx, ny, 1) || 1;
      nx /= len;
      ny /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

const repeatCache = new Map<string, { map: THREE.Texture; normal: THREE.Texture | null }>();

/**
 * Textures for a colour at a given tiling. Clones share the underlying image,
 * so a new repeat costs nothing but a wrapper object.
 */
export function texturesFor(color: string, repeat: number, force?: TexKind) {
  const kind = force ?? texKindFor(color);
  if (!kind) return null;
  const r = Math.max(1, Math.min(8, Math.round(repeat)));
  const key = `${kind}|${color}|${r}`;
  let entry = repeatCache.get(key);
  if (!entry) {
    const base = baseFor(kind, color);
    const map = base.map.clone();
    map.repeat.set(r, r);
    map.needsUpdate = true;
    let normal: THREE.Texture | null = null;
    if (base.normal) {
      normal = base.normal.clone();
      normal.repeat.set(r, r);
      normal.needsUpdate = true;
    }
    entry = { map, normal };
    repeatCache.set(key, entry);
  }
  return entry;
}
