import { useEffect } from "react";
import { sfx } from "./audio";
import { useGame } from "./store";

/**
 * Gamepad navigation for menus.
 *
 * Rather than wiring a pad handler into every panel one at a time, this walks
 * the focusable elements inside the overlay and moves real DOM focus. Anything
 * that is a button or an input gets controller support for free, including
 * panels added later.
 *
 * The quiz and the rock paper scissors panel run their own pad loops, so this
 * stands down while either is open to avoid double input.
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
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

export function PadMenu() {
  const phase = useGame((s) => s.phase);

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

      const st = useGame.getState();
      // those two panels own the pad while they are up
      if (st.quiz || st.rps) {
        prev = { up: false, down: false, left: false, right: false, a: false, b: false };
        return;
      }
      // during play the pad drives the character, not the menu
      if (st.phase === "playing") return;

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

      const t = performance.now();
      const step = (dir: 1 | -1) => {
        if (t < cooldown) return;
        cooldown = t + 170;
        move(dir);
      };

      if (now.down && !prev.down) step(1);
      else if (now.up && !prev.up) step(-1);
      else if (now.right && !prev.right) step(1);
      else if (now.left && !prev.left) step(-1);

      if (now.a && !prev.a) {
        const active = document.activeElement as HTMLElement | null;
        const list = items();
        const target = active && list.includes(active) ? active : list[0];
        if (target) {
          if (target.tagName === "INPUT") target.focus();
          else target.click();
        }
      }

      // B backs out of whatever is open
      if (now.b && !prev.b) {
        const s = useGame.getState();
        if (s.journalOpen) s.toggleJournal();
        else if (s.phase === "paused") s.resumePlay();
      }

      prev = now;
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  // when a panel opens, put focus on its first control so the pad has a start
  useEffect(() => {
    const id = window.setTimeout(() => {
      const list = items();
      const active = document.activeElement as HTMLElement | null;
      if (list.length && (!active || !list.includes(active))) list[0]?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [phase]);

  return null;
}
