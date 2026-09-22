/**
 * Collectible sticker art, drawn procedurally with the Canvas 2D API.
 *
 * Every sticker is a small set of drawing functions in a normalised 100x100
 * space. A sticker is rendered in layers, like a real die-cut sticker:
 *   1. the silhouette shapes stroked thick and white (the paper border),
 *   2. the art itself, with chunky dark outlines,
 *   3. a glossy streak (and a holographic sheen for shiny stickers),
 * and the whole layer is then stamped onto the target with a soft shadow.
 */
import * as THREE from "three";

export type StickerId =
  | "frog" | "dragonfly" | "goldfish" | "butterfly" | "ladybug" | "bee"
  | "apple" | "tractor" | "chicken" | "sunflower" | "horse" | "balloon"
  | "popcorn" | "ferriswheel" | "mushroom" | "crystal" | "bat" | "tent"
  | "marshmallow" | "owl" | "squirrel" | "baseball" | "tennisball" | "basketball"
  | "soccerball" | "golfflag" | "beachball" | "rainbow" | "sneaker" | "snail";

export type StickerRarity = "common" | "rare" | "shiny";

export type StickerArtDef = { id: StickerId; name: string; rarity: StickerRarity };

/** Park 1's sticker book. A second park's book is its own list. */
export const STICKER_ART: StickerArtDef[] = [
  { id: "frog", name: "Frog", rarity: "common" },
  { id: "dragonfly", name: "Dragonfly", rarity: "rare" },
  { id: "goldfish", name: "Goldfish", rarity: "common" },
  { id: "butterfly", name: "Butterfly", rarity: "common" },
  { id: "ladybug", name: "Ladybug", rarity: "common" },
  { id: "bee", name: "Bee", rarity: "common" },
  { id: "apple", name: "Apple", rarity: "common" },
  { id: "tractor", name: "Tractor", rarity: "common" },
  { id: "chicken", name: "Chicken", rarity: "common" },
  { id: "sunflower", name: "Sunflower", rarity: "common" },
  { id: "horse", name: "Carousel Horse", rarity: "rare" },
  { id: "balloon", name: "Balloon", rarity: "common" },
  { id: "popcorn", name: "Popcorn", rarity: "common" },
  { id: "ferriswheel", name: "Ferris Wheel", rarity: "shiny" },
  { id: "mushroom", name: "Glow Mushroom", rarity: "rare" },
  { id: "crystal", name: "Crystal", rarity: "shiny" },
  { id: "bat", name: "Bat", rarity: "rare" },
  { id: "tent", name: "Tent", rarity: "common" },
  { id: "marshmallow", name: "Marshmallow", rarity: "common" },
  { id: "owl", name: "Owl", rarity: "rare" },
  { id: "squirrel", name: "Squirrel", rarity: "rare" },
  { id: "baseball", name: "Baseball", rarity: "common" },
  { id: "tennisball", name: "Tennis Ball", rarity: "common" },
  { id: "basketball", name: "Basketball", rarity: "common" },
  { id: "soccerball", name: "Soccer Ball", rarity: "common" },
  { id: "golfflag", name: "Golf Flag", rarity: "rare" },
  { id: "beachball", name: "Beach Ball", rarity: "common" },
  { id: "rainbow", name: "Rainbow", rarity: "shiny" },
  { id: "sneaker", name: "Sneaker", rarity: "common" },
  { id: "snail", name: "Snail", rarity: "common" },
];

// ---------------------------------------------------------------------------
// Drawing kit (all coordinates in the 100x100 sticker space)
// ---------------------------------------------------------------------------

export type G = CanvasRenderingContext2D;
type Fill = string | CanvasGradient;
/** A path builder. `w` set means it is an open line of that width, not a filled area. */
export type Shape = ((g: G) => void) & { w?: number };

export interface Art {
  /** Shapes covering the whole sticker; stroked thick and white for the paper border. */
  sil: Shape[];
  draw: (g: G) => void;
  /** Nudge to centre the art in the square. */
  off?: [number, number];
}

const TAU = Math.PI * 2;
const INK = "#3a2b20";
const LW = 3.4;
const BORDER = 15;
const WHITE = "#ffffff";

const shp = (fn: (g: G) => void, w?: number): Shape => Object.assign(fn, { w });

const E = (cx: number, cy: number, rx: number, ry: number, rot = 0): Shape =>
  shp((g) => {
    g.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
    g.ellipse(cx, cy, rx, ry, rot, 0, TAU);
  });
const C = (cx: number, cy: number, r: number): Shape => E(cx, cy, r, r);
const RR = (x: number, y: number, w: number, h: number, r: number): Shape =>
  shp((g) => g.roundRect(x, y, w, h, r));
const P = (...p: number[]): Shape =>
  shp((g) => {
    g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.closePath();
  });
const LINE = (w: number, ...p: number[]): Shape =>
  shp((g) => {
    g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  }, w);
const PATH = (fn: (g: G) => void, w?: number): Shape => shp(fn, w);
/** Mirror a shape left-right across x = 50. */
const MIR = (s: Shape): Shape =>
  shp((g) => {
    g.save();
    g.translate(100, 0);
    g.scale(-1, 1);
    s(g);
    g.restore();
  }, s.w);

const list = (s: Shape | Shape[]): Shape[] => (Array.isArray(s) ? s : [s]);

/** Fill (or stroke, for lines) each shape and give it its own dark outline. */
function part(g: G, shapes: Shape | Shape[], fill: Fill, lw = LW): void {
  for (const s of list(shapes)) {
    g.beginPath();
    s(g);
    if (s.w) {
      if (lw > 0) {
        g.lineWidth = s.w + lw * 2;
        g.strokeStyle = INK;
        g.stroke();
      }
      g.lineWidth = s.w;
      g.strokeStyle = fill;
      g.stroke();
    } else {
      g.fillStyle = fill;
      g.fill();
      if (lw > 0) {
        g.lineWidth = lw;
        g.strokeStyle = INK;
        g.stroke();
      }
    }
  }
}

/** Fill several overlapping shapes as one merged blob with a single outer outline. */
function blob(g: G, shapes: Shape[], fill: Fill, lw = LW): void {
  g.strokeStyle = INK;
  for (const s of shapes) {
    g.beginPath();
    s(g);
    g.lineWidth = (s.w ?? 0) + lw * 2;
    g.stroke();
  }
  for (const s of shapes) {
    g.beginPath();
    s(g);
    if (s.w) {
      g.lineWidth = s.w;
      g.strokeStyle = fill;
      g.stroke();
    } else {
      g.fillStyle = fill;
      g.fill();
    }
  }
}

/** Run fn clipped to the union of shapes. */
function clip(g: G, shapes: Shape | Shape[], fn: () => void): void {
  g.save();
  g.beginPath();
  for (const s of list(shapes)) s(g);
  g.clip();
  fn();
  g.restore();
}

function strokePath(g: G, build: (g: G) => void, color: string, w: number): void {
  g.beginPath();
  build(g);
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke();
}

function lin(g: G, x0: number, y0: number, x1: number, y1: number, ...cs: string[]): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  cs.forEach((c, i) => gr.addColorStop(i / (cs.length - 1), c));
  return gr;
}

/** A rounded, lit-from-top-left gradient. */
function ball(g: G, cx: number, cy: number, r: number, light: string, base: string, dark: string): CanvasGradient {
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05);
  gr.addColorStop(0, light);
  gr.addColorStop(0.55, base);
  gr.addColorStop(1, dark);
  return gr;
}

function dot(g: G, x: number, y: number, r: number, color = INK): void {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = color;
  g.fill();
}

function gloss(g: G, cx: number, cy: number, rx: number, ry: number, rot = 0, a = 0.75): void {
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, rot, 0, TAU);
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.fill();
}

/** A shiny black bead eye. */
function eye(g: G, x: number, y: number, r: number): void {
  dot(g, x, y, r);
  dot(g, x - r * 0.32, y - r * 0.35, r * 0.4, WHITE);
}

/** A big cartoon eye: white ball with outline, pupil and glint. */
function eyeBall(g: G, x: number, y: number, r: number, pr: number): void {
  part(g, C(x, y, r), WHITE, 2.6);
  dot(g, x + r * 0.1, y + r * 0.12, pr);
  dot(g, x + r * 0.1 - pr * 0.35, y + r * 0.12 - pr * 0.38, pr * 0.42, WHITE);
}

function blush(g: G, x: number, y: number, rx = 4.5, ry = 2.8): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fillStyle = "rgba(255,110,150,0.55)";
  g.fill();
}

function smile(g: G, x: number, y: number, w: number, lw = 2.6, color = INK): void {
  strokePath(g, (g) => {
    g.moveTo(x - w / 2, y);
    g.quadraticCurveTo(x, y + w * 0.6, x + w / 2, y);
  }, color, lw);
}

function star(cx: number, cy: number, R: number, r: number, n = 5, rot = -Math.PI / 2): Shape {
  return shp((g) => {
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n;
      const rr = i % 2 ? r : R;
      const x = cx + rr * Math.cos(a);
      const y = cy + rr * Math.sin(a);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  });
}

function ngon(cx: number, cy: number, r: number, rot: number, n: number): Shape {
  return shp((g) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i * TAU) / n;
      if (i === 0) g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    g.closePath();
  });
}

