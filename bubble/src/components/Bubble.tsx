import { useCallback, useRef, useState } from "react";

import type { BubbleDriver } from "../lib/bubbleDriver";
import { DRAG_THRESHOLD } from "../lib/constants";
import { snapToEdge } from "../lib/placement";
import { useReducedMotion } from "../hooks/useReducedMotion";

type Visual = "idle" | "hover" | "press" | "drag";

type Props = {
  driver: BubbleDriver;
  onActivate: () => void;
  /** The arc is open: the bubble recedes so it reads as the anchor, not an item. */
  open?: boolean;
  /** Threshold crossed. The arc can't follow a moving bubble, so it closes. */
  onDragStart?: () => void;
};

export function Bubble({ driver, onActivate, open = false, onDragStart }: Props) {
  const [visual, setVisual] = useState<Visual>("idle");
  const reduceMotion = useReducedMotion();

  const hovering = useRef(false);
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  const rest = useCallback(() => {
    setVisual(hovering.current ? "hover" : "idle");
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      // Screen coords, not client: the window itself moves once the drag starts.
      press.current = { x: e.screenX, y: e.screenY, dragging: false };
      // Feedback on pointer-down. Waiting for the release reads as lag.
      setVisual("press");
      driver.arm();
    },
    [driver],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const p = press.current;
      if (!p || p.dragging) return;
      if (Math.hypot(e.screenX - p.x, e.screenY - p.y) < DRAG_THRESHOLD) return;
      p.dragging = true;
      setVisual("drag");
      onDragStart?.();
      void driver.beginDrag();
    },
    [driver, onDragStart],
  );

  const finish = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, activate: boolean) => {
      const p = press.current;
      press.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      rest();
      if (!p) return;
      if (p.dragging) {
        void driver.release(snapToEdge, reduceMotion);
      } else {
        driver.disarm();
        if (activate) onActivate();
      }
    },
    [driver, onActivate, reduceMotion, rest],
  );

  return (
    <button
      type="button"
      className="bubble"
      data-state={visual}
      data-open={open}
      aria-label="Blury"
      aria-haspopup="menu"
      aria-expanded={open}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onPointerEnter={() => {
        hovering.current = true;
        if (!press.current) setVisual("hover");
      }}
      onPointerLeave={() => {
        hovering.current = false;
        if (!press.current) setVisual("idle");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="bubble__shadow" aria-hidden />
      <span className="bubble__shadow bubble__shadow--lift" aria-hidden />
      <span className="bubble__ring" aria-hidden />
      <span className="bubble__body" aria-hidden>
        <span className="bubble__specular" />
      </span>
    </button>
  );
}
