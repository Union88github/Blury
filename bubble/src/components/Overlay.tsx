import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelCapture,
  captureFrame,
  captureLog,
  finishCapture,
  overlayReady,
  overlayShow,
  type ShotInfo,
} from "../lib/ipc";
import type { Point } from "../lib/geometry";
import { dragRect, selectionToPhysical } from "../lib/selection";

type Drag = { from: Point; to: Point };

/**
 * The capture overlay: one per monitor, covering it exactly.
 *
 * It shows the **already frozen** frame as an ordinary image and draws the
 * dimming and selection on top of it. Nothing drawn here can reach the saved
 * file, which is the point — dimming the live screen and capturing afterwards
 * is what bakes the dim into the result.
 */
export function Overlay({ index }: { index: number }) {
  const [info, setInfo] = useState<ShotInfo | null>(null);
  const [painted, setPainted] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  /** Latched so a second pointerup or a late Escape can't fire a second crop. */
  const done = useRef(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        captureLog(`overlay ${index}: mounted`);
        const shot = await overlayReady(index);
        if (!alive) return;
        setInfo(shot);
        captureLog(`overlay ${index}: ready ${shot.width}x${shot.height}`);

        const bytes = await captureFrame(index);
        if (!alive) return;
        captureLog(`overlay ${index}: got ${bytes.byteLength} bytes`);

        // Raw RGBA straight into the canvas backing store. The canvas is sized
        // in physical px and scaled by CSS, so the frame stays 1:1 with the
        // screen it came from whatever this monitor's DPI is.
        const el = canvas.current;
        if (!el) throw new Error("overlay canvas missing");
        el.width = shot.width;
        el.height = shot.height;
        const ctx = el.getContext("2d");
        if (!ctx) throw new Error("no 2d context for the capture overlay");
        ctx.putImageData(
          new ImageData(new Uint8ClampedArray(bytes), shot.width, shot.height),
          0,
          0,
        );

        setPainted(true);
        captureLog(`overlay ${index}: painted`);
        // Only now is there something to look at. Showing earlier puts an empty
        // fullscreen window over everything.
        await overlayShow(index);
        captureLog(`overlay ${index}: show returned`);
      } catch (err) {
        console.error("bubble: capture overlay failed to start", err);
        captureLog(`overlay ${index}: FAILED ${String(err)}`);
        void cancelCapture();
      }
    })();

    return () => {
      alive = false;
    };
  }, [index]);

  const cancel = useCallback(() => {
    if (done.current) return;
    done.current = true;
    void cancelCapture();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || done.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    setDrag({ from: p, to: p });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag({ from: drag.from, to: { x: e.clientX, y: e.clientY } });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !info || done.current) return;
    const current = { ...drag };
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const rect = selectionToPhysical(current.from, current.to, info.scaleFactor, info);
    // A click with no drag is how people dismiss this kind of overlay, so treat
    // a too-small selection as "never mind" rather than saving a 1px file.
    if (!rect) {
      cancel();
      return;
    }

    done.current = true;
    finishCapture(index, rect.x, rect.y, rect.width, rect.height).catch((err) => {
      console.error("bubble: could not save the capture", err);
      void cancelCapture();
    });
  };

  /**
   * Losing the pointer mid-drag abandons the *drag*, not the capture. A
   * spurious cancel should not throw away a frame the screen is already frozen
   * for; the user can simply drag again.
   */
  const abandonDrag = () => setDrag(null);

  const box = drag ? dragRect(drag.from, drag.to) : null;

  return (
    <div
      className="overlay"
      data-ready={painted}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={abandonDrag}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <canvas ref={canvas} className="overlay__frame" />

      {/* The dim is one enormous spread shadow cast *outward* from the
          selection, so the selected area is left perfectly untouched — no
          second copy of the frame to drift out of alignment with it. Collapsed
          to zero size before a drag, which makes the shadow cover everything
          and dims the whole screen. */}
      <div
        className="overlay__dim"
        style={
          box
            ? { left: box.x, top: box.y, width: box.width, height: box.height }
            : { left: 0, top: 0, width: 0, height: 0 }
        }
        data-selecting={box !== null}
      />

      {box && (
        <div
          className="overlay__size"
          style={{ left: box.x, top: box.y + box.height }}
        >
          {Math.round(box.width * (info?.scaleFactor ?? 1))} ×{" "}
          {Math.round(box.height * (info?.scaleFactor ?? 1))}
        </div>
      )}

      {!drag && painted && (
        <p className="overlay__hint">Drag to capture · Esc to cancel</p>
      )}
    </div>
  );
}
