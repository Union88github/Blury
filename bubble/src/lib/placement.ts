import type { ReleaseResolver } from "./bubbleDriver";
import { BUBBLE_BOX } from "./constants";
import { clamp } from "./physics";

type Edge = "left" | "right" | "top" | "bottom";

/**
 * Where a released bubble comes to rest: the nearest edge to where its momentum
 * was heading.
 *
 * The edge is chosen from the *projected* point rather than the release point,
 * so a flick throws the bubble across the screen instead of dropping it where
 * the finger left off.
 */
export const snapToEdge: ReleaseResolver = ({ projected, area }) => {
  const half = (BUBBLE_BOX * area.scaleFactor) / 2;
  const { x: ax, y: ay, width, height } = area.workArea;

  const minX = ax + half;
  const maxX = ax + width - half;
  const minY = ay + half;
  const maxY = ay + height - half;

  const x = clamp(projected.x, minX, maxX);
  const y = clamp(projected.y, minY, maxY);

  const distances: { edge: Edge; gap: number }[] = [
    { edge: "left", gap: x - minX },
    { edge: "right", gap: maxX - x },
    { edge: "top", gap: y - minY },
    { edge: "bottom", gap: maxY - y },
  ];
  const nearest = distances.reduce((a, b) => (b.gap < a.gap ? b : a));

  const target = { x, y };
  if (nearest.edge === "left") target.x = minX;
  else if (nearest.edge === "right") target.x = maxX;
  else if (nearest.edge === "top") target.y = minY;
  else target.y = maxY;

  // The axis being snapped lands against a wall, and the other axis may have
  // been clamped into one. Neither may overshoot: past the edge the bubble is
  // off-screen, and coming back reads as a bug rather than as physics. Bounce
  // is only allowed on an axis that stopped of its own accord.
  const snapping: "x" | "y" =
    nearest.edge === "left" || nearest.edge === "right" ? "x" : "y";

  return {
    target,
    bounce: {
      x: snapping === "x" || target.x !== projected.x ? 0 : 0.12,
      y: snapping === "y" || target.y !== projected.y ? 0 : 0.12,
    },
    duration: 0.45,
  };
};
