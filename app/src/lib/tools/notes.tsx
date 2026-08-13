import { StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getNotes, saveNotes } from "../ipc";
import type { Tool } from "./types";

/** Idle time after the last keystroke before the buffer is written. */
const AUTOSAVE_MS = 600;

function NotesPanel({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);

  const area = useRef<HTMLTextAreaElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** The latest text, for the flush on unmount, which can't read state. */
  const latest = useRef("");
  /** Nothing to flush until the user has actually changed something. */
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    getNotes()
      .then((saved) => {
        if (!alive) return;
        setText(saved);
        latest.current = saved;
        setReady(true);
      })
      .catch((err) => {
        // An unreadable file must not present as an empty note the user then
        // overwrites, so stay disabled rather than inviting typing.
        console.error("bubble: could not load notes", err);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Flush on unmount. Closing the panel is the most likely moment for the last
  // keystroke to still be inside the debounce window.
  useEffect(() => {
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      if (!dirty.current) return;
      saveNotes(latest.current).catch((err) => {
        console.error("bubble: could not save notes", err);
      });
    };
  }, []);

  useEffect(() => {
    if (ready) area.current?.focus();
  }, [ready]);

  const onChange = (value: string) => {
    setText(value);
    latest.current = value;
    dirty.current = true;
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      dirty.current = false;
      saveNotes(value).catch((err) => {
        dirty.current = true;
        console.error("bubble: could not save notes", err);
      });
    }, AUTOSAVE_MS);
  };

  return (
    <div className="notes">
      <header className="notes__bar">
        <span className="notes__title">Notes</span>
        <button
          type="button"
          className="notes__close"
          onClick={onClose}
          aria-label="Close notes"
        >
          ×
        </button>
      </header>
      <textarea
        ref={area}
        className="notes__text"
        value={text}
        disabled={!ready}
        spellCheck={false}
        placeholder={ready ? "" : "Loading…"}
        aria-label="Notes"
        onChange={(e) => onChange(e.target.value)}
        // Escape belongs to the panel, but the textarea would otherwise be the
        // first to see it and do nothing.
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

export const notes: Tool = {
  id: "notes",
  label: "Notes",
  icon: StickyNote,
  run: (ctx) => ctx.openPanel(),
  panel: NotesPanel,
};
