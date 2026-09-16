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

/** Hue-cycling shader, applied on top of the standard lighting model. */
function rainbowMaterial(base: string) {
  const m = new THREE.MeshStandardMaterial({
    color: base,
    roughness: 0.28,
    metalness: 0.25,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n varying vec3 vLocalPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vLocalPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         varying vec3 vLocalPos;
         vec3 hue2rgb(float h) {
           vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);
           return clamp(min(k, 4.0 - k), 0.0, 1.0);
         }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float band = vLocalPos.y * 1.1 + vLocalPos.x * 0.35 + uTime * 0.22;
         diffuseColor.rgb = mix(diffuseColor.rgb, hue2rgb(fract(band)), 0.82);`,
      );
  };
  m.customProgramCacheKey = () => "sloanie-rainbow";
  return m;
}

function irisMaterial(base: string) {
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.14,
    metalness: 0.35,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 560],
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
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
        const m = new THREE.MeshStandardMaterial({
          color: isAccent ? "#fff2c0" : "#e8b53c",
          metalness: 1,
          roughness: isAccent ? 0.12 : 0.26,
        });
        made.push(m);
        return m;
      }
      case "pearl": {
        const m = new THREE.MeshPhysicalMaterial({
          color: isAccent ? "#ffffff" : "#eef2f6",
          metalness: 0.9,
          roughness: 0.08,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
        });
        made.push(m);
        return m;
      }
      case "iridescent": {
        const m = irisMaterial(isAccent ? "#ffffff" : base);
        made.push(m);
        return m;
      }
      case "rainbow": {
        const m = rainbowMaterial(base);
        made.push(m);
        return m;
      }
      case "glow": {
        const m = new THREE.MeshStandardMaterial({
          color: base,
          roughness: 0.4,
          metalness: 0,
          emissive: new THREE.Color(isAccent ? accent : color),
          emissiveIntensity: 1.1,
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
        (pulse as THREE.MeshStandardMaterial).emissiveIntensity = 0.85 + Math.sin(t * 2.4) * 0.35;
      }
    },
    sparkBoost: finish === "glow" ? 1.8 : finish === "rainbow" ? 0.5 : 0.2,
  };
}
