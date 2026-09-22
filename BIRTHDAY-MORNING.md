# Birthday morning checklist

The game is at **https://par72golf.github.io/Sloanie-s-World/**

## 1. Set it up (5 minutes, before she's watching)

1. **Controller: X-input mode.** On the 8BitDo, hold **X while powering on**.
   In Switch mode the button marked A is the right-hand one, which the browser
   reads as B, so "A" would close menus instead of choosing.
2. **Open the game in Chrome** (not inside another app's preview pane).
   If you installed it as a desktop app, open that instead: it runs in its own
   window with no browser bars, which is better on a TV.
3. **Check the controller is talking to it:** main menu → **Controls**. Press
   each button and watch the rows light up. A should light *Jump*, X should
   light *Collect*. If A lights something else, you are still in Switch mode.
   Anything can be changed here, and the choices are saved.
4. **Fresh start:** main menu → **Start over** → **"Start over and clear best
   times"**. That wipes the dumplings, tickets, stickers, pets, prizes, her
   house and your test times, and reloads a clean park. Your control layout is
   kept.
5. **Full screen:** the **Fullscreen** item on the main menu, or the pause menu.
6. **Sound on.** Read aloud is on by default (pause menu → Read aloud). The
   voice can be changed there too.

## 2. Check it runs well on the TV

- Pause → **Show frame rate**.
- Comfortably above 60: leave everything alone.
- Dipping below 60: pause → **Graphics: Smooth**. About three times lighter and
  still looks good; it drops the glow, softens shadows and thins the grass.

## 3. What she does

- **Find 16 dumplings.** Warm and cold guide her; a right answer to the little
  sum keeps each one. Miss twice and it runs off somewhere new.
- **Find the backpack** on the ball field first: nothing can be picked up until
  she has it. The **sticker book** is near the start; 30 stickers are hidden.
- **When she finds all 16**, the time locks in and she gets the Golden Crown,
  then **Keep exploring** (the first button) drops her back into the park so
  she can carry on with everything else.
- **Farmer Joe** (by his tractor at the farm, with a speech bubble) has three
  rescues: a treat hunt to the cave, a feather trail into the maze, and hide and
  seek on the farm. She walks each pet back to Joe, and **all the pets she has
  rescued follow her at once**.
- **Mini golf** at the north of the park: five holes, aim with left and right,
  hold to charge the power meter, let go to putt. Tickets and a saved best.
- **Lawn bowls** (the bowls club in the east): the arrow swings on its own —
  press to stop it straight, then hold for power. Nine pins, three turns.
- **Floor is lava** (the big lawn south of the campground): five sections of
  jumps over lava to a prize podium. Falling in sends her back to the start.
  First crossing wins a Dragon tail.
- **Around the plaza:** the kite field, the duck pond, the flower garden, the
  story circle, the fairground green by the carousel, and Sandcastle Corner.
- **Everything else:** the carnival games and prize booth, her house to
  decorate, Emmett's monster truck, the zoo, the mountain cave and the lookout.

## 3b. Sugar Rush Park, when she gets there

Park 2 unlocks when she finishes park 1. It is the same game in a candy world,
so everything she already knows still works — sweets instead of dumplings, a
candy satchel instead of the backpack, cotton candy instead of juice boxes —
and then there is a lot that is new. A good order to let her find it in:

1. **The white river.** Do not explain it. She will notice the river is the
   wrong colour, and the answer is the candy princess in the Lollipop Forest,
   west of the start.
2. **The princess's errand.** The factory has stopped and three things are
   missing: the big whisk in Marshmallow Fields, the bucket of syrup by the
   chocolate lake, the cog at the Licorice Maze. Carry all three into the
   factory and pull the big lever, and the chocolate floods the whole river
   from the factory outward. It is the best thing in the park and it takes
   about twenty minutes to earn.
3. **Her three creatures**, once the factory runs. One is up a lollipop tree
   (walk up the spiral), one is out in the marshmallow bog (hop the pads before
   they sink), one is set in toffee (jump on it three times). They follow her
   afterwards, and the basket by her porch sends them inside to live.
4. **Her gingerbread house** at the head of the village square, east. Bigger
   than the neighbours', and the board by the gate builds it up in three
   stages with tickets — cottage, candy house, candy castle — each one adding
   a room inside to decorate.
5. **Emmett's den**, south of the village: rock paper scissors three times,
   then an obstacle run, then a race. Win all five and his monster truck is
   hers, parked by her house, and she can drive it at boost speed.
6. **The fairground**, far north-west: Marshmallow Toss, Whack-a-Gummy, Sweet
   Sorter, the gumdrop wheel, and a sweet shop to spend the tickets in. The
   cupcake carousel is through the arch on its own green.
7. **The chocolate river boat**, from a jetty a short walk east of the start:
   half a minute down the river to the lake.
8. **Ice Cream Mountain** in the far north-west corner: a spiral walk to the
   top and a telescope that zooms and sparkles the sweets she has not found.
9. **The Floor is Chocolate** along the whole north edge: longer than park 1's
   lava course, with three candy flags that catch her when she falls in.

If she loses the thread, the **journal has a Jobs page** in this park listing
everything still to do and where she was told to look.

## 4. If something goes wrong

- **Controls feel wrong:** main menu → Controls → **Reset to normal**.
- **It looks stuck or the screen is blank:** refresh the page (Cmd+R). Progress
  is saved as she plays; she keeps everything except the run timer.
- **She wants a completely fresh go:** Start over, as above.
- **Everything looks like the old version:** hard refresh, Cmd+Shift+R.
- **A dumpling seems unreachable:** the Hint button (4 per run) points at the
  nearest one, and the big map (M) shows where she is.

## 5. Rolling back

If anything is badly wrong and there is no time to fix it, the build from
before the birthday work is tagged:

```bash
cd ~/Desktop/Sloanie-s-World
git push -f origin birthday-safe-v3.1:main   # last known-good, then wait ~2 min
```

To come back to the current version afterwards:

```bash
git push -f origin main
```
