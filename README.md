# Sloanie's World

A 3D dumpling hunt built for Sloan. Explore the park, find the 16 hidden dumplings,
answer a little maths question to keep each one, and watch out for Emmett on his
tricycle.

Play it: https://par72golf.github.io/Sloanie-s-World/

Keyboard, mouse, touch and a gamepad all work. Progress and best times save in the
browser.

## Run it locally

```
npm install
npm run dev
```

Then open http://127.0.0.1:8080.

## Checks

```
npm run typecheck
npx jiti tools/check-layout.ts
npm run build
```

`HANDOFF.md` is the full project guide: architecture, the tooling in `tools/`, the
bugs that cost the most time, and how to prompt on this project.
