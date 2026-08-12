import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

import { arcOffset, getArc, MAX_ARC_ITEMS } from "../lib/arc";
import {
  ARC_ITEM_SIZE,
  ARC_ITEM_START,
  MENU_IN_MS,
  MENU_OUT_MS,
  MENU_REDUCED_MS,
  MENU_STAGGER_IN_MS,
  MENU_STAGGER_OUT_MS,
} from "../lib/constants";
import { rectToLogical, type Env } from "../lib/ipc";
import { staggerSpan, staggerSteps } from "../lib/stagger";

/**
 * The least the menu needs to draw an item and report a click.
 *
 * Deliberately *not* the `Tool` type: the menu has no business knowing that an
 * item can `run()` or carry a panel. A `Tool` satisfies this structurally, so
 * the registry can be passed straight in without the menu importing it.
 */
export type MenuEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type Props<T extends MenuEntry> = {
  items: T[];
  env: Env;
  open: boolean;
  reduceMotion: boolean;
  onSelect: (item: T) => void;
  onDismiss: () => void;
};

/**
 * The arc of items around the bubble.
 *
 * Knows nothing about what an item does — it takes a label and an icon and
 * reports clicks. Placement comes entirely from `getArc`, so every edge and
 * corner case is settled by the tested geometry rather than here.
 */
export function Menu<T extends MenuEntry>({
  items,
  env,
  open,
  reduceMotion,
  onSelect,
  onDismiss,
}: Props<T>) {
  const shown = items.slice(0, MAX_ARC_ITEMS);

  // `getArc` works in CSS px; everything over the IPC boundary is physical.
  const scale = env.scaleFactor;
  const arc = getArc(
    { x: env.center.x / scale, y: env.center.y / scale },
    rectToLogical(env.workArea, scale),
    shown.length,
  );
  const steps = staggerSteps(shown.length);
  const span = staggerSpan(shown.length);

  const vars = {
    "--menu-in": `${reduceMotion ? MENU_REDUCED_MS : MENU_IN_MS}ms`,
    "--menu-out": `${reduceMotion ? MENU_REDUCED_MS : MENU_OUT_MS}ms`,
    "--arc-item-size": `${ARC_ITEM_SIZE}px`,
  } as CSSProperties;

  return (
    <div className="menu" data-open={open} style={vars}>
      {/* Clicks anywhere in the window that miss an item dismiss the menu. The
          window only covers its own 360px, so a click on another app is caught
          by the focus listener instead. */}
      <div
        className="menu__backdrop"
        onPointerDown={onDismiss}
        aria-hidden
      />

      <ul className="menu__items" role="menu" aria-label="Blury tools">
        {shown.map((item, i) => {
          const offset = arcOffset(arc[i].angleDeg);
          const Icon = item.icon;
          // Reversed on the way out: the outermost items leave first, so the
          // arc collapses back toward the bubble the way it came.
          const inStep = steps[i];
          const outStep = span - inStep;

          const style = {
            "--x": `${offset.x}px`,
            "--y": `${offset.y}px`,
            "--x0": `${offset.x * ARC_ITEM_START}px`,
            "--y0": `${offset.y * ARC_ITEM_START}px`,
            "--delay-in": reduceMotion ? "0ms" : `${inStep * MENU_STAGGER_IN_MS}ms`,
            "--delay-out": reduceMotion
              ? "0ms"
              : `${outStep * MENU_STAGGER_OUT_MS}ms`,
          } as CSSProperties;

          return (
            <li className="menu__item" key={item.id} style={style} role="none">
              <button
                type="button"
                className="menu__button"
                role="menuitem"
                aria-label={item.label}
                title={item.label}
                tabIndex={open ? 0 : -1}
                onClick={() => onSelect(item)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
