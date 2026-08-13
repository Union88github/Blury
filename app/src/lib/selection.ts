import type { Point, Rect } from "./geometry";

/**
 * The rectangle between two drag points, always with positive size.
 *
 * Dragging up or left produces negative extents if you subtract naively, and a
 * negative-height crop is what makes screenshot tools silently return nothing
 * when you select bottom-right to top-left.
 */
export function dragRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * A CSS-space selection turned into the integer physical-pixel crop the backend
 * will apply to the frozen frame.
 *
 * The overlay is laid out in CSS px but the captured frame is physical px, so
 * this is the one place the two spaces meet — everything downstream of it is
 * physical. Clamped to the frame, because a drag that leaves the window would
 * otherwise crop outside the image. Returns `null` for a selection too small to
 * be meaningful, which is how a stray click is told apart from a real drag.
 */
export function selectionToPhysical(
  a: Point,
  b: Point,
  scale: number,
  frame: { width: number; height: number },
): Rect | null {
  const css = dragRect(a, b);

  // Round the edges, not the size: rounding the size independently lets a
  // rectangle drift by a pixel depending on where it started.
  const left = Math.round(css.x * scale);
  const top = Math.round(css.y * scale);
  const right = Math.round((css.x + css.width) * scale);
  const bottom = Math.round((css.y + css.height) * scale);

  const x = clamp(left, 0, frame.width);
  const y = clamp(top, 0, frame.height);
  const width = clamp(right, 0, frame.width) - x;
  const height = clamp(bottom, 0, frame.height) - y;

  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
