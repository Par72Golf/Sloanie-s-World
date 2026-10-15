---
paths:
  - src/game/levels.ts
  - src/game/world-build.ts
  - src/game/park.ts
  - src/game/placement.ts
  - src/game/collision.ts
  - src/game/merge.ts
  - src/game/build-yard.ts
  - src/game/candy-builds.ts
  - src/game/sugar-rush.ts
  - src/game/sugar-models.ts
  - src/game/sugar-model-boxes.ts
  - tools/**
---

# Geometry and layout rules

Nothing here can render a frame. Every geometry bug in this project was found by a
person playing it or by a script in `tools/`. Run them with `npx jiti tools/<name>.ts`.

## After any geometry change

- Run `npx jiti tools/check-layout.ts` (park 1) and `LEVEL=1 npx jiti tools/check-layout.ts`
  (Sugar Rush) and paste the output. It rebuilds the engine's exact colliders and reports
  overlaps, z-fighting, floating or buried collectibles, and reachability from spawn.
- On an "invisible wall at <place>" report, run `tools/near.ts x z radius` first, then
  `tools/walk.ts`, which must print 0 stalls.
- `tools/parkmap.ts` prints an ASCII map of a region. Use it to see what is actually there
  before moving anything. Coordinates typed by hand were wrong about a third of the time;
  coordinates checked by a tool almost never.
- `.github/workflows/pages.yml` is the full list of checks CI runs. Run the ones that cover
  what you touched.
- A new class of bug gets a new check in `tools/`, not just a fix for the instance.

## Three rules that keep performance sane (HANDOFF.md section 2)

1. The game loop never writes to the Zustand store per frame. Positions go through the
   mutable object in `pose.ts`.
2. Materials and geometries are cached and shared: `lam()` by colour and material
   properties, `beveledBox()` by quantised size.
3. Static meshes are merged after the world is built (`merge.ts`, end of `buildWorld`).
   Anything that must move at runtime is added to the `live` set or flagged
   `userData.cloudDrift`, or it will be frozen in place.

Hard-won constraints, each one a trap that has been re-entered before: HANDOFF.md
section 4. Read that section before placing anything by hand.
