import * as Sentry from "@sentry/solid";

const STORAGE_KEY = "tenso-telemetry-enabled";

// --- Opt-out management ---

export function isTelemetryEnabled(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== "false"; // default: enabled (opt-out model)
}

export function setTelemetryEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  // Takes effect on next app launch — Sentry can't be torn down at runtime
}

// --- Initialization ---

export function initTelemetry() {
  if (!isTelemetryEnabled()) return;

  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN;
  if (!dsn) return; // no DSN in dev = no telemetry

  Sentry.init({
    dsn,
    release: `tenso@${__APP_VERSION__}`,
    environment: (import.meta as any).env?.MODE || "production",

    // Privacy: never send PII
    sendDefaultPii: false,

    // Disable features we don't need
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Extra safety: strip any user context before sending
    beforeSend(event) {
      delete event.user;
      return event;
    },
  });
}

// --- Error capture ---

export function captureError(error: unknown, context?: Record<string, string>) {
  if (!isTelemetryEnabled()) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export { withSentryErrorBoundary } from "@sentry/solid";