/** A four-point twinkle. */
function twinkle(g: G, x: number, y: number, r: number, color = WHITE): void {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fillStyle = color;
  g.fill();
}

// ---------------------------------------------------------------------------
// The stickers
// ---------------------------------------------------------------------------

const frog: Art = (() => {
  const body = E(50, 64, 36, 26);
  const bumpL = C(31, 38, 14);
  const bumpR = C(69, 38, 14);
  const feet = [E(24, 87, 13, 6, -0.15), E(76, 87, 13, 6, 0.15)];
  return {
    off: [0, -4],
    sil: [body, bumpL, bumpR, ...feet],
    draw(g) {
      part(g, feet, "#4fae3a");
      blob(g, [body, bumpL, bumpR], ball(g, 50, 56, 44, "#b4f08a", "#6cc94a", "#48a236"));
      part(g, E(50, 76, 21, 10), "#c9f0a0", 0);
      eyeBall(g, 31, 37, 9.5, 5);
      eyeBall(g, 69, 37, 9.5, 5);
      dot(g, 46, 55, 1.3);
      dot(g, 54, 55, 1.3);
      smile(g, 50, 61, 28, 3);
      blush(g, 25, 63);
      blush(g, 75, 63);
    },
  };
})();

const dragonfly: Art = (() => {
  const wings = [E(29, 38, 22, 8.5, 0.3), E(71, 38, 22, 8.5, -0.3), E(31, 55, 19, 7, -0.35), E(69, 55, 19, 7, 0.35)];
  const eyes = [C(44, 22, 7.5), C(56, 22, 7.5)];
  const thorax = E(50, 40, 7.5, 10);
  const tail = RR(46.25, 46, 7.5, 44, 3.75);
  return {
    off: [0, -2],
    sil: [...wings, ...eyes, thorax, tail],
    draw(g) {
      part(g, wings, "#cdefff", 2.8);
      const axes: [number, number, number, number][] = [[29, 38, 22, 0.3], [71, 38, 22, -0.3], [31, 55, 19, -0.35], [69, 55, 19, 0.35]];
      for (const [cx, cy, rx, rot] of axes) {
        const dx = Math.cos(rot) * rx * 0.8;
        const dy = Math.sin(rot) * rx * 0.8;
        strokePath(g, (g) => { g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); }, "#8ccbe8", 1.6);
        gloss(g, cx - dx * 0.2, cy - dy * 0.2 - 3, rx * 0.4, 1.8, rot, 0.8);
      }
      part(g, tail, lin(g, 0, 46, 0, 90, "#3cc6d4", "#2a7fd0"));
      for (let y = 55; y < 88; y += 7) {
        strokePath(g, (g) => { g.moveTo(47.5, y); g.lineTo(52.5, y); }, INK, 1.8);
      }
      part(g, thorax, "#3cc6b4");
      part(g, eyes, ball(g, 50, 18, 12, "#b8ffcf", "#3fd98a", "#22a86a"));
      eye(g, 44, 23, 3.4);
      eye(g, 56, 23, 3.4);
      smile(g, 50, 30.5, 6, 2);
    },
  };
})();

const goldfish: Art = (() => {
  const body = E(44, 52, 30, 23);
  const tail = PATH((g) => {
    g.moveTo(66, 52);
    g.quadraticCurveTo(80, 34, 92, 26);
    g.quadraticCurveTo(84, 52, 92, 78);
    g.quadraticCurveTo(80, 70, 66, 52);
    g.closePath();
  });
  const finTop = PATH((g) => {
    g.moveTo(30, 33);
    g.quadraticCurveTo(46, 14, 64, 22);
    g.quadraticCurveTo(58, 30, 58, 36);
    g.closePath();
  });
  const finBot = PATH((g) => {
    g.moveTo(40, 72);
    g.quadraticCurveTo(46, 86, 58, 84);
    g.quadraticCurveTo(54, 76, 57, 70);
    g.closePath();
  });
  return {
    off: [-3, 0],
    sil: [body, tail, finTop, finBot],
    draw(g) {
      part(g, tail, lin(g, 66, 52, 92, 52, "#ff9a2e", "#ffd08a"));
      for (const [x, y] of [[88, 34], [90, 52], [88, 70]]) {
        strokePath(g, (g) => { g.moveTo(71, 52); g.lineTo(x, y); }, "#e87a20", 1.6);
      }
      part(g, [finTop, finBot], "#ffb54e");
      part(g, body, ball(g, 40, 48, 34, "#ffd89a", "#ff9a2e", "#ef741c"));
      g.save();
      for (const [x, y] of [[50, 42], [60, 50], [50, 58], [60, 64], [66, 38], [42, 66]]) {
        strokePath(g, (g) => g.arc(x, y, 5, -1.1, 1.1), "rgba(214,96,20,0.55)", 1.7);
      }
      g.restore();
      strokePath(g, (g) => g.arc(22, 52, 16, -0.75, 0.75), "#e2701c", 2.2);
      eyeBall(g, 27, 45, 7, 4);
      part(g, E(16, 57, 2.4, 2.8), "#e0602a", 1.8);
      blush(g, 30, 60, 4, 2.5);
      gloss(g, 42, 36, 9, 3.5, -0.15);
    },
  };
})();

const butterfly: Art = (() => {
  const wUL = E(31, 34, 21, 17, 0.6);
  const wUR = E(69, 34, 21, 17, -0.6);
  const wLL = E(35, 66, 15, 13, -0.6);
  const wLR = E(65, 66, 15, 13, 0.6);
  const body = E(50, 55, 5.5, 21);
  const head = C(50, 31, 9);
  const antL = PATH((g) => { g.moveTo(47, 24); g.quadraticCurveTo(42, 14, 36, 12); }, 2.2);
  const antR = MIR(antL);
  const knobs = [C(36, 12, 3.2), C(64, 12, 3.2)];
  return {
    off: [0, 5],
    sil: [wUL, wUR, wLL, wLR, body, head, antL, antR, ...knobs],
    draw(g) {
      part(g, [antL, antR], INK, 0);
      part(g, knobs, INK, 0);
      part(g, [wLL, wLR], ball(g, 50, 60, 30, "#d9c2ff", "#b58cff", "#8f63e6"));
      part(g, [C(34, 68, 5), C(66, 68, 5)], "#ffe066", 2.2);
      part(g, [wUL, wUR], ball(g, 50, 26, 40, "#ffc2de", "#ff6fae", "#e8468c"));
      g.fillStyle = "#ffa8cf";
      for (const [cx, rot] of [[30, 0.6], [70, -0.6]] as const) {
        g.beginPath();
        g.ellipse(cx, 35, 11, 8, rot, 0, TAU);
        g.fill();
      }
      part(g, [C(24, 29, 4), C(76, 29, 4)], "#ffe066", 2.2);
      part(g, [C(36, 43, 2.8), C(64, 43, 2.8)], "#7ee0ff", 2);
      gloss(g, 22, 24, 6, 2.5, 0.6);
      gloss(g, 62, 22, 5, 2, -0.6, 0.55);
      part(g, body, "#5b3f7a");
      part(g, head, "#5b3f7a");
      dot(g, 46.5, 30, 1.8, WHITE);
      dot(g, 53.5, 30, 1.8, WHITE);
      smile(g, 50, 34, 5, 1.8, WHITE);
    },
  };
})();

const ladybug: Art = (() => {
  const body = C(50, 58, 32);
  const head = E(50, 30, 17, 13);
  const antL = PATH((g) => { g.moveTo(44, 20); g.quadraticCurveTo(40, 12, 34, 11); }, 2.4);
  const antR = MIR(antL);
  const knobs = [C(34, 11, 3.2), C(66, 11, 3.2)];
  const legsL = [LINE(3, 22, 48, 12, 42), LINE(3, 20, 62, 10, 63), LINE(3, 24, 76, 15, 83)];
  const legs = [...legsL, ...legsL.map(MIR)];
  return {
    off: [0, 1],
    sil: [body, head, antL, antR, ...knobs, ...legs],
    draw(g) {
      part(g, legs, INK, 0);
      part(g, [antL, antR], INK, 0);
      part(g, knobs, INK, 0);
      part(g, body, ball(g, 50, 58, 32, "#ff9a80", "#e8412f", "#c42c1e"));
      clip(g, body, () => {
        for (const [x, y, r] of [[35, 48, 7], [65, 48, 7], [29, 68, 6], [71, 68, 6], [41, 82, 5], [59, 82, 5]]) dot(g, x, y, r);
        strokePath(g, (g) => { g.moveTo(50, 28); g.lineTo(50, 92); }, INK, 3);
      });
      part(g, head, INK, 0);
      eyeBall(g, 43.5, 29, 4.6, 2.5);
      eyeBall(g, 56.5, 29, 4.6, 2.5);
      smile(g, 50, 36, 6, 1.8, WHITE);
      gloss(g, 34, 40, 7, 3.5, -0.7);
    },
  };
})();

