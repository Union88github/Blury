import { notes } from "./notes";
import { screenshot } from "./screenshot";
import type { Tool } from "./types";

export type { Tool, ToolContext } from "./types";

/**
 * The tool registry. **Order here is arc order** — the first entry is the first
 * item on the fan, nearest the inward normal.
 *
 * Adding a tool should mean adding a module and one line here, and touching
 * nothing else. If a change ever requires editing the bubble or the menu, the
 * boundary has been broken somewhere.
 */
export const TOOLS: Tool[] = [screenshot, notes];
