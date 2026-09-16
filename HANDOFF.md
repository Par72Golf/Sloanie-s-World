# Sloanie's World — Handoff

A 3D dumpling-hunting game built as a birthday present for Sloan, turning 7 in late
September 2026. Played on a PC hooked up to a TV, keyboard or controller.

This document is written to be dropped into the repo root so Claude Code reads it as
context. It covers what exists, what the tooling is for, the bugs that cost the most
time and why, what "finished" would actually require, and how to prompt effectively
on this specific project.

Current version: **v2.9**.

### Since v2.8 (16 Sept 2026)

- The Grok scaffold (TanStack Start, Nitro, Vercel, pglite, better-auth) is gone.
  The app is now a plain Vite + React single-page app: `index.html`,
  `src/main.tsx`, `vite.config.ts`. Dependencies went from 429 packages to 98.
  The old scaffold is preserved in the first git commit if anything is ever needed.
- The repo lives at https://github.com/Par72Golf/Sloanie-s-World and every push to
  `main` builds and publishes to GitHub Pages via `.github/workflows/pages.yml`.
  The workflow runs the typecheck and `check-layout.ts` before it builds, so a
  broken layout cannot ship.
- Target machine is now a MacBook Pro on a TV over HDMI with an 8BitDo Ultimate
  controller, not a Windows PC. The launch path is a URL opened fullscreen.
- Claude Code in the desktop app has a browser pane, so it can now boot the game
  and take screenshots. Section 7.2 is out of date on that point.
- Rendering now goes through an `EffectComposer` (`runtime.ts`): multisampled
  half-float render target, `UnrealBloomPass` (strength 0.5, radius 0.5, threshold
  0.78), `OutputPass`. Tone mapping is `NeutralToneMapping` at exposure 1.08, the
  sun is 2.0 and warm, shadows are PCF with radius 4. The canvas `antialias` flag
  no longer does anything; the target's `samples: 4` is the antialiasing.
- Static meshes are merged after build (`merge.ts`), the camera looks over low
  obstacles (`camera.ts`), the maze has an exit and gates, and jumping is disabled
  around it (`noJump` on the level). Each has a tool in `tools/`.
- Fullscreen (`fullscreen.ts`): entered on the Start click, toggles on the title and
  pause screens. Untested in the desktop-app browser pane, which refused it; needs
  a real browser. A gamepad-driven click cannot enter fullscreen, so the TV needs
  one trackpad click on Start.
- The desktop-app pane runs the animation loop at a fixed 30fps regardless of
  render cost, so judge frame rate with the `renderOnce` probe or on the Mac.
- Sloan was rebuilt (`makeGirl` in `meshes.ts`): kid proportions, flat materials,
  iPod classic in her right hand, wired headphones. The rig keys on `userData` are
  unchanged and `animateGirl` still drives them.
- Accessories (`accessories.ts`): six items, one per slot (head, hair, face, back).
  Five are pickups placed by `level.accessories` (walk into the glowing ring; the
  layout checker verifies each spot is reachable), the golden crown is awarded by
  `completeLevel`. Found items and what is worn persist in the save. Worn items are
  attached to the head or torso group and tagged `userData.accessory`; the runtime
  re-dresses her whenever the store's `wornGen` changes. Wardrobe panel is on the
  title and pause screens.
- Ferris wheel (`makeFerrisWheel` in `meshes.ts`, placed by `level.ride`): eight
  gondolas kept level every frame, idles slowly, one 42-second lap when she boards.
  Boarding is Collect on the platform (`tryBoard` runs before the dumpling check).
  While riding: input off, gravity off, Emmett paused, run clock paused, and the
  camera is a fixed side view from the platform side (the boom would sit inside the
  rim). Only the foot pads, fence and platform are colliders (`colliders.ts`); the
  whole group is in the merge's live set.
- The park is 320m (bounds ±160, wall at ±157.5) since the expansion: woods with a
  trail and clearing down the west band (`forest()` in park.ts, avoiding the trail
  rects), a campground (`campground()`, `tent` prop kind, `makeCampfire` live mesh
  placed by `level.campfire`), a pavilion (`pavilion()`), and the splash pad rebuilt
  with three arches whose spray is a live mesh (`makeSprayArches`, `level.splash`)
  animated in sequence by the runtime, plus the slide. Ring road unchanged. Trail
  slabs are stepped in height because same-height slabs z-fight end to end.
