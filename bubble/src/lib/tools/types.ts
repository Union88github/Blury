import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { Env } from "../ipc";

/**
 * What a tool is handed when it runs.
 *
 * Deliberately small. Anything a tool can reach here is something every tool
 * can reach, so keep it to what is genuinely shared — where the bubble is, and
 * the two things a tool might want to do to the UI around it.
 */
export type ToolContext = {
  /** Bubble centre, work area and scale at the moment the tool was picked. */
  env: Env;
  /** Show this tool's `panel`. Does nothing for a tool that has none. */
  openPanel: () => void;
  /** Close whatever this tool opened. */
  closePanel: () => void;
};

/**
 * A tool is a self-contained module. The registry in `index.ts` is the only
 * place they are listed, and registry order is arc order.
 *
 * The rule that makes this worth having: **nothing about a specific tool may
 * leak into the bubble or menu components.** They see `id`, `label` and `icon`
 * and nothing else, which is what lets a tool be added later without touching
 * the core. Don't shortcut it because v1 only has two.
 */
export interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  run(ctx: ToolContext): void | Promise<void>;
  /** Rendered next to the bubble when the tool calls `openPanel`. */
  panel?: ComponentType<{ onClose: () => void }>;
}
