import { useEffect, useRef } from "react";

import { setInteractive } from "../lib/ipc";

/**
 * Reports to the backend whether the whole window should accept clicks.
 *
 * There is deliberately **one** of these for the whole app. The arc and a tool
 * panel can each be open, and if both reported independently the one closing
 * would switch hit-testing off while the other was still on screen — leaving a
 * visible panel that swallows nothing and cannot be clicked.
 *
 * Calls are chained rather than fired in parallel: out of order, the backend
 * ends up believing something is open when it isn't, and the window goes on
 * swallowing clicks across its whole rectangle.
 */
export function useInteractive(active: boolean): void {
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    chain.current = chain.current.then(() =>
      setInteractive(active).catch((err) => {
        console.error("bubble: could not update hit-testing", err);
      }),
    );
  }, [active]);
}