- Second fill round: pool and outdoor gym behind the houses (north band), farm and
  mini golf in the south band, soccer pitch and a tree cluster in the east band,
  each with a spur off the ring road. The pool is two water zones so she swims
  slowly in it. Quiz operands never include 1. The HUD explains the wheel when she
  is within 9m of its platform (`rideNear`).
- Load time is the world build in the first frame: props ~2s, grass ~0.2s, merge
  ~0.5s on the Windows laptop. `[build]` in the console breaks it down. The grass
  mask has a spatial grid; before it, grass placement alone was 6s.
- The picnic park has 16 dumplings. The first (peachy) is always beside the spawn.
  Four live in the outer band: acorn (woods clearing), smore (campground), maple
  (pavilion table), and sky, which hangs at the top of the ferris wheel's arc and is
  collected by pressing Collect while the gondola passes the top (about a 4-second
  window; the HUD says "Press Collect!"). The layout checker labels sky as "ride"
  instead of floating or unreachable. Nothing hard-codes twelve any more; the crown
  is awarded when `collected.length >= level.dumplings.length`.
- After editing a module the game imports, Vite's hot reload can leave two copies
  of `store.ts` alive (React on one, the runtime on the other), so the DOM stops
  matching `__gameTest.store()`. Do a full page reload before trusting any test.

---

## 1. What this is

Sloan explores a park, finds 12 hidden dumplings, and answers a small maths question
to keep each one. Her little brother Emmett turns up on a tricycle every few minutes
and plays rock paper scissors for one. Juice boxes give a temporary speed boost.
Runs are timed and posted to a local leaderboard.

Three parks exist. **Only the first one is finished.** See section 6.

### Stack

- Vite + React single-page app (originally a Grok TanStack Start scaffold, replaced in v2.9)
- Three.js r186, no physics engine, no ECS
- Zustand store (`src/game/store.ts`) bridges the game loop and the React UI
- Everything is procedural: no model files, no texture files, no audio files.
  Meshes are built from primitives, textures are drawn to canvas at load, and all
  sound is synthesised with Web Audio. The game works offline with nothing to fetch.

---

## 2. Architecture

| File | Responsibility |
| --- | --- |
| `game/runtime.ts` | The game loop. Movement, camera, collisions, dumpling state, Emmett and juice updates, celebration animation, run clock. The biggest file and the one most worth reading first. |
| `game/levels.ts` | Level data as flat prop arrays. Also the placement logic that positions berms, hedges and tree lines by search rather than by hand. |
| `game/world-build.ts` | Turns level data into meshes and colliders. **The solidity rule lives here** and is the single highest-leverage function in the codebase. |
| `game/meshes.ts` | Every procedural mesh and character animation: Sloan, Emmett, dumplings, fountain, treehouse, cave, juice boxes. |
| `game/park.ts` | Composite zone builders: tennis, baseball, splash pad, playground, houses, berms. |
| `game/placement.ts` | Occupancy maps and clear-space search. Nothing should be hand-placed without checking against this. |
| `game/collision.ts` | Capsule vs AABB, height-aware, with a 0.62m auto step-up. |
| `game/scenery.ts` | Instanced grass and flowers with a wind shader, plus the grass exclusion mask. |
| `game/textures.ts` | Ten procedural texture generators plus an explicit colour→texture table. |
| `game/beveled.ts` | Per-size cached rounded-box geometry. This is what gives the Roblox look. |
| `game/finishes.ts` | Dumpling treatments: gold, pearl, iridescent, rainbow, glow. |
| `game/emmett.ts` | Emmett's AI: appearance schedule, pursuit, keep-out zones, give-up timer. |
| `game/minimap.tsx` | Cached static map layer plus live markers, driven by `pose.ts`. |
| `game/overlays.tsx` | All UI. Title, HUD, quiz, rock paper scissors, pause, results, leaderboard. |
| `game/pad-menu.tsx` | Gamepad menu navigation via DOM focus. |
| `game/math-quiz.ts` | Question and distractor generation. |

### Three rules that keep performance sane