const bee: Art = (() => {
  const wingL = E(42, 26, 11, 16, -0.35);
  const wingR = E(60, 26, 11, 16, 0.35);
  const body = E(54, 58, 30, 23);
  const head = C(26, 52, 17);
  const stinger = P(82, 53, 92, 60, 82, 67);
  const antL = PATH((g) => { g.moveTo(20, 38); g.quadraticCurveTo(14, 30, 10, 25); }, 2.4);
  const antR = PATH((g) => { g.moveTo(28, 36); g.quadraticCurveTo(28, 27, 24, 20); }, 2.4);
  const knobs = [C(10, 25, 3.2), C(24, 20, 3.2)];
  return {
    off: [0, 3],
    sil: [wingL, wingR, body, head, stinger, antL, antR, ...knobs],
    draw(g) {
      part(g, [wingL, wingR], "#e6f6ff", 2.8);
      gloss(g, 39, 20, 3, 7, -0.35, 0.9);
      gloss(g, 57, 20, 3, 7, 0.35, 0.9);
      part(g, stinger, INK, 2);
      part(g, body, ball(g, 54, 58, 30, "#fff3a6", "#ffd23f", "#f0ae1e"));
      clip(g, body, () => {
        g.fillStyle = INK;
        g.fillRect(45, 30, 8, 60);
        g.fillRect(62, 30, 8, 60);
        g.fillRect(78, 30, 8, 60);
      });
      g.beginPath();
      body(g);
      g.lineWidth = LW;
      g.strokeStyle = INK;
      g.stroke();
      part(g, [antL, antR], INK, 0);
      part(g, knobs, INK, 0);
      part(g, head, ball(g, 26, 52, 17, "#fff3a6", "#ffd23f", "#f0ae1e"));
      eye(g, 20, 50, 3.4);
      eye(g, 31.5, 50, 3.4);
      smile(g, 25.75, 57, 8, 2.2);
      blush(g, 14.5, 57, 3.5, 2.2);
      blush(g, 37, 57, 3.5, 2.2);
      gloss(g, 58, 42, 10, 3, -0.1, 0.55);
    },
  };
})();

const apple: Art = (() => {
  const lobes = [C(37, 60, 25), C(63, 60, 25), E(50, 74, 24, 14)];
  const stem = PATH((g) => { g.moveTo(50, 40); g.quadraticCurveTo(49, 27, 55, 18); }, 4.5);
  const leaf = PATH((g) => {
    g.moveTo(54, 29);
    g.quadraticCurveTo(64, 14, 80, 19);
    g.quadraticCurveTo(71, 34, 54, 29);
    g.closePath();
  });
  return {
    off: [0, -1],
    sil: [...lobes, stem, leaf],
    draw(g) {
      part(g, stem, "#7a4a2a");
      blob(g, lobes, ball(g, 42, 52, 42, "#ff9c86", "#e8412f", "#b3261a"));
      part(g, leaf, lin(g, 54, 29, 80, 19, "#3f9e30", "#8fdc5a"));
      strokePath(g, (g) => { g.moveTo(57, 28); g.quadraticCurveTo(68, 22, 76, 20.5); }, "#2f7a24", 1.5);
      gloss(g, 30, 52, 5, 10, 0.35, 0.8);
      dot(g, 35, 67, 2.2, "rgba(255,255,255,0.7)");
    },
  };
})();

const tractor: Art = (() => {
  const cab = RR(20, 18, 30, 34, 4);
  const body = RR(18, 40, 62, 24, 5);
  const hood = RR(46, 36, 36, 24, 6);
  const pipe = RR(64, 20, 6, 18, 2);
  const rear = C(32, 68, 21);
  const front = C(72, 76, 13);
  const roof = RR(16, 14, 38, 7, 3.5);
  const red = "#e8412f";
  return {
    off: [2, -1],
    sil: [cab, body, hood, pipe, rear, front, roof],
    draw(g) {
      part(g, pipe, "#6a5d55", 2.8);
      part(g, RR(62.5, 17, 9, 5, 2), INK, 0);
      part(g, body, red);
      part(g, hood, lin(g, 0, 36, 0, 60, "#ff7a5e", red, "#c42c1e"));
      part(g, cab, lin(g, 0, 18, 0, 52, "#ff6a50", red));
      part(g, RR(25, 24, 20, 14, 3), lin(g, 25, 24, 45, 38, "#effaff", "#9fdcff"), 2.4);
      strokePath(g, (g) => { g.moveTo(29, 34); g.lineTo(35, 27); }, "rgba(255,255,255,0.9)", 2.2);
      part(g, roof, "#ffd23f", 3);
      for (let y = 43; y <= 55; y += 4) {
        strokePath(g, (g) => { g.moveTo(75, y); g.lineTo(80, y); }, INK, 1.8);
      }
      part(g, C(66, 41, 3), "#fff6b0", 2);
      gloss(g, 58, 40, 7, 1.8, 0, 0.6);
      for (const [cx, cy, r, hub] of [[32, 68, 21, 10], [72, 76, 13, 6]]) {
        part(g, C(cx, cy, r), "#4a3b33");
        const n = r > 15 ? 14 : 10;
        for (let i = 0; i < n; i++) {
          const a = (i * TAU) / n;
          strokePath(g, (g) => {
            g.moveTo(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5));
            g.lineTo(cx + Math.cos(a) * (r - 1.5), cy + Math.sin(a) * (r - 1.5));
          }, "#2b211b", 2.4);
        }
        part(g, C(cx, cy, hub), ball(g, cx, cy, hub, "#fff09a", "#ffd23f", "#e8a81a"), 2.6);
        dot(g, cx, cy, hub * 0.35);
      }
    },
  };
})();

const chicken: Art = (() => {
  const body = E(56, 62, 32, 25);
  const head = C(36, 38, 18);
  const tails = [E(82, 40, 7, 14, 0.45), E(86, 50, 5.5, 10, 1.0)];
  const comb = [C(28, 21, 5.5), C(36, 17, 6), C(44, 21, 5.5)];
  const beak = P(19, 35, 8, 41, 19, 47);
  const wattle = E(21, 52, 4, 6);
  const legs = [
    PATH((g) => { g.moveTo(46, 84); g.lineTo(46, 90); g.moveTo(42, 91); g.lineTo(46, 89); g.lineTo(50, 91); }, 2.6),
    PATH((g) => { g.moveTo(62, 84); g.lineTo(62, 90); g.moveTo(58, 91); g.lineTo(62, 89); g.lineTo(66, 91); }, 2.6),
  ];
  return {
    off: [0, -3],
    sil: [body, head, ...tails, ...comb, beak, wattle, ...legs],
    draw(g) {
      part(g, legs, "#ff9a2e", 1.8);
      part(g, tails, "#fff1cf", 3);
      part(g, comb, "#ff4d4d", 3);
      blob(g, [body, head], ball(g, 44, 46, 50, "#ffffff", "#fff4dc", "#efd7a6"));
      part(g, E(62, 62, 16, 11, -0.25), "#f7e0b0", 3);
      strokePath(g, (g) => { g.moveTo(54, 64); g.quadraticCurveTo(62, 70, 72, 62); }, "#d9b77a", 1.8);
      part(g, beak, "#ffb020", 2.6);
      part(g, wattle, "#ff4d4d", 2.6);
      eye(g, 31, 35, 3.6);
      blush(g, 40, 44, 4, 2.6);
      gloss(g, 44, 46, 10, 3, -0.3, 0.9);
    },
  };
})();

const sunflower: Art = (() => {
  const cx = 50;
  const cy = 42;
  const petals: Shape[] = [];
  const back: Shape[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    petals.push(E(cx + 21 * Math.cos(a), cy + 21 * Math.sin(a), 12, 6.5, a));
    const b = a + TAU / 24;
    back.push(E(cx + 19 * Math.cos(b), cy + 19 * Math.sin(b), 11, 6, b));
  }
  const center = C(cx, cy, 16);
  const stem = LINE(7, 50, 56, 50, 90);
  const leafL = PATH((g) => { g.moveTo(50, 80); g.quadraticCurveTo(34, 62, 20, 70); g.quadraticCurveTo(34, 86, 50, 80); g.closePath(); });
  const leafR = PATH((g) => { g.moveTo(50, 73); g.quadraticCurveTo(66, 56, 80, 63); g.quadraticCurveTo(68, 79, 50, 73); g.closePath(); });
  return {
    sil: [...petals, center, stem, leafL, leafR],
    draw(g) {
      part(g, stem, "#4fae3a");
      part(g, [leafL, leafR], lin(g, 20, 60, 80, 80, "#8fdc5a", "#4fae3a"), 3);
      strokePath(g, (g) => { g.moveTo(48, 79); g.quadraticCurveTo(36, 72, 26, 71); }, "#3a8a2a", 1.5);
      strokePath(g, (g) => { g.moveTo(52, 72); g.quadraticCurveTo(64, 64, 74, 64); }, "#3a8a2a", 1.5);
      part(g, back, "#f5a623", 2.4);
      part(g, petals, lin(g, 0, 10, 0, 76, "#ffe27a", "#ffc93c", "#ffb020"), 2.6);
      part(g, center, ball(g, cx, cy, 16, "#b87a48", "#7a4a2a", "#5a341c"));
      for (let i = 0; i < 14; i++) {
        const a = (i * TAU) / 14;
        dot(g, cx + 12 * Math.cos(a), cy + 12 * Math.sin(a), 1.1, "#4a2a14");
      }
      eye(g, 44.5, 39, 2.8);
      eye(g, 55.5, 39, 2.8);
      smile(g, 50, 45, 9, 2.2);
      blush(g, 40, 46, 3.2, 2);
      blush(g, 60, 46, 3.2, 2);
    },
  };
})();

