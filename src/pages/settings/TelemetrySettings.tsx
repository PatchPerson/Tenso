import { Component, Accessor, Setter } from "solid-js";

interface Props {
  telemetryOn: Accessor<boolean>;
  setTelemetryOn: Setter<boolean>;
  setTelemetryEnabled: (enabled: boolean) => void;
}

export const TelemetrySettings: Component<Props> = (props) => (
  <div class="settings-card">
    <div class="settings-card-header">
      <span class="settings-card-title">Telemetry</span>
      <span class="settings-card-desc">Help improve Tenso by sending anonymous error reports</span>
    </div>
    <div class="settings-telemetry">
      <label class="settings-telemetry-toggle">
        <input
          type="checkbox"
          class="kv-checkbox"
          checked={props.telemetryOn()}
          onChange={(e) => {
            const enabled = e.currentTarget.checked;
            props.setTelemetryEnabled(enabled);
            props.setTelemetryOn(enabled);
          }}
        />
        <span class="kv-checkbox-custom" />
        <span>Send anonymous crash reports</span>
      </label>
      <p class="settings-telemetry-disclaimer">
        When enabled, Tenso sends error reports to Sentry to help diagnose bugs.
        No personal data, request contents, or usage analytics are collected.
        Changes take effect on next launch.
      </p>
    </div>
  </div>
);
