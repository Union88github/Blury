import { invoke } from "@tauri-apps/api/core";

import type { Point, Rect } from "./geometry";

/** Physical pixels on the virtual desktop, unless a name says otherwise. */
export type { Point, Rect };

export type Env = {
  center: Point;
  workArea: Rect;
  scaleFactor: number;
  /** The whole window is accepting clicks, because something is open in it. */
  interactive: boolean;
};

/** The monitor under some arbitrary point, which may not be the bubble's. */
export type AreaInfo = {
  workArea: Rect;
  scaleFactor: number;
};

export type Settings = {
  position: Point | null;
  hotkey: string;
  autostart: boolean;
  /** Unused in v1. */
  license: string | null;
};

/** Position and reveal the window. Call once, after the first paint. */
export const bubbleReady = () => invoke<Env>("bubble_ready");

export const bubbleEnv = () => invoke<Env>("bubble_env");
export const cursorPos = () => invoke<Point>("cursor_pos");

/** Latch the cursor-to-centre offset in Rust so no frame can race it. */
export const startDrag = () => invoke<Env>("start_drag");
export const dragTick = () => invoke<Env>("drag_tick");

export const setCenter = (x: number, y: number) =>
  invoke<void>("set_center", { x, y });

/**
 * Report that something is open in the window — the arc, a tool panel. Does not
 * touch window geometry: the window is a fixed size. It only widens hit-testing
 * to the whole window, so the empty area around whatever is open can catch the
 * click-outside that dismisses it.
 */
export const setInteractive = (interactive: boolean) =>
  invoke<Env>("set_interactive", { interactive });

export const getNotes = () => invoke<string>("get_notes");

/** One monitor's frozen frame: its physical rect and the scale to convert by. */
export type ShotInfo = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
};

/** Freeze every screen and raise an overlay over each. */
export const beginCapture = () => invoke<ShotInfo[]>("begin_capture");

/** An overlay has mounted: position it over its monitor, still hidden. */
export const overlayReady = (index: number) =>
  invoke<ShotInfo>("overlay_ready", { index });

/** Reveal it, once its frozen frame has actually been decoded. */
export const overlayShow = (index: number) =>
  invoke<void>("overlay_show", { index });

/**
 * Raw RGBA pixels of one monitor's frozen frame — dimensions come from the
 * `ShotInfo`. Uncompressed on purpose: it goes straight into a canvas in this
 * same process, and PNG-encoding a full screen only to decode it again is slow
 * enough in a debug build to look like a hang.
 */
export const captureFrame = (index: number) =>
  invoke<ArrayBuffer>("capture_frame", { index });

/** Crop, save and copy. The rect is physical px relative to that monitor. */
export const finishCapture = (
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
) => invoke<string>("finish_capture", { index, x, y, width, height });

export const cancelCapture = () => invoke<void>("cancel_capture");

/**
 * Write into the backend's capture trace. The overlay is a second webview with
 * no reachable console, so this is the only way to see what its half of a
 * capture actually did.
 */
export const captureLog = (message: string) => {
  void invoke<void>("capture_log", { message }).catch(() => {
    /* tracing must never be the thing that breaks a capture */
  });
};

/** Debounce before calling: this writes the file every time. */
export const saveNotes = (text: string) => invoke<void>("save_notes", { text });

/** The monitor under a point — the bubble may be flicked onto another screen. */
export const workAreaAt = (x: number, y: number) =>
  invoke<AreaInfo>("work_area_at", { x, y });

export const getSettings = () => invoke<Settings>("get_settings");

/**
 * Apply and persist a settings change. Rejects with a message when the hotkey
 * can't be registered — another app may already own it — and the previous
 * hotkey stays bound in that case.
 *
 * Position is deliberately not passed: it belongs to the drag, which writes it
 * on settle, and round-tripping it here would let a stale value win.
 */
export const saveSettings = (hotkey: string, autostart: boolean) =>
  invoke<Settings>("save_settings", { hotkey, autostart });

/** Written when the bubble settles, not while it moves. */
export const savePosition = (x: number, y: number) =>
  invoke<void>("save_position", { x, y });

/**
 * Label prefix for capture overlay windows. Mirrors `overlay_label` in
 * src-tauri/src/capture.rs — the frontend routes on it to decide which UI to
 * render, so the two must agree exactly.
 */
export const CAPTURE_LABEL_PREFIX = "capture-";

/** Events emitted by the backend. */
export const SUMMON_EVENT = "bubble://summon";
export const SETTINGS_EVENT = "bubble://settings";

/** Physical px -> CSS px on the monitor the bubble is currently on. */
export const toLogical = (v: number, scale: number) => v / scale;

export const rectToLogical = (r: Rect, scale: number): Rect => ({
  x: r.x / scale,
  y: r.y / scale,
  width: r.width / scale,
  height: r.height / scale,
});
