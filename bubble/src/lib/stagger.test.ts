import { describe, expect, it } from "vitest";

import { staggerSteps, staggerSpan } from "./stagger";

describe("staggerSteps", () => {
  it("is empty for no items", () => {
    expect(staggerSteps(0)).toEqual([]);
    expect(staggerSteps(-1)).toEqual([]);
  });

  it("gives a single item no delay", () => {
    expect(staggerSteps(1)).toEqual([0]);
  });

  it("starts both innermost items together for an even count", () => {
    expect(staggerSteps(6)).toEqual([2, 1, 0, 0, 1, 2]);
    expect(staggerSteps(2)).toEqual([0, 0]);
  });

  it("starts from the single middle item for an odd count", () => {
    expect(staggerSteps(5)).toEqual([2, 1, 0, 1, 2]);
    expect(staggerSteps(3)).toEqual([1, 0, 1]);
  });

  it("is symmetric, so both rims arrive together", () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const steps = staggerSteps(count);
      expect(steps).toEqual([...steps].reverse());
    }
  });

  it("always starts at zero, so nothing waits before the first item", () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      expect(Math.min(...staggerSteps(count))).toBe(0);
    }
  });

  it("spans one step per item pair", () => {
    expect(staggerSpan(0)).toBe(0);
    expect(staggerSpan(1)).toBe(0);
    expect(staggerSpan(6)).toBe(2);
    expect(staggerSpan(5)).toBe(2);
  });
});