1. **The game loop never writes to the Zustand store per frame.** Positions go into
   the plain mutable object in `pose.ts`, which the minimap reads on its own
   animation frame. The run clock and boost timer only push whole seconds. Breaking
   this will re-render the entire HUD 60 times a second.
2. **Materials and geometries are cached and shared.** `lam()` caches by colour,
   opacity, roughness, texture repeat and kind. `beveledBox()` caches by quantised
   size. 733 boxes need only 245 geometries.
3. **Static meshes are merged after the world is built** (`game/merge.ts`, called
   at the end of `buildWorld`). Every opaque, non-instanced mesh that is not a
   dumpling, beam or cloud is baked into world space and merged with others that
   share its material and shadow flags; materials with many meshes are also split
   into 80m cells so frustum culling still works. This took the picnic park from
   1543 draw calls to 597 and cut CPU submit time by roughly two thirds. Anything
   new that must move at runtime has to be added to the `live` set in
   `buildWorld`, or flagged with `userData.cloudDrift`, or it will be frozen in
   place. `?nomerge=1` on the URL disables the merge for A/B measurement.
   Transparent meshes are never merged, and there are ~360 of them, mostly the
   cylinder props at 0.92 opacity; making those opaque would be the next win.

---

## 3. The tooling — read this before changing geometry

Nothing in this environment can render a frame. Every geometry bug in this project
was found either by a human playing it or by one of these scripts. Run them with
`npx jiti tools/<name>.ts`.

| Tool | What it proves |
| --- | --- |
| `check-layout.ts` | The main one. Rebuilds the exact colliders the engine builds, then reports overlapping solids, coplanar surfaces that will z-fight, dumplings that are floating or buried, boundary containment, and reachability by flood fill from the spawn. `LAYOUT=1 npx jiti tools/check-layout.ts` checks an alternate dumpling layout. |
| `probe.ts` | Tall props that are not solid (walk-through walls) and solid props too faint to see (invisible walls). |
| `thin.ts` | Thin solid props, the other source of invisible walls. |
| `climb.ts` | Walks a route and reports the height change at each step, flagging anything above the 0.62m step-up. |
| `cavewalk.ts` | Same, for the route into the cave and up to the ledge. |
| `los.ts` | Line of sight from the cave mouth to the dumpling, from 15 positions. Proves it is actually hidden. |
| `spread.ts` | Nearest-neighbour distance between dumplings, to catch clustering. |
| `coplanar.ts` | Near-coplanar faces in the hill region. |
| `bevel.ts` | How many distinct geometries the bevel cache needs. |
| `textures.ts` | Texture coverage: how many props are textured vs flat. |
| `quizprobe.ts` | Answer position and magnitude distribution across 6000 generated questions. |
| `board.ts` | Leaderboard logic, headless. |
| `layoutroll.ts` | Layout rotation distribution and repeat rate. |
| `coverage.ts` | Per-level feature coverage. Run this to see how far behind parks 2 and 3 are. |
| `jump.ts` | Jump stress test: 1200 random run-and-jump attempts at berms, stairs, the maze, the playground, the wheel platform and the campground through the real collision code; fails if she ever moves more than 2m sideways in one frame. Found the berm "reset" (an axis sweep pushing her out through the far face of a 34m box). |
| `ones.ts` | Proves no quiz question uses 1 as an operand and none has a zero or negative answer. |
| `walk.ts` | Invisible-wall detector. Walks her through the real collision code along lines across the whole park (or around a point: `walk.ts x z radius`) and reports every stall where the blocker's top is within the step-up. Found both 16 Sept reports; must print 0 stalls. |
| `near.ts` | `near.ts x z radius` lists every solid collider near a point with the usual suspects flagged: rotated boxes, low opacity, ledges above the step-up. The first thing to run on any "invisible wall at <place>" report. |
| `camera.ts` | Walks the hedge maze at 60Hz with the camera yaw fixed and following, and reports how often the camera is pulled in, lurches, or falls back to sitting on her head. This is what proved the maze camera bug (58% of frames pulled in, 330 emergency frames) and the low-obstacle lift fix (0 and 0). |
| `maze.ts` | Prints the hedge maze as built, scores its difficulty (route length from the opening, junctions, dead ends), and fails if her jump can land on the hedges without a `noJump` zone wide enough to stop a boosted running jump from outside. |
| `merge.ts` | Proves the static-mesh merge preserves geometry: triangle count, precise bounding box, sampled world-space vertices, and that live, transparent, instanced and cloud meshes are left alone. |
| `diamond.ts`, `cave.ts`, `summit.ts`, `rotated.ts`, `face.ts` | Targeted diagnostics kept from specific investigations. |

