import { Camera } from "lucide-react";

import { beginCapture } from "../ipc";
import type { Tool } from "./types";

/**
 * Region screenshot.
 *
 * Everything real happens in the backend and in the overlay windows it raises —
 * the tool itself is just the trigger. It has no panel: the UI for this tool is
 * a separate fullscreen window per monitor, not something anchored to the
 * bubble.
 */
export const screenshot: Tool = {
  id: "screenshot",
  label: "Screenshot",
  icon: Camera,
  run: async () => {
    await beginCapture();
  },
};
