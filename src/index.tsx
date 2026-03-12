import { render } from "solid-js/web";
import { ErrorBoundary } from "solid-js";
import { initTelemetry, withSentryErrorBoundary } from "./lib/telemetry";
import "./styles.css";
import App from "./App";

// Initialize Sentry before anything renders
initTelemetry();

const SentryErrorBoundary = withSentryErrorBoundary(ErrorBoundary);

render(
  () => (
    <SentryErrorBoundary
      fallback={(err) => (
        <div style={{ padding: "2rem", color: "#e0e0e0", "font-family": "system-ui" }}>
          <h2>Something went wrong</h2>
          <p>{err?.message || "Unknown error"}</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
    >
      <App />
    </SentryErrorBoundary>
  ),
  document.getElementById("root")!,
);
