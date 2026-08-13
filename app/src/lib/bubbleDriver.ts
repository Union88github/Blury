import { animate, type AnimationPlaybackControls } from "motion";

import {
  bubbleEnv,
  bubbleReady,
  dragTick,
  savePosition,
  setCenter,
  startDrag,
  workAreaAt,
  type AreaInfo,
  type Env,
  type Point,
} from "./ipc";
import { project, VelocityTracker } from "./physics";

export type ReleaseContext = {
  /** Where momentum alone would carry the bubble. */
  projected: Point;
  current: Point;
  /** Physical px/s at the moment of release. */
  velocity: Point;
  /**
   * The monitor under the *projected* point, not the current one — a flick can
   * cross screens, and it has to land in the destination's terms.
   */
  area: AreaInfo;
};

export type ReleasePlan = {
  target: Point;
  /**
   * Per axis, because X and Y are independent springs. An axis landing against
   * a screen edge gets `0` — overshoot there would push the bubble off-screen
   * and pull it back, which reads as a bug, not as physics.
   */
  bounce?: Point;
  duration?: number;
};

export type ReleaseResolver = (ctx: ReleaseContext) => ReleasePlan;

/**
 * Owns the bubble's screen position and every animation that touches it.
 *
 * Deliberately outside React: position updates run at display rate and must
 * survive interruption mid-flight, neither of which wants a render pass.
 */
export class BubbleDriver {
  center: Point = { x: 0, y: 0 };
  env: Env | null = null;
  /** Fired whenever the work area or scale under the bubble changes. */
  onEnv: ((env: Env) => void) | null = null;

  private armed = false;
  private armPromise: Promise<void> | null = null;
  private dragging = false;
  private dragRaf = 0;
  private flushRaf = 0;
  private pending: Point | null = null;
  private springs: AnimationPlaybackControls[] = [];
  private tracker = new VelocityTracker();
  private tickErrors = 0;

  get isDragging() {
    return this.dragging;
  }

  /** Position and reveal the window. Once, on mount. */
  async ready(): Promise<Env> {
    return this.adopt(await bubbleReady());
  }

  async sync(): Promise<Env> {
    return this.adopt(await bubbleEnv());
  }

  /** Take on an env produced by a command this driver didn't issue. */
  absorb(env: Env): Env {
    return this.adopt(env);
  }

  /**
   * Come to rest: re-read the environment and remember where we ended up.
   * Persisting here rather than per frame keeps a drag from writing the config
   * file a hundred times a second.
   */
  private async settled(): Promise<void> {
    try {
      const env = await this.sync();
      await savePosition(env.center.x, env.center.y);
    } catch (err) {
      console.error("bubble: could not save position", err);
    }
  }

  private adopt(env: Env): Env {
    this.env = env;
    this.center = env.center;
    this.onEnv?.(env);
    return env;
  }

  /**
   * Pointer went down. Latch the grab offset *now*, before the drag threshold
   * is crossed — the user grabbed the bubble at this instant, and measuring the
   * offset a few pixels later would make it slide under the cursor.
   *
   * Any in-flight animation is dropped where it stands rather than allowed to
   * finish: a moving object you grab must follow the cursor from its current
   * position, not from where it was headed.
   */
  arm(): void {
    this.stopSprings();
    this.tracker.reset();
    this.armed = true;
    this.armPromise = startDrag().then((env) => {
      if (this.armed) this.adopt(env);
    });
  }

  /** Threshold crossed — this is a drag, not a click. */
  async beginDrag(): Promise<void> {
    if (!this.armed || this.dragging) return;
    this.dragging = true;
    // The latch is one round-trip out; ticking before it lands would read a
    // stale offset.
    await this.armPromise;
    if (!this.dragging) return;
    this.tracker.push(this.center.x, this.center.y);
    this.tick();
  }

  /** Pointer went up without ever becoming a drag. */
  disarm(): void {
    this.armed = false;
  }

