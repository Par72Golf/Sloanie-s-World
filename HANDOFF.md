# Sloanie's World — Handoff

A 3D dumpling-hunting game built as a birthday present for Sloan, turning 7 in late
September 2026. Played on a PC hooked up to a TV, keyboard or controller.

This document is written to be dropped into the repo root so Claude Code reads it as
context. It covers what exists, what the tooling is for, the bugs that cost the most
time and why, what "finished" would actually require, and how to prompt effectively
on this specific project.

Current version: **v3.3** (22 Sept 2026): Sugar Rush Park, the second full-size park — a candy world with its own hunt, accessories and stickers, a gingerbread house she builds up in three stages, a chocolate obstacle course, a factory she can go inside, three rides, three fairground games played in the park rather than in a menu, the candy princess's quest, and Emmett's monster truck to win and drive. See SUGAR-RUSH.md.

Before that, v3.2 (17 Sept 2026, the day before the birthday): her house, Emmett's truck, the zoo, the mountain lookout, the rebuilt landing plaza and walkways, Sandcastle Corner, remappable controls, and the jewel UI.

### The grown-ups' menu

The start menu's last row, **Grown-ups**, is PIN-locked: **7272**. It is in plain
sight on purpose — a hidden door is something a seven-year-old hunts for, a
locked one is something she shrugs at. Nothing it turns on is ever saved, so
closing the game locks it again and she can never find it left open.

Behind it:

- **Fly over a park** — a hands-off camera tour of any park, about fifty
  seconds, from the title screen. Any button stops it. This is the quickest way
  to see what a morning's building actually looks like.
- **Free fly** — the old `?fly` camera. `F` flies and lands once the PIN is in.
- **+100 tickets**, for testing anything that costs them.
- Entering the PIN also unlocks every park, which `?preview` used to do.

The PIN is `GROWNUP_PIN` at the top of `GrownUps` in `src/game/overlays.tsx`.
`?preview` and `?fly` still work for scripted testing.

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
- First person (`view` in the store, saved; LT on the pad, V on the keyboard, buttons
  on the pause menu): camera at eye height 1.42m with pitch from the right stick or
  mouse drag, field of view 70 (58 in third person), she faces the camera yaw. Body
  parts tagged `userData.fpHide` (head, arms, shoulders, neck) hide; skirt and legs
  stay. Hands are a separate viewmodel (`makeHands`) the runtime pins to the camera
  each frame with bob and sway; rebuilt (and the old geometry disposed) with the girl
  when the dress changes. Fingers, thumbs and forearms are built by `limb()`: a list
  of joint positions with a sphere at each joint and a tapered cone between, merged
  into one mesh per hand. Pose them by moving joints, not by rotating parts; posing
  with Euler rotations kept hiding the fingers behind the device. The right hand's
  group is the iPod's own frame: palm behind, fingertips wrapping the left edge onto
  the face, thumb over the right edge onto the click wheel. The left hand is a loose
  fist held forward. Both forearms run to an elbow below the frame so nothing floats.
  The iPod (`makeIpod`, shared with the third-person model) is a black front with a
  chrome back, a menu screen canvas texture (`ipodScreenTexture`, unlit and grey-white
  so bloom ignores it), a textured 64-segment click wheel, and a headphone jack whose
  position is `userData.jack`; the first-person cord is a tube from the jack that
  loops down out of frame. The
  ride camera overrides both modes. Third person is the default; first person is
  opt-in because a big TV can make a 7-year-old queasy.
- Controls panel (`ControlsPanel`): title, pause menu and a HUD gamepad icon.
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


### 17 Sept 2026

- First-person hands and iPod rebuilt. Fingers, thumbs and forearms are `limb()`
  joint lists merged into one mesh per hand; `makeIpod` is shared with the
  third-person model (menu screen, round click wheel, chrome back, jack).
- Ferris wheel on touch: a big pop-up Ride button on the platform (`boardReady` in
  the store, `onBoardSpot()` in the runtime) and a Grab button at the top. The sky
  dumpling floats at 15.2m, above the rim, so it reaches from the gondola with
  `RIDE_COLLECT_R` 3.1 instead of 2.15; about a 4 second window.
- Frame-rate counter, from the pause menu (saved): fps, worst frame, CPU ms per
  frame and the real drawing size. Retina draws at 2x.
