import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/error-boundary.tsx";
import "./index.css";
import App from "./App.tsx";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    {/* Last resort for a throw in the shell itself (e.g. the start bar),
        outside any per-widget boundary in window-manager.tsx. There's no
        window store to render a real Widget into here, so this is a plain
        message with a reload button instead. */}
    <ErrorBoundary
      label="App"
      fallback={(error) => (
        <div className="window" style={{ margin: "2rem", maxWidth: 420 }}>
          <div className="title-bar">
            <div className="title-bar-text">w98tools crashed</div>
          </div>
          <div className="window-body">
            <p>Something went wrong and the app couldn&apos;t continue.</p>
            <p>{error.message}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
