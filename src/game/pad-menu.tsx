import { useEffect, useRef } from "react";
import { sfx } from "./audio";
import { activePad, padClaimed } from "./input";
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

/**
 * Where the pad starts in a layer: a control marked data-pad-default (the
 * title's Start), else its first control, passing over a corner close button
 * (B closes) and text boxes (typing a name is not where a controller starts).
 */
function first(list: HTMLElement[]) {
  return (
    list.find((el) => el.hasAttribute("data-pad-default")) ??
    list.find((el) => el.tagName !== "INPUT" && !/^close/i.test(el.getAttribute("aria-label") ?? "")) ??
    list[0]
  );
}

/** A focused box with more to read: up and down scroll it before moving on. */
function scrollWithin(el: HTMLElement, dir: "up" | "down") {
  if (el.scrollHeight <= el.clientHeight + 2) return false;
  const room = dir === "down" ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop;
  if (room <= 1) return false;
  el.scrollBy({ top: (dir === "down" ? 1 : -1) * Math.max(80, el.clientHeight * 0.45), behavior: "smooth" });
  return true;
}

export function PadMenu() {
  const phase = useGame((s) => s.phase);
  const wardrobeOpen = useGame((s) => s.wardrobeOpen);
  const controlsOpen = useGame((s) => s.controlsOpen);
  const quizOpen = useGame((s) => s.quiz != null);
  const rpsOpen = useGame((s) => s.rps != null);

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
    let repeatAt = 0;

    type Dir = "up" | "down" | "left" | "right";
    /**
     * Spatial: from the focused control, pick the nearest control whose centre
     * lies in the pressed direction, weighting sideways drift heavily so up and
     * down stay in a column and left and right stay in a row. Grids, two-column
     * menus and rows of buttons all behave the way they look. At an edge it
     * wraps to the far side of the same row or column.
     */
    const move = (dir: Dir) => {
      const list = items();
      if (!list.length) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !list.includes(active)) {
        first(list)?.focus();
        sfx.click();
        return;
      }
      if ((dir === "up" || dir === "down") && scrollWithin(active, dir)) return;
      const a = active.getBoundingClientRect();
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      const horiz = dir === "left" || dir === "right";
      const sign = dir === "right" || dir === "down" ? 1 : -1;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      let wrap: HTMLElement | null = null;
      let wrapScore = -Infinity;
      for (const el of list) {
        if (el === active) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const along = (horiz ? cx - ax : cy - ay) * sign;
        // overlap along the other axis counts as "in line"
        const gap = horiz
          ? Math.max(0, Math.max(r.top, a.top) - Math.min(r.bottom, a.bottom))
          : Math.max(0, Math.max(r.left, a.left) - Math.min(r.right, a.right));
        const across = horiz ? Math.abs(cy - ay) : Math.abs(cx - ax);
        if (along > 4) {
          const score = along + (gap > 0 ? across * 3 + 200 : across * 0.3);
          if (score < bestScore) {
            bestScore = score;
            best = el;
          }
        } else if (along < -4 && gap === 0) {
          // candidates for wrapping: in line, furthest the other way
          const far = -along - across * 0.3;
          if (far > wrapScore) {
            wrapScore = far;
            wrap = el;
          }
        }
      }
      const next = best ?? wrap;
      if (next) {
        next.focus();
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
        sfx.click();
      }
    };

    const loop = () => {
      raf = window.requestAnimationFrame(loop);

      const pad = activePad();
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

      // a fresh press moves at once; holding repeats after a short wait
      const t = performance.now();
      const dirs: Dir[] = ["up", "down", "left", "right"];
      const held = dirs.find((d) => now[d]);
      if (held) {
        const fresh = !was[held];
        if (fresh) {
          move(held);
          repeatAt = t + 380;
        } else if (t >= repeatAt) {
          move(held);
          repeatAt = t + 130;
        }
      }

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

  // A sub-screen (controls, wardrobe) remembers the button that opened it, and
  // focus goes back there when it closes rather than to the top of the menu.
  const returnTo = useRef<HTMLElement[]>([]);
  const wasOpen = useRef({ wardrobeOpen, controlsOpen });
  useEffect(() => {
    const before = wasOpen.current;
    wasOpen.current = { wardrobeOpen, controlsOpen };
    const opened = (wardrobeOpen && !before.wardrobeOpen) || (controlsOpen && !before.controlsOpen);
    if (opened && document.activeElement instanceof HTMLElement) returnTo.current.push(document.activeElement);
  }, [wardrobeOpen, controlsOpen]);

  // when a panel opens or closes, put focus on its first control so the pad has a start
  useEffect(() => {
    const id = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      // in play, and while the quiz or rock paper scissors run their own
      // highlight, nothing in the overlay keeps a focus ring
      if (phase === "playing" || quizOpen || rpsOpen) {
        if (active && active !== document.body && active.closest(".overlay-root")) active.blur();
        return;
      }
      const list = items();
      if (!list.length || (active && list.includes(active))) return;
      let back = returnTo.current.pop();
      while (back && !(back.isConnected && list.includes(back))) back = returnTo.current.pop();
      (back ?? first(list))?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [phase, wardrobeOpen, controlsOpen, quizOpen, rpsOpen]);

  return null;
}
