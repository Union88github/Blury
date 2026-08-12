import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

import App from "./App";
import { Overlay } from "./components/Overlay";
import { CAPTURE_LABEL_PREFIX } from "./lib/ipc";
import "./styles.css";

/**
 * Every window loads this same bundle; the label says which one it is.
 *
 * Routing on the label rather than a query string keeps the URL identical in
 * dev and production — a `?overlay=0` path has to survive both the Vite dev
 * server and the bundled asset protocol, and it does not do so reliably.
 */
const label = getCurrentWindow().label;
const capture = label.startsWith(CAPTURE_LABEL_PREFIX)
  ? Number(label.slice(CAPTURE_LABEL_PREFIX.length))
  : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {capture === null || Number.isNaN(capture) ? (
      <App />
    ) : (
      <Overlay index={capture} />
    )}
  </React.StrictMode>,
);
