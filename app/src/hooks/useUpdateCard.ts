import { useEffect, useRef, useState } from "react";

export type CardMountState = {
  /** In the DOM — true through the exit transition too. */
  mounted: boolean;
  /** In its resting position. Drives the transition. */
  open: boolean;
};

/**
 * The same mount/open split `usePanel` uses, but driven by `active` rather
 * than a `show()`/`close()` call — the update card's schedule belongs to the
 * update flow, not to a click. Keeping it mounted through `exitMs` is what
 * lets the "Updated to x.y.z" card fade out instead of vanishing the instant
 * its timer in `lib/updater.ts` flips the status back to idle.
 */
export function useUpdateCard(active: boolean, exitMs: number): CardMountState {
  const [mounted, setMounted] = useState(active);
  const [open, setOpen] = useState(active);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }

    if (active) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setOpen(true));
      });
      return;
    }

    setOpen(false);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setMounted(false);
    }, exitMs);
  }, [active, exitMs]);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  return { mounted, open };
}
