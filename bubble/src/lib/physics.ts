import type { Point } from "./ipc";

/**
 * Apple's momentum projection from *Designing Fluid Interfaces* — exponential
 * decay, not the textbook `v²/2a`. Answers "where would this come to rest if I
 * let go now", which is what a release should aim at. Snapping to the nearest
 * target from the *release point* instead makes a flick feel like a nudge.
 */
export function project(velocity: number, deceleration = 0.998): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

const SAMPLE_WINDOW_MS = 90;

/**
 * Release velocity from a short position history. A single frame's delta is far
 * too noisy — a stutter on the last frame would read as "they stopped moving"
 * and kill the throw.
 */
export class VelocityTracker {
  private samples: { t: number; x: number; y: number }[] = [];

  reset() {
    this.samples.length = 0;
  }

  push(x: number, y: number, t = performance.now()) {
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > SAMPLE_WINDOW_MS) {
      this.samples.shift();
    }
  }

  /** Physical px per second. */
  velocity(): Point {
    if (this.samples.length < 2) return { x: 0, y: 0 };
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  }
}

export const clamp = (v: number, min: number, max: number) =>
  min > max ? (min + max) / 2 : Math.min(Math.max(v, min), max);
