import * as THREE from "three";

/**
 * Dumpling finishes.
 *
 * Rarer finishes go on the harder hiding spots, so the payoff matches the
 * effort. Gold and pearl lean on the scene's PMREM environment map, which is
 * already set up, so they cost almost nothing. Rainbow and iridescent inject a
 * little shader code. Glow is emissive plus a brighter spark light.
 */

export type Finish = "plain" | "gold" | "pearl" | "iridescent" | "rainbow" | "glow";

export type FinishRig = {
  materials: THREE.Material[];
  /** Called each frame for the animated finishes. */
  update: (t: number) => void;
  /** Extra brightness for the dumpling's point light. */
  sparkBoost: number;
};

const shared = { uTime: { value: 0 } };

/** Lift a colour toward white without losing its hue. */
function lighten(hex: string, amount: number) {
  return new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), amount);
}

function hueOf(hex: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  return hsl.h;
}

/**
 * Oil-slick shader, applied on top of the standard lighting model.
 *
 * It used to replace the colour outright with a full-spectrum hue cycle, which
 * meant Cocoa Pillow and Mint Cloud — the only two rainbows in the park — were
 * the same rainbow ball, and neither was its own colour any more. Now the hue
 * sweeps a band either side of the dumpling's own hue, so Cocoa shimmers
 * chocolate to gold to rose and Mint shimmers green to teal to lime. Both still
 * read as the special, rarer finish, and they no longer read as each other.
 */
function rainbowMaterial(base: string) {
  const m = new THREE.MeshStandardMaterial({
    color: base,
    roughness: 0.3,
    metalness: 0.12,
  });
  const hue = hueOf(base);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uHue = { value: hue };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n varying vec3 vLocalPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vLocalPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform float uHue;
         varying vec3 vLocalPos;
         // hue to rgb at full saturation. The 1.0 - matters: without it this
         // returns the complement, which nobody noticed while the finish swept
         // the whole wheel, and which put a cyan-and-violet Cocoa Pillow on the
         // first attempt at anchoring the sweep to each dumpling's own hue.
         vec3 hue2rgb(float h) {
           vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);
           return 1.0 - clamp(min(k, 4.0 - k), 0.0, 1.0);
         }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float band = vLocalPos.y * 1.1 + vLocalPos.x * 0.35 + uTime * 0.22;
         // a smooth sweep, so there is no hard violet-to-red seam down its side
         float h = uHue + sin(band * 4.0) * 0.12;
         // keep the dumpling's own brightness: a full-strength slick turns a
         // chocolate bun into a neon one
         float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
         vec3 slick = hue2rgb(fract(h + 1.0)) * (0.16 + luma * 0.8);
         diffuseColor.rgb = mix(diffuseColor.rgb, slick, 0.52);`,
      );
  };
  // one program for every rainbow; the hue is a uniform, not a #define
  m.customProgramCacheKey = () => "sloanie-rainbow";
  return m;
}

/**
 * Soap-bubble sheen. Kept low in metalness so the dumpling's own colour still
 * comes through: at 0.35 metal with 0.14 roughness, Lemon Drop and Berry Squish
 * were mostly reflected sky, and the specular ran past the bloom threshold and
 * flared into a white smear in sunlight.
 */
function irisMaterial(base: THREE.ColorRepresentation) {
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.3,
    metalness: 0.1,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [140, 440],
    clearcoat: 0.42,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.7,
  });
}

/**
 * Swap a dumpling group's materials for the chosen finish.
 * The accent parts keep their own colour so the dumpling still reads as itself.
 */
export function applyFinish(
  group: THREE.Object3D,
  finish: Finish,
  color: string,
  accent: string,
): FinishRig {
  if (finish === "plain") {
    return { materials: [], update: () => {}, sparkBoost: 0 };
  }

  const made: THREE.Material[] = [];
  let pulse: THREE.MeshStandardMaterial | null = null;

  const build = (isAccent: boolean): THREE.Material => {
    const base = isAccent ? accent : color;
    switch (finish) {
      case "gold": {
        // roughness 0.26 put a mirror finish on a sphere under a bright sun:
        // the highlight blew through the bloom threshold as one white smear
        // across its face. A softer gold still reads as gold and keeps a face.
        const m = new THREE.MeshStandardMaterial({
          color: isAccent ? "#ffe9a8" : "#e0ae3e",
          metalness: 1,
          roughness: isAccent ? 0.2 : 0.34,
          envMapIntensity: 0.85,
        });
        made.push(m);
        return m;
      }
      case "pearl": {
        // A pearl was one fixed near-white at 0.9 metalness, so Honey Fold,
        // Raindrop and S'more Puff all came out as the same cold chrome ball
        // with nothing of their own colour left. A pearl is now the dumpling's
        // own colour, lifted and glazed.
        const m = new THREE.MeshPhysicalMaterial({
          color: lighten(base, isAccent ? 0.16 : 0.26),
          metalness: 0.18,
          roughness: 0.22,
          clearcoat: 1,
          clearcoatRoughness: 0.14,
          envMapIntensity: 1,
        });
        made.push(m);
        return m;
      }
      case "iridescent": {
        // the knot used to be forced to pure white, which threw away the one
        // detail that tells Blush Bao from Berry Squish across a room
        const m = irisMaterial(isAccent ? lighten(base, 0.22) : base);
        made.push(m);
        return m;
      }
      case "rainbow": {
        const m = rainbowMaterial(base);
        made.push(m);
        return m;
      }
      case "glow": {
        // At 1.1 on an almost-white body this was a bare lightbulb: Moon Gyoza
        // and Sky Dumpling were featureless white blobs with no face, no pleats
        // and no colour, and in sunlight the bloom smeared them out entirely.
        // Half that still lights the cave and leaves a dumpling to look at.
        const m = new THREE.MeshStandardMaterial({
          color: base,
          roughness: 0.4,
          metalness: 0,
          emissive: new THREE.Color(isAccent ? accent : color),
          emissiveIntensity: isAccent ? 0.6 : 0.5,
        });
        if (!isAccent) pulse = m;
        made.push(m);
        return m;
      }
      default: {
        const m = new THREE.MeshStandardMaterial({ color: base });
        made.push(m);
        return m;
      }
    }
  };

  const bodyMat = build(false);
  const accentMat = build(true);

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // eyes, mouth and cheeks keep their own colours; gold eyeballs are not cute
    if (m.userData.noFinish) return;
    // the dumpling is a body plus small accent details; keep that split
    const old = m.material as THREE.MeshStandardMaterial;
    const isAccent =
      old && old.color ? old.color.getHexString() === new THREE.Color(accent).getHexString() : false;
    m.material = isAccent ? accentMat : bodyMat;
  });

  return {
    materials: made,
    update: (t: number) => {
      shared.uTime.value = t;
      if (pulse) {
        (pulse as THREE.MeshStandardMaterial).emissiveIntensity = 0.44 + Math.sin(t * 2.4) * 0.16;
      }
    },
    sparkBoost: finish === "glow" ? 1.8 : finish === "rainbow" ? 0.5 : 0.2,
  };
}