- Walkways are not built for now. They are still reserved in the placement map
  (`coreWalks`, `trailSlabs`, `paths`), so nothing else moved; re-map them once the
  buildings are in by adding `walkways` back to `props`.
- The pool's water zones are `pool: true`: no pond bank, reeds or foam.
- Farm tractor is a model (`makeTractor`, prop kind `tractor`). Cylinder props are
  always upright, which is why its wheels looked like barrels.
- The gym is a kids' ninja course: prop kinds `trampoline` and `tyre`, bounce in
  `physics()` (grounded at `TRAMPOLINE_TOP` inside a mat; a jump tap within 0.35s
  before landing gives `SUPER_BOUNCE`), stepping posts, balance beam, climbing wall
  to a deck. `tools/gym.ts`.
- Splash pad (`splash.ts` layout shared by props, `makeSplashPad` and the runtime):
  painted deck, ground jets firing in a chase that launch her (`GEYSER`), a tipping
  bucket that dumps every 12s and soaks her ("SPLASH!"), sprinkler droplets, and a
  noise-based splash sound. The deck is grey-tinted and matte so it stays under the
  bloom threshold.
- The cave moved. The lookout hill and its cave are gone (their footprint is
  reserved as `oldHillReserve`; that lawn beside the ferris wheel is for the
  carnival). The new mountain cave is in the south-east band at x 52..94,
  z -113..-149 (`cave.ts`): a 12x14 grid of 3m cells, each rock cell a full-height
  solid column and each open cell a roof slab at its headroom (tunnels 3.2m, rooms
  5m, cavern 6.5m). Entrance tunnel, a crystal grotto, a glowing mushroom room,
  a great cavern with the Moon Gyoza on a ledge, and a dead-end nook. About four
  times the old floor area. Inside the footprint the runtime forces first person
  (`inCave()`), because no third-person boom fits a tunnel; the saved view is
  untouched. Emmett is kept out. Decoration (`makeMountainCave`) adds no colliders:
  wall boulders are shallow ellipsoids positioned from their 0.78 minimum radius so
  they always show 0.1 to ~0.37m past the rock face, which keeps the first-person
  camera out of them. `tools/cave.ts`. The layout checker's 2D flood fill reports
  the grotto and ledge spots unreachable; `cave.ts` walks to both.
- Cost of the mountain: looking straight at it, +119 draw calls and +340k
  triangles against the previous build; from the spawn, draw calls are unchanged
  (631 to 635) and triangles fell slightly with the old hill gone.
- Test hook `__gameTest.lookAt(pos, target)` parks the camera for photographing a
  spot; `lookAt(null)` hands it back.
- **v3.0: the carnival** (`carnival.ts` layout, prizes and rules; `carnival-mesh.ts`
  look; `carnival-games.tsx` panels), on the old hill's reserved lawn beside the
  ferris wheel. Four booths facing south and a carousel. Standing at a counter or
  the carousel gate shows a big pop-up (`carnivalNear`); Collect opens the booth's
  panel (`carnival` in the store), which freezes her, pauses Emmett and the run
  clock like rock paper scissors. Every game plays with the pad (stick or d-pad,
  A, B to leave), keyboard (arrows, Space, Esc, digits) or touch.
  - Ring Toss (timing): drop the ring over the glowing bottle, 3 of 5. Prize: heart
    balloon (back).
  - Duck Pond (memory): 12 ducks hiding 6 random pairs, 14 turns. Prize: duck hat.
  - Whack-a-Mole (reactions and a rule): moles +1, golden moles +3, the bunny -1,
    12 points in 30s. Slowed after playtesting (moles up 2.2s easing to 1.45s).
    Prize: star glasses.
  - Carousel: ridden like the wheel (`carouselRide`, forced camera outside the
    fence); each lap passes the brass-ring arm with a ~1.2s grab window; the ring
    is gold on pass 3 of 4. Prize: unicorn headband (a head item).
  - Prize booth: shows the four prizes and hands out the giant teddy (back) once
    all four are won.
  Prizes are accessories (`winPrize`), so they save and live in the wardrobe.
  `wornFromSave` drops unknown items and re-slots moved ones on load. The fence is
  closed and there is a `noJump` zone round the carousel. Adding the carnival
  moved one hedge 2m south and dropped one berm in front of its entrance (a
  `keepClear` rect keeps the approach open); nothing else in the park moved.