const horse: Art = (() => {
  const pole = LINE(4.5, 56, 12, 56, 88);
  const knobs = [C(56, 11, 3.8), C(56, 89, 3.8)];
  const body = E(56, 54, 25, 14);
  const neck = P(30, 52, 42, 44, 36, 24, 22, 26);
  const head = E(20, 32, 13, 8, -0.7);
  const ear = P(27, 23, 31, 12, 36, 22);
  const legsBack = [
    PATH((g) => { g.moveTo(40, 62); g.lineTo(30, 70); g.lineTo(32, 80); }, 7),
    LINE(7, 72, 64, 76, 83),
  ];
  const legsFront = [
    LINE(7, 48, 64, 46, 84),
    PATH((g) => { g.moveTo(76, 60); g.lineTo(86, 70); g.lineTo(84, 80); }, 7),
  ];
  const tail = PATH((g) => { g.moveTo(79, 50); g.quadraticCurveTo(92, 48, 88, 66); }, 6);
  const mane = [C(35, 22, 5.5), C(39, 30, 5.5), C(42, 38, 5.5), C(29, 19, 4.5)];
  return {
    off: [0, 0],
    sil: [pole, ...knobs, body, neck, head, ear, ...legsBack, ...legsFront, tail, ...mane],
    draw(g) {
      part(g, pole, "#f5c542", 2.6);
      clip(g, RR(53.75, 12, 4.5, 76, 0), () => {
        for (let y = 10; y < 90; y += 7) {
          strokePath(g, (g) => { g.moveTo(52, y); g.lineTo(60, y + 5); }, "#ff5f7a", 2);
        }
      });
      part(g, knobs, ball(g, 56, 11, 4, "#fff3a0", "#f5c542", "#d69a1a"), 2.4);
      part(g, tail, "#ff7eb6");
      part(g, legsBack, "#efe3d2");
      part(g, legsFront, "#fffaf2");
      for (const [x, y] of [[32, 80], [76, 83], [46, 84], [84, 80]]) dot(g, x, y, 4, "#b58cff");
      part(g, ear, "#fffaf2", 2.8);
      blob(g, [body, neck, head], ball(g, 40, 38, 50, "#ffffff", "#fffaf2", "#ecdcc8"));
      part(g, mane, "#ff7eb6", 2.6);
      part(g, RR(48, 39, 18, 12, 4), "#8a6cff", 2.6);
      part(g, RR(50, 36.5, 14, 5, 2.5), "#ffd23f", 2.2);
      strokePath(g, (g) => { g.moveTo(14, 34); g.lineTo(25, 38); g.lineTo(30, 30); }, "#ff4d6d", 2);
      eye(g, 23, 28, 2.4);
      dot(g, 11.5, 38, 1.2);
      blush(g, 18, 36, 3, 2);
      gloss(g, 58, 47, 8, 2, 0, 0.8);
    },
  };
})();

const balloon: Art = (() => {
  const bal = E(50, 40, 27, 30);
  const knot = P(45, 75, 55, 75, 50, 68);
  const string = PATH((g) => { g.moveTo(50, 75); g.bezierCurveTo(42, 80, 58, 85, 50, 89); }, 2.2);
  return {
    sil: [bal, knot, string],
    draw(g) {
      part(g, string, INK, 0);
      part(g, knot, "#d62a4d", 2.6);
      part(g, bal, ball(g, 50, 40, 32, "#ffb0c0", "#ff4d6d", "#d02648"));
      gloss(g, 38, 28, 5, 10, 0.5, 0.85);
      dot(g, 45, 18.5, 2, "rgba(255,255,255,0.85)");
    },
  };
})();

const popcorn: Art = (() => {
  const box = P(24, 48, 76, 48, 68, 90, 32, 90);
  const puffs = [C(50, 24, 11), C(33, 27, 8.5), C(67, 26, 8.5), C(40, 37, 11), C(61, 36, 11), C(28, 45, 10), C(72, 45, 10), C(50, 46, 9)];
  return {
    off: [0, 1],
    sil: [box, ...puffs],
    draw(g) {
      for (const p of puffs) part(g, p, ball(g, 46, 30, 30, "#ffffff", "#fff3cc", "#f2d27a"), 2.8);
      for (const [x, y] of [[53, 20], [36, 34], [64, 32], [30, 42]]) dot(g, x, y, 2, "rgba(255,200,60,0.8)");
      clip(g, box, () => {
        g.fillStyle = WHITE;
        g.fillRect(0, 40, 100, 60);
        g.fillStyle = "#e8412f";
        for (let k = 0; k < 8; k += 2) {
          const t0 = 24 + (52 * k) / 8;
          const t1 = 24 + (52 * (k + 1)) / 8;
          const b0 = 32 + (36 * k) / 8;
          const b1 = 32 + (36 * (k + 1)) / 8;
          g.beginPath();
          g.moveTo(t0, 40);
          g.lineTo(t1, 40);
          g.lineTo(b1, 95);
          g.lineTo(b0, 95);
          g.fill();
        }
      });
      g.beginPath();
      box(g);
      g.lineWidth = LW;
      g.strokeStyle = INK;
      g.stroke();
      part(g, P(22, 46, 78, 46, 77, 53, 23, 53), "#ffd23f", 3);
      part(g, star(50, 71, 9, 4), "#ffd23f", 2.6);
      gloss(g, 36, 62, 1.8, 8, -0.15, 0.6);
    },
  };
})();

const ferriswheel: Art = (() => {
  const cx = 50;
  const cy = 40;
  const R = 28;
  const legs = [LINE(5, 50, 40, 27, 86), LINE(5, 50, 40, 73, 86)];
  const base = RR(16, 83, 68, 7, 3.5);
  const gondolas: { s: Shape; x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + TAU / 16;
    const x = cx + R * Math.cos(a);
    const y = cy + R * Math.sin(a);
    gondolas.push({ s: RR(x - 5.5, y, 11, 9, 3.5), x, y });
  }
  const colors = ["#ff4d6d", "#ff9a2e", "#ffd23f", "#6cc94a", "#3db8ff", "#9b6bff", "#ff6fae", "#2ed1c4"];
  return {
    sil: [C(cx, cy, 31), ...legs, base, ...gondolas.map((d) => d.s)],
    draw(g) {
      part(g, legs, "#5aa9e6", 3);
      part(g, base, "#6cc94a", 3);
      part(g, C(cx, cy, R), "#e9f6ff", 0);
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8 + TAU / 16;
        strokePath(g, (g) => { g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); }, INK, 1.8);
      }
      strokePath(g, (g) => g.arc(cx, cy, 16, 0, TAU), "#ff9ecb", 2.4);
      strokePath(g, (g) => g.arc(cx, cy, R, 0, TAU), INK, 7.5);
      strokePath(g, (g) => g.arc(cx, cy, R, 0, TAU), "#ff6fae", 4);
      for (let i = 0; i < 24; i++) {
        const a = (i * TAU) / 24;
        dot(g, cx + R * Math.cos(a), cy + R * Math.sin(a), 0.9, "#fff6b0");
      }
      part(g, C(cx, cy, 6), ball(g, cx, cy, 6, "#fff09a", "#ffd23f", "#e8a81a"), 2.6);
      gondolas.forEach((d, i) => {
        part(g, d.s, colors[i], 2.6);
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.fillRect(d.x - 3.5, d.y + 2.5, 7, 2.5);
        dot(g, d.x, d.y, 1.4);
      });
    },
  };
})();

const mushroom: Art = (() => {
  const cap = PATH((g) => {
    g.moveTo(12, 52);
    g.bezierCurveTo(10, 8, 90, 8, 88, 52);
    g.quadraticCurveTo(50, 62, 12, 52);
    g.closePath();
  });
  const stem = PATH((g) => {
    g.moveTo(36, 54);
    g.lineTo(64, 54);
    g.quadraticCurveTo(70, 74, 66, 88);
    g.quadraticCurveTo(50, 93, 34, 88);
    g.quadraticCurveTo(30, 74, 36, 54);
    g.closePath();
  });
  return {
    off: [0, -2],
    sil: [cap, stem],
    draw(g) {
      part(g, stem, lin(g, 0, 54, 0, 92, "#f6f0ff", "#d6c4ff"));
      eye(g, 44, 70, 3);
      eye(g, 56, 70, 3);
      smile(g, 50, 76, 8, 2.2);
      blush(g, 38.5, 76, 3.5, 2.2);
      blush(g, 61.5, 76, 3.5, 2.2);
      const gr = g.createRadialGradient(40, 24, 2, 50, 40, 46);
      gr.addColorStop(0, "#d6fff8");
      gr.addColorStop(0.45, "#55e0d8");
      gr.addColorStop(1, "#6a6cf0");
      part(g, cap, gr);
      for (const [x, y, r] of [[30, 36, 6], [52, 24, 5.5], [71, 36, 6.5], [48, 44, 4], [21, 47, 3.2], [81, 48, 3]]) {
        dot(g, x, y, r * 1.7, "rgba(220,255,250,0.35)");
        dot(g, x, y, r, "#f2fffd");
      }
      strokePath(g, (g) => g.arc(50, 54, 34, Math.PI * 1.13, Math.PI * 1.3), "rgba(255,255,255,0.75)", 2.6);
      twinkle(g, 64, 22, 3.2);
    },
  };
})();

