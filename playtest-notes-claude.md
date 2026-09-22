# Playtest notes (Claude), 16 Sept 2026

Build: v2.9 plus the new first-person hands/iPod (954ddcf). Run in the Claude desktop
browser pane against the local dev server, save wiped with `resetAll()` first.
Pane runs the loop at ~30fps, so nothing here is a frame-rate judgement.

Severity: **BLOCKER** breaks the birthday run, **BUG** wrong but playable,
**ROUGH** works but feels off, **IDEA** suggestion only.

## Title screen

- **BUG** "Start over" (`resetAll`) keeps the explorer name and the first/third
  person view. Probably fine (they are preferences), noting in case it is meant to
  be a full wipe.
- **BUG** Keyboard **E** is bound to both Collect (`wantsInteract`) and camera turn
  right (`runtime.ts` ~1060). How to play says "Q and E also turn the camera" and
  "press Collect". Pressing E next to a dumpling opens the quiz and also swings the
  camera; holding E to turn near a dumpling or the wheel platform will trigger a
  collect / board.
- **ROUGH** How to play does not mention Emmett and rock paper scissors, juice boxes,
  accessories/wardrobe, the ferris wheel (or that a dumpling is on it), or first
  person (V / LT). Also does not say what the keyboard Collect key is.
- **ROUGH** README still says "find the 12 hidden dumplings"; the park has 16.
- **ROUGH** How to play and Controls can both be open at once, stacked under the
  title card; Escape did not close the Controls panel (only "Got it" did).

## The hunt (layout 1 this run)

Driven with the in-game test hooks: teleport beside each dumpling, press F, answer in
the real quiz panel. So this proves the collect, quiz and celebration flow, not that
each spot is fun to reach on foot (the layout tools cover reachability).

- Collected 10 of 16 cleanly: peachy, sesame, clover, honey, berry, lemon, cocoa,
  mint, star, moon. Quiz opened every time, the right answer kept it, the counter
  went up, the celebration finished and play resumed.
- One wrong answer: the quiz stays open with attempts 1. Correct. Two wrong answers:
  the quiz closes, "Oh no — it ran off!" shows, the dumpling moves. Correct.
- **ROUGH** The runaway dumpling (berry, from the basketball court) re-hid 113m away
  at (2.9, 17.7), right beside the spawn and on top of where Peachy Bao was just
  found. `relocateDumpling` picks from every dumpling's layout-0 home, including
  ones already collected, so a runaway can land in a spot she has already cleared
  and is standing near the start of the park. Easy to re-find; may feel like no
  penalty.
- **ROUGH** Quiz variety: 11 questions were 3+2, 2+5, 7+2, 6+2, 6+6, 7+7, 5+7,
  4+8, 9−4, 15−3, 10+4. Nine of eleven were addition and four of the first four
  added 2. Probably fine for a 7-year-old; worth a look with `tools/quizprobe.ts`
  if she finds it samey.
- Walking works: holding W for 1.5s moved her 9.5m from the spawn.
- Juice box triggered on its own during a teleport ("Juice box! Zoom!").

## Not reached (session stopped)

- Emmett and rock paper scissors (was waiting out the 2.5 minutes).
- The last six: blush, rain, acorn, smore, maple, and sky on the ferris wheel.
- Ferris wheel ride and the Press Collect window at the top.
- Park complete: golden crown, results screen, best times entry.
- Accessory pickups, wardrobe, pause menu buttons, controller menus.

---

## Triaged, 22 September 2026

Walked the list against the game as it stands. Most of it had already been
fixed in the year of work since, so what follows is only what was still true.

**Fixed now**
- Escape closes the Controls panel when it is not waiting for a key, and opening
  Controls from the title closes "How to play" first, so the two can no longer
  stack.
- "How to play" mentions the ferris wheel (and that a dumpling only comes out at
  the top), the wardrobe, and first person — in both parks, worded for each.

**Already fixed**
- Keyboard E doing both Collect and turn-right: the camera is on the shoulder
  buttons and the bindings are remappable.
- The README's dumpling count: it says sixteen.
- Emmett, the juice boxes, the accessories, the wardrobe, the pause menu and the
  controller menus were all reached and exercised in later sessions.

**Left alone on purpose**
- "Start over" keeping her name and her camera preference. Those are hers, not
  progress.
- A runaway dumpling landing in a cleared spot. It is a soft penalty by design;
  worth revisiting only if she says it feels like none.
- Quiz variety. `makeQuestion` scales with how many she has found; the sample was
  from the first eleven, which are meant to be easy.

The Sugar Rush pass is in `playtest-notes-sugar-rush.md`.
