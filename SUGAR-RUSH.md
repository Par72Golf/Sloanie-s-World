# Sugar Rush Park — the plan

The second real park. It replaces `candyVillage()`, the 90x90m v1 leftover, with a
full-size candy world the same size as Sunny Picnic Park, and it keeps the
progression the game already has: **locked until she finishes park 1**.

Decided with Dalton on 2026-09-21. Anything not written here is still open.

## The shape of it

- **320 x 320m**, bounds -160..160, same as the big park.
- **Bright rainbow candy**: saturated reds, pinks, yellows, mint, lilac, with
  chocolate browns for the river and the factory. Not pastel.
- Built in stages that go live as they are finished. The park is locked behind
  park 1, so a half-built Sugar Rush cannot spoil her game.

## Regions (blockout coordinates)

North is -z, east is +x, same as park 1. Bounds ±160, candy boundary fence at
±157.5 so the flood-fill check has a sealed edge.

| Region | Centre | Footprint | What is there |
| --- | --- | --- | --- |
| Peppermint Plaza | (0, 20) | r 14 | arrival hub, spawn at (0, 34) facing it, signposts, peppermint paving |
| Chocolate River | see below | 8m wide | the spine of the park; bridges where the loop crosses it |
| Chocolate Lake | (125, 125) | r 18 | where the river ends; the boat turns around here |
| Ice Cream Mountain | (-112, -124) | 36m across | scoops, a walk to the top deck, a slide down |
| The Candy Factory | (-18, -58) | 26 x 18 | the big landmark; the river runs straight through it |
| Lollipop Forest | (-145..-70, -30..60) | | lollipop trees; the princess's clearing at (-105, 15) |
| Gingerbread Village | (130, 10) | | icing houses, the candy shop, her own house |
| Licorice Maze | (80, -78) | 48m square | black and red hedges, six cells square |
| Gumdrop Meadow | (40..110, 45..110) | | gumdrop hills to climb |
| Marshmallow Fields | (-60..0, 90..140) | | bouncy ground; the jumping course runs east over a chocolate canal at z 120 |
| Fairground | (-140..-70, 70..140) | | cupcake carousel (-110, 100), gumdrop wheel (-85, 115), booths along z 80 |
| Emmett's den | (120, 45) | | his hangout in this park |

**The river**, as a polyline of straight runs and 45° elbows (boxes can be
rotated, so this stays cheap): (-120, -140) → (-60, -90) → (-10, -55) through the
factory → (25, -10) → (40, 40) → (80, 85) → the lake at (125, 125). Bridges
wherever the candy-cane loop crosses it.

**The candy-cane loop** is a rounded rectangle through roughly (±110, ±110), 6m
wide, with spokes into the plaza — the job the walkway network does in park 1.

## Art direction

The park has to read as a candy world at a glance and still be legible to a
seven-year-old playing it on a TV from the sofa.

- **Sky**: raspberry at the top, blossom in the middle, warm sugar at the
  horizon, and the fog is the horizon colour so distance fades into the sky
  rather than greying out against it.
- **Palette**: pastels hold the large areas (sugar paths, cream aprons, blossom
  pink), and saturated candy colours are used as accents only — a whole hillside
  of pillar-box red is what made the first fairground look like a warning sign.
- **No confetti.** Anything placed follows a line that already exists: an avenue
  along a path, pairs across a river, rows in a bed, a ring round a roundel.
  Open lawns stay open.
- **Every region reads as its own place** from a distance: its own ground
  colour, its own planting, an entrance you can see you are going through.
- **Relief**: the ground is not a table. Gentle mounds and terraces give the eye
  something to travel over and give her something to climb.
- **Nothing pure white in a big area.** It blooms into a glowing sheet in
  sunlight; #f6f1e8 is the white that behaves.
- **Legibility first**: a path must read as a path, a hidden candy must not be
  lost in the planting, and a landmark must be recognisable from the far side of
  the park.

## What has to be freed up first

Park 1's features are wired to fixed coordinates, so a second park cannot simply
switch them on: the flags `carnival`, `zoo`, `caveZone` and `emmettBase` build
park 1's carnival, zoo, mountain and truck yard at park 1's absolute coordinates.

- **Cheap** (one origin constant each, the insides are already local-space):
  mini golf, lawn bowls, the lava course, her house, Emmett's base, the zoo.
- **Medium**: the carnival (booth positions are literals, they need an origin),
  and the composite meshes and signs currently built inside a
  `level.id === "picnic"` block in world-build.ts.
- **Expensive, and not worth porting**: the sticker hunt and Farmer Joe's quest
  are ~80 hand-authored coordinates. Sugar Rush gets its own princess quest
  instead.

