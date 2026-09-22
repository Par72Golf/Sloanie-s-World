import { setBowlsOrigin } from "./bowls";
import { setCarnivalOrigin } from "./carnival";
import { setEmmettBase } from "./emmett-base";
import { featuresFor } from "./features";
import { setHouseOrigin } from "./home";
import { setCandyHouseOrigin } from "./sugar-home";
import { setLavaStart } from "./lava";
import { setGolfOrigin } from "./park";
import { setZooOrigin } from "./zoo";
import type { LevelDef } from "./types";

/**
 * Put every shared feature where this park keeps it.
 *
 * The games are each authored in their own local frame round one origin, and
 * that origin is a table the whole module reads — the ball's physics, the art,
 * the camera and the tools all go through it. Handing the origin down through
 * every one of those calls would be a hundred parameters for a number that
 * changes once, when the park loads, so it is installed here instead.
 *
 * Call this before building the world: world-build reads the carnival's and
 * the yard's tables while it draws them. Passing no origin puts a feature back
 * where its own module keeps it, which is park 1's spot, so a park that turns
 * a feature on without saying where gets the original one.
 */
export function applyLevelOrigins(level: LevelDef) {
  const feat = featuresFor(level);
  setGolfOrigin(feat.golf);
  setBowlsOrigin(feat.bowls);
  setLavaStart(feat.lava);
  setHouseOrigin(feat.home);
  setCandyHouseOrigin(feat.home);
  setZooOrigin(feat.zoo);
  setEmmettBase(feat.emmettBase);
  setCarnivalOrigin(feat.carnival);
}