- **Directions:** north is -z, east is +x. She starts the park facing north.
  (Older hints had north as +z, which with east as +x was a mirror-image
  compass; the few that said north or south were flipped to match.) The corner
  minimap is round and turns with her so forward is always up, with a red N on
  the rim; the expanded map is north-up with a small compass rose. Use this frame
  for any new hint text.
---
- **Birthday build (17 Sept 2026), built with helper agents in parallel:**
  - Backpack gating: nothing in the world can be picked up until the backpack
    (ball field) is found; stickers need the sticker book (near the start).
  - Journal (J / Back) is three pages (`journal.tsx`): Dumplings, Stickers (30
    stickers, `sticker-art.ts` canvas art, spots in `collectibles.ts`) and Bag,
    a Minecraft-style equip grid with slots head, hair, face, back and hand.
    LB/RB or Q/E switch pages. Held items attach to the right hand and hide the
    iPod; the balloon is steadied and the pinwheel spins in the runtime.
  - Tickets from every carnival game and ring; spent in the prize booth shop
    (`SHOP` in carnival.ts) on wearables and holdables (`accessories.ts`).
  - Lost pet quest (`quest.ts`, `quest-panel.tsx`, `quest-mesh.ts`, `pets.ts`):
    Farmer Joe at the farm, 5 treats, a paw trail to the mountain cave, three
    scared pets in the great cavern, lead them home, choose one (kind, coat,
    name). The pet follows her, sits, and sniffs toward nearby dumplings.
    Saved stage `escort` reloads as `trail` (pets wait in the cave again).
  - iPod music (`music.ts`, procedural, five channels): RT / N / HUD button.
    After 3s on a channel standing still she dances (`dances.ts`).
  - Read aloud (`speech.ts`, Web Speech API): HUD messages, hints, maths,
    booth panels, the farmer; "Hear it" buttons; voice chooser in pause. The
    browser cannot use Siri voices; downloaded Premium voices are preferred.
  - Instruction cards (`help-cards.tsx`): backpack, sticker book, farmer,
    carnival; once each, again from the pause menu.
  - Tools: `tools/collectibles.ts` (walks to every sticker, treat and the trail),
    `tools/pets.ts` (its allocation check is sensitive to GC noise when the
    machine is busy; rerun before trusting a failure).
- **Her house and Emmett's truck (17 Sept 2026, evening):**
  - Sloan's house is the house at (-9, 110) on the south street, with a name
    board and a glowing doorstep. Collect there moves her into a room built at
    y 150 straight above it (`home.ts`), so the minimap still shows her at home.
    Inside, the view is forced to first person (the room is 10m x 8m). The
    doormat takes her back out. The room, furniture and spots are
    `home-mesh.ts` and `furniture.ts` (cabin theme, 10 spots, 34 pieces: five
    wallpapers and five floors, three of everything else).
  - Decorating (`home-panel.tsx`): each spot has a glowing marker; the panel
    previews by placing, A keeps or buys with tickets, B puts back what was
    there. Reward pieces unlock from the crown, all 30 stickers and adopting a
    pet. The house has its own store and save slot (`home-store.ts`,
    `sloanies-world-home-v1`), cleared by the main reset.
  - Emmett lives at a monster truck yard on the east lawn at (50.5, -9)
    (`emmett-base.ts` data, `monster-truck.ts` meshes). He laps the truck on
    his trike, rides out to find her when his timer runs out, and pedals back
    home after. At the truck, "Play with Emmett" is rock paper scissors for 3
    tickets with nothing to lose, with a 40s rest between games.
  - The truck's colliders come from `colliders.ts` (`emmettBase` level flag);
    the yard's solid bits are props hidden inside the drawn tyres and ramp;
    the grass mask skips the dirt yard.
