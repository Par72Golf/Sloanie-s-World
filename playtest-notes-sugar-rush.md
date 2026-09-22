# Sugar Rush playtest — 22 September 2026

Played end to end in the built snapshot, not the dev server, so what was tested
is what deploys. Everything below was reproduced in the running game before it
was changed.

One caveat on method: the browser pane throttles `requestAnimationFrame` hard,
so the game was driven a frame at a time through the test hooks rather than
played at the keyboard. That covers everything that lives in the game loop. The
one thing it cannot drive is the marshmallow toss's power meter, which is filled
by the toss UI's own animation frame — the booth, the lock-in, the HUD, the quit
and the ticket payout were all checked, and the throw itself is covered by
`tools/toss.ts` instead.

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
ground. 396 checks, and it runs in CI.

### 2. The gummy bear looked broken
He is set in a puddle of toffee and will not come out until she jumps on it
three times. Until then, walking up to him and pressing Collect does nothing at
all — no prompt, no line, no sound. A button that does nothing reads as a bug.

Now the first time she stands on the toffee she is told: *"He is stuck fast in
the toffee. Jump on it to crack it!"*, and the Jobs page says the same.

### 3. Park 1's words all over park 2
- The satchel help card was titled **"Your backpack"** and talked about a backpack.
- The sticker card said **30 stickers** and sent her to "the farm, the woods, the cave, the pool and the carnival" — park 1's places. Sugar Rush has 20.
- The journal's first page was **"Dumpling journal"**, its tab said **"Dumplings"**, and every sweet she had not found was an **"Unknown dumpling"**.
- The Bag page was titled **"Backpack"**, checked for park 1's backpack rather than her candy satchel, counted park 1's stickers, and told her to spend her tickets "at the prize booth" — which is in the other park.
- Farmer Joe's pet treats showed up in her Sugar Rush satchel.

Help cards are now per park (`helpIdsFor`), with a candy satchel card, a candy
sticker card, and a new **factory card** that lays out the whole job the first
time she meets the princess. The journal names the sweets, the satchel and the
sweet shop when she is in Sugar Rush, and is byte-for-byte the same in park 1.

### 3b. The quiz, the pause screen and the park-complete screen too
Every sweet she picks up opens a panel titled **"Solve it to keep the dumpling"**
— sixteen times a park. Pausing said "The dumplings will wait." Rock paper
scissors with Emmett offered to let her "keep your dumplings". And the screen she
sees at the very end, after finding all sixteen, read **"16 squishy dumplings
rescued from Sugar Rush Park."** One `prizeWord(levelIndex)` now answers all of
them, and it says sweet in Sugar Rush.

And the satchel: three places told her it was "behind the start", and the source
comment put it at the east end of the sweet shop street. It is at the west end,
and the street is sixteen metres *north* of where she spawns.

### 4. The world kept running behind the fair's result cards
Whack-a-Gummy and Sweet Sorter put a results card up when the clock runs out.
Unlike golf, bowls and the toss, those two were not in the runtime's "a panel is
open" list, so Collect still fired into the world behind them — she could board
a ride through her own scorecard. Both are now in the list, and the world waits
behind them the way it waits behind every other card.

### 5. Her timer could show -1:-1
A frame that arrives with a negative delta (a tab waking up, a clock stepping
back) drove the run clock below zero and the HUD printed `-1:-1`. The
accumulator is clamped at zero.

### 6. Two old notes from `playtest-notes-claude.md`
Escape now closes the Controls panel when it is not waiting for a key, and
"How to play" mentions the wardrobe, the ferris wheel and first person.

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
