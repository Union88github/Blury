import { ARC_RADIUS } from "./constants";
import type { Point, Rect } from "./geometry";

/**
 * Past six, the angular segments get too thin to hit reliably.
 */
export const MAX_ARC_ITEMS = 6;

/**
 * How much closer than the arc radius an edge has to be before it counts as
 * blocking. The slack is what keeps the outermost item off the edge: at exactly
 * `ARC_RADIUS` an item on the fan's rim would land on the boundary.
 */
const EDGE_SLACK = 24;

const ONE_EDGE_SPREAD = 160;
const CORNER_SPREAD = 100;

/** Screen convention: 0° is +x (right), 90° is +y (down), -90° is straight up. */
export type ArcItem = { angleDeg: number };

type Vec = { x: number; y: number };

/**
 * Angles for `itemCount` items arranged around a bubble at `bubbleCenter`.
 *
 * A fixed circle breaks the moment the bubble is near an edge — which is where
 * it lives most of the time — so the fan turns to face inward. Pure: no DOM, no
 * rendering, no knowledge of what the items are.
 */
export function getArc(
  bubbleCenter: Point,
  workArea: Rect,
  itemCount: number,
): ArcItem[] {
  const count = Math.min(Math.max(Math.trunc(itemCount), 0), MAX_ARC_ITEMS);
  if (count === 0) return [];

  const blocking = ARC_RADIUS + EDGE_SLACK;
  const normals: Vec[] = [];

  // Each normal points *away* from its edge, i.e. into the screen.
  if (bubbleCenter.x - workArea.x <= blocking) normals.push({ x: 1, y: 0 });
  if (workArea.x + workArea.width - bubbleCenter.x <= blocking) {
    normals.push({ x: -1, y: 0 });
  }
  if (bubbleCenter.y - workArea.y <= blocking) normals.push({ x: 0, y: 1 });
  if (workArea.y + workArea.height - bubbleCenter.y <= blocking) {
    normals.push({ x: 0, y: -1 });
  }

  const sum = normals.reduce<Vec>(
    (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }),
    { x: 0, y: 0 },
  );

  // Nothing blocking, or opposing edges that cancel out (a work area narrower
  // than the arc). Either way no direction is better than any other.
  if (normals.length === 0 || (sum.x === 0 && sum.y === 0)) {
    return ring(count);
  }

  const spread = normals.length === 1 ? ONE_EDGE_SPREAD : CORNER_SPREAD;
  return fan(degrees(Math.atan2(sum.y, sum.x)), spread, count);
}

/** Full circle, first item straight up, evenly spaced. */
function ring(count: number): ArcItem[] {
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => ({
    angleDeg: normalize(-90 + i * step),
  }));
}

/** `count` items centred on `centerDeg`, spanning `spread` degrees. */
function fan(centerDeg: number, spread: number, count: number): ArcItem[] {
  if (count === 1) return [{ angleDeg: normalize(centerDeg) }];
  const step = spread / (count - 1);
  const start = centerDeg - spread / 2;
  return Array.from({ length: count }, (_, i) => ({
    angleDeg: normalize(start + i * step),
  }));
}

const degrees = (radians: number) => (radians * 180) / Math.PI;

/** Wrap to (-180, 180]. */
function normalize(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Offset in CSS px from the bubble centre for an arc item. */
export function arcOffset(angleDeg: number, radius = ARC_RADIUS): Point {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}
