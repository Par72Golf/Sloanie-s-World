import { useEffect } from "react";
import { sfx } from "./audio";
import { padClaimed } from "./input";
import { useGame } from "./store";

/**
 * Gamepad navigation for menus.
 *
 * Rather than wiring a pad handler into every panel one at a time, this walks
 * the focusable elements inside the overlay and moves real DOM focus. Anything
 * that is a button or an input gets controller support for free, including
 * panels added later.
 *
 * The quiz, rock paper scissors and every panel that claims the pad (booths,
 * the farmer, instruction cards, the journal) run their own pad loops, so this
 * stands down while any of them is open to avoid double input. It still
 * watches the buttons, so the A that closes one of them is not a fresh press
 * on the menu underneath.
 */

const FOCUSABLE =
  'button:not([disabled]):not([data-pad-skip]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement) {
  if (el.hidden) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function items(): HTMLElement[] {
  const root = document.querySelector(".overlay-root");
  if (!root) return [];
  // only the topmost full-screen layer: the pause menu and not the HUD under
  // it, the wardrobe and not the pause menu under that
  let scope: Element = root;
  let top = -Infinity;
  for (const layer of root.querySelectorAll<HTMLElement>(".pointer-events-auto.inset-0")) {
    if (!visible(layer)) continue;
    const z = Number.parseInt(getComputedStyle(layer).zIndex, 10) || 0;
    if (z >= top) {
      top = z;
      scope = layer;
    }
  }
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

/** Where the pad starts in a layer: its first control, passing over a corner close button (B closes). */
function first(list: HTMLElement[]) {
  return list.find((el) => !/^close/i.test(el.getAttribute("aria-label") ?? "")) ?? list[0];
}

export function PadMenu() {
  const phase = useGame((s) => s.phase);
  const wardrobeOpen = useGame((s) => s.wardrobeOpen);
  const controlsOpen = useGame((s) => s.controlsOpen);

  useEffect(() => {
    let prev = {
      up: false,
      down: false,
      left: false,
      right: false,
      a: false,
      b: false,
    };
    let raf = 0;
    let cooldown = 0;

    const move = (dir: 1 | -1) => {
      const list = items();
      if (!list.length) return;
      const active = document.activeElement as HTMLElement | null;
      let i = active ? list.indexOf(active) : -1;
      if (i < 0) i = dir === 1 ? -1 : 0;
      const next = list[(i + dir + list.length) % list.length];
      if (next) {
        next.focus();
        sfx.click();
      }
    };

    const loop = () => {
      raf = window.requestAnimationFrame(loop);

      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find((p) => p && p.buttons.length > 0);
      if (!pad) return;

      const ly = pad.axes[1] ?? 0;
      const lx = pad.axes[0] ?? 0;
      const now = {
        up: Boolean(pad.buttons[12]?.pressed) || ly < -0.55,
        down: Boolean(pad.buttons[13]?.pressed) || ly > 0.55,
        left: Boolean(pad.buttons[14]?.pressed) || lx < -0.55,
        right: Boolean(pad.buttons[15]?.pressed) || lx > 0.55,
        a: Boolean(pad.buttons[0]?.pressed),
        b: Boolean(pad.buttons[1]?.pressed),
      };
      // buttons are tracked even while the menu is not listening
      const was = prev;
      prev = now;

      const st = useGame.getState();
      // those panels own the pad while they are up
      if (st.quiz || st.rps || padClaimed()) return;
      // during play the pad drives the character, not the menu
      if (st.phase === "playing") return;

      const t = performance.now();
      const step = (dir: 1 | -1) => {
        if (t < cooldown) return;
        cooldown = t + 170;
        move(dir);
      };

      if (now.down && !was.down) step(1);
      else if (now.up && !was.up) step(-1);
      else if (now.right && !was.right) step(1);
      else if (now.left && !was.left) step(-1);

      if (now.a && !was.a) {
        const active = document.activeElement as HTMLElement | null;
        const list = items();
        if (active && list.includes(active)) {
          if (active.tagName === "INPUT") active.focus();
          else active.click();
        } else {
          // focus was left behind on a layer that closed: land first, then act
          first(list)?.focus();
        }
      }

      // B backs out of whatever is open, topmost first
      if (now.b && !was.b) {
        const s = useGame.getState();
        if (s.controlsOpen) s.setControls(false);
        else if (s.wardrobeOpen && (s.phase === "title" || s.phase === "paused")) s.setWardrobe(false);
        else if (s.journalOpen) s.toggleJournal();
        else if (s.phase === "paused") s.resumePlay();
      }
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  // when a panel opens or closes, put focus on its first control so the pad has a start
  useEffect(() => {
    const id = window.setTimeout(() => {
      const list = items();
      const active = document.activeElement as HTMLElement | null;
      if (list.length && (!active || !list.includes(active))) first(list)?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [phase, wardrobeOpen, controlsOpen]);

  return null;
}
