import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Bubble } from "./components/Bubble";
import { Menu } from "./components/Menu";
import { Panel } from "./components/Panel";
import { SettingsPanel } from "./components/SettingsPanel";
import { BubbleDriver } from "./lib/bubbleDriver";
import { SETTINGS_EVENT, SUMMON_EVENT, type Env } from "./lib/ipc";
import { TOOLS, type Tool } from "./lib/tools";
import { useInteractive } from "./hooks/useInteractive";
import { useMenu } from "./hooks/useMenu";
import { usePanel } from "./hooks/usePanel";
import { useReducedMotion } from "./hooks/useReducedMotion";

export default function App() {
  const driverRef = useRef<BubbleDriver | null>(null);
  if (!driverRef.current) driverRef.current = new BubbleDriver();
  const driver = driverRef.current;
  const reduceMotion = useReducedMotion();

  const menu = useMenu(driver, reduceMotion, TOOLS.length);
  const panel = usePanel(reduceMotion);
  const { close: closeMenu } = menu;
  const { close: closePanel } = panel;

  // One reporter for the whole app: the arc and a panel can both be up, and two
  // reporters would race to switch hit-testing off.
  useInteractive(menu.mounted || panel.source !== null);

  useEffect(() => {
    driver.ready().catch((err) => {
      console.error("bubble: failed to place window", err);
    });
    return () => driver.destroy();
  }, [driver]);

  const dismissAll = useCallback(() => {
    closePanel();
    closeMenu();
  }, [closePanel, closeMenu]);

  useEffect(() => {
    // The hotkey fired. The backend has already revealed the bubble if it was
    // hidden; when it was already on screen we spring it across so it reads as
    // the object travelling rather than teleporting.
    const pending = listen<Env>(SUMMON_EVENT, ({ payload }) => {
      dismissAll();
      driver.moveTo(payload.center, { animate: !reduceMotion });
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [driver, reduceMotion, dismissAll]);

  // Clicking another application never reaches us, so losing focus is the only
  // evidence of a click outside our own rectangle.
  // Settings comes from the tray, not the arc — it is not a tool. The bubble
  // may be hidden when it fires, so re-read the environment rather than trusting
  // whatever the driver last saw.
  const { show: showPanel } = panel;
  useEffect(() => {
    const pending = listen(SETTINGS_EVENT, () => {
      closeMenu();
      driver
        .sync()
        .then((env) => showPanel({ id: "settings", body: SettingsPanel }, env))
        .catch((err) => console.error("bubble: could not open settings", err));
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [driver, closeMenu, showPanel]);

  const { dismissOnBlur } = menu;
  const watchingBlur = menu.mounted || panel.source !== null;
  useEffect(() => {
    if (!watchingBlur) return;
    const pending = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) return;
      closePanel();
      dismissOnBlur();
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [watchingBlur, closePanel, dismissOnBlur]);

  const onSelect = useCallback(
    (tool: Tool) => {
      const env = menu.env ?? driver.env;
      closeMenu();
      if (!env) {
        console.error("bubble: no environment to run a tool against");
        return;
      }
      // The tool decides what happens next; all this knows is how to hand it a
      // context and not swallow its failures.
      void (async () => {
        try {
          await tool.run({
            env,
            openPanel: () => {
              if (tool.panel) panel.show({ id: tool.id, body: tool.panel }, env);
            },
            closePanel,
          });
        } catch (err) {
          console.error(`bubble: tool ${tool.id} failed`, err);
        }
      })();
    },
    [menu.env, driver, closeMenu, panel, closePanel],
  );

  const PanelBody = panel.source?.body;

  return (
    <>
      {menu.mounted && menu.env && (
        <Menu
          items={TOOLS}
          env={menu.env}
          open={menu.open}
          reduceMotion={reduceMotion}
          onSelect={onSelect}
          onDismiss={closeMenu}
        />
      )}
      {PanelBody && panel.env && (
        <Panel
          body={PanelBody}
          env={panel.env}
          open={panel.open}
          reduceMotion={reduceMotion}
          onClose={closePanel}
        />
      )}
      <Bubble
        driver={driver}
        open={menu.open}
        onActivate={menu.toggle}
        onDragStart={dismissAll}
      />
    </>
  );
}