### In-browser perf probes

`window.__gameTest` (set up in `runtime.ts`) has probes that work even when the tab
is hidden, which the animation loop does not: `renderOnce(sync)` renders one frame
and returns ms (with `gl.finish()` when sync, so it is the true frame cost; without,
just the CPU submit cost), `info()` returns draw calls, triangles, pixel ratio and
drawing-buffer size, `setPixelRatio(r)`, `setShadows(on, mapSize?)`, and `scene()`.
Interleave conditions over several rounds; single runs on a laptop are noisy.

Measured 16 Sept 2026 on an Intel Iris Xe at 1920x1080, title-screen view: ~1540
draw calls, 1.37M triangles, 20-30ms per frame, and **submit-only time equals full
frame time**. The bottleneck is CPU draw-call submission, not the GPU. Removing all
grass or all shadows changes little. Merging static props by material is the fix.

**The tools are worth more than any single feature in this repo.** When a new class
of bug appears, the right response is to write a check for it, not just to fix the
instance.

---

## 4. Hard-won constraints

These are the bugs that cost real time. Each one is a trap that will be re-entered
by anyone who does not know about it.

**`OutlineEffect` read `outlineParameters` from the material's userData, not the
object's.** Setting it on the mesh silently did nothing, so the sky sphere wore a
brown outline shell and that brown dome was mistaken for a missing sky. The outline
pass has since been removed entirely, but the general lesson stands: three.js addons
read config from places you would not guess.

**Never infer material behaviour from colour.** Water was detected with a prefix
match on `#5aa`, which also matched `#5aaa62`, the green of the maze and garden
hedges, silently turning every one of them into a walk-through wall. The fix to
"check whether blue is the dominant channel" was worse: it caught the dugout roofs,
fence posts and bleacher supports. It is now an explicit list of six liquid colours
in `world-build.ts`. Do not replace it with a heuristic.

**Solidity is a single rule in `world-build.ts`, and it is delicate.** Everything is
solid except liquid, spray, and props the author explicitly marked non-colliding
*that are also under 0.35m in both horizontal dimensions*. That last clause exists
because a blanket "everything is solid" rule turned 60 stair handrails at 0.12m
square into invisible walls. Widening or narrowing this rule will create or destroy
whole classes of bug.

**The solidity rule and every collider now live in `colliders.ts`**, and both the
game and the tools call the same function. The layout checker used to keep a copy
that had drifted (trees twice as wide, handrails solid). Do not add colliders
anywhere else.

**A ledge under 3cm is floor, not wall.** `collision.ts` stepped up anything from 2cm
to 62cm and blocked anything under 2cm, so a walkway crossing 8cm onto 10cm and the
infield dirt 3cm onto 5cm were invisible walls. `FLOOR_TOLERANCE` is 3cm now and
`tools/walk.ts` sweeps the park for any recurrence.

**Never toggle a light's `visible`.** Three.js bakes the number of lights into every
shader, so hiding one light recompiles every material at once: a 2-second freeze 2.3s
after every catch, when the caught dumpling's spark light was hidden. Lights are
dimmed with `intensity = 0` instead. The `?debug=1` overlay is what found this: it
logs any frame over 120ms with what the game was doing at the time.

