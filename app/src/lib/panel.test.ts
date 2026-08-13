import { describe, expect, it } from "vitest";

import { getPanelOffset } from "./panel";
import {
  BUBBLE_SIZE,
  PANEL_GAP,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_WIDTH,
  WINDOW_SIZE,
} from "./constants";

const AREA = { x: 0, y: 0, width: 1600, height: 860 };
const PANEL = { width: PANEL_WIDTH, height: PANEL_HEIGHT };
const ANCHOR = BUBBLE_SIZE / 2 + PANEL_GAP;

describe("getPanelOffset", () => {
  it("opens to the right when there is room", () => {
    const o = getPanelOffset({ x: 100, y: 430 }, AREA, PANEL);
    expect(o.x).toBe(ANCHOR);
  });

  it("flips to the left when the right would not fit", () => {
    const o = getPanelOffset({ x: 1560, y: 430 }, AREA, PANEL);
    expect(o.x).toBe(-(ANCHOR + PANEL.width));
  });

  it("flips exactly at the point the panel stops fitting", () => {
    // Right edge minus anchor minus width is the last centre that still fits.
    const fits = AREA.width - ANCHOR - PANEL.width;
    expect(getPanelOffset({ x: fits, y: 430 }, AREA, PANEL).x).toBe(ANCHOR);
    expect(getPanelOffset({ x: fits + 1, y: 430 }, AREA, PANEL).x).toBe(
      -(ANCHOR + PANEL.width),
    );
  });

  it("centres vertically on the bubble when it can", () => {
    const o = getPanelOffset({ x: 100, y: 430 }, AREA, PANEL);
    expect(o.y).toBe(-PANEL.height / 2);
  });

  it("never runs past the top of the work area", () => {
    const center = { x: 100, y: 48 };
    const o = getPanelOffset(center, AREA, PANEL);
    expect(center.y + o.y).toBeGreaterThanOrEqual(AREA.y + PANEL_MARGIN);
  });

  it("never runs past the bottom of the work area", () => {
    const center = { x: 100, y: 812 };
    const o = getPanelOffset(center, AREA, PANEL);
    const bottom = center.y + o.y + PANEL.height;
    expect(bottom).toBeLessThanOrEqual(AREA.y + AREA.height - PANEL_MARGIN);
  });

  it("respects a work area that does not start at the origin", () => {
    const area = { x: 2000, y: -300, width: 1280, height: 700 };
    const center = { x: 2040, y: -260 };
    const o = getPanelOffset(center, area, PANEL);
    expect(center.x + o.x).toBeGreaterThanOrEqual(area.x);
    expect(center.y + o.y).toBeGreaterThanOrEqual(area.y + PANEL_MARGIN);
  });

  it("pins to the top when the work area is shorter than the panel", () => {
    const area = { x: 0, y: 0, width: 1600, height: 200 };
    const o = getPanelOffset({ x: 100, y: 100 }, area, PANEL);
    expect(100 + o.y).toBe(area.y + PANEL_MARGIN);
  });

  it("always stays inside the window, which is what makes it visible at all", () => {
    const half = WINDOW_SIZE / 2;
    // Sweep the bubble across every position it can legally occupy.
    for (let x = 48; x <= AREA.width - 48; x += 37) {
      for (let y = 48; y <= AREA.height - 48; y += 29) {
        const o = getPanelOffset({ x, y }, AREA, PANEL);
        expect(Math.min(o.x, o.y)).toBeGreaterThanOrEqual(-half);
        expect(Math.max(o.x + PANEL.width, o.y + PANEL.height)).toBeLessThanOrEqual(half);
      }
    }
  });
});