const crystal: Art = (() => {
  type Gem = { cx: number; by: number; w: number; h: number; rot: number; cols: [string, string, string, string] };
  const gems: Gem[] = [
    { cx: 35, by: 83, w: 18, h: 44, rot: -0.5, cols: ["#e6fcff", "#a8ecff", "#62cdf2", "#3aa6d8"] },
    { cx: 65, by: 83, w: 16, h: 38, rot: 0.45, cols: ["#ffe6f3", "#ffb0d6", "#ff76b4", "#e0508f"] },
    { cx: 50, by: 82, w: 27, h: 68, rot: 0, cols: ["#f6e6ff", "#dca8ff", "#b46cff", "#8a4bd8"] },
  ];
  const pt = (gm: Gem, x: number, y: number): [number, number] => {
    const c = Math.cos(gm.rot);
    const s = Math.sin(gm.rot);
    return [gm.cx + x * c - y * s, gm.by + x * s + y * c];
  };
  const polyOf = (gm: Gem, pts: [number, number][]): Shape =>
    shp((g) => {
      pts.forEach(([x, y], i) => {
        const [px, py] = pt(gm, x, y);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
    });
  const outline = (gm: Gem): Shape => {
    const k = gm.w * 0.55;
    return polyOf(gm, [[-gm.w / 2, 0], [-gm.w / 2, -gm.h + k], [0, -gm.h], [gm.w / 2, -gm.h + k], [gm.w / 2, 0]]);
  };
  const rock = E(50, 83, 32, 8);
  return {
    sil: [rock, ...gems.map(outline)],
    draw(g) {
      for (const gm of gems) {
        const k = gm.w * 0.55;
        const hw = gm.w / 2;
        const top = -gm.h;
        const m = -gm.h + k * 1.5;
        const [c0, c1, c2, c3] = gm.cols;
        part(g, polyOf(gm, [[0, 0], [0, m], [hw, top + k], [hw, 0]]), c2, 0);
        part(g, polyOf(gm, [[-hw, 0], [-hw, top + k], [0, m], [0, 0]]), c1, 0);
        part(g, polyOf(gm, [[-hw, top + k], [0, top], [0, m]]), c0, 0);
        part(g, polyOf(gm, [[0, top], [hw, top + k], [0, m]]), c3, 0);
        g.beginPath();
        const edges: [number, number][][] = [[[-hw, top + k], [0, m], [hw, top + k]], [[0, top], [0, 0]]];
        for (const e of edges) {
          e.forEach(([x, y], i) => {
            const [px, py] = pt(gm, x, y);
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          });
        }
        g.strokeStyle = "rgba(58,43,32,0.45)";
        g.lineWidth = 1.6;
        g.stroke();
        g.beginPath();
        outline(gm)(g);
        g.lineWidth = LW;
        g.strokeStyle = INK;
        g.stroke();
      }
      part(g, rock, lin(g, 0, 75, 0, 91, "#b9aea4", "#8a7f76"));
      gloss(g, 40, 80, 6, 1.8, 0, 0.5);
      twinkle(g, 44, 34, 5.5);
      twinkle(g, 58, 58, 3.5);
      twinkle(g, 29, 58, 3);
    },
  };
})();

const bat: Art = (() => {
  const wingL = PATH((g) => {
    g.moveTo(40, 46);
    g.quadraticCurveTo(26, 22, 8, 32);
    g.quadraticCurveTo(15, 40, 15, 52);
    g.quadraticCurveTo(21, 45, 26, 56);
    g.quadraticCurveTo(32, 49, 38, 62);
    g.closePath();
  });
  const wingR = MIR(wingL);
  const earL = P(38, 40, 34, 20, 48, 34);
  const earR = MIR(earL);
  const body = E(50, 52, 17, 18);
  return {
    off: [0, 5],
    sil: [wingL, wingR, earL, earR, body],
    draw(g) {
      part(g, [wingL, wingR], lin(g, 0, 25, 0, 62, "#9a7fd6", "#5b3f9a"));
      for (const s of [1, -1]) {
        g.save();
        if (s < 0) { g.translate(100, 0); g.scale(-1, 1); }
        strokePath(g, (g) => { g.moveTo(37, 48); g.quadraticCurveTo(27, 40, 15, 42); }, "#3f2a70", 1.6);
        strokePath(g, (g) => { g.moveTo(37, 52); g.quadraticCurveTo(30, 50, 26, 54); }, "#3f2a70", 1.6);
        g.restore();
      }
      part(g, [earL, earR], "#6b4f9e", 3);
      part(g, [P(38.5, 37, 36, 25.5, 45, 33.5), MIR(P(38.5, 37, 36, 25.5, 45, 33.5))], "#ff9ac1", 0);
      part(g, body, ball(g, 50, 52, 18, "#a78ce0", "#6b4f9e", "#4a3380"));
      part(g, E(50, 61, 9, 7), "#8a70c4", 0);
      eyeBall(g, 43, 48, 5.2, 3);
      eyeBall(g, 57, 48, 5.2, 3);
      part(g, [P(46.6, 57.3, 49, 57.8, 47.6, 61), P(53.4, 57.3, 51, 57.8, 52.4, 61)], WHITE, 1);
      smile(g, 50, 56.5, 8, 2.2);
      blush(g, 38, 56, 3.5, 2.2);
      blush(g, 62, 56, 3.5, 2.2);
    },
  };
})();

const tent: Art = (() => {
  const tentS = P(50, 20, 88, 80, 12, 80);
  const ground = E(50, 82, 42, 7);
  const pole = LINE(2.6, 50, 20, 50, 10);
  const flag = P(50, 10, 63, 13.5, 50, 17);
  const door = P(50, 38, 63, 80, 37, 80);
  const flapL = PATH((g) => { g.moveTo(50, 38); g.quadraticCurveTo(40, 60, 30, 80); g.lineTo(39, 80); g.quadraticCurveTo(44, 60, 50, 38); g.closePath(); });
  return {
    sil: [tentS, ground, pole, flag],
    draw(g) {
      part(g, ground, ball(g, 50, 80, 40, "#9be86a", "#6cc94a", "#4fa83a"));
      part(g, pole, "#7a4a2a", 2);
      part(g, flag, "#ff4d6d", 2.4);
      part(g, tentS, lin(g, 12, 80, 70, 20, "#ff6a2e", "#ffb13d"));
      clip(g, tentS, () => {
        g.fillStyle = "rgba(190,60,10,0.22)";
        g.beginPath();
        g.moveTo(50, 20);
        g.lineTo(90, 82);
        g.lineTo(66, 82);
        g.fill();
        g.fillStyle = "#ffd23f";
        g.fillRect(0, 68, 100, 5);
      });
      g.beginPath();
      tentS(g);
      g.lineWidth = LW;
      g.strokeStyle = INK;
      g.lineJoin = "round";
      g.stroke();
      part(g, door, "#4a3226", 2.6);
      for (const x of [46, 54]) {
        dot(g, x, 67, 2.8, WHITE);
        dot(g, x + 0.4, 67.6, 1.5);
      }
      part(g, [flapL, MIR(flapL)], "#ffe0b0", 2.4);
      gloss(g, 34, 50, 1.8, 10, 0.55, 0.55);
      for (const x of [16, 28, 72, 84]) {
        strokePath(g, (g) => { g.moveTo(x - 2, 84); g.lineTo(x, 80); g.lineTo(x + 2, 84); }, "#3f8a2e", 1.6);
      }
    },
  };
})();

const marshmallow: Art = (() => {
  const stick = LINE(6, 48, 48, 74, 88);
  const tx = 42;
  const ty = 38;
  const rot = -0.3;
  const local = (fn: (g: G) => void): Shape =>
    shp((g) => {
      g.save();
      g.translate(tx, ty);
      g.rotate(rot);
      fn(g);
      g.restore();
    });
  const mal = local((g) => g.roundRect(-21, -22, 42, 44, 12));
  return {
    off: [4, -2],
    sil: [stick, mal],
    draw(g) {
      part(g, stick, lin(g, 48, 48, 74, 88, "#d09a62", "#9a6438"));
      g.save();
      g.translate(tx, ty);
      g.rotate(rot);
      g.beginPath();
      g.roundRect(-21, -22, 42, 44, 12);
      g.fillStyle = lin(g, 0, -22, 0, 22, "#ffffff", "#ffe8f1", "#f4c0a0");
      g.fill();
      g.lineWidth = LW;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.ellipse(0, -13.5, 17, 5.5, 0, 0, TAU);
      g.fillStyle = "#fffafc";
      g.fill();
      g.lineWidth = 1.8;
      g.strokeStyle = "rgba(58,43,32,0.35)";
      g.stroke();
      g.beginPath();
      g.ellipse(-9, 18.5, 6.5, 2.4, 0, 0, TAU);
      g.moveTo(14, 18);
      g.ellipse(9, 18, 5, 2.2, 0, 0, TAU);
      g.fillStyle = "rgba(200,120,60,0.55)";
      g.fill();
      eye(g, -8, 2, 3.3);
      eye(g, 8, 2, 3.3);
      smile(g, 0, 7.5, 9, 2.4);
      blush(g, -14, 8.5, 3.8, 2.4);
      blush(g, 14, 8.5, 3.8, 2.4);
      g.restore();
      twinkle(g, 30, 30, 3);
    },
  };
})();

const owl: Art = (() => {
  const body = E(50, 58, 30, 33);
  const earL = P(24, 36, 25, 15, 42, 28);
  const earR = MIR(earL);
  const wings = [E(22, 64, 9, 19, 0.18), E(78, 64, 9, 19, -0.18)];
  const feet = [E(42, 91, 5.5, 3.5), E(58, 91, 5.5, 3.5)];
  return {
    off: [0, -3],
    sil: [body, earL, earR, ...wings, ...feet],
    draw(g) {
      part(g, feet, "#ffa53a", 2.4);
      blob(g, [body, earL, earR], ball(g, 44, 46, 44, "#d09560", "#a26a3f", "#7a4a28"));
      part(g, E(50, 71, 17, 17), "#f4dcb8", 0);
      for (const [x, y] of [[44, 64], [56, 64], [50, 71], [44, 78], [56, 78]]) {
        strokePath(g, (g) => { g.moveTo(x - 3, y); g.lineTo(x, y + 2.5); g.lineTo(x + 3, y); }, "#c79a6e", 1.8);
      }
      part(g, wings, "#86532e");
      part(g, [C(38, 46, 12.5), C(62, 46, 12.5)], "#fff6e0", 2.8);
      eye(g, 39, 47, 7);
      eye(g, 61, 47, 7);
      part(g, P(45.5, 54, 54.5, 54, 50, 62), "#ffa53a", 2.4);
      blush(g, 27, 57, 3.5, 2.2);
      blush(g, 73, 57, 3.5, 2.2);
      gloss(g, 36, 30, 7, 2.5, -0.25, 0.4);
    },
  };
})();

const squirrel: Art = (() => {
  const tail = [C(72, 78, 13), C(81, 60, 15), C(78, 39, 15), C(64, 24, 12), C(51, 25, 7.5)];
  const body = E(47, 66, 17, 21);
  const head = C(33, 42, 14);
  const snout = E(21, 46, 7, 5.5);
  const ear = P(32, 31, 36, 16, 46, 30);
  const feet = [E(40, 88, 8, 4), E(56, 88, 8, 4)];
  const nut = E(28, 67, 6, 7);
  const cap = E(28, 60, 7.5, 4);
  const fur = "#d9803a";
  return {
    off: [-4, 0],
    sil: [...tail, body, head, snout, ear, ...feet, nut, cap],
    draw(g) {
      blob(g, tail, ball(g, 70, 46, 44, "#f5b070", fur, "#b35e26"));
      strokePath(g, (g) => { g.moveTo(71, 82); g.quadraticCurveTo(87, 62, 79, 42); g.quadraticCurveTo(73, 28, 58, 25); }, "#f7c890", 3);
      part(g, feet, "#b8652a", 2.6);
      part(g, ear, fur, 3);
      part(g, P(35, 28, 37, 20, 42, 28.5), "#ffb3c6", 0);
      blob(g, [body, head, snout], ball(g, 34, 44, 40, "#f5b070", fur, "#b35e26"));
      part(g, E(41, 71, 9, 13), "#f7dcb5", 0);
      eye(g, 31, 38.5, 3.4);
      dot(g, 14.5, 45, 2.4);
      strokePath(g, (g) => { g.moveTo(16.5, 50); g.quadraticCurveTo(20, 52.5, 23.5, 50); }, INK, 1.8);
      blush(g, 30, 48.5, 3.5, 2.2);
      part(g, nut, "#d99a55", 2.6);
      part(g, cap, "#7a4a2a", 2.6);
      part(g, LINE(1.8, 28, 56, 29.5, 52.5), INK, 0);
      part(g, [E(34.5, 64, 4, 3.2), E(21.5, 64, 4, 3.2)], fur, 2.2);
    },
  };
})();

const baseball: Art = (() => {
  const b = C(50, 50, 38);
  return {
    sil: [b],
    draw(g) {
      part(g, b, ball(g, 50, 50, 38, "#ffffff", "#fbf6ea", "#ddd2bc"));
      clip(g, b, () => {
        for (const [cx, a0, a1] of [[6, -1, 1], [94, Math.PI - 1, Math.PI + 1]]) {
          strokePath(g, (g) => g.arc(cx, 50, 32, a0, a1), "#e0322e", 2);
          for (let t = 0; t <= 10; t++) {
            const a = a0 + ((a1 - a0) * t) / 10;
            const px = cx + 32 * Math.cos(a);
            const py = 50 + 32 * Math.sin(a);
            const nx = Math.cos(a);
            const ny = Math.sin(a);
            const tx = -ny;
            const ty = nx;
            strokePath(g, (g) => {
              g.moveTo(px - nx * 3.2 + tx * 1.6, py - ny * 3.2 + ty * 1.6);
              g.lineTo(px, py);
              g.lineTo(px + nx * 3.2 + tx * 1.6, py + ny * 3.2 + ty * 1.6);
            }, "#e0322e", 1.8);
          }
        }
      });
      gloss(g, 37, 30, 9, 4.5, -0.6, 0.9);
    },
  };
})();

const tennisball: Art = (() => {
  const b = C(50, 50, 38);
  return {
    sil: [b],
    draw(g) {
      part(g, b, ball(g, 50, 50, 38, "#f6ff9a", "#d4ec2c", "#9fba16"));
      clip(g, b, () => {
        for (let i = 0; i < 90; i++) {
          const x = 14 + ((i * 37) % 72);
          const y = 14 + ((i * 53) % 72);
          dot(g, x, y, 0.7, "rgba(255,255,255,0.35)");
        }
        const seams: (g: G) => void = (g) => {
          g.moveTo(8 + 34 * Math.cos(-1.3), 50 + 34 * Math.sin(-1.3));
          g.arc(8, 50, 34, -1.3, 1.3);
          g.moveTo(92 + 34 * Math.cos(Math.PI - 1.3), 50 + 34 * Math.sin(Math.PI - 1.3));
          g.arc(92, 50, 34, Math.PI - 1.3, Math.PI + 1.3);
        };
        strokePath(g, seams, "rgba(58,43,32,0.35)", 6.5);
        strokePath(g, seams, "#ffffff", 4.2);
      });
      gloss(g, 37, 30, 9, 4.5, -0.6, 0.8);
    },
  };
})();

const basketball: Art = (() => {
  const b = C(50, 50, 38);
  return {
    sil: [b],
    draw(g) {
      part(g, b, ball(g, 50, 50, 38, "#ffc080", "#f28a2e", "#c95f14"));
      clip(g, b, () => {
        strokePath(g, (g) => {
          g.moveTo(50, 8);
          g.lineTo(50, 92);
          g.moveTo(8, 50);
          g.lineTo(92, 50);
          g.moveTo(4 + 32 * Math.cos(-1.6), 50 + 32 * Math.sin(-1.6));
          g.arc(4, 50, 32, -1.6, 1.6);
          g.moveTo(96 + 32 * Math.cos(Math.PI - 1.6), 50 + 32 * Math.sin(Math.PI - 1.6));
          g.arc(96, 50, 32, Math.PI - 1.6, Math.PI + 1.6);
        }, INK, 2.8);
      });
      gloss(g, 36, 29, 8, 4, -0.6, 0.6);
    },
  };
})();

const soccerball: Art = (() => {
  const b = C(50, 50, 38);
  return {
    sil: [b],
    draw(g) {
      part(g, b, ball(g, 50, 50, 38, "#ffffff", "#f6f6f6", "#cfcfd6"));
      clip(g, b, () => {
        const pr = 11;
        const outs: { x: number; y: number; a: number }[] = [];
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k * TAU) / 5;
          outs.push({ x: 50 + 35 * Math.cos(a), y: 50 + 35 * Math.sin(a), a });
        }
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const o = outs[k];
          const n = outs[(k + 1) % 5];
          // centre pentagon vertex to the outer pentagon's inward vertex
          g.moveTo(50 + pr * Math.cos(o.a), 50 + pr * Math.sin(o.a));
          g.lineTo(o.x - pr * Math.cos(o.a), o.y - pr * Math.sin(o.a));
          // outer pentagon to its neighbour
          const va = o.a + Math.PI - (2 * TAU) / 5;
          const vb = n.a + Math.PI + (2 * TAU) / 5;
          g.moveTo(o.x + pr * Math.cos(va), o.y + pr * Math.sin(va));
          g.lineTo(n.x + pr * Math.cos(vb), n.y + pr * Math.sin(vb));
        }
        g.strokeStyle = INK;
        g.lineWidth = 2.2;
        g.stroke();
        part(g, ngon(50, 50, pr, -Math.PI / 2, 5), INK, 0);
        for (const o of outs) part(g, ngon(o.x, o.y, pr, o.a + Math.PI, 5), INK, 0);
      });
      gloss(g, 36, 29, 8, 4, -0.6, 0.85);
    },
  };
})();

