import { Component, Show, For, createSignal } from "solid-js";
import { syncErrorLog, clearSyncErrorLog } from "../lib/sync";
import { isTelemetryEnabled, setTelemetryEnabled } from "../lib/telemetry";
import { ThemeSettings } from "./settings/ThemeSettings";
import { TeamSettings } from "./settings/TeamSettings";
import { TelemetrySettings } from "./settings/TelemetrySettings";

export const Settings: Component = () => {
  const [telemetryOn, setTelemetryOn] = createSignal(isTelemetryEnabled());

  return (
    <div class="settings-page">
      <div class="settings-header">
        <span class="sidebar-title">Settings</span>
      </div>

      <div class="settings-body">
        <TeamSettings />
        <ThemeSettings />

        {/* Sync Log section */}
        <Show when={syncErrorLog().length > 0}>
          <div class="settings-card">
            <div class="settings-card-header">
              <span class="settings-card-title">Sync Log</span>
              <button class="btn-sm" onClick={clearSyncErrorLog}>Clear</button>
            </div>
            <div class="sync-log-list">
              <For each={[...syncErrorLog()].reverse()}>
                {(entry) => (
                  <div class="sync-log-entry">
                    <span class="sync-log-time">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span class="sync-log-message">{entry.message}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Telemetry section — always visible */}
        <TelemetrySettings
          telemetryOn={telemetryOn}
          setTelemetryOn={setTelemetryOn}
          setTelemetryEnabled={setTelemetryEnabled}
        />
      </div>
    </div>
  );
};