Anything a new park must satisfy to pass the existing checks: everything hidden
at least 4m apart, soda cans at least 18m apart with every landmark within 50m of
one, every collectible resting on something within 0.75m, nothing hidden on a
path or in a playing area, everything reachable from spawn without jumping, and a
sealed boundary. Collectible ids must be unique across the whole game, not just
within the park.

## What she does here

- **The hunt: 16 candies**, one of each kind — chocolate drop, candy cane, sour
  worm, gummy bear, jellybean, lollipop, marshmallow, bubblegum, licorice twist,
  peppermint, toffee, rock candy, cotton candy, caramel, fudge, jawbreaker. Same
  warm and cold, same little sum to keep each one, same journal and map.
- **Candy floss** instead of juice boxes for the speed boost.
- **Three rides**: the chocolate river boat, the cupcake carousel, the gumdrop
  ferris wheel.
- **A jumping course** over the chocolate river: marshmallows and gumdrops, and
  falling in drops her back at the start (the lava course engine, re-themed).
- **Candy carnival**: one familiar booth plus two new candy games, and a candy
  prize shop.
- **The candy princess** in the Lollipop Forest has lost her candy creatures — a
  gummy bear, a marshmallow bunny, a jellybean puppy. Sloan rescues them and they
  follow her, the way Farmer Joe's pets do.
- **Her own gingerbread house** at the head of the village square, to decorate
  and to build up. It is bigger than the neighbours' cottages, and it grows in
  three stages bought at a builder's board by the gate — **gingerbread cottage
  (free) → candy house (30 tickets) → candy castle (60 tickets)** — each stage
  adding an upstairs or a tower outside and **another room inside**:

  | Stage | Outside | Room it opens | What she decorates there |
  | --- | --- | --- | --- |
  | 1 | 11 x 9 cottage, gabled icing roof, cane porch | Bedroom | bed, rug, lamp, curtains, and the wallpaper and floor for the whole house |
  | 2 | upper storey, balcony over the porch, chocolate chimney, sugar garden | Sweet kitchen | table and plant, round a fitted chocolate counter |
  | 3 | two striped towers with swirl roofs, battlements, her flag | Tower room | picture and pet bed, by a window seat |

  The room she walks into is built high above the house, as park one's is, so
  the minimap still says she is at home.

  It works like her house in park 1 — the same ten things to change (bed, rug,
  wallpaper, floor, curtains, lamp, plant, table, picture, pet bed), bought with
  tickets — but everything in it is made of sweets, and it keeps its own
  furniture separately from her park 1 house, because it is a different house.

  **Every upgrade offers both a girls' and a boys' option**, plus neutral ones,
  so whoever is playing finds something they want. For example: a gumdrop canopy
  bed or a racing-car candy bed; a rainbow swirl rug or a tyre-track rug; icing
  lace curtains or racing flag bunting; a princess portrait or a monster truck
  poster; a marshmallow pet bed or a tyre pet bed.
- **Emmett** visits for rock paper scissors and has a den here, and Play as
  Emmett works in this park too, with its own side quests.

## Asked for after Sloan saw it (2026-09-21)

Her list, in her order:

1. **The floor is chocolate** — not park 1's course re-themed but **a new
   layout, bigger**, with **two or three checkpoints**: fall in the chocolate
   and she goes back to the last checkpoint she reached, not the start.

   Built: a 240m chocolate canal along the park's northern frontage, **29
   pieces in seven sections** against park 1's 27 in five, and **three candy
   flags** to light — Gumdrop Hops (it climbs), the Liquorice Beams (narrow,
   and they step sideways), the Marshmallow Bog (they sink under her weight,
   so standing still drops her in), the Chocolate Ferry (a barge she has to
   catch — the only thing on either course she cannot get past by jumping
   better), the Peppermint Wheels (landing on something that is moving), the
   Wafer Climb (a lift to a tower 6.6m up and a three-metre drop off the far
   side) and the Last Leap. The first section is deliberately the most
   forgiving on either course and every section after it is tighter.
2. **A tall candy mountain** to climb, with a **looking glass** at the top to
   look out over the park.
3. **Her house bigger than the others**, and **upgradeable from the outside in
   three stages with tickets** — each stage makes it bigger and nicer and adds
   a room inside.
4. **Emmett and his monster truck, candy-themed** in this park. Built: he and
   the truck both have a second look made of sweets — a candy-cane shirt, a
   liquorice trike, a lollipop on the handlebars; a pink body with wafer
   panels, a chocolate chassis, liquorice tyres on candy-yellow rims and a
   real candy-cane roll bar — and his den is at (120, 45).