const golfflag: Art = (() => {
  const mound = E(50, 80, 38, 11);
  const pole = LINE(3.4, 38, 80, 38, 15);
  const flag = PATH((g) => {
    g.moveTo(40, 14);
    g.quadraticCurveTo(60, 9, 84, 24);
    g.quadraticCurveTo(62, 30, 40, 38);
    g.closePath();
  });
  const top = C(38, 12, 3.4);
  const gball = C(66, 72, 5.5);
  return {
    sil: [mound, pole, flag, top, gball],
    draw(g) {
      part(g, mound, ball(g, 50, 76, 40, "#a8ee78", "#6cc94a", "#48a236"));
      clip(g, mound, () => {
        g.fillStyle = "rgba(255,255,255,0.14)";
        for (let x = 0; x < 100; x += 16) {
          g.beginPath();
          g.moveTo(x, 68);
          g.lineTo(x + 8, 68);
          g.lineTo(x - 4, 92);
          g.lineTo(x - 12, 92);
          g.fill();
        }
      });
      part(g, E(38, 80, 8, 3), "#2e4a24", 2);
      part(g, pole, WHITE, 2.4);
      part(g, flag, lin(g, 40, 20, 84, 24, "#ff4d6d", "#ff8aa0"));
      gloss(g, 52, 18, 7, 1.6, 0.12, 0.7);
      part(g, top, "#ffd23f", 2.4);
      part(g, gball, ball(g, 66, 72, 6, "#ffffff", "#ffffff", "#d8d8d8"), 2.4);
      for (const [x, y] of [[64, 71], [67.5, 70], [66, 74], [69, 73]]) dot(g, x, y, 0.8, "#c4c4c4");
    },
  };
})();

