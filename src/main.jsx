import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { CopilotLogProvider } from "./context/CopilotTranscriptLog";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CopilotLogProvider>
      <App />
    </CopilotLogProvider>
  </React.StrictMode>
);

// Register service worker for offline capability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