5. **Beat Emmett at his monster truck five times and she keeps the truck.**
   Built: rock paper scissors three times at his truck, then the obstacle
   run (six rings round the yard, beat 13 seconds) and the big race (eleven
   rings on a long lap out east and back, beat 41 seconds). Neither run is
   against an AI racer — a racer can get stuck on a lollipop, and losing to a
   bug is how a seven-year-old is taught to give up — she races a time, and
   the time is worked out from the length of the route so moving a ring can
   never quietly make it impossible. Losing costs nothing and she can go
   again at once. Win all five and the truck parks on the lawn by her house
   with her name painted on the side, and she drives it at boost speed.
6. **Inside the chocolate factory.** Built: both front doors open, and the
   inside is a hall of machinery — the mixing vat, the moulding line, the
   gumball silos, a conveyor of sweets and a control desk — with a big lever
   that runs the whole factory at double speed for eight seconds.
7. **Cotton candy instead of juice boxes** for the speed boosts.

Decided with her list:

- **The truck gauntlet is five challenges, escalating**: rock paper scissors
  three times, then an obstacle run, then a final race. Win all five and the
  truck is hers, parked by her house, drivable at boost speed.
- **The looking glass zooms**, and sparkles the candies she has not found and
  the places she has not been.
- **The house upgrades in three stages**: gingerbread cottage, then a
  two-storey candy house with a garden, then a small candy castle with towers —
  each stage bought with tickets and adding a room inside.

Also asked for: **her own things to find here** — candy accessories to wear, a
candy backpack (nothing can be carried until she finds it, as in park 1), and a
sticker hunt on theme, with its own sticker book.

Then: nail down the quests.

## Stages

1. **Ground and layout** — terrain, the river, the path loop, region blockout,
   sky and palette, colliders, reachability checks. **Done.**
2. **Landmarks** — the forest, meadow, village, mountain, maze, factory, plaza.
   **Done**, and the mountain is climbable with a looking glass on top.
3. **The hunt** — 16 candies, hints, signs, plus 7 candy accessories, 20 candy
   stickers and their own book. **Done.**
4. **Rides and games** — the gumdrop wheel, the chocolate river boat and the
   cupcake carousel; Marshmallow Toss, Whack-a-Gummy and Sweet Sorter, all
   played in the park rather than in a card menu; the sweet shop. **Done.**
5. **The princess quest** — the stopped factory, the white river, the three
   missing parts, her three creatures and where they live. **Done.**
6. **Emmett** — his den, the candy truck, the five challenges and driving it
   afterwards. **Done.** Play as Emmett here is not started, and the
   `emmett-mode` branch it would build on is still unfinished.
7. **Polish** — frame rate on the TV, the tool checks, the morning checklist.
   The checks are in CI; BIRTHDAY-MORNING.md covers this park; the frame rate
   on the real TV has not been measured.

## What is not built

- **Play as Emmett** in this park, and the `emmett-mode` branch generally.
- The park has never been played end to end **by a child**. It has now been
  walked end to end in the built game (see below), but every number in it — the
  course times, the game clocks, the ticket prices — is still set from a
  simulated run or from judgement, not from watching Sloan.

## Played end to end, 22 September 2026

The whole park was walked in the built snapshot: all 16 sweets, the satchel gate,
the sticker book and all 20 stickers, the princess's quest from her first line to
the river running chocolate, the three creatures and the basket, the three house
stages, Emmett's five challenges and the truck, the three games, the three rides,
the chocolate course's checkpoints, the mountain's 42 treads and the telescope,
the flyover and the grown-ups PIN. `playtest-notes-sugar-rush.md` is the record:
twelve things were wrong and all twelve are fixed.

The one that mattered: the bubblegum sat inside the ferris wheel's boarding
circle, so pressing Collect at it boarded the wheel. `tools/buttons.ts` now
proves no sweet in either park can sit inside any button.

## Rules this park must keep

- Everything procedural. No asset files.
- It must pass the existing checks: reachability, hiding-spot spread, no floating
  or buried collectibles, nothing inside a wall, and no sweet inside a button
  (`tools/buttons.ts`).
- Park 2 uses park 2's words. She finds *sweets*, not dumplings, and carries a
  *candy satchel*, not a backpack. Anything she reads — a help card, a journal
  page, a hint — belongs to the park she is standing in.
- It must hold 60fps on the MacBook driving the TV, in Sharp, the same as park 1.
- Nothing about it may touch Sloan's save for park 1, and the park stays locked
  until she finishes park 1.
