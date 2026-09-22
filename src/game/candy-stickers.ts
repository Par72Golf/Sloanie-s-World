import {
  ART_KIT,
  drawStickerArt,
  stickerDataUrlArt,
  stickerTextureArt,
  type Art,
  type ArtSource,
  type StickerRarity,
} from "./sticker-art";
import type { StickerSpot } from "./collectibles";
import type { StickerSet } from "./stickers-world";
import { SUGAR, mazeCell } from "./sugar-rush";

/**
 * Sugar Rush Park's sticker hunt: twenty sweets to find, and the candy sticker
 * book that lets her keep them.
 *
 * Park 1's hunt is in collectibles.ts (where) and sticker-art.ts (what they
 * look like). This park's is one file, because its spots and its art were
 * decided together: a gumball sticker by the gumball machine, a licorice wheel
 * deep in the licorice maze.
 *
 * The rules the spots have to pass are park 1's, since the checks are shared:
 * at least 4m from anything else hidden (candies, boosts, accessories, the
 * other stickers, the book), never on a path or in the chocolate, and
 * reachable on foot from the spawn without jumping. Positions come off the
 * region centres in sugar-rush.ts, so moving a region moves its stickers.
 *
 * y is 0.9: the park's ground plus the height a pickup floats at.
 */

export type CandyStickerId =
  | "gumballs"
  | "candycane"
  | "cupcake"
  | "donut"
  | "icecream"
  | "gummy"
  | "swirlpop"
  | "chocbar"
  | "jellybeans"
  | "mallow"
  | "cottonfloss"
  | "gumdrop"
  | "licorice"
  | "sourworm"
  | "peppermint"
  | "toffeeapple"
  | "macaron"
  | "gingerbreadman"
  | "popsicle"
  | "rockcandy";

/* ------------------------------------------------------------------ the art */

const {
  TAU,
  WHITE,
  C,
  E,
  RR,
  P,
  LINE,
  PATH,
  part,
  blob,
  clip,
  strokePath,
  lin,
  ball,
  dot,
  gloss,
  twinkle,
  eye,
  smile,
  blush,
} = ART_KIT;

/** Sugar crystals scattered over a sweet: what makes a gumdrop look sugared. */
function sugar(
  g: CanvasRenderingContext2D,
  pts: [number, number, number][],
  color = "rgba(255,255,255,0.92)",
) {
  for (const [x, y, r] of pts) dot(g, x, y, r, color);
}

const gumballs: Art = (() => {
  const a = C(34, 62, 22);
  const b = C(68, 58, 20);
  const c = C(52, 28, 17);
  return {
    sil: [a, b, c],
    draw(g) {
      part(g, a, ball(g, 34, 62, 22, "#ff9bb6", "#e8384f", "#a81a34"));
      part(g, b, ball(g, 68, 58, 20, "#9fe8ff", "#39a8e8", "#1a6aa8"));
      part(g, c, ball(g, 52, 28, 17, "#fff0a8", "#ffc83a", "#d99010"));
      gloss(g, 26, 53, 6, 4, -0.6);
      gloss(g, 61, 50, 5, 3.4, -0.6);
      gloss(g, 46, 21, 4.5, 3, -0.6);
    },
  };
})();

const candycane: Art = (() => {
  /*
   * The stripes are a dashed white stroke laid over a red one, not a clip.
   * Clipping to the cane does not work: it is an open line, and a clip uses
   * the path's fill, which for a line is a sliver — the first version came out
   * as an empty outline with two stripes in it.
   */
  const path = (g: CanvasRenderingContext2D) => {
    g.moveTo(62, 88);
    g.lineTo(62, 44);
    g.bezierCurveTo(62, 20, 30, 20, 30, 44);
    g.lineTo(30, 54);
  };
  const cane = PATH(path, 19);
  return {
    sil: [cane],
    draw(g) {
      part(g, cane, "#e8384f");
      g.save();
      g.setLineDash([9, 9]);
      g.lineCap = "butt";
      strokePath(g, path, "#fffaf4", 19);
      g.restore();
      g.lineCap = "round";
      strokePath(
        g,
        (g) => {
          g.moveTo(57, 82);
          g.lineTo(57, 52);
        },
        "rgba(255,255,255,0.35)",
        3,
      );
    },
  };
})();

