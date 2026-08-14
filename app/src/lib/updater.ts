import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

import { UPDATE_JUST_UPDATED_MS, UPDATE_RESTART_HOLD_MS } from "./constants";
import { markUpdatePending, takePendingUpdate } from "./ipc";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "restarting"
  | "justUpdated"
  | "error";

export type UpdaterSnapshot = {
  version: string;
  status: UpdaterStatus;
  /** 0..1. Only meaningful while `status === "downloading"`. */
  progress: number;
  /** The version being downloaded, installed, or just installed. */
  toVersion: string | null;
  error: string | null;
};

type Listener = () => void;

/**
 * Lives outside React, like `BubbleDriver` — the progress ring, the update
 * card, and the settings panel's manual check all need the same in-flight
 * state, and none of them owns the others.
 */
let snapshot: UpdaterSnapshot = {
  version: "",
  status: "idle",
  progress: 0,
  toVersion: null,
  error: null,
};
const listeners = new Set<Listener>();

function setSnapshot(next: Partial<UpdaterSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return snapshot;
}

export async function loadVersion() {
  try {
    const version = await getVersion();
    setSnapshot({ version });
  } catch (err) {
    console.error("mote: could not read app version", err);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reads the flag `markUpdatePending` wrote right before the last install, and
 * clears it in the same read — so it surfaces exactly once, on the boot that
 * follows an update, and never again on an ordinary launch.
 */
export async function checkJustUpdated() {
  let pending;
  try {
    pending = await takePendingUpdate();
  } catch (err) {
    console.error("mote: could not read pending-update flag", err);
    return;
  }
  if (!pending) return;
  setSnapshot({ status: "justUpdated", toVersion: pending.toVersion });
  await sleep(UPDATE_JUST_UPDATED_MS);
  // Something else may have started a fresh check in the meantime — only
  // clear our own announcement.
  if (snapshot.status === "justUpdated") setSnapshot({ status: "idle", toVersion: null });
}

/** Guards the one automatic check per launch against React's dev double-effect. */
let startupCheckStarted = false;

export function runStartupCheck() {
  if (startupCheckStarted) return;
  startupCheckStarted = true;
  void runUpdateCheck({ silent: true });
}

/**
 * Check, and if found, download with real progress, announce it, install, and
 * relaunch — one continuous action with no click in between. `silent`
 * controls only how failures are handled:
 *
 * - A background check has nothing to show an error in — an always-on-top
 *   overlay with no chrome — so any failure, at any stage, is abandoned
 *   without a trace. The next launch tries again; nothing here retries
 *   within the same session, on purpose, since a bad connection is assumed
 *   to be ordinary rather than exceptional.
 * - A check the user asked for from settings gets to say so.
 */
export async function runUpdateCheck(options: { silent: boolean }) {
  if (
    snapshot.status === "checking" ||
    snapshot.status === "downloading" ||
    snapshot.status === "restarting"
  ) {
    return;
  }

  setSnapshot({ status: "checking", error: null });
  try {
    const update = await check();
    if (!update) {
      setSnapshot({ status: "idle", toVersion: null });
      return;
    }
    await downloadAndInstall(update, options);
  } catch (err) {
    if (options.silent) {
      setSnapshot({ status: "idle", progress: 0 });
      return;
    }
    setSnapshot({ status: "error", error: String(err) });
  }
}

async function downloadAndInstall(update: Update, options: { silent: boolean }) {
  setSnapshot({ status: "downloading", progress: 0, toVersion: update.version, error: null });

  let contentLength = 0;
  let downloaded = 0;
  const onEvent = (event: DownloadEvent) => {
    if (event.event === "Started") {
      contentLength = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      setSnapshot({
        progress: contentLength > 0 ? Math.min(downloaded / contentLength, 1) : snapshot.progress,
      });
    } else if (event.event === "Finished") {
      setSnapshot({ progress: 1 });
    }
  };

  try {
    await update.download(onEvent);
  } catch (err) {
    if (options.silent) {
      setSnapshot({ status: "idle", progress: 0, toVersion: null });
      return;
    }
    setSnapshot({ status: "error", error: String(err) });
    return;
  }

  // The card announces the restart, so the flag has to be on disk before the
  // hold ends and install() has a chance to replace the process.
  setSnapshot({ status: "restarting" });
  try {
    await markUpdatePending(update.version);
  } catch (err) {
    // Not fatal to the update itself — worst case the next boot doesn't show
    // the "Updated to" card, which is cosmetic, not correctness.
    console.error("mote: could not persist the pending-update flag", err);
  }

  await sleep(UPDATE_RESTART_HOLD_MS);

  try {
    await update.install();
    await relaunch();
  } catch (err) {
    if (options.silent) {
      setSnapshot({ status: "idle", progress: 0, toVersion: null });
      return;
    }
    setSnapshot({ status: "error", error: String(err) });
  }
}
