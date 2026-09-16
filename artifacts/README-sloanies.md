# Sloanie's World v1

A 3D dumpling-hunt game for Sloan. Keyboard, mouse, touch, and a gamepad all work.

## Run it on a PC

1. Install Node.js 22 from https://nodejs.org
2. Unzip this folder
3. In a terminal, inside the unzipped folder:

```
npm install
npm run dev
```

4. Open the address it prints (usually http://localhost:8080)

## Where the game lives

- `src/game/runtime.ts` — movement, camera, collecting
- `src/game/levels.ts` — Sunny Picnic Park layout and dumpling hiding spots
- `src/game/meshes.ts` — Sloan, trees, dumplings
- `src/game/math-quiz.ts` — 2nd-grade add/subtract questions
- `src/game/overlays.tsx` — menus, quiz, hints
- `src/game/input.ts` — keyboard, touch, controller

Progress saves in the browser (localStorage).
