# Sloanie's World

A 3D dumpling-hunting game built for Sloan. Vite + React single-page app, Three.js
r186 with no physics engine, and a Zustand store bridging the game loop and the UI.
Everything is procedural: no model, texture or audio files.

## Commands

- `npm run dev` — dev server on http://127.0.0.1:8080
- `npm run typecheck` — `tsc --noEmit`
- `npm run check` — typecheck plus `tools/check-layout.ts`; run after any geometry change
- `npm run build` — production build

Typecheck or build failing is a stop condition. Add new checks to `tools/` rather than
writing throwaway ones; the suite compounds.

## Where things are

| File                      | What                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `src/game/runtime.ts`     | Game loop: movement, camera, collisions, dumplings, Emmett |
| `src/game/levels.ts`      | Level data and the placement search                        |
| `src/game/world-build.ts` | Level data to meshes and colliders; the solidity rule      |
| `src/game/meshes.ts`      | Procedural meshes and character animation                  |
| `src/game/overlays.tsx`   | All UI                                                     |
| `src/game/store.ts`       | Zustand store between the loop and the UI                  |

Full file map and the three performance rules: HANDOFF.md section 2. Tooling: section 3.
Hard-won constraints: section 4. How to prompt here: section 7. Sugar Rush park:
SUGAR-RUSH.md. HANDOFF.md is 56 KB; read the section a task needs, never the whole file.

## Working rules (keep token use low)

- Grep for the symbol first, then read only the surrounding range. Several files are
  2,000 to 3,300 lines. Never read one end to end unless asked.
- Do not read `package-lock.json`, `dist/`, `house-dist/` or `public/` assets with any
  tool, including `cat` in Bash.
- Confirm an edit with `npm run check`, not by re-reading the file.
- Reply tersely. The diff and the check output are the report; do not restate the plan.
- Do not spawn subagents or workflows unless asked.
- Do not take screenshots unless asked; say what a check proves instead. The model
  cannot judge how things look. Screenshots from the person playing are the visual
  feedback loop.
- Explain the cause of a bug before fixing it. The stated symptom is often not the real
  problem (HANDOFF.md 7.3).

# Compact instructions

When compacting, keep the task statement, the files changed with line ranges, the last
check output, and anything not yet verified. Drop file contents that have already been
edited.