  private tick() {
    this.dragRaf = requestAnimationFrame(async () => {
      if (!this.dragging) return;
      try {
        const env = await dragTick();
        if (!this.dragging) return;
        this.adopt(env);
        this.tracker.push(env.center.x, env.center.y);
        this.tickErrors = 0;
      } catch (err) {
        // A dropped frame is not worth tearing down the gesture for — but a
        // silent catch here once hid a backend failure through an entire drag,
        // so say something the first time and then stop shouting.
        if (this.tickErrors++ === 0) {
          console.error("bubble: drag_tick failed", err);
        }
      }
      if (this.dragging) this.tick();
    });
  }

  async release(resolve: ReleaseResolver, reduceMotion = false): Promise<void> {
    if (!this.dragging) return;
    this.dragging = false;
    this.armed = false;
    cancelAnimationFrame(this.dragRaf);

    const velocity = this.tracker.velocity();
    const projected = {
      x: this.center.x + project(velocity.x),
      y: this.center.y + project(velocity.y),
    };

    const fallback: AreaInfo = this.env
      ? { workArea: this.env.workArea, scaleFactor: this.env.scaleFactor }
      : { workArea: (await bubbleEnv()).workArea, scaleFactor: 1 };
    const area = await workAreaAt(projected.x, projected.y).catch(() => fallback);

    const plan = resolve({ projected, current: this.center, velocity, area });

    if (reduceMotion) {
      this.center = plan.target;
      await setCenter(plan.target.x, plan.target.y);
      void this.settled();
      return;
    }
    this.springTo(plan, velocity);
  }

  /** Move under our own steam — hotkey summon, restoring a saved position. */
  moveTo(target: Point, opts: { animate?: boolean; bounce?: number } = {}) {
    this.stopSprings();
    if (opts.animate === false) {
      this.center = target;
      void setCenter(target.x, target.y);
      void this.settled();
      return;
    }
    this.springTo(
      { target, bounce: { x: opts.bounce ?? 0, y: opts.bounce ?? 0 }, duration: 0.4 },
      { x: 0, y: 0 },
    );
  }

  /**
   * X and Y as two independent springs. A single spring over 2D distance
   * desyncs the moment the axes carry different velocities.
   */
  private springTo(plan: ReleasePlan, velocity: Point) {
    this.stopSprings();

    const from = this.center;
    const live = { ...from };
    const duration = plan.duration ?? 0.5;

    const axis = (key: "x" | "y") =>
      animate(from[key], plan.target[key], {
        type: "spring",
        duration,
        bounce: plan.bounce?.[key] ?? 0,
        // Hand off the finger's exact speed so there is no seam between the
        // drag and the animation that follows it.
        velocity: velocity[key],
        onUpdate: (value: number) => {
          live[key] = value;
          this.queue({ ...live });
        },
      });

    this.springs = [axis("x"), axis("y")];
    const settling = this.springs;
    Promise.all(settling.map((s) => s.finished))
      .then(() => {
        if (this.springs === settling) {
          this.springs = [];
          void this.settled();
        }
      })
      .catch(() => {
        /* stopped mid-flight; the interrupting gesture owns it now */
      });
  }

  /** Coalesce both axes into a single position write per frame. */
  private queue(p: Point) {
    this.pending = p;
    if (this.flushRaf) return;
    this.flushRaf = requestAnimationFrame(() => {
      this.flushRaf = 0;
      const next = this.pending;
      this.pending = null;
      if (!next) return;
      this.center = next;
      void setCenter(next.x, next.y);
    });
  }

  private stopSprings() {
    for (const s of this.springs) s.stop();
    this.springs = [];
  }

  destroy() {
    this.dragging = false;
    cancelAnimationFrame(this.dragRaf);
    cancelAnimationFrame(this.flushRaf);
    this.flushRaf = 0;
    this.stopSprings();
  }
}