const cupcake: Art = (() => {
  const cup = P(28, 54, 72, 54, 65, 88, 35, 88);
  const lip = RR(25, 48, 50, 10, 5);
  const frost = [C(36, 44, 15), C(64, 44, 15), C(50, 32, 16), E(50, 46, 22, 12)];
  const cherry = C(50, 15, 8);
  return {
    sil: [cup, lip, ...frost, cherry],
    draw(g) {
      part(g, cup, lin(g, 0, 54, 0, 88, "#ff93c4", "#e8508f"));
      clip(g, cup, () => {
        for (let x = 30; x < 74; x += 8)
          strokePath(
            g,
            (g) => {
              g.moveTo(x, 54);
              g.lineTo(x - 3, 90);
            },
            "rgba(255,255,255,0.45)",
            3,
          );
      });
      part(g, lip, "#f7ead3");
      blob(g, frost, lin(g, 30, 24, 70, 56, "#fffafc", "#ffd9ea"));
      for (const [x, y, c] of [
        [36, 40, "#e8384f"],
        [58, 36, "#39a8e8"],
        [48, 46, "#7fd94a"],
        [64, 46, "#ffc83a"],
        [42, 28, "#b06aff"],
      ] as [number, number, string][]) {
        strokePath(
          g,
          (g) => {
            g.moveTo(x - 3, y - 2);
            g.lineTo(x + 3, y + 2);
          },
          c,
          3.4,
        );
      }
      part(g, cherry, ball(g, 50, 15, 8, "#ff8a8a", "#d81f3c", "#8f0f24"));
      strokePath(
        g,
        (g) => {
          g.moveTo(52, 9);
          g.quadraticCurveTo(58, 2, 64, 4);
        },
        "#4a7a2a",
        3,
      );
      gloss(g, 47, 12, 2.4, 1.6, -0.6);
    },
  };
})();

const donut: Art = (() => {
  const ring = C(50, 52, 33);
  const hole = C(50, 52, 11);
  const icing = PATH((g) => {
    g.moveTo(50, 19);
    g.bezierCurveTo(75, 19, 84, 38, 82, 54);
    g.bezierCurveTo(80, 66, 74, 62, 71, 70);
    g.bezierCurveTo(68, 79, 58, 85, 50, 85);
    g.bezierCurveTo(36, 85, 26, 78, 22, 68);
    g.bezierCurveTo(19, 60, 16, 56, 17, 46);
    g.bezierCurveTo(19, 30, 30, 19, 50, 19);
    g.closePath();
  });
  return {
    sil: [ring],
    draw(g) {
      part(g, ring, ball(g, 40, 40, 40, "#ffd9a0", "#e8a85a", "#b87a34"));
      clip(g, ring, () => part(g, icing, lin(g, 20, 20, 80, 80, "#ffb3d8", "#ff6aa8"), 2.6));
      for (let i = 0; i < 14; i++) {
        const a = i * 1.7;
        const r = 16 + (i % 3) * 7;
        const x = 50 + Math.cos(a) * r;
        const y = 48 + Math.sin(a) * r * 0.95;
        strokePath(
          g,
          (g) => {
            g.moveTo(x - 3, y - 2);
            g.lineTo(x + 3, y + 2);
          },
          ["#fff6ea", "#ffc83a", "#7fd94a", "#39a8e8"][i % 4]!,
          3.2,
        );
      }
      part(g, hole, "#c98a44");
      part(g, C(50, 51, 7), "#a86a30", 0);
      gloss(g, 30, 32, 7, 4, -0.7, 0.55);
    },
  };
})();

const icecream: Art = (() => {
  const cone = P(29, 50, 71, 50, 50, 92);
  const bottom = C(50, 46, 23);
  const top = C(50, 26, 18);
  const cherry = C(50, 10, 7);
  return {
    sil: [cone, bottom, top, cherry],
    draw(g) {
      part(g, cone, lin(g, 29, 50, 71, 92, "#f0c98a", "#c98a44"));
      clip(g, cone, () => {
        for (let i = -60; i < 90; i += 11) {
          strokePath(
            g,
            (g) => {
              g.moveTo(i, 44);
              g.lineTo(i + 60, 100);
            },
            "rgba(120,74,30,0.55)",
            2.4,
          );
          strokePath(
            g,
            (g) => {
              g.moveTo(i + 60, 44);
              g.lineTo(i, 100);
            },
            "rgba(120,74,30,0.55)",
            2.4,
          );
        }
      });
      part(g, bottom, ball(g, 44, 38, 26, "#ffd0e6", "#ff93c4", "#e8508f"));
      part(g, top, ball(g, 45, 20, 20, "#c9ffee", "#6fe3c4", "#2fae8e"));
      part(g, cherry, ball(g, 50, 10, 7, "#ff8a8a", "#d81f3c", "#8f0f24"));
      gloss(g, 38, 36, 6, 3.6, -0.6);
      gloss(g, 42, 20, 4.4, 2.6, -0.6);
    },
  };
})();

