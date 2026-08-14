/**
 * The one and only window size, CSS px. The window never resizes: opening used
 * to grow it 96 -> 360, which moved the window's top-left and forced the webview
 * to re-lay out the centred bubble, and that repaint could not be synchronised
 * with the OS move — so opening flashed. Mirrors `WINDOW` in
 * src-tauri/src/bubble.rs and width/height in tauri.conf.json.
 */
export const WINDOW_SIZE = 600;

/**
 * The bubble's own visual footprint: the 64px disc plus room for the hover ring
 * and press scale. Much smaller than the window, and it is this box — not the
 * window — that edge snapping and clamping use, or the bubble could never reach
 * a screen edge. Mirrors `BUBBLE_BOX` in src-tauri/src/bubble.rs.
 */
export const BUBBLE_BOX = 96;

/** The visible disc. */
export const BUBBLE_SIZE = 64;

/** Distance from the bubble centre to the centre of each arc item. */
export const ARC_RADIUS = 110;

/** Past this many CSS px of pointer travel, a press becomes a drag. */
export const DRAG_THRESHOLD = 5;

/** The visible disc of one arc item. */
export const ARC_ITEM_SIZE = 40;

/**
 * How far along its own radius an item sits before it flies out — it starts
 * tucked under the bubble, not at the bubble's exact centre, so the travel
 * reads as "emerging from underneath" rather than "spawning from a point".
 */
export const ARC_ITEM_START = 0.28;

/**
 * Menu timing, in ms. Declared here rather than in CSS because the close path
 * has to keep the items mounted until the exit animation has finished, so JS
 * needs the same numbers the transitions use. They are pushed into CSS custom
 * properties, so this stays the only source.
 */
export const MENU_IN_MS = 220;
export const MENU_OUT_MS = 160;
export const MENU_STAGGER_IN_MS = 30;
export const MENU_STAGGER_OUT_MS = 20;

/** Reduced motion: a plain fade, no travel and no stagger. */
export const MENU_REDUCED_MS = 120;

/**
 * Tool panel geometry, CSS px. The window has to contain the panel wherever it
 * lands: the worst case is `BUBBLE_SIZE/2 + PANEL_GAP + PANEL_WIDTH` sideways,
 * which must stay under `WINDOW_SIZE / 2`.
 */
export const PANEL_WIDTH = 240;
export const PANEL_HEIGHT = 340;
/** Clear air between the bubble's edge and the panel. */
export const PANEL_GAP = 16;
/** Closest the panel may come to the edge of the work area. */
export const PANEL_MARGIN = 8;

export const PANEL_IN_MS = 200;
export const PANEL_OUT_MS = 140;
export const PANEL_REDUCED_MS = 120;

/**
 * Wait before the silent startup update check. Long enough that it never
 * competes with the window placing itself and the tray icon going up, short
 * enough that the check has already resolved before anyone thinks to look.
 */
export const UPDATE_CHECK_DELAY_MS = 3000;

/** Card geometry — a small announcement, not a tool panel. */
export const UPDATE_CARD_WIDTH = 220;
export const UPDATE_CARD_HEIGHT = 76;

/** Same curves and timing as a tool panel, so it reads as the same object. */
export const UPDATE_CARD_IN_MS = PANEL_IN_MS;
export const UPDATE_CARD_OUT_MS = PANEL_OUT_MS;
export const UPDATE_CARD_REDUCED_MS = PANEL_REDUCED_MS;

/** How long "Updating to x.y.z" is on screen before install() is called. */
export const UPDATE_RESTART_HOLD_MS = 2000;

/** How long "Updated to x.y.z" stays up after relaunch before it dismisses itself. */
export const UPDATE_JUST_UPDATED_MS = 4000;
