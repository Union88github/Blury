import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

import { PANEL_OUT_MS, PANEL_REDUCED_MS } from "../lib/constants";
import type { Env } from "../lib/ipc";

/**
 * Anything that can be shown in the panel slot.
 *
 * Deliberately *not* `Tool`. Settings is a panel too, and it is not a tool —
 * v1's arc has exactly two items and settings is not one of them. Holding the
 * narrower shape keeps the host from growing tool-specific knowledge it would
 * then have to unlearn.
 */
export type PanelSource = {
  id: string;
  body: ComponentType<{ onClose: () => void }>;
};

export type PanelState = {
  /** What is on screen, including through its exit animation. */
  source: PanelSource | null;
  /** The panel is in its resting position. Drives the transitions. */
  open: boolean;
  /** Captured when the panel opened — what its placement is computed from. */
  env: Env | null;
  show: (source: PanelSource, env: Env) => void;
  close: () => void;
};

/**
 * Owns the panel slot: what is showing, and its enter/exit lifecycle.
 *
 * Knows nothing about tools or settings — it holds a component and renders it.
 * This is the half of the module boundary that lives outside the tools; the
 * other half is that tools never reach into the bubble or the menu.
 */
export function usePanel(reduceMotion: boolean): PanelState {
  const [source, setSource] = useState<PanelSource | null>(null);
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState<Env | null>(null);

  const gen = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const live = useRef(false);

  const exitMs = reduceMotion ? PANEL_REDUCED_MS : PANEL_OUT_MS;

  const clearTimer = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };

  const show = useCallback((next: PanelSource, nextEnv: Env) => {
    const token = ++gen.current;
    clearTimer();
    live.current = true;
    setSource(next);
    setEnv(nextEnv);
    setOpen(false);
    // Mount closed, then open on the next frame so the transition has a
    // from-state to leave.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen.current === token) setOpen(true);
      });
    });
  }, []);

  const close = useCallback(() => {
    if (!live.current) return;
    const token = ++gen.current;
    clearTimer();
    live.current = false;
    setOpen(false);
    // Stay mounted until the exit has played, or the panel vanishes instead of
    // leaving.
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (gen.current !== token) return;
      setSource(null);
      setEnv(null);
    }, exitMs);
  }, [exitMs]);

  useEffect(() => {
    if (!source) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      // Stop the arc's own Escape handler from also firing; the panel is on
      // top, so it is what the user means to dismiss.
      e.stopPropagation();
      close();
    };
    // Capture phase, so this runs before the menu's bubble-phase listener.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [source, close]);

  useEffect(() => clearTimer, []);

  return { source, open, env, show, close };
}