const beachball: Art = (() => {
  const b = C(50, 50, 38);
  return {
    sil: [b],
    draw(g) {
      clip(g, b, () => {
        g.save();
        g.translate(50, 50);
        g.rotate(-0.35);
        const half = (side: number, outer: string, inner: string) => {
          g.save();
          g.beginPath();
          g.rect(side < 0 ? -45 : 0, -45, 45, 90);
          g.clip();
          g.fillStyle = outer;
          g.fillRect(-45, -45, 90, 90);
          g.beginPath();
          g.ellipse(0, 0, 25, 40, 0, 0, TAU);
          g.fillStyle = inner;
          g.fill();
          g.restore();
        };
        half(-1, "#ff4d6d", "#ffffff");
        half(1, "#ffd23f", "#ffffff");
        g.beginPath();
        g.ellipse(0, 0, 11, 40, 0, 0, TAU);
        g.fillStyle = "#3db8ff";
        g.fill();
        g.beginPath();
        g.ellipse(0, 0, 25, 40, 0, 0, TAU);
        g.moveTo(11, 0);
        g.ellipse(0, 0, 11, 40, 0, 0, TAU);
        g.strokeStyle = "rgba(58,43,32,0.5)";
        g.lineWidth = 1.6;
        g.stroke();
        part(g, C(0, -34, 5.5), WHITE, 2);
        g.restore();
        const sh = g.createRadialGradient(38, 34, 8, 50, 50, 40);
        sh.addColorStop(0, "rgba(255,255,255,0.25)");
        sh.addColorStop(0.6, "rgba(0,0,0,0)");
        sh.addColorStop(1, "rgba(40,20,0,0.22)");
        g.fillStyle = sh;
        g.fillRect(0, 0, 100, 100);
      });
      g.beginPath();
      b(g);
      g.lineWidth = LW;
      g.strokeStyle = INK;
      g.stroke();
      gloss(g, 36, 29, 8, 4, -0.6, 0.85);
    },
  };
})();

const rainbow: Art = (() => {
  const cx = 50;
  const cy = 68;
  const arcShape = PATH((g) => {
    g.moveTo(cx - 39, cy);
    g.arc(cx, cy, 39, Math.PI, TAU);
    g.lineTo(cx + 14, cy);
    g.arc(cx, cy, 14, 0, Math.PI, true);
    g.closePath();
  });
  const cloudL = [C(14, 70, 7), C(22, 63, 9), C(31, 69, 7.5), C(23, 75, 8)];
  const cloudR = cloudL.map(MIR);
  const bands = ["#ff4d4d", "#ff9a2e", "#ffd23f", "#6cc94a", "#3db8ff", "#9b6bff"];
  return {
    off: [0, -6],
    sil: [arcShape, ...cloudL, ...cloudR],
    draw(g) {
      const step = (39 - 14) / bands.length;
      bands.forEach((col, i) => {
        const r0 = 39 - i * step;
        const r1 = r0 - step;
        g.beginPath();
        g.arc(cx, cy, r0, Math.PI, TAU);
        g.arc(cx, cy, r1, TAU, Math.PI, true);
        g.closePath();
        g.fillStyle = col;
        g.fill();
      });
      g.beginPath();
      arcShape(g);
      g.lineWidth = LW;
      g.strokeStyle = INK;
      g.stroke();
      strokePath(g, (g) => g.arc(cx, cy, 35.5, Math.PI * 1.12, Math.PI * 1.38), "rgba(255,255,255,0.7)", 2.4);
      for (const cloud of [cloudL, cloudR]) blob(g, cloud, ball(g, 22, 62, 22, "#ffffff", "#f6faff", "#d8e6f6"));
      for (const x of [22, 78]) {
        eye(g, x - 4, 69, 2.2);
        eye(g, x + 4, 69, 2.2);
        smile(g, x, 72.5, 4.5, 1.8);
      }
      twinkle(g, 50, 36, 4);
    },
  };
})();

const sneaker: Art = (() => {
  const sole = RR(8, 68, 84, 15, 7.5);
  const upper = PATH((g) => {
    g.moveTo(12, 72);
    g.quadraticCurveTo(10, 56, 28, 52);
    g.lineTo(48, 40);
    g.quadraticCurveTo(52, 24, 64, 24);
    g.lineTo(70, 33);
    g.quadraticCurveTo(78, 35, 82, 27);
    g.quadraticCurveTo(91, 40, 90, 72);
    g.closePath();
  });
  return {
    off: [0, -3],
    sil: [sole, upper],
    draw(g) {
      part(g, upper, lin(g, 10, 72, 90, 28, "#ff4f98", "#ff8ac0"));
      clip(g, upper, () => {
        part(g, E(16, 72, 16, 15), "#ffffff", 2.6);
        part(g, PATH((g) => { g.moveTo(80, 90); g.lineTo(80, 44); g.quadraticCurveTo(86, 36, 96, 40); g.lineTo(96, 90); g.closePath(); }), "#7a5cff", 2.6);
      });
      g.beginPath();
      upper(g);
      g.lineWidth = LW;
      g.strokeStyle = INK;
      g.stroke();
      part(g, PATH((g) => { g.moveTo(64, 26); g.quadraticCurveTo(72, 38, 81.5, 29); }, 4), "#ffe0ef", 2);
      for (const t of [0.15, 0.45, 0.75]) {
        const x = 30 + (50 - 30) * t;
        const y = 52 + (39 - 52) * t;
        part(g, LINE(3, x - 3, y - 4.5, x + 3, y + 4.5), WHITE, 1.4);
      }
      part(g, star(62, 54, 8.5, 3.8), "#ffd23f", 2.4);
      part(g, sole, lin(g, 0, 68, 0, 83, "#ffffff", "#e6e2ee"));
      strokePath(g, (g) => { g.moveTo(14, 74.5); g.lineTo(86, 74.5); }, "#3db8ff", 3);
      gloss(g, 34, 47, 7, 1.8, -0.55, 0.7);
    },
  };
})();

