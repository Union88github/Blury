import { describe, expect, it } from "vitest";

import type { ReleaseContext } from "./bubbleDriver";
import { BUBBLE_BOX } from "./constants";
import type { Point } from "./geometry";
import { project } from "./physics";
import { snapToEdge } from "./placement";

const AREA = {
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
};
const HALF = BUBBLE_BOX / 2; // 48
const MIN_X = HALF;
const MAX_X = 1920 - HALF;
const MIN_Y = HALF;
const MAX_Y = 1040 - HALF;

/** Release from `current` with `velocity`, exactly as the driver would. */
const release = (current: Point, velocity: Point = { x: 0, y: 0 }) => {
  const ctx: ReleaseContext = {
    current,
    velocity,
    projected: {
      x: current.x + project(velocity.x),
      y: current.y + project(velocity.y),
    },
    area: AREA,
  };
  return snapToEdge(ctx);
};

describe("edge choice", () => {
  it("snaps to the right edge from the right half", () => {
    expect(release({ x: 1500, y: 520 }).target).toEqual({ x: MAX_X, y: 520 });
  });

  it("snaps to the left edge from the left half", () => {
    expect(release({ x: 300, y: 520 }).target).toEqual({ x: MIN_X, y: 520 });
  });

  it("snaps to the top when nearer the top than either side", () => {
    expect(release({ x: 960, y: 100 }).target).toEqual({ x: 960, y: MIN_Y });
  });

  it("snaps to the bottom when nearer the bottom than either side", () => {
    expect(release({ x: 960, y: 950 }).target).toEqual({ x: 960, y: MAX_Y });
  });

  it("keeps the free axis where it was released", () => {
    // y kept mid-band: nearer the right edge than the top or bottom, so the
    // snap is horizontal and the vertical position is left alone.
    expect(release({ x: 1500, y: 600 }).target.y).toBe(600);
  });
});

describe("momentum decides the edge, not the release point", () => {
  it("throws across the screen to the far edge", () => {
    // Sitting on the right, flicked hard to the left.
    const plan = release({ x: 1800, y: 520 }, { x: -4000, y: 0 });
    expect(plan.target.x).toBe(MIN_X);
  });

  it("stays on the near edge without momentum", () => {
    expect(release({ x: 1800, y: 520 }).target.x).toBe(MAX_X);
  });

  it("carries the free axis along with the throw", () => {
    const plan = release({ x: 1800, y: 520 }, { x: -4000, y: 400 });
    expect(plan.target.x).toBe(MIN_X);
    expect(plan.target.y).toBeGreaterThan(520);
  });
});

describe("overshoot", () => {
  it("never bounces on the axis meeting the edge", () => {
    expect(release({ x: 1500, y: 520 }).bounce?.x).toBe(0);
    expect(release({ x: 960, y: 100 }).bounce?.y).toBe(0);
  });

  it("allows bounce on a free axis that stopped on its own", () => {
    expect(release({ x: 1500, y: 520 }).bounce?.y).toBeGreaterThan(0);
  });

  it("does not bounce a free axis that was clamped into a wall", () => {
    // Flicked hard downward: y clamps to the bottom, so it must not overshoot.
    const plan = release({ x: 1500, y: 520 }, { x: 0, y: 6000 });
    expect(plan.target.y).toBe(MAX_Y);
    expect(plan.bounce?.y).toBe(0);
  });
});

describe("the bubble always lands fully on screen", () => {
  it("stays inside the work area from anywhere, at any velocity", () => {
    const failures: string[] = [];
    for (let x = MIN_X; x <= MAX_X; x += 53) {
      for (let y = MIN_Y; y <= MAX_Y; y += 53) {
        for (const v of [
          { x: 0, y: 0 },
          { x: 5000, y: 0 },
          { x: -5000, y: 0 },
          { x: 0, y: 5000 },
          { x: 0, y: -5000 },
          { x: 3000, y: 3000 },
        ]) {
          const { target } = release({ x, y }, v);
          if (
            target.x < MIN_X ||
            target.x > MAX_X ||
            target.y < MIN_Y ||
            target.y > MAX_Y
          ) {
            failures.push(`(${x},${y}) v=(${v.x},${v.y}) -> (${target.x},${target.y})`);
          }
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("respects a monitor that is not at the origin", () => {
    const secondary: ReleaseContext["area"] = {
      workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    };
    const plan = snapToEdge({
      current: { x: -200, y: 520 },
      velocity: { x: 0, y: 0 },
      projected: { x: -200, y: 520 },
      area: secondary,
    });
    expect(plan.target.x).toBe(-HALF);
  });

  it("accounts for display scaling", () => {
    const scaled: ReleaseContext["area"] = {
      workArea: { x: 0, y: 0, width: 2560, height: 1440 },
      scaleFactor: 2,
    };
    const plan = snapToEdge({
      current: { x: 2400, y: 700 },
      velocity: { x: 0, y: 0 },
      projected: { x: 2400, y: 700 },
      area: scaled,
    });
    // Half the window is 96 physical px at 2x, so the centre stops 96 short.
    expect(plan.target.x).toBe(2560 - 96);
  });
});