**An axis sweep only resolves against a face she crossed that step.** The X sweep
used to push her out of any box she overlapped in Y and Z, so landing beside the
long side of a berm sent her out through its far end, up to 20m away ("the hedge
resets you"). `tools/jump.ts` guards this.

**Colliders ignore rotation.** `addBox` pushes an axis-aligned AABB at the unrotated
dimensions. A rotated tall box will have a collider that does not match its visual.
There are currently none, and it should stay that way.

**Flat surfaces that share a top face will z-fight.** `park.ts` defines a `TOP`
constant assigning every surface class its own band: lawn, apron, drive, path,
court, inner, line, mark. New flat geometry must pick a band, and overlapping
same-class surfaces must be given distinct heights.

**The overlay root is `pointer-events: none`.** Every interactive panel has to opt
back in with `pointer-events-auto`, or it renders perfectly and receives nothing.
This shipped once in the rock paper scissors panel.

**Bulk regex edits on this codebase have caused two real bugs.** A refactor to make
the baseball diamond flippable produced `Z(7.6) + i * 0.85`, a sign error that made
the bleachers march into the backstop. A separate splice deleted two whole React
components. Every scripted edit should assert that its match succeeded; a silent
no-op led to "fixed" being reported when nothing had changed.

**The ground is a hard floor at y 0.** `collision.ts` clamps to it. There is no
below-ground. Caves and basements have to go up and around, not down.

**The camera has an indoor mode.** Below a ceiling it blends to a 3.6m boom at 1.75m
height. A 7.4m third-person boom does not fit in any interior at any room size.

**She jumps 2.7m and the hedges are 1.7m.** Nothing stops her landing on a hedge top
and walking over the maze except the `noJump` zone on the level, which has to reach
her jump range (9.3m boosted) past the outer hedge. Movement constants live in
`tuning.ts` so tools can do this arithmetic. If you make hedges taller instead, the
camera's low-obstacle lift stops applying above 2.4m and the maze camera bug returns.

**The camera looks over low obstacles instead of pulling in for them.** Camera
placement is a pure function in `camera.ts`. When the eye-to-camera line is cut by
something whose top is under 2.4m, the boom is lifted (up to 6.4m) to clear it, and
only if still blocked does it pull in. Before this, a 1.7m hedge a metre behind her
pulled the camera into her back and often into the emergency "on her head" position,
which made the maze unplayable. Run `tools/camera.ts` after touching any of it.

---

## 5. Known limitations

- The reachability flood fill is 2D. It handles step-up and walking under overhangs,
  but not jumping or climbing, so it reports dumplings on tables, roofs and decks as
  unreachable. Those are expected; three in layout 0.
- One z-fighting sliver remains, 2.4m by 0.4m, between two stair treads in Grok's
  original code.
- No renderer is available in this environment, so nothing visual has ever been
  verified except by a human playing it.
- Performance is entirely untested. Up to 95,000 grass instances, ~950 props, 2048
  shadow maps, roughly 45 canvas textures generated at load.

---

## 6. What "a finished indie game" would require

Ordered by how much it matters.

### 6.1 Content — the biggest gap by far

Run `npx jiti tools/coverage.ts`:

```
picnic    props  953  juice 12  rehideSpots 4  keepOut 2  alts 11  finishes 9  bounds 240m
village   props   66  juice  0  rehideSpots 0  keepOut 0  alts  0  finishes 0  bounds  90m
sky       props  124  juice  0  rehideSpots 0  keepOut 0  alts  0  finishes 0  bounds  90m
```

Parks 2 and 3 are still Grok's v1. They are a fourteenth the size, have no juice
boxes, no Emmett support, no dumpling finishes and no alternate layouts. **Two
thirds of the advertised game does not exist yet.** Everything global (textures,
bevels, characters, camera, UI) applies to them, but the level content does not.

This is the single largest piece of work remaining and the one that decides whether
this is a demo or a game.

### 6.2 Audio

Currently a synthesised music bed, a handful of sound effects and Emmett's hum. A
finished game needs footsteps that vary by surface, ambience per zone (birds, water
at the pond, splash pad noise), and positional audio rather than distance-scaled
gain. Web Audio's `PannerNode` would do it.

### 6.3 Performance and the launch path

Untested at the target resolution. Needs a frame budget, an options screen with
grass density and shadow quality, and a proper build the player launches from a
desktop shortcut in fullscreen, not a dev server in a terminal.

### 6.4 Onboarding

There is a "how to play" panel and nothing else. A finished game teaches through
play: a first dumpling placed where she cannot miss it, Emmett introduced with a
scripted first encounter, the juice box explained by being placed in her path.

### 6.5 Save robustness

`localStorage` on one browser profile. Clearing browsing data wipes everything,
including the leaderboard. Export and import would be cheap insurance.

### 6.6 Accessibility

Reduced-motion is respected on button presses only. Needs a colourblind check on the
hot-and-cold meter and the dumpling finishes, a subtitle option for spoken cues, and
a difficulty setting that adjusts sparkle radius and Emmett's frequency.

### 6.7 Art direction

The Roblox pass (bevels, plastic sheen, no outlines) is coherent. What is missing is
a lighting pass per park, better skies, and post-processing. Bloom on the glowing
dumpling and gentle ambient occlusion would lift everything. Note that adding an
`EffectComposer` conflicts with nothing now that the outline pass is gone.

---

## 7. How to prompt on this project

This section is the distilled version of what worked and what wasted time over the
course of building v1 through v2.8.

### 7.1 Ask for the proof, not just the fix

The highest-value prompt pattern on this project, by a wide margin:

> Before you change anything, write a check that would have caught this, run it, and
> show me the output.

Every recurring bug class here was eventually solved by a script rather than by
care. Coordinates typed by hand were wrong roughly a third of the time. Coordinates
verified by a tool were wrong almost never. When a fix is claimed, ask what proves
it.

### 7.2 Remember the model cannot see

It has no renderer. It can prove that geometry does not overlap and that a route is
walkable, and it cannot tell you whether anything looks good. Treat it as a
structural engineer, not an art director.

That makes your screenshots the only visual feedback loop. Good bug reports on this
project looked like:

> Invisible wall at the top of the stairs up the hill, and the ball diamond still
> has one.

Location, plus what it felt like. That was enough to find both. What does not work
is "it looks off", because there is no way to act on it.

### 7.3 Demand the root cause

Ask "what caused this?" rather than "can you fix this?". On this project the stated
symptom was frequently not the real problem:

- "The sky isn't rendering" was an outline shell painted over it.
- "A hedge you can walk through" was every hedge in the game, from a colour
  heuristic.
- "The cave is too small" was really the camera, which does not fit indoors at any
  room size.
- "The correct answer looks highlighted" was the answer being the middle of three
  numbers 99.7% of the time.

A fix that does not explain the cause will usually be the wrong fix.

### 7.4 One visual change at a time

Structural work batches fine. Visual work does not. When bevels, plastic material
and outline removal all landed together, there was no way to attribute the result to
any one of them. If you dislike the outcome, ask for them separately.

### 7.5 Ask what is untested

Useful at the end of any work session:

> What did you change that I have not seen? What are you least confident about?

The answer tells you where to look first, and it surfaces the difference between
"builds clean" and "works", which is where almost every bug in this project lived.

### 7.6 Push back on unearned confidence

"Fixed" was reported at least twice on this project when nothing had changed,
because a scripted edit silently failed to match. If a fix sounds too easy, ask to
see the diff or the test output.

### 7.7 Prompt patterns worth reusing

```
Add <feature>. Before writing it, tell me what could go wrong and what you will
check afterwards. Then build it and run the checks.
```

```
<symptom>, at <location>. Do not guess: find what is actually there first.
```

```
Port everything the picnic park has to the village: juice boxes, Emmett keep-out
zones, rehide spots, dumpling finishes, alternate layouts. Run check-layout.ts
against all three layouts before you tell me it is done.
```

```
Review <file> and tell me what is weakest about it. Be honest, do not be nice.
```

### 7.8 Working in Claude Code specifically

- Keep this file in the repo root so it is read as context.
- Ask it to run `npx jiti tools/check-layout.ts` after any geometry change, and to
  paste the output.
- `npx tsc --noEmit` and `npx vite build` both pass today. Treat either failing as a
  stop condition.
- It can run the dev server (`npm run dev`, then http://127.0.0.1:8080) and take
  screenshots in its browser pane, so ask it to confirm the game boots after
  structural changes and to show you what it sees.
- On this Windows machine git is at `C:\Program Files\Git\cmd\git.exe` and is not on
  PATH in Claude's shell. Pushing needs your terminal the first time, for the GitHub
  sign-in window.
- Have it add to the `tools/` folder rather than writing throwaway checks. The suite
  compounds.

---

## 8. Immediate next steps

1. Play v2.8 end to end. A lot has changed since the last full playthrough: bevels,
   plastic material, no outlines, Sloan's rebuilt animation, Emmett's humming and
   reactions, the cave interior.
2. Test performance on the actual TV at the actual resolution.
3. Confirm the controller works through every menu.
4. Then bring the village up to the picnic park's standard, using `coverage.ts` as
   the checklist.

The birthday build only needs park one to be good. The finished game needs all three.
