import { describe, expect, it } from "vitest";

import { dragRect, selectionToPhysical } from "./selection";

const FRAME = { width: 2560, height: 1440 };

describe("dragRect", () => {
  it("handles a normal top-left to bottom-right drag", () => {
    expect(dragRect({ x: 10, y: 20 }, { x: 110, y: 220 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
  });

  it("is identical when dragged backwards", () => {
    const forward = dragRect({ x: 10, y: 20 }, { x: 110, y: 220 });
    const backward = dragRect({ x: 110, y: 220 }, { x: 10, y: 20 });
    expect(backward).toEqual(forward);
  });

  it("handles the two mixed diagonals", () => {
    expect(dragRect({ x: 110, y: 20 }, { x: 10, y: 220 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
    expect(dragRect({ x: 10, y: 220 }, { x: 110, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
  });
});

describe("selectionToPhysical", () => {
  it("passes through at scale 1", () => {
    expect(
      selectionToPhysical({ x: 10, y: 20 }, { x: 110, y: 220 }, 1, FRAME),
    ).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it("scales for a 150% display", () => {
    expect(
      selectionToPhysical({ x: 10, y: 20 }, { x: 110, y: 220 }, 1.5, FRAME),
    ).toEqual({ x: 15, y: 30, width: 150, height: 300 });
  });

  it("keeps edges accurate at a fractional scale", () => {
    // Edges are rounded, not the size, so the crop lands on the pixels actually
    // under the selection. The size may vary by one pixel with the subpixel
    // phase — that is correct, not drift: 50 CSS px at 1.25 is 62.5 physical,
    // which genuinely covers 62 or 63 pixels depending on where it starts.
    for (let start = 0; start < 12; start++) {
      const r = selectionToPhysical(
        { x: start, y: start },
        { x: start + 100, y: start + 50 },
        1.25,
        FRAME,
      );
      expect(r).not.toBeNull();
      expect(r!.x).toBe(Math.round(start * 1.25));
      expect(r!.y).toBe(Math.round(start * 1.25));
      expect(Math.abs(r!.width - 125)).toBeLessThanOrEqual(1);
      expect(Math.abs(r!.height - 62.5)).toBeLessThanOrEqual(1);
    }
  });

  it("clamps a drag that leaves the frame", () => {
    const r = selectionToPhysical(
      { x: -50, y: -50 },
      { x: 5000, y: 5000 },
      1,
      FRAME,
    );
    expect(r).toEqual({ x: 0, y: 0, width: FRAME.width, height: FRAME.height });
  });

  it("rejects a click with no drag", () => {
    expect(selectionToPhysical({ x: 40, y: 40 }, { x: 40, y: 40 }, 1, FRAME)).toBeNull();
  });

  it("rejects a sub-pixel smudge", () => {
    expect(
      selectionToPhysical({ x: 40, y: 40 }, { x: 40.2, y: 41 }, 1, FRAME),
    ).toBeNull();
  });

  it("rejects a selection entirely outside the frame", () => {
    expect(
      selectionToPhysical({ x: 4000, y: 4000 }, { x: 4200, y: 4200 }, 1, FRAME),
    ).toBeNull();
  });

  it("never returns a crop outside the frame", () => {
    for (const [ax, ay, bx, by] of [
      [-100, -100, 50, 50],
      [2500, 1400, 3000, 1800],
      [0, 0, 2560, 1440],
      [1000, -20, 1200, 1500],
    ]) {
      const r = selectionToPhysical({ x: ax, y: ay }, { x: bx, y: by }, 1, FRAME);
      if (!r) continue;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(FRAME.width);
      expect(r.y + r.height).toBeLessThanOrEqual(FRAME.height);
    }
  });
});