const snail: Art = (() => {
  const bodyS = PATH((g) => {
    g.moveTo(24, 86);
    g.quadraticCurveTo(10, 86, 12, 70);
    g.quadraticCurveTo(12, 50, 24, 50);
    g.quadraticCurveTo(34, 50, 34, 64);
    g.lineTo(36, 74);
    g.lineTo(80, 74);
    g.quadraticCurveTo(94, 76, 90, 84);
    g.quadraticCurveTo(88, 88, 80, 88);
    g.closePath();
  });
  const stalks = [LINE(2.6, 20, 54, 14, 37), LINE(2.6, 28, 53, 32, 36)];
  const eyes = [C(14, 34, 5), C(32, 33, 5)];
  const shell = C(60, 50, 25);
  return {
    off: [0, -7],
    sil: [bodyS, ...stalks, ...eyes, shell],
    draw(g) {
      part(g, stalks, "#a8d64e", 2);
      part(g, bodyS, lin(g, 0, 50, 0, 88, "#d8f28a", "#96c444"));
      part(g, shell, ball(g, 54, 42, 30, "#ffd0a8", "#ff8f5a", "#dc5f34"));
      strokePath(g, (g) => {
        for (let i = 0; i <= 80; i++) {
          const th = (i / 80) * Math.PI * 4.1;
          const r = 1.5 + th * 1.6;
          const x = 61 + r * Math.cos(th + 2.2);
          const y = 51 + r * Math.sin(th + 2.2);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      }, "#b8452a", 3);
      gloss(g, 48, 33, 6, 3, -0.7, 0.8);
      eyeBall(g, 14, 34, 5, 2.8);
      eyeBall(g, 32, 33, 5, 2.8);
      smile(g, 23, 65, 8, 2.2);
      blush(g, 30, 70, 3, 2);
    },
  };
})();

const ART: Record<StickerId, Art> = {
  frog, dragonfly, goldfish, butterfly, ladybug, bee, apple, tractor, chicken, sunflower,
  horse, balloon, popcorn, ferriswheel, mushroom, crystal, bat, tent, marshmallow, owl,
  squirrel, baseball, tennisball, basketball, soccerball, golfflag, beachball, rainbow, sneaker, snail,
};

const RARITY = new Map<StickerId, StickerRarity>(STICKER_ART.map((s) => [s.id, s.rarity]));

/**
 * A sticker to draw: its art, whether it is a shiny, and a key unique across
 * the game to cache the rendered layer under.
 *
 * Another park's book (candy-stickers.ts) hands one of these in rather than
 * registering its art here. A registry looked tidier and was a trap: it is
 * module state, and anything that ends up with two copies of this module —
 * a dev-server reload, a second bundle — draws every one of that park's
 * stickers as a frog, because the art was registered on the other copy.
 */
export type ArtSource = { key: string; art: Art; shiny?: boolean };

const sourceFor = (id: StickerId): ArtSource => ({ key: id, art: ART[id], shiny: RARITY.get(id) === "shiny" });

/**
 * The drawing kit, so a park's stickers can be drawn in that park's own file
 * in the same language: 100x100 space, thick white die-cut border, chunky dark
 * outlines. Nothing here is specific to a park.
 */
export const ART_KIT = {
  TAU, INK, LW, WHITE,
  shp, E, C, RR, P, LINE, PATH, MIR, star,
  part, blob, clip, strokePath, lin, ball, dot, gloss, twinkle, eye, eyeBall, blush, smile,
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** 100-space is shrunk a little and nudged up so the border and the shadow fit. */
const FIT = 0.9;
const FIT_X = 5;
const FIT_Y = 4;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): G {
  const g = c.getContext("2d");
  if (!g) throw new Error("sticker-art: 2D canvas unavailable");
  return g;
}

function toStickerSpace(g: G, px: number, a: Art): void {
  const k = (px / 100) * FIT;
  g.setTransform(k, 0, 0, k, (px * FIT_X) / 100, (px * FIT_Y) / 100);
  if (a.off) g.translate(a.off[0], a.off[1]);
  g.lineJoin = "round";
  g.lineCap = "round";
}

function paintBorder(g: G, a: Art, edge: string, paper: string): void {
  for (const [color, extra] of [[edge, 2], [paper, 0]] as const) {
    g.fillStyle = color;
    g.strokeStyle = color;
    for (const s of a.sil) {
      g.beginPath();
      s(g);
      if (s.w) {
        g.lineWidth = s.w + BORDER + extra;
        g.stroke();
      } else {
        g.lineWidth = BORDER + extra;
        g.fill();
        g.stroke();
      }
    }
  }
}

function paintGloss(g: G): void {
  g.save();
  g.globalCompositeOperation = "source-atop";
  const gr = g.createLinearGradient(0, 0, 100, 100);
  gr.addColorStop(0, "rgba(255,255,255,0)");
  gr.addColorStop(0.27, "rgba(255,255,255,0)");
  gr.addColorStop(0.32, "rgba(255,255,255,0.3)");
  gr.addColorStop(0.37, "rgba(255,255,255,0)");
  gr.addColorStop(0.41, "rgba(255,255,255,0)");
  gr.addColorStop(0.43, "rgba(255,255,255,0.2)");
  gr.addColorStop(0.45, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(-20, -20, 140, 140);
  g.restore();
}

function paintHolo(g: G): void {
  g.save();
  g.globalCompositeOperation = "source-atop";
  const gr = g.createLinearGradient(5, 0, 95, 100);
  const hues = [320, 20, 55, 130, 190, 250, 320, 20, 55];
  hues.forEach((h, i) => gr.addColorStop(i / (hues.length - 1), `hsla(${h},100%,72%,0.3)`));
  g.fillStyle = gr;
  g.fillRect(-20, -20, 140, 140);
  const streak = g.createLinearGradient(0, 100, 100, 0);
  for (const [t, a] of [[0, 0], [0.18, 0], [0.24, 0.35], [0.3, 0], [0.62, 0], [0.66, 0.28], [0.7, 0], [1, 0]]) {
    streak.addColorStop(t, `rgba(255,255,255,${a})`);
  }
  g.fillStyle = streak;
  g.fillRect(-20, -20, 140, 140);
  for (const [x, y, r] of [[18, 20, 5], [84, 78, 4], [80, 16, 3.2], [16, 82, 3]]) twinkle(g, x, y, r);
  g.restore();
}

/** The sticker (border + art + effects) drawn onto a transparent px-square canvas. */
function renderLayer(src: ArtSource, px: number, found: boolean): HTMLCanvasElement {
  const a = src.art;
  const c = makeCanvas(px, px);
  const g = ctx2d(c);
  toStickerSpace(g, px, a);
  if (found) {
    paintBorder(g, a, "rgba(58,43,32,0.2)", WHITE);
    g.save();
    a.draw(g);
    g.restore();
    paintGloss(g);
    if (src.shiny) paintHolo(g);
    return c;
  }
  // Not found yet: a flat grey cut-out of the exact art shape, with a "?".
  const art = makeCanvas(px, px);
  const ag = ctx2d(art);
  toStickerSpace(ag, px, a);
  a.draw(ag);
  ag.setTransform(1, 0, 0, 1, 0, 0);
  ag.globalCompositeOperation = "source-in";
  ag.fillStyle = "#bdb5ab";
  ag.fillRect(0, 0, px, px);
  paintBorder(g, a, "rgba(58,43,32,0.14)", "#f4f0ea");
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(art, 0, 0);
  g.restore();
  g.setTransform((px / 100) * FIT, 0, 0, (px / 100) * FIT, (px * FIT_X) / 100, (px * FIT_Y) / 100);
  g.font = "900 44px ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 7;
  g.strokeStyle = "#9d9288";
  g.strokeText("?", 50, 53);
  g.fillStyle = WHITE;
  g.fillText("?", 50, 53);
  return c;
}

const layerCache = new Map<string, HTMLCanvasElement>();

function layerFor(src: ArtSource, px: number, found: boolean): HTMLCanvasElement {
  const key = `${src.key}|${px}|${found ? 1 : 0}`;
  let c = layerCache.get(key);
  if (!c) {
    c = renderLayer(src, px, found);
    layerCache.set(key, c);
  }
  return c;
}

/** Draw the sticker centred in a size x size area of g (origin top-left of that area). found=false draws a grey silhouette with a "?" instead. */
export function drawSticker(g: CanvasRenderingContext2D, id: StickerId, size: number, found = true): void {
  drawStickerArt(g, sourceFor(id), size, found);
}

/** As drawSticker, for art this module does not own (another park's book). */
export function drawStickerArt(g: CanvasRenderingContext2D, src: ArtSource, size: number, found = true): void {
  if (!(size > 0)) return;
  const t = g.getTransform();
  const scale = Math.min(4, Math.max(1, Math.hypot(t.a, t.b)));
  const px = Math.max(16, Math.ceil(size * scale));
  const layer = layerFor(src, px, found);
  g.save();
  // Shadow sizes are in device pixels and ignore the transform.
  g.shadowColor = found ? "rgba(45,28,12,0.34)" : "rgba(45,28,12,0.18)";
  g.shadowBlur = (size * scale * 3) / 100;
  g.shadowOffsetX = 0;
  g.shadowOffsetY = (size * scale * 2.2) / 100;
  g.drawImage(layer, 0, 0, size, size);
  g.restore();
}

const urlCache = new Map<string, string>();

/** A cached data URL (PNG) of the sticker for the sticker book UI. */
export function stickerDataUrl(id: StickerId, size = 128, found = true): string {
  return stickerDataUrlArt(sourceFor(id), size, found);
}

/** As stickerDataUrl, for art this module does not own. */
export function stickerDataUrlArt(src: ArtSource, size = 128, found = true): string {
  const key = `${src.key}|${size}|${found ? 1 : 0}`;
  let url = urlCache.get(key);
  if (!url) {
    const c = makeCanvas(size, size);
    drawStickerArt(ctx2d(c), src, size, found);
    url = c.toDataURL("image/png");
    urlCache.set(key, url);
  }
  return url;
}

const texCache = new Map<string, THREE.CanvasTexture>();

/** A cached THREE.CanvasTexture (256px, transparent background, sRGB) for the floating pickup in the park. */
export function stickerTexture(id: StickerId): THREE.CanvasTexture {
  return stickerTextureArt(sourceFor(id));
}

/** As stickerTexture, for art this module does not own. */
export function stickerTextureArt(src: ArtSource): THREE.CanvasTexture {
  const key = `${src.key}|256|1`;
  let tex = texCache.get(key);
  if (!tex) {
    const c = makeCanvas(256, 256);
    drawStickerArt(ctx2d(c), src, 256, true);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    texCache.set(key, tex);
  }
  return tex;
}