- **The day before the birthday (17 Sept 2026, afternoon), from the dad's playtest notes:**
  - **Controls she can remap** (`bindings.ts`, `controls-remap.tsx`): every play action has a
    controller button and a keyboard key, saved in their own slot
    (`sloanies-world-controls-v1`). Moving and the menu buttons (A choose, B back,
    Esc) are fixed so no layout can lock anyone out; assigning a button that is
    taken swaps the two. The screen lights up each button as it is pressed, which
    doubles as a way to check an 8BitDo is in X-input mode.
  - **Menus move spatially** (`pad-menu.tsx`): up, down, left and right pick the
    nearest control in that direction on screen, holding repeats, a focused
    scrollable box scrolls before focus moves on, focus starts on
    `data-pad-default`, and a sub-screen returns focus to the button that opened it.
  - **Esc is decided in one place** (`input.ts`), from what is open at the moment of
    the press, so closing a panel no longer also opens the pause menu.
  - Music plays whatever she is holding; a jump press within 0.18s of landing still
    counts (`JUMP_BUFFER`); the catch celebration plays in front of the camera in
    first person; the first-person iPod goes away when she holds something else.
  - **Emmett always gets home** (`emmett.ts`): a berm between the park and his yard
    could leave him circling for the rest of the game, taking his truck game with
    him. After `HOME_GIVE_UP` seconds he slips out of sight and turns up at the
    yard. `tools/emmett-home.ts` meets her at two spots and fails if he does not
    get back.
  - **The park and the run survive a reload:** dumplings that ran off or were stolen
    are saved (`movedSpots`), the world rebuilds when the layout changes, the run
    clock keeps running after a trip to the title (a resumed run shows its time but
    does not go on the board: `runValid`), and Start always faces her the way the
    park expects.
  - **"Start over" is a real fresh start:** it clears the house, the help cards seen
    and everything else, then reloads the page. A second button also clears best
    times.
  - **A dumpling that runs off stays findable:** `flee.ts` now aims for a chase
    distance instead of the farthest spot in the park (`FLEE_MAX_FROM_PLAYER`).
  - **The maze zone hugs the hedges:** `noJump` entries can carry `keepOff`, and
    landing above that height inside the zone puts her back where she jumped from
    (`runtime.keepOffCheck`), so the zone no longer has to cover the 9m a boosted
    running jump reaches. `tools/maze.ts` checks the zone hugs the hedges and has
    a sane `keepOff`.
  - **New places:** a zoo beside the farm (`zoo.ts`, `zoo-mesh.ts`, `tools/zoo.ts`:
    six enclosures, animals with idle animations, plaques with fun facts), a
    lookout deck on the mountain roof with a walkable switchback stair
    (`tools/lookout.ts`), and a rebuilt landing plaza with walkways and signage.
  - **Item pictures** (`item-thumbs.ts`): one offscreen renderer draws each
    accessory and each piece of furniture once, cached, used in the bag, the prize
    shop, the wardrobe and the house. Reading pixels goes through a PBO and a
    fence, because a plain readPixels on a WebGL canvas stalls for hundreds of ms.
  - **Premium UI, second pass:** jewel styling, a main menu with a video-game feel,
    and a HUD status card rework.
  - `lam()` no longer passes undefined optional parameters to three.js, which was
    printing thousands of warnings at load.
