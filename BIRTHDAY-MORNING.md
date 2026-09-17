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
- **Side quests:** Farmer Joe's lost pets (she keeps one), the carnival games
  and the prize booth, her own house to decorate, Emmett's monster truck,
  the zoo by the farm, the mountain cave and the lookout on top.

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
