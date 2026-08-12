import type { CSSProperties, ComponentType } from "react";

import {
  PANEL_HEIGHT,
  PANEL_IN_MS,
  PANEL_OUT_MS,
  PANEL_REDUCED_MS,
  PANEL_WIDTH,
} from "../lib/constants";
import { rectToLogical, type Env } from "../lib/ipc";
import { getPanelOffset } from "../lib/panel";

type Props = {
  /** Whatever component the active tool carries. Never inspected further. */
  body: ComponentType<{ onClose: () => void }>;
  env: Env;
  open: boolean;
  reduceMotion: boolean;
  onClose: () => void;
};

/**
 * Positions a tool panel next to the bubble and animates it in.
 *
 * Generic on purpose: it takes a component and renders it. Nothing here knows
 * which tool is showing, which is what lets a tool ship its own panel without
 * this file changing.
 */
export function Panel({ body: Body, env, open, reduceMotion, onClose }: Props) {
  const scale = env.scaleFactor;
  const offset = getPanelOffset(
    { x: env.center.x / scale, y: env.center.y / scale },
    rectToLogical(env.workArea, scale),
    { width: PANEL_WIDTH, height: PANEL_HEIGHT },
  );

  // Grow from the bubble's side rather than from the panel's own middle, so it
  // reads as coming out of the bubble.
  const originX = offset.x > 0 ? 0 : PANEL_WIDTH;
  const originY = Math.min(Math.max(-offset.y, 0), PANEL_HEIGHT);

  const style = {
    "--panel-w": `${PANEL_WIDTH}px`,
    "--panel-h": `${PANEL_HEIGHT}px`,
    "--panel-x": `${offset.x}px`,
    "--panel-y": `${offset.y}px`,
    "--panel-origin": `${originX}px ${originY}px`,
    "--panel-in": `${reduceMotion ? PANEL_REDUCED_MS : PANEL_IN_MS}ms`,
    "--panel-out": `${reduceMotion ? PANEL_REDUCED_MS : PANEL_OUT_MS}ms`,
  } as CSSProperties;

  return (
    <div className="panel-layer" data-open={open} style={style}>
      {/* Clicks that miss the panel dismiss it, the same way they do the arc. */}
      <div className="panel-layer__backdrop" onPointerDown={onClose} aria-hidden />
      <div className="panel" role="dialog" aria-modal="false">
        <Body onClose={onClose} />
      </div>
    </div>
  );
}