const gummy: Art = (() => {
  const head = C(50, 32, 16);
  const ears = [C(33, 20, 8), C(67, 20, 8)];
  const body = E(50, 64, 21, 22);
  const arms = [E(25, 57, 9, 11, -0.4), E(75, 57, 9, 11, 0.4)];
  const legs = [E(34, 85, 11, 8, -0.2), E(66, 85, 11, 8, 0.2)];
  return {
    sil: [head, ...ears, body, ...arms, ...legs],
    draw(g) {
      const green = lin(g, 20, 14, 80, 92, "#b6f58a", "#5fc93a", "#3f9420");
      blob(g, [body, ...arms, ...legs, head, ...ears], green);
      part(g, E(50, 70, 12, 13), "rgba(255,255,255,0.28)", 0);
      part(g, E(50, 40, 9, 7), "rgba(255,255,255,0.3)", 0);
      eye(g, 44, 30, 2.8);
      eye(g, 56, 30, 2.8);
      dot(g, 50, 38, 3.2);
      smile(g, 50, 41, 9, 2.4);
      gloss(g, 40, 22, 5, 3, -0.6, 0.6);
      gloss(g, 38, 58, 4, 8, 0.2, 0.35);
    },
  };
})();

const swirlpop: Art = (() => {
  const disc = C(50, 40, 30);
  const stick = RR(46, 62, 9, 30, 4);
  return {
    sil: [disc, stick],
    draw(g) {
      part(g, stick, "#f7ead3");
      part(g, disc, "#fff6ea");
      clip(g, disc, () => {
        g.beginPath();
        for (let t = 0; t < TAU * 3.2; t += 0.08) {
          const r = 2 + t * 3.1;
          const x = 50 + Math.cos(t) * r;
          const y = 40 + Math.sin(t) * r;
          if (t === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = "#e8384f";
        g.lineWidth = 8.5;
        g.lineCap = "round";
        g.stroke();
      });
      gloss(g, 34, 26, 7, 4.4, -0.7);
      twinkle(g, 74, 18, 6);
      twinkle(g, 22, 60, 4);
    },
  };
})();

const chocbar: Art = (() => {
  const bar = RR(16, 30, 68, 50, 6);
  const foil = P(10, 26, 46, 14, 54, 30, 18, 42);
  return {
    sil: [bar, foil],
    draw(g) {
      part(g, foil, lin(g, 10, 14, 54, 42, "#f2f4f8", "#b8c2cf"));
      part(g, bar, lin(g, 16, 30, 84, 80, "#8a5a34", "#5a3418"));
      for (let i = 1; i < 4; i++)
        strokePath(
          g,
          (g) => {
            g.moveTo(16 + i * 17, 30);
            g.lineTo(16 + i * 17, 80);
          },
          "#43250f",
          3,
        );
      for (let i = 1; i < 3; i++)
        strokePath(
          g,
          (g) => {
            g.moveTo(16, 30 + i * 16.7);
            g.lineTo(84, 30 + i * 16.7);
          },
          "#43250f",
          3,
        );
      for (let i = 0; i < 4; i++) {
        strokePath(
          g,
          (g) => {
            g.moveTo(19 + i * 17, 33);
            g.lineTo(30 + i * 17, 33);
          },
          "rgba(255,255,255,0.3)",
          3,
        );
      }
      strokePath(
        g,
        (g) => {
          g.moveTo(16, 24);
          g.lineTo(44, 16);
        },
        "rgba(255,255,255,0.7)",
        3,
      );
    },
  };
})();

const jellybeans: Art = (() => {
  const a = E(32, 62, 18, 13, -0.35);
  const b = E(66, 66, 17, 12, 0.3);
  const c = E(52, 32, 17, 12, 0.12);
  return {
    sil: [a, b, c],
    draw(g) {
      part(g, a, ball(g, 28, 57, 20, "#ffc2e0", "#ff6aa8", "#c93a78"));
      part(g, b, ball(g, 62, 61, 19, "#d3ffa8", "#7fd94a", "#489a20"));
      part(g, c, ball(g, 48, 27, 19, "#c9e8ff", "#69c8ff", "#2f88c9"));
      gloss(g, 26, 56, 5.5, 3, -0.35);
      gloss(g, 60, 61, 5, 2.8, 0.3);
      gloss(g, 46, 27, 5, 2.8, 0.12);
    },
  };
})();

const mallow: Art = (() => {
  const lower = RR(22, 52, 56, 32, 13);
  const lowerTop = E(50, 52, 28, 9);
  const upper = RR(30, 24, 40, 28, 12);
  const upperTop = E(50, 24, 20, 7);
  return {
    sil: [lower, lowerTop, upper, upperTop],
    draw(g) {
      blob(g, [lower, lowerTop], lin(g, 22, 44, 22, 84, "#ffd6e6", "#ffa8cc"));
      part(g, E(50, 52, 28, 9), "#fff0f6", 2.6);
      blob(g, [upper, upperTop], lin(g, 30, 17, 30, 52, "#fffaf4", "#f0e2d4"));
      part(g, E(50, 24, 20, 7), WHITE, 2.6);
      sugar(g, [
        [36, 66, 1.8],
        [58, 72, 1.6],
        [46, 76, 1.5],
        [66, 60, 1.6],
        [42, 34, 1.5],
        [60, 36, 1.4],
      ]);
      gloss(g, 34, 62, 4, 8, 0.1, 0.4);
    },
  };
})();

const cottonfloss: Art = (() => {
  const cone = P(40, 56, 60, 56, 52, 92, 48, 92);
  const puffs = [C(33, 42, 18), C(66, 41, 18), C(50, 29, 19), C(50, 49, 19)];
  return {
    sil: [cone, ...puffs],
    draw(g) {
      part(g, cone, lin(g, 40, 56, 60, 92, "#f7ead3", "#d9c2a0"));
      strokePath(
        g,
        (g) => {
          g.moveTo(41, 64);
          g.lineTo(59, 64);
        },
        "#b06aff",
        3,
      );
      blob(g, puffs, lin(g, 24, 16, 76, 62, "#fff0f8", "#ff93c4", "#e8508f"));
      for (const [x, y, r] of [
        [36, 34, 6],
        [58, 30, 5],
        [46, 48, 5.5],
        [64, 48, 4.5],
      ] as [number, number, number][]) {
        part(g, C(x, y, r), "rgba(255,255,255,0.42)", 0);
      }
      twinkle(g, 78, 22, 5);
    },
  };
})();

const gumdrop: Art = (() => {
  const dome = PATH((g) => {
    g.moveTo(20, 78);
    g.bezierCurveTo(20, 26, 80, 26, 80, 78);
    g.closePath();
  });
  const base = E(50, 78, 30, 9);
  return {
    sil: [dome, base],
    draw(g) {
      blob(g, [dome, base], ball(g, 40, 44, 44, "#ffd0a8", "#ff8a3a", "#c95a10"));
      part(g, E(50, 78, 30, 9), "#ffb37a", 2.6);
      sugar(g, [
        [30, 60, 2.2],
        [38, 46, 2],
        [52, 38, 2.2],
        [66, 48, 2],
        [72, 62, 2.2],
        [26, 72, 1.8],
        [44, 68, 1.8],
        [60, 66, 2],
        [74, 74, 1.8],
        [50, 54, 1.7],
      ]);
      gloss(g, 36, 44, 5, 9, -0.5, 0.5);
    },
  };
})();

const licorice: Art = (() => {
  const wheel = C(50, 50, 33);
  return {
    sil: [wheel],
    draw(g) {
      part(g, wheel, ball(g, 40, 40, 42, "#5a5060", "#2a2430", "#14101a"));
      clip(g, wheel, () => {
        g.beginPath();
        for (let t = 0; t < TAU * 3.6; t += 0.08) {
          const r = 3 + t * 2.9;
          const x = 50 + Math.cos(t) * r;
          const y = 50 + Math.sin(t) * r;
          if (t === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = "rgba(255,255,255,0.22)";
        g.lineWidth = 2.6;
        g.stroke();
      });
      part(g, C(50, 50, 9), ball(g, 47, 47, 10, "#ff9bb6", "#e8384f", "#a81a34"));
      gloss(g, 32, 30, 7, 4, -0.7, 0.45);
    },
  };
})();

const sourworm: Art = (() => {
  const body = PATH((g) => {
    g.moveTo(20, 72);
    g.bezierCurveTo(28, 40, 46, 84, 56, 52);
    g.bezierCurveTo(63, 30, 78, 32, 80, 48);
  }, 18);
  return {
    sil: [body],
    draw(g) {
      part(g, body, "#7fd94a");
      clip(g, body, () => {
        g.beginPath();
        g.moveTo(52, 0);
        g.lineTo(100, 0);
        g.lineTo(100, 100);
        g.lineTo(52, 100);
        g.closePath();
        g.fillStyle = "#ff8a3a";
        g.fill();
      });
      sugar(
        g,
        [
          [26, 62, 1.8],
          [36, 60, 1.6],
          [44, 70, 1.7],
          [58, 46, 1.7],
          [68, 34, 1.6],
          [76, 44, 1.7],
        ],
        "rgba(255,255,255,0.75)",
      );
      eye(g, 78, 43, 2.4);
      eye(g, 82, 51, 2.2);
      blush(g, 72, 54, 3.4, 2.2);
    },
  };
})();

const peppermint: Art = (() => {
  const disc = C(50, 50, 33);
  return {
    sil: [disc],
    draw(g) {
      part(g, disc, "#fff6ea");
      clip(g, disc, () => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          g.beginPath();
          g.moveTo(50, 50);
          g.arc(50, 50, 34, a, a + 0.42);
          g.closePath();
          g.fillStyle = "#e8384f";
          g.fill();
          g.beginPath();
          g.moveTo(50, 50);
          g.quadraticCurveTo(
            50 + Math.cos(a + 0.5) * 22,
            50 + Math.sin(a + 0.5) * 22,
            50 + Math.cos(a + 0.9) * 34,
            50 + Math.sin(a + 0.9) * 34,
          );
          g.quadraticCurveTo(50 + Math.cos(a + 0.62) * 20, 50 + Math.sin(a + 0.62) * 20, 50, 50);
          g.fillStyle = "#e8384f";
          g.fill();
        }
      });
      part(g, C(50, 50, 7), "#fff6ea", 2.6);
      gloss(g, 33, 31, 7.5, 4.2, -0.7);
    },
  };
})();

const toffeeapple: Art = (() => {
  const apple = C(50, 46, 29);
  const stick = RR(45, 68, 10, 28, 4);
  const leaf = PATH((g) => {
    g.moveTo(58, 20);
    g.quadraticCurveTo(72, 6, 86, 12);
    g.quadraticCurveTo(76, 26, 58, 20);
    g.closePath();
  });
  return {
    sil: [apple, stick, leaf],
    draw(g) {
      part(g, stick, lin(g, 45, 68, 55, 96, "#f0dcbe", "#c9a878"));
      part(g, apple, ball(g, 40, 36, 36, "#ff9b7a", "#d81f3c", "#8f0f24"));
      part(g, leaf, lin(g, 58, 20, 86, 12, "#3f9e30", "#8fdc5a"));
      strokePath(
        g,
        (g) => {
          g.moveTo(50, 20);
          g.quadraticCurveTo(49, 12, 55, 8);
        },
        "#6b4226",
        4,
      );
      gloss(g, 34, 34, 6, 12, -0.5, 0.75);
      dot(g, 62, 60, 3, "rgba(255,255,255,0.55)");
    },
  };
})();

const macaron: Art = (() => {
  const top = RR(16, 24, 68, 25, 12);
  const bottom = RR(16, 53, 68, 25, 12);
  const cream = RR(19, 45, 62, 14, 7);
  return {
    sil: [top, bottom, cream],
    draw(g) {
      // the filling first and with no outline of its own: outlined, the gap
      // between the two shells read as a row of black teeth
      part(g, cream, lin(g, 19, 45, 19, 59, "#fff0c9", "#eccd86"), 0);
      part(g, top, lin(g, 16, 20, 16, 49, "#ffd9ec", "#ff93c4"));
      part(g, bottom, lin(g, 16, 53, 16, 80, "#ffb3d8", "#e8508f"));
      // the ruffled feet: bumps along the inner edge of each shell, drawn
      // over the join so the two outlines do not read as a row of teeth
      for (let i = 0; i < 7; i++) {
        part(g, C(22 + i * 9.4, 47, 4.6), "#ffc6e2", 0);
        part(g, C(22 + i * 9.4, 57, 4.6), "#f09dc4", 0);
      }
      part(g, RR(19, 49.5, 62, 5, 2.5), "#f7dfa4", 0);
      gloss(g, 32, 30, 10, 3.4, -0.1, 0.55);
    },
  };
})();

const gingerbreadman: Art = (() => {
  const head = C(50, 24, 15);
  const body = E(50, 58, 18, 21);
  const arms = LINE(15, 24, 46, 76, 46);
  const legs = [LINE(15, 42, 74, 34, 90), LINE(15, 58, 74, 66, 90)];
  return {
    sil: [head, body, arms, ...legs],
    draw(g) {
      blob(g, [arms, ...legs, body, head], lin(g, 20, 10, 80, 92, "#e0a860", "#b87a34"));
      for (const [x, y] of [
        [50, 50],
        [50, 62],
      ] as [number, number][])
        part(g, C(x, y, 4.2), "#e8384f", 2.2);
      strokePath(
        g,
        (g) => {
          g.moveTo(26, 44);
          g.lineTo(34, 48);
          g.lineTo(26, 52);
        },
        "#fff6ea",
        3,
      );
      strokePath(
        g,
        (g) => {
          g.moveTo(74, 44);
          g.lineTo(66, 48);
          g.lineTo(74, 52);
        },
        "#fff6ea",
        3,
      );
      strokePath(
        g,
        (g) => {
          g.moveTo(38, 82);
          g.lineTo(46, 79);
        },
        "#fff6ea",
        3,
      );
      strokePath(
        g,
        (g) => {
          g.moveTo(62, 82);
          g.lineTo(54, 79);
        },
        "#fff6ea",
        3,
      );
      eye(g, 44, 22, 2.8);
      eye(g, 56, 22, 2.8);
      smile(g, 50, 29, 12, 2.6);
      blush(g, 38, 29, 4, 2.4);
      blush(g, 62, 29, 4, 2.4);
    },
  };
})();

const popsicle: Art = (() => {
  const body = RR(27, 12, 46, 58, 16);
  const stick = RR(42, 66, 16, 24, 4);
  return {
    sil: [body, stick],
    draw(g) {
      part(g, stick, lin(g, 42, 66, 52, 90, "#f0dcbe", "#c9a878"));
      part(g, body, lin(g, 27, 12, 27, 70, "#ff93c4", "#ff6aa8"));
      clip(g, body, () => {
        g.beginPath();
        g.moveTo(20, 44);
        g.bezierCurveTo(36, 38, 42, 50, 56, 44);
        g.bezierCurveTo(68, 39, 74, 48, 82, 44);
        g.lineTo(82, 76);
        g.lineTo(20, 76);
        g.closePath();
        g.fillStyle = "#ffc83a";
        g.fill();
      });
      gloss(g, 36, 24, 4.5, 10, 0.1, 0.6);
      dot(g, 62, 26, 3, "rgba(255,255,255,0.5)");
    },
  };
})();

const rockcandy: Art = (() => {
  const stick = RR(45, 52, 10, 40, 4);
  const crystals = [
    P(30, 34, 42, 18, 54, 30, 50, 54, 34, 54),
    P(50, 26, 64, 16, 74, 32, 68, 54, 52, 52),
    P(26, 46, 38, 40, 44, 58, 34, 68),
    P(58, 44, 74, 44, 76, 62, 60, 62),
  ];
  return {
    sil: [stick, ...crystals],
    draw(g) {
      part(g, stick, lin(g, 45, 52, 55, 92, "#f0dcbe", "#c9a878"));
      const faces = ["#d8a8ff", "#b06aff", "#e8c2ff", "#9b4ae0"];
      crystals.forEach((c, i) =>
        part(g, c, lin(g, 26, 16, 76, 68, faces[i]!, i % 2 ? "#7a2fc0" : "#c98aff")),
      );
      strokePath(
        g,
        (g) => {
          g.moveTo(36, 30);
          g.lineTo(42, 22);
        },
        "rgba(255,255,255,0.7)",
        3,
      );
      strokePath(
        g,
        (g) => {
          g.moveTo(60, 28);
          g.lineTo(68, 22);
        },
        "rgba(255,255,255,0.6)",
        3,
      );
      twinkle(g, 22, 26, 6);
      twinkle(g, 82, 36, 5);
    },
  };
})();

/* ------------------------------------------------------------- the book list */

export type CandyStickerDef = { id: CandyStickerId; name: string; rarity: StickerRarity; art: Art };

/** Sugar Rush's sticker book, in the order it shows them. */
export const CANDY_STICKER_ART: CandyStickerDef[] = [
  { id: "gumballs", name: "Gumballs", rarity: "common", art: gumballs },
  { id: "candycane", name: "Candy Cane", rarity: "common", art: candycane },
  { id: "cupcake", name: "Cupcake", rarity: "common", art: cupcake },
  { id: "donut", name: "Donut", rarity: "common", art: donut },
  { id: "icecream", name: "Ice Cream", rarity: "common", art: icecream },
  { id: "gummy", name: "Gummy Bear", rarity: "rare", art: gummy },
  { id: "swirlpop", name: "Swirl Lollipop", rarity: "shiny", art: swirlpop },
  { id: "chocbar", name: "Chocolate Bar", rarity: "common", art: chocbar },
  { id: "jellybeans", name: "Jelly Beans", rarity: "common", art: jellybeans },
  { id: "mallow", name: "Marshmallows", rarity: "common", art: mallow },
  { id: "cottonfloss", name: "Cotton Candy", rarity: "common", art: cottonfloss },
  { id: "gumdrop", name: "Gumdrop", rarity: "common", art: gumdrop },
  { id: "licorice", name: "Licorice Wheel", rarity: "rare", art: licorice },
  { id: "sourworm", name: "Sour Worm", rarity: "rare", art: sourworm },
  { id: "peppermint", name: "Peppermint Swirl", rarity: "common", art: peppermint },
  { id: "toffeeapple", name: "Toffee Apple", rarity: "rare", art: toffeeapple },
  { id: "macaron", name: "Macaron", rarity: "common", art: macaron },
  { id: "gingerbreadman", name: "Gingerbread Man", rarity: "rare", art: gingerbreadman },
  { id: "popsicle", name: "Ice Lolly", rarity: "common", art: popsicle },
  { id: "rockcandy", name: "Rock Candy", rarity: "shiny", art: rockcandy },
];

/**
 * The art handed to sticker-art.ts's renderer. It is passed in rather than
 * registered: the drawing is shared, the art is this park's, and nothing
 * depends on which file loaded first.
 */
const SOURCES = new Map<string, ArtSource>(
  CANDY_STICKER_ART.map((s) => [
    s.id as string,
    { key: s.id, art: s.art, shiny: s.rarity === "shiny" },
  ]),
);

const sourceFor = (id: string): ArtSource => SOURCES.get(id) ?? SOURCES.get("gumballs")!;

/** One of this park's stickers as a texture for the floating pickup. */
export function candyStickerTexture(id: string) {
  return stickerTextureArt(sourceFor(id));
}

/** One of this park's stickers as a data URL, for the sticker book UI. */
export function candyStickerDataUrl(id: string, size = 128, found = true) {
  return stickerDataUrlArt(sourceFor(id), size, found);
}

/** One of this park's stickers drawn straight onto a canvas. */
export function drawCandySticker(
  g: CanvasRenderingContext2D,
  id: string,
  size: number,
  found = true,
) {
  drawStickerArt(g, sourceFor(id), size, found);
}

/* ----------------------------------------------------------------- the spots */

const at = (x: number, z: number): [number, number, number] => [x, 0.9, z];

/**
 * Where the twenty are, off the region centres in sugar-rush.ts.
 *
 * A function rather than a table, for the same reason as the accessories':
 * this file reads SUGAR, and the park's module reaches back here, so a table
 * built at module load would read an empty SUGAR if anything imported this
 * file before the park's.
 */
export function candyStickerSpots(): StickerSpot[] {
  const P2 = SUGAR.plaza;
  return [
    {
      id: "gumballs",
      pos: at(P2.x - 18, P2.z + 12),
      area: "the sweet shop street",
      hint: "Gumballs spilled in front of the candy stall on the north side of the sweet shop street, just south of where you start.",
    },
    {
      id: "peppermint",
      pos: at(P2.x + 17, P2.z - 12),
      area: "Peppermint Plaza",
      hint: "A peppermint swirl is on the grass north-east of the big peppermint plaza.",
    },
    {
      id: "candycane",
      pos: at(P2.x - 19, P2.z - 5),
      area: "Peppermint Plaza",
      hint: "A candy cane is lying just outside the plaza, on its north-west side.",
    },
    {
      id: "macaron",
      pos: at(P2.x - 54, P2.z + 16),
      area: "the sweet shop street",
      hint: "A macaron rolled past the last cottage, at the west end of the sweet shop street.",
    },
    {
      id: "jellybeans",
      // the walled candy garden round the chocolate fountain (sugar-rush.ts)
      pos: at(-28.5, 9.5),
      area: "the candy garden",
      hint: "Jelly beans are spilled in the walled garden with the chocolate fountain, west of the plaza.",
    },
    {
      id: "chocbar",
      pos: at(SUGAR.factory.x - 19, SUGAR.factory.z + 10),
      area: "the candy factory",
      hint: "A chocolate bar is round the west side of the candy factory.",
    },
    {
      id: "gumdrop",
      pos: at(SUGAR.meadow.x - 12, SUGAR.meadow.z - 6),
      area: "Gumdrop Meadow",
      hint: "A gumdrop is sitting among the gumdrop hills, on the west side of the meadow.",
    },
    {
      id: "cottonfloss",
      pos: at(SUGAR.meadow.x + 16, SUGAR.meadow.z - 10),
      area: "Gumdrop Meadow",
      hint: "Cotton candy floated to the north-east corner of the gumdrop meadow.",
    },
    {
      id: "licorice",
      // a corner cell of the maze, well away from the licorice twist in the middle
      pos: at(mazeCell(1, 4)[0], mazeCell(1, 4)[1]),
      area: "the Licorice Maze",
      hint: "A licorice wheel is deep in the licorice maze, in the south-west of it.",
    },
    {
      id: "gummy",
      pos: at(SUGAR.forest.x - 7.5, SUGAR.forest.z + 9),
      area: "the Lollipop Forest",
      hint: "A gummy bear is hiding in the lollipop woods, south of the princess's clearing.",
    },
    {
      id: "swirlpop",
      pos: at(SUGAR.forest.x + 27, SUGAR.forest.z - 10),
      area: "the Lollipop Forest",
      hint: "A swirl lollipop is at the east edge of the lollipop woods, off the trail.",
    },
    {
      id: "toffeeapple",
      pos: at(SUGAR.village.x - 5, SUGAR.village.z - 16),
      area: "Gingerbread Village",
      hint: "A toffee apple is by the gingerbread house at the north end of the village.",
    },
    {
      id: "gingerbreadman",
      pos: at(SUGAR.village.x - 1, SUGAR.village.z + 14),
      area: "Gingerbread Village",
      hint: "A gingerbread man ran off to the south side of the village square.",
    },
    {
      id: "donut",
      pos: at(SUGAR.village.x + 7, SUGAR.village.z + 13),
      area: "Gingerbread Village",
      hint: "A donut is behind the candy shop on the village square.",
    },
    {
      id: "icecream",
      pos: at(SUGAR.mountain.x + 24, SUGAR.mountain.z + 1),
      area: "Ice Cream Mountain",
      hint: "An ice cream cone is on the grass east of Ice Cream Mountain, near the top of the chocolate river.",
    },
    {
      id: "rockcandy",
      pos: at(SUGAR.mountain.x - 15, SUGAR.mountain.z - 2),
      area: "Ice Cream Mountain",
      hint: "Rock candy is growing on the west side of Ice Cream Mountain, far to the north-west.",
    },
    {
      id: "popsicle",
      pos: at(SUGAR.mountain.x + 19, SUGAR.mountain.z - 6),
      area: "Ice Cream Mountain",
      hint: "An ice lolly is melting on the north-east side of Ice Cream Mountain.",
    },
    {
      id: "mallow",
      pos: at(SUGAR.marshmallow.x + 11, SUGAR.marshmallow.z - 12.5),
      area: "Marshmallow Fields",
      hint: "Marshmallows are stacked on the bouncy white fields, far to the south.",
    },
    {
      id: "cupcake",
      pos: at(SUGAR.fair.x - 17, SUGAR.fair.z + 8),
      area: "the fairground",
      hint: "A cupcake is in front of the candy stalls at the fairground.",
    },
    {
      id: "sourworm",
      pos: at(SUGAR.lake.x - 23, SUGAR.lake.z - 0.5),
      area: "the chocolate lake",
      hint: "A sour worm is wiggling on the shore of the chocolate lake, in the far south-east corner.",
    },
  ];
}

/** Her candy sticker book, a short walk east of where she arrives. */
export function candyStickerBook(): { pos: [number, number, number]; hint: string } {
  return {
    pos: at(SUGAR.plaza.x + 25, SUGAR.plaza.z + 18),
    hint: "Your candy sticker book is just east of where you start, past the end of the sweet shop street.",
  };
}

/* ------------------------------------------------------------------- the set */

/**
 * What the store has to provide for this park's book. The fields are added to
 * store.ts when this is wired up (candyStickerBook / findCandyStickerBook);
 * until then the book simply cannot be picked up, which is the safe failure.
 */
type CandyBookStore = {
  candyStickerBook?: boolean;
  findCandyStickerBook?: () => void;
};
const bookStore = (st: unknown) => st as CandyBookStore;

/** The park's hunt, ready to hand to StickerWorld. */
export function candyStickers(): StickerSet {
  return {
    spots: candyStickerSpots(),
    book: candyStickerBook(),
    // a pink book with an icing spine and a gold candy badge
    bookColors: {
      cover: "#ff6aa8",
      pages: "#fff6ea",
      badge: "#ffc83a",
      ring: "#ffd0e6",
      glow: "#ff5fa8",
    },
    texture: candyStickerTexture,
    names: new Map(CANDY_STICKER_ART.map((s) => [s.id as string, s.name])),
    hasBook: (st) => bookStore(st).candyStickerBook === true,
    findBook: (st) => bookStore(st).findCandyStickerBook?.(),
    take: (st, id, name) => st.findSticker(id, name),
    needBook: (name) =>
      `A ${name.toLowerCase()} sticker! You need a candy sticker book to keep it. There's one near where you started.`,
  };
}
