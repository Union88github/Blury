import { describe, expect, it } from "vitest";

import { arcOffset, getArc, MAX_ARC_ITEMS } from "./arc";
import { ARC_RADIUS, BUBBLE_BOX } from "./constants";
import type { Rect } from "./geometry";

const SCREEN: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
/** ARC_RADIUS + EDGE_SLACK */
const BLOCKING = 134;

const angles = (...args: Parameters<typeof getArc>) =>
  getArc(...args).map((i) => i.angleDeg);

describe("item count", () => {
  it("returns nothing for zero items", () => {
    expect(getArc({ x: 960, y: 520 }, SCREEN, 0)).toEqual([]);
  });

  it("caps at six", () => {
    expect(getArc({ x: 960, y: 520 }, SCREEN, 9)).toHaveLength(MAX_ARC_ITEMS);
    expect(getArc({ x: 48, y: 48 }, SCREEN, 12)).toHaveLength(MAX_ARC_ITEMS);
  });

  it("ignores negative and fractional counts", () => {
    expect(getArc({ x: 960, y: 520 }, SCREEN, -3)).toEqual([]);
    expect(getArc({ x: 960, y: 520 }, SCREEN, 3.7)).toHaveLength(3);
  });
});

describe("no blocking edge", () => {
  it("spreads a full circle from straight up", () => {
    expect(angles({ x: 960, y: 520 }, SCREEN, 4)).toEqual([-90, 0, 90, 180]);
  });

  it("starts at -90 whatever the count", () => {
    for (let n = 1; n <= MAX_ARC_ITEMS; n++) {
      expect(angles({ x: 960, y: 520 }, SCREEN, n)[0]).toBe(-90);
    }
  });

  it("spaces items evenly around 360", () => {
    const got = angles({ x: 960, y: 520 }, SCREEN, 6);
    expect(got).toEqual([-90, -30, 30, 90, 150, -150]);
  });
});

describe("one blocking edge", () => {
  it("fans inward from the left edge", () => {
    expect(angles({ x: 60, y: 520 }, SCREEN, 3)).toEqual([-80, 0, 80]);
  });

  it("fans inward from the right edge", () => {
    expect(angles({ x: 1860, y: 520 }, SCREEN, 3)).toEqual([100, 180, -100]);
  });

  it("fans downward from the top edge", () => {
    expect(angles({ x: 960, y: 60 }, SCREEN, 3)).toEqual([10, 90, 170]);
  });

  it("fans upward from the bottom edge", () => {
    expect(angles({ x: 960, y: 990 }, SCREEN, 3)).toEqual([-170, -90, -10]);
  });

  it("puts a lone item on the normal itself", () => {
    expect(angles({ x: 60, y: 520 }, SCREEN, 1)).toEqual([0]);
  });

  it("spans exactly 160 degrees end to end", () => {
    const got = angles({ x: 60, y: 520 }, SCREEN, 5);
    expect(got[got.length - 1] - got[0]).toBeCloseTo(160, 10);
  });
});

describe("corner", () => {
  it("fans out of the top-left corner along the diagonal", () => {
    expect(angles({ x: 60, y: 60 }, SCREEN, 3)).toEqual([-5, 45, 95]);
  });

  it("fans out of the bottom-right corner along the diagonal", () => {
    expect(angles({ x: 1860, y: 990 }, SCREEN, 3)).toEqual([175, -135, -85]);
  });

  it("fans out of the top-right corner along the diagonal", () => {
    expect(angles({ x: 1860, y: 60 }, SCREEN, 3)).toEqual([85, 135, -175]);
  });

  it("fans out of the bottom-left corner along the diagonal", () => {
    expect(angles({ x: 60, y: 990 }, SCREEN, 3)).toEqual([-95, -45, 5]);
  });

  it("spans exactly 100 degrees end to end", () => {
    const got = angles({ x: 60, y: 60 }, SCREEN, 4);
    expect(got[got.length - 1] - got[0]).toBeCloseTo(100, 10);
  });
});

describe("blocking threshold", () => {
  it("counts an edge at exactly radius + slack as blocking", () => {
    expect(angles({ x: BLOCKING, y: 520 }, SCREEN, 3)).toEqual([-80, 0, 80]);
  });

  it("ignores an edge one pixel further away", () => {
    expect(angles({ x: BLOCKING + 1, y: 520 }, SCREEN, 3)[0]).toBe(-90);
  });

  it("respects a work area that does not start at the origin", () => {
    // Second monitor, left of the primary, with a taskbar at the bottom.
    const secondary: Rect = { x: -1920, y: 0, width: 1920, height: 1040 };
    expect(angles({ x: -1860, y: 520 }, secondary, 3)).toEqual([-80, 0, 80]);
    expect(angles({ x: -960, y: 520 }, secondary, 3)[0]).toBe(-90);
  });
});

describe("degenerate work areas", () => {
  it("falls back to a full circle when opposing edges cancel", () => {
    const slot: Rect = { x: 0, y: 0, width: 200, height: 1040 };
    expect(angles({ x: 100, y: 520 }, slot, 3)[0]).toBe(-90);
  });

  it("still fans when three edges block", () => {
    const strip: Rect = { x: 0, y: 0, width: 200, height: 1040 };
    // Left and right cancel, top survives, so the fan points down — and with
    // more than one edge blocking it takes the tighter corner spread.
    expect(angles({ x: 100, y: 60 }, strip, 3)).toEqual([40, 90, 140]);
  });
});

describe("the arc never leaves the work area", () => {
  // The bubble can get no closer to an edge than half the collapsed window.
  const MARGIN = BUBBLE_BOX / 2;

  const positions: number[] = [];
  for (const screen of [SCREEN]) {
    for (
      let x = screen.x + MARGIN;
      x <= screen.x + screen.width - MARGIN;
      x += 37
    ) {
      positions.push(x);
    }
  }

  it("keeps every item inside for every reachable bubble position", () => {
    const ys: number[] = [];
    for (
      let y = SCREEN.y + MARGIN;
      y <= SCREEN.y + SCREEN.height - MARGIN;
      y += 37
    ) {
      ys.push(y);
    }

    const failures: string[] = [];
    for (const x of positions) {
      for (const y of ys) {
        for (let n = 1; n <= MAX_ARC_ITEMS; n++) {
          for (const { angleDeg } of getArc({ x, y }, SCREEN, n)) {
            const o = arcOffset(angleDeg);
            const px = x + o.x;
            const py = y + o.y;
            const inside =
              px >= SCREEN.x &&
              px <= SCREEN.x + SCREEN.width &&
              py >= SCREEN.y &&
              py <= SCREEN.y + SCREEN.height;
            if (!inside) {
              failures.push(
                `bubble(${x},${y}) n=${n} angle=${angleDeg} -> (${px.toFixed(1)},${py.toFixed(1)})`,
              );
            }
          }
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});

describe("arcOffset", () => {
  it("puts -90 straight up", () => {
    const o = arcOffset(-90);
    expect(o.x).toBeCloseTo(0, 10);
    expect(o.y).toBeCloseTo(-ARC_RADIUS, 10);
  });

  it("puts 0 to the right", () => {
    const o = arcOffset(0);
    expect(o.x).toBeCloseTo(ARC_RADIUS, 10);
    expect(o.y).toBeCloseTo(0, 10);
  });
});
