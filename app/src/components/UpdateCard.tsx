import type { CSSProperties } from "react";

import {
  UPDATE_CARD_HEIGHT,
  UPDATE_CARD_IN_MS,
  UPDATE_CARD_OUT_MS,
  UPDATE_CARD_REDUCED_MS,
  UPDATE_CARD_WIDTH,
} from "../lib/constants";
import { rectToLogical, type Env } from "../lib/ipc";
import { getPanelOffset } from "../lib/panel";

type Props = {
  title: string;
  subtitle?: string;
  env: Env;
  open: boolean;
  reduceMotion: boolean;
};

/**
 * A small, non-interactive announcement that grows from the bubble the same
 * way a tool panel does — same offset math, same transform-origin, same
 * curves — but nothing in it is clickable. It appears and disappears on the
 * update flow's own schedule, not the user's, so there is deliberately no
 * backdrop and no close button.
 */
export function UpdateCard({ title, subtitle, env, open, reduceMotion }: Props) {
  const scale = env.scaleFactor;
  const offset = getPanelOffset(
    { x: env.center.x / scale, y: env.center.y / scale },
    rectToLogical(env.workArea, scale),
    { width: UPDATE_CARD_WIDTH, height: UPDATE_CARD_HEIGHT },
  );

  const originX = offset.x > 0 ? 0 : UPDATE_CARD_WIDTH;
  const originY = Math.min(Math.max(-offset.y, 0), UPDATE_CARD_HEIGHT);

  const style = {
    "--card-w": `${UPDATE_CARD_WIDTH}px`,
    "--card-h": `${UPDATE_CARD_HEIGHT}px`,
    "--card-x": `${offset.x}px`,
    "--card-y": `${offset.y}px`,
    "--card-origin": `${originX}px ${originY}px`,
    "--card-in": `${reduceMotion ? UPDATE_CARD_REDUCED_MS : UPDATE_CARD_IN_MS}ms`,
    "--card-out": `${reduceMotion ? UPDATE_CARD_REDUCED_MS : UPDATE_CARD_OUT_MS}ms`,
  } as CSSProperties;

  return (
    <div className="update-card-layer" data-open={open} style={style}>
      <div className="update-card" role="status">
        <p className="update-card__title">{title}</p>
        {subtitle && <p className="update-card__subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