- **The evening before the birthday, from the dad's testing:**
  - **Finishing a park keeps the park.** The Complete screen locks the time in,
    awards the crown, and offers **Keep exploring** first (`keepExploring` in
    store.ts), so the carnival, Farmer Joe's pets, the stickers and her house
    carry on in a finished park with the clock stopped.
  - **Start over really starts over.** The title rewrite had dropped the page
    reload, so the old park stayed up: pickups she had already taken never came
    back and the backpack could not be found again. There is also a second
    button that clears best times, which is the one to use before handing the
    game to a new player.
  - **Emmett takes a dumpling every time he wins.** The runtime keyed "already
    resolved" on `round:result`, so a second encounter ending the same way was
    skipped: he won and took nothing, and never pedalled off.
  - **Held things are in her left hand**, so the iPod stays in her right and the
    music is never interrupted (`applyWorn` in accessories.ts).
  - **The slide mesh was broken everywhere**: `makeSlide`'s chute rotation was
    inverted, so the ramp climbed out of the tower into the air with its rails
    hanging beside it. Fixed, which also repaired the splash pad.
  - **Sandcastle Corner** replaced the jumble of props east of the spawn
    (`playCorner()` in park.ts): a framed sandpit the slide lands in, a castle,
    bucket and spade, a picket fence and a gateway from the walkway.
  - **The plaza banner** sits in front of the striped pole, which used to run
    straight through her name.
  - **The menu selector bar** was measured against the inner list but positioned
    inside the padded scroll box, so the highlight sat off the row.
  - **Drawing resolution is capped at 1.5x** in sharp mode (`sharpPixelRatio`).
    Profiling showed the game is fill-rate bound: frame time is close to linear
    in pixels, so a TV reporting devicePixelRatio 2 asked for four times the
    work of the window. Draw calls barely matter by comparison (218 in the cave
    was slower than 2594 on the house street).
  - **The app icon is drawn in code** (`tools/icons.ts`: a rasteriser and a PNG
    encoder using node's zlib) and written to public/, with a web manifest so
    the game installs as a desktop app, and an iconset for a macOS .icns.
- **Late on 17 Sept 2026 (the night before):**
  - **Playable mini golf** (`minigolf.ts`, `minigolf-ui.tsx`, `tools/minigolf.ts`): five
    holes at (20, -132) — Straight Away, The Windmill, The Dogleg, Twin Gates,
    Rolling Log. Walk onto a tee, aim left and right, hold for power, release.
    Par 15, tickets from `2 x par - strokes`, a saved best round. She is frozen
    the way the carousel freezes her, and the panel claims the pad. The tool
    proves every hole is sinkable, the ball can never escape or stick, and the
    view from each tee shows the ball and its first target.
    - The aim was mirrored at first: `atan2(gx, gz) + aim` in a `(sin, cos)`
      frame sends a positive aim to the player's left. One `aimDir` helper now
      feeds both the drawn line and `putt()`, and the tool checks handedness.
  - **Keep exploring** after the 16th dumpling (see above).
  - **Farmer Joe moved** to the front of his tractor, where the path into the
    farm arrives, with a pink speech bubble in gold bubble letters (a white
    bubble bloomed in the sun). `makeBubble` in `quest-mesh.ts` is reusable.
  - **Touch controls follow the input device, not the screen width.** They were
    hidden by `md:hidden`, so a phone held sideways (and every tablet) lost the
    joystick and the Jump button. Now `[@media(hover:hover)_and_(pointer:fine)]:hidden`,
    and the minimap moves up on short screens so it stops covering them.
  - **The app icon** is drawn by `tools/icons.ts` and the game installs as a
    desktop app through `public/manifest.webmanifest`.
- **Fixes the same evening:**
  - Berm "reset": rising with her feet within 3cm of a box top was taken as a
    head bump and dropped her inside the berm; she is now put on top. Step-ups
    also need headroom (`headroom()` in collision.ts), which stopped her
    popping 3m up onto posts from under a bench. `tools/berm.ts` hammers it.
  - Fleeing dumplings pick their new spot in `flee.ts`: 25m+ from spawn, never
    on a cleared spot, only low spots. `tools/flee.ts`.
  - Controller: panels claim the pad (`claimPad`) so A on a panel does not also
    jump or collect; J / H / P keys for journal, hint and pause.
  - Pause menu has a Graphics choice (sharp or smooth) for slower machines.

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
| `check-layout.ts` | The main one. Rebuilds the exact colliders the engine builds, then reports overlapping solids, coplanar surfaces that will z-fight, dumplings that are floating or buried, boundary containment, and reachability by flood fill from the spawn. `LAYOUT=1 npx jiti tools/check-layout.ts` checks an alternate dumpling layout, and `LEVEL=1` checks Sugar Rush instead of park 1. |
| `probe.ts` | Tall props that are not solid (walk-through walls) and solid props too faint to see (invisible walls). |
| `thin.ts` | Thin solid props, the other source of invisible walls. |
| `cave.ts` | The mountain cave through the real collision code: walks from outside the entrance along the tunnel grid to every open cell and each hiding spot, checks the lowest roof, that no hop is ever needed except onto the cavern ledge, and that no hiding spot is visible from the entrance. |
| `carnival.ts` | The carnival: walks from the lawn to every booth counter and the carousel gate, checks nothing solid is on a standing spot, and holds the games to fair limits (ring over a bottle at least 0.28s per pass, duck turns above perfect play, moles up at least 1.2s, carousel grab window at least 1s). |
| `gym.ts` | The ninja course: walking up the climbing wall onto the deck, trampolines launching her (and the tapped big bounce), and the stepping posts walkable and landable. Caught the first post row being impossible to land on. |
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
| `home.ts` | Her house: every furniture piece builds, the room's worst-case triangle count, colliders and reachability of each decoration spot. |
| `emmett-base.ts` | The truck yard: clear ground, 12m from every hiding spot, walkable round the truck and up the ramp, the roof seat on the roof, and his laps clear of anything solid. |
| `icons.ts` | Draws the app icon and writes the PNGs (and the macOS iconset). Not a check: run it after changing the icon design. |
| `paths.ts` | The walkway network, the arrival plaza and the signs: no path laid through a solid, every node walkable from spawn through the real collision code, no z-fighting between the flat layers, and sign arrows pointing the right way. |
| `parkmap.ts` | An ASCII map of any region (north up, east right) marking solids, steps, walkways, flat surfaces and water. The fastest way to see what is actually where before moving anything. |
| `minigolf.ts` | The five mini golf holes: geometry, containment (thousands of wild putts, no escapes or burials), no dead ends, moving parts never trap the ball, a rough-aiming model finishes under par 15, aim handedness, and the sightline from every tee. |
| `zoo.ts` | The zoo: clear ground beside the farm, every plaque walkable from spawn, fences unclimbable, spacing from hiding spots. `tools/zoo.ts scan` searches for clear ground of a given size. |
| `lookout.ts` | The mountain lookout: walks the switchback stair from spawn with the jump key never pressed, then shoves her at every railing to prove she cannot fall off. |
| `emmett-home.ts` | Emmett's routine headless: laps at home, rides out, catches her, goes back; fails under 3 round trips in 15 minutes. |
| `berm.ts` | Jumps at every stepped berm in the park through the real collision and camera code, stepped like the runtime; hunts the "reset" where she dropped inside a tier. Must report 0 events. |
| `flee.ts` | The new-spot picker for a fleeing dumpling against its rules, compared with the old picker. |
| `merge.ts` | Proves the static-mesh merge preserves geometry: triangle count, precise bounding box, sampled world-space vertices, and that live, transparent, instanced and cloud meshes are left alone. |
| `buttons.ts` | **Both parks.** There is one Collect key, and `tryCollect` reads every button — the booths, the golf tees, the bowls mats, both ferris wheels, the fair's three games, the boat jetty, the sweet shop, the princess, her truck, her front door, the telescope, the three stuck creatures — before it reads the sweet at her feet. This proves no sweet's collect circle can overlap a button's, so no sweet is one she presses Collect at and boards a ride instead. It knows a sweet above her head (the Sky Dumpling) is out of a ground button's reach. Found the Sugar Rush bubblegum. |
| `gauntlet.ts` | Emmett's five challenges in Sugar Rush: the obstacle run and the big race routes walkable ring to ring, nothing solid in a gate, and the courses clear of his truck and the meadow terraces. |
| `creatures.ts` | The princess's three predicaments: the lollipop climb's treads touch and never rise more than her step-up, the marshmallow bog's pads are within a jump and cannot be walked around, the toffee sits above its own surface, and all three stand on clear reachable ground away from everything else hidden. |
| `toss.ts`, `toss-space.ts` | The marshmallow toss: the lob physics reach every mug inside the power range, the mouths are catchable, the booth's footprint is clear of the bunting, the loop path and the stall row, and **every throw ends** — the whole meter swept against fresh, filled and knocked-over mugs, failing if a marshmallow is still in the air after four seconds. That last one is the check for the bounce that used to trap a marshmallow on a mug rim for ever. |
| `diamond.ts`, `rotated.ts`, `face.ts` | Targeted diagnostics kept from specific investigations. (The old hill's `climb.ts`, `cavewalk.ts`, `los.ts`, `summit.ts` and `cave.ts` went with the hill.) |

### In-browser perf probes

`__gameTest.input()` hands back the records the HUDs write and the game loop
reads — golf's, bowls' and the toss's button and pose. Those panels poll their
button in their own `requestAnimationFrame`, which a hidden or throttled tab does
not run, so stepping the loop by hand otherwise never sees a press and the game
looks frozen when it is only unattended. Hold `input().toss.input.charge`, step
some frames, release it, and read `input().toss.pose` for what the panel would
be showing. The first throw driven this way found the mug-rim trap.

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
