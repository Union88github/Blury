import { useCallback, useEffect, useRef, useState } from "react";

import type { BubbleDriver } from "../lib/bubbleDriver";
import type { Env } from "../lib/ipc";
import {
  MENU_IN_MS,
  MENU_OUT_MS,
  MENU_REDUCED_MS,
  MENU_STAGGER_OUT_MS,
} from "../lib/constants";
import { staggerSpan } from "../lib/stagger";

export type MenuState = {
  /** The items are in the DOM — true through the whole exit animation too. */
  mounted: boolean;
  /** The items are in their outward position. Drives the transitions. */
  open: boolean;
  /** Captured on open — what the arc geometry is computed from. */
  env: Env | null;
  toggle: () => void;
  close: () => void;
  /** The webview lost focus — dismiss, if the menu is settled and open. */
  dismissOnBlur: () => void;
};

/**
 * Owns opening and closing the arc.
 *
 * There is no window resize here any more, and that absence is the feature: the
 * window is a fixed 360×360, so opening is a pure content change the webview
 * paints on its own schedule with nothing to synchronise against. The old
 * version had to grow the window before animating in and shrink it after
 * animating out, and the resize flashed a blank frame every time.
 *
 * What remains is that the unmount waits for the exit animation so items aren't
 * ripped out mid-flight. Hit-testing is *not* reported from here — `mounted` is
 * fed to the app's single `useInteractive`, because a tool panel can be open at
 * the same time and two reporters would fight.
 */
export function useMenu(
  driver: BubbleDriver,
  reduceMotion: boolean,
  itemCount: number,
): MenuState {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState<Env | null>(null);

  const gen = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  /**
   * Whether the arc is up, read inside async continuations where the state
   * value would be whatever it was when the callback was created. Set the
   * instant a transition starts, so a second click is never judged against the
   * old state.
   */
  const live = useRef(false);
  /** Focus loss is only a dismissal once the menu has settled. */
  const settledAt = useRef(0);

  const enterMs = reduceMotion ? MENU_REDUCED_MS : MENU_IN_MS;
  const exitMs = reduceMotion
    ? MENU_REDUCED_MS
    : MENU_OUT_MS + MENU_STAGGER_OUT_MS * staggerSpan(itemCount);

  const clearTimer = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };

  const openMenu = useCallback(async () => {
    const token = ++gen.current;
    clearTimer();
    live.current = true;

    // The arc is placed from the bubble's current position, which a drag or a
    // summon may have changed since the last read.
    let next: Env;
    try {
      next = await driver.sync();
    } catch (err) {
      console.error("bubble: could not read the environment", err);
      if (gen.current === token) live.current = false;
      return;
    }
    if (gen.current !== token) return;

    setEnv(next);
    setMounted(true);
    // Mount tucked under the bubble, then flip on the next frame so the
    // transition has a from-state to leave. Both in one pass would paint the
    // items already in place, with nothing to animate.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen.current !== token) return;
        setOpen(true);
        settledAt.current = performance.now() + enterMs;
      });
    });
  }, [driver, enterMs]);

  const closeMenu = useCallback(() => {
    // Called on every drag start and every summon, so the common case is a menu
    // that was never open.
    if (!live.current && !mounted) return;

    const token = ++gen.current;
    clearTimer();
    live.current = false;
    setOpen(false);

    // Keep the items mounted until the exit has finished playing.
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (gen.current !== token) return;
      setMounted(false);
      setEnv(null);
    }, exitMs);
  }, [mounted, exitMs]);

  const toggle = useCallback(() => {
    if (live.current) closeMenu();
    else void openMenu();
  }, [closeMenu, openMenu]);

  /**
   * Clicking another application never reaches us, so losing focus is the only
   * evidence of a click outside our own rectangle. Ignored until the open
   * animation has finished, so a focus change caused by opening can't dismiss
   * the menu instantly.
   */
  const dismissOnBlur = useCallback(() => {
    if (!live.current) return;
    if (performance.now() < settledAt.current) return;
    closeMenu();
  }, [closeMenu]);

  // Escape closes. Bound to the window rather than a node so it fires wherever
  // focus happens to be inside the webview.
  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, closeMenu]);

  useEffect(() => clearTimer, []);

  return { mounted, open, env, toggle, close: closeMenu, dismissOnBlur };
}
