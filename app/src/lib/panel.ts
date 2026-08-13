import { BUBBLE_SIZE, PANEL_GAP, PANEL_MARGIN } from "./constants";
import type { Point, Rect } from "./geometry";

export type Size = { width: number; height: number };

/**
 * Where a tool panel goes, as an offset in CSS px from the bubble centre to the
 * panel's top-left.
 *
 * Same problem `getArc` solves, and the same answer: the bubble lives against an
 * edge most of the time, so a panel pinned to one side would hang off the screen
 * half the time. It opens toward whichever side has room, and is clamped
 * vertically so it never runs past the top or bottom of the work area.
 *
 * Pure: no DOM, no rendering, no knowledge of which tool owns the panel.
 * Everything is logical (CSS) px.
 */
export function getPanelOffset(
  bubbleCenter: Point,
  workArea: Rect,
  panel: Size,
): Point {
  const anchor = BUBBLE_SIZE / 2 + PANEL_GAP;

  // Prefer the right, but only if the panel actually fits there.
  const roomRight = workArea.x + workArea.width - (bubbleCenter.x + anchor);
  const x = roomRight >= panel.width ? anchor : -(anchor + panel.width);

  const minTop = workArea.y + PANEL_MARGIN;
  const maxTop = workArea.y + workArea.height - panel.height - PANEL_MARGIN;
  // Centred on the bubble, then pulled back onto the screen. When the work area
  // is shorter than the panel there is no valid top, so pin to the top edge and
  // let it overflow downward rather than jumping somewhere arbitrary.
  const centred = bubbleCenter.y - panel.height / 2;
  const top = maxTop < minTop ? minTop : clamp(centred, minTop, maxTop);

  return { x, y: top - bubbleCenter.y };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
