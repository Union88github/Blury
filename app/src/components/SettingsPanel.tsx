import { useEffect, useRef, useState } from "react";

import { getSettings, saveSettings } from "../lib/ipc";

type Status = { kind: "idle" | "saving" | "saved" | "error"; message?: string };

/**
 * Settings, in the same panel slot the tools use.
 *
 * Not a tool: v1's arc has exactly two items and this is not one of them. It is
 * reached from the tray, which emits `bubble://settings`.
 *
 * Changes apply on save rather than on every keystroke, because saving means
 * re-registering a global shortcut with the OS — something that can fail, and
 * that should not be attempted against half-typed input.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [hotkey, setHotkey] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  /** What is actually persisted, so we can tell whether anything changed. */
  const saved = useRef({ hotkey: "", autostart: false });
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => {
        if (!alive) return;
        setHotkey(s.hotkey);
        setAutostart(s.autostart);
        saved.current = { hotkey: s.hotkey, autostart: s.autostart };
        setReady(true);
      })
      .catch((err) => {
        console.error("bubble: could not load settings", err);
        setStatus({ kind: "error", message: "Could not load settings" });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ready) field.current?.focus();
  }, [ready]);

  const dirty =
    ready &&
    (hotkey.trim() !== saved.current.hotkey || autostart !== saved.current.autostart);

  const commit = async () => {
    const next = hotkey.trim();
    if (!next) {
      setStatus({ kind: "error", message: "Shortcut cannot be empty" });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const applied = await saveSettings(next, autostart);
      saved.current = { hotkey: applied.hotkey, autostart: applied.autostart };
      setHotkey(applied.hotkey);
      setAutostart(applied.autostart);
      setStatus({ kind: "saved" });
    } catch (err) {
      // The backend keeps the old hotkey bound when the new one is refused, so
      // say what happened rather than pretending it took.
      setStatus({ kind: "error", message: String(err) });
    }
  };

  return (
    <div className="settings">
      <header className="settings__bar">
        <span className="settings__title">Settings</span>
        <button
          type="button"
          className="settings__close"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </header>

      <div className="settings__body">
        <label className="settings__field">
          <span className="settings__label">Summon shortcut</span>
          <input
            ref={field}
            type="text"
            className="settings__input"
            value={hotkey}
            disabled={!ready}
            spellCheck={false}
            placeholder="Ctrl+Shift+Space"
            onChange={(e) => {
              setHotkey(e.target.value);
              setStatus({ kind: "idle" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) void commit();
            }}
          />
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={autostart}
            disabled={!ready}
            onChange={(e) => {
              setAutostart(e.target.checked);
              setStatus({ kind: "idle" });
            }}
          />
          <span>Start with Windows</span>
        </label>
      </div>

      <footer className="settings__foot">
        <p className="settings__status" data-kind={status.kind} role="status">
          {status.kind === "saving" && "Saving…"}
          {status.kind === "saved" && "Saved"}
          {status.kind === "error" && status.message}
        </p>
        <button
          type="button"
          className="settings__save"
          disabled={!dirty || status.kind === "saving"}
          onClick={() => void commit()}
        >
          Save
        </button>
      </footer>
    </div>
  );
}
