# Sugar Rush playtest — 22 September 2026

Played end to end in the built snapshot, not the dev server, so what was tested
is what deploys. Everything below was reproduced in the running game before it
was changed.

One note on method: the browser pane throttles `requestAnimationFrame` hard, so
the game was driven a frame at a time through the test hooks rather than played
at the keyboard. Golf, bowls and the toss take their one button through the
panel's own animation frame, so at first none of them could be driven this way
and the toss looked untestable. Putting those input records on `window.__gameTest`
fixed that — and the first real throw it made found items 11 and 12 below.

## Found and fixed

### 1. The bubblegum could not be picked up
She walks to the bubblegum by the ferris wheel, presses Collect, and gets on the
ferris wheel. There is one Collect key and `tryCollect` reads the wheel long
before it reads the sweet at her feet, so a sweet inside the wheel's 2.4m
boarding circle is a sweet she can never have. The bubblegum sat 2.83m from the
boarding spot, and its 2.15m collect circle overlapped it, so any approach from
the wheel side boarded the wheel.

Moved the bubblegum to (-104, 90), south-west of the wheel, and changed the hint
to match. Added **`tools/buttons.ts`**, which measures every sweet in both parks
against every button — the booths, the golf tees, the bowls mats, the two ferris
wheels, the fair's three games, the boat jetty, the sweet shop, the princess,
her truck, her front door, the telescope, the three stuck creatures — and fails
if the two circles can ever overlap. It knows that a sweet above her head (park
1's Sky Dumpling, 15m up on the wheel) cannot be stolen by a button on the
ground, and it checks the landmarks Emmett rehides a sweet at too. 588 checks,
and it runs in CI.

### 2. The gummy bear looked broken
He is set in a puddle of toffee and will not come out until she jumps on it
three times. Until then, walking up to him and pressing Collect does nothing at
all — no prompt, no line, no sound. A button that does nothing reads as a bug.

Now the first time she stands on the toffee she is told: *"He is stuck fast in
the toffee. Jump on it to crack it!"*, and the Jobs page says the same.

### 3. Losing to Emmett in Sugar Rush cost her nothing, and said nothing
He rides up, beats her at rock paper scissors, and the panel tells her "He is
taking one and hiding it." Then nothing happens: `emmettTakesOne` needs a
landmark to hide it at, Sugar Rush had no list of them, and it gave up silently
— no sweet lost, no line, no hint. He also offered "rock, paper, scissors for a
dumpling".

Sugar Rush has eight landmarks now, one per region, each on clear ground and
clear of every button even after the spot is nudged. `tools/buttons.ts` checks
the landmarks too, since a rehidden sweet is still a sweet she has to collect.

### 4. Park 1's words all over park 2
- The satchel help card was titled **"Your backpack"** and talked about a backpack.
- The sticker card said **30 stickers** and sent her to "the farm, the woods, the cave, the pool and the carnival" — park 1's places. Sugar Rush has 20.
- The journal's first page was **"Dumpling journal"**, its tab said **"Dumplings"**, and every sweet she had not found was an **"Unknown dumpling"**.
- The Bag page was titled **"Backpack"**, checked for park 1's backpack rather than her candy satchel, counted park 1's stickers, and told her to spend her tickets "at the prize booth" — which is in the other park.
- Farmer Joe's pet treats showed up in her Sugar Rush satchel.

Help cards are now per park (`helpIdsFor`), with a candy satchel card, a candy
sticker card, and a new **factory card** that lays out the whole job the first
time she meets the princess. The journal names the sweets, the satchel and the
sweet shop when she is in Sugar Rush, and is byte-for-byte the same in park 1.

### 5. The quiz, the pause screen and the park-complete screen too
Every sweet she picks up opens a panel titled **"Solve it to keep the dumpling"**
— sixteen times a park. Pausing said "The dumplings will wait." Rock paper
scissors with Emmett offered to let her "keep your dumplings". And the screen she
sees at the very end, after finding all sixteen, read **"16 squishy dumplings
rescued from Sugar Rush Park."** One `prizeWord(levelIndex)` now answers all of
them, and it says sweet in Sugar Rush.

And the satchel: three places told her it was "behind the start", and the source
comment put it at the east end of the sweet shop street. It is at the west end,
and the street is sixteen metres *north* of where she spawns.

### 6. The boost is cotton candy, and it said "Juice box! Zoom!"
Sugar Rush hands her a stick of candy floss, and picking one up announced a
juice box. The boost timer in the corner of the HUD was a juice carton draining,
in a park with no juice in it. The notice names the park's own boost now, and
the clock is a stick of candy floss whose cloud drains instead of a carton.

### 7. The map was a green field with a blue river
The minimap and the full map are drawn from one hardcoded palette: park 1's.
Opening the map in Sugar Rush gave her a green park with a blue river running
through it — the right shapes in the wrong park's colours. Each park now has its
own palette, and Sugar Rush's map is mint ground, pink sugar paths and a
chocolate river. Park 1's map draws pixel-for-pixel what it always did.

### 8. The world kept running behind the fair's result cards
Whack-a-Gummy and Sweet Sorter put a results card up when the clock runs out.
Unlike golf, bowls and the toss, those two were not in the runtime's "a panel is
open" list, so Collect still fired into the world behind them — she could board
a ride through her own scorecard. Both are now in the list, and the world waits
behind them the way it waits behind every other card.

### 9. Her timer could show -1:-1
A frame that arrives with a negative delta (a tab waking up, a clock stepping
back) drove the run clock below zero and the HUD printed `-1:-1`. The
accumulator is clamped at zero.

### 10. Two old notes from `playtest-notes-claude.md`
Escape now closes the Controls panel when it is not waiting for a key, and
"How to play" mentions the wardrobe, the ferris wheel and first person.

### 11. A marshmallow could get stuck on a mug for ever
Clip the side of a mug near the rim and the throw never ends. The bounce is
about 0.6 m/s upward, which lifts the marshmallow a couple of centimetres, and
nothing moved it out of the mug's width — so it landed on the same wall on the
next step, and the next, hovering at the rim at about 1.42m with the horizontal
speed shrinking 65% each time. The throw never finished: no card, no tickets,
her marshmallow spent, and the only way out was Quit. A seven-year-old throwing
slightly short hits this.

The bounce now pushes the marshmallow clear of the mug and sends it *away* from
the mug rather than always back toward her, so an overshoot carries on past
instead of turning round into it. There is also a six-second watchdog, because a
throw that never lands should never be able to hang the game whatever the shapes
do later. `tools/toss.ts` sweeps the whole meter — against fresh mugs, mugs
already filled, and a mug knocked over — and fails if any throw is still in the
air after four seconds; the slowest real one settles in 2.58s. Reverting the
bounce fix makes that check fail, which is how I know it is checking the thing.

### 12. One throw could write several results on the card
Once a marshmallow could travel on after clipping a mug, it reached the next one
— and `landed` wrote a result every time it touched something, not once per
throw. Three throws produced four entries, the card showed the first three, and
her last throw going in was pushed off the end: the card said "Missed" under a
throw that had just splashed. The mug count and the tickets were right, so only
the list lied.

Whatever a throw does first is now its result, except going in, which always
wins; only the contact that decides it puts a line on the HUD.

### 13. Emmett's den was made of picnic park
Two things. The tyre stacks, the kicker ramp and the toy box were drawn and not
solid — park 1 has carried `yardProps()` since it was built and Sugar Rush never
did, so she walked through all four. And the yard itself was still brown mud
with tyre ruts sitting on spearmint, in a park where everything else including
his truck had been candified.

The pieces are solid now, and the yard is crushed biscuit dusted with cocoa,
sprinkles where the pebbles were, licorice tyres, a wafer ramp, a candy chest,
pink cones and a raspberry chequered flag. Making the pieces solid immediately
failed `tools/gauntlet.ts` — the obstacle run's first ring stood on the toy box,
which had never mattered while the toy box was not there. The ring moved.

### 14. I moved the bubblegum into a fence
Item 1's fix put it hard against the fairground fence, where the flood fill has
nowhere to stand. `check-layout.ts` printed UNREACHABLE and exited 0 — it had no
exit code at all, which is why the pass/fail loop I was running it in called it a
pass, and why park 1's four have printed the same way for years. The sweet is out
on the open apron now, and the tool fails on a spawn inside a solid, a boundary
leak, a blocked accessory, and any unreachable collectible that is not on a
written-down list of the four the fill cannot see on purpose.

## Checked and working

- **All 16 sweets** collect, from a clean save, one after another.
- **The satchel gate**: an accessory refuses until she has the candy satchel and tells her where it is; the satchel itself pops the right card.
- **The sticker book and all 20 stickers**, each reachable on foot.
- **The quest**: the princess talks, names each missing part and where it is; all three parts pick up; the lever inside the factory starts it; the river floods chocolate from the factory to the lake.
- **The three creatures**: the climb, the bog and the toffee; the bear stays gated until the toffee cracks; freeing all three pays 20 tickets; the basket sends them indoors and calls them back, and indoors they are round the rug in her bedroom.
- **Her house**: cottage → candy house (30) → candy castle (60), tickets deducted, rooms opened, and the three creatures visible inside.
- **Emmett's five**: three rounds of rock paper scissors, the obstacle run, the big race, then the truck is hers, parked by her house, drivable at boost speed and she can get out again.
- **Whack-a-Gummy** (30s, scored, paid), **Sweet Sorter** (45s, scored, paid), the **sweet shop** (buys, deducts, equips).
- **All three rides**: the gumdrop wheel, the chocolate river boat the whole length of the river to the lake, and the cupcake carousel.
- **The chocolate course**: all three candy flags light and bank her progress.
- **Ice Cream Mountain**: all 42 treads of the spiral are solid and each is one step above the last, right up to the telescope; the looking glass opens and remembers the six regions she had walked into.
- **The flyover** from the grown-ups menu: 52 seconds over Sugar Rush and back to the title.
- **The grown-ups menu**: the wrong PIN says "Not that one", 7272 opens it, and it offers all three flyovers, free fly and +100 tickets.
- **"How to play"** in Sugar Rush names the satchel, the 20 stickers, the cotton candy, the princess, the creatures, the three games, the three rides, the house, Emmett, the mountain, the wardrobe and first person.

## Not a bug, checked anyway

- **"Freezing" on the HUD** is the hot-and-cold reading for the nearest sweet she has not found, not weather.
- The prompt pill briefly overlapping the mini-map at 903x453 is the pop animation mid-flight; at every real window size it fits.
- The build panel hides each stage's description below 560px of height; on a TV it shows.
