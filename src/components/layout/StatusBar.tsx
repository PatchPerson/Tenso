import { Component, Show } from "solid-js";
import { activeTeam, teams } from "../../stores/collections";
import { activeEnvId, environments } from "../../stores/environments";
import { syncState } from "../../lib/sync";
import { authUser } from "../../lib/auth";

export const StatusBar: Component = () => {
  const currentTeam = () => teams().find(w => w.id === activeTeam());
  const currentEnv = () => environments().find(e => e.id === activeEnvId());

  const syncIcon = () => {
    switch (syncState()) {
      case "syncing": return "\u21BB"; // ↻
      case "synced": return "\u2713"; // ✓
      case "error": return "\u26A0"; // ⚠
      default: return "\u25CB"; // ○
    }
  };

  const syncClass = () => `sync-indicator sync-${syncState()}`;

  return (
    <div class="status-bar">
      <div class="status-left">
        <span class="status-item">
          <Show when={currentTeam()} fallback="No team">
            {currentTeam()!.name}
          </Show>
        </span>
      </div>
      <div class="status-right">
        <Show when={authUser()}>
          <span class={syncClass()} title={`Sync: ${syncState()}`}>
            {syncIcon()}
          </span>
          <Show when={authUser()?.image}>
            <img
              class="status-avatar"
              src={authUser()!.image!}
              alt={authUser()!.name || "User"}
              width="16"
              height="16"
            />
          </Show>
        </Show>
        <Show when={currentEnv()}>
          <span class="status-item env-badge">{currentEnv()!.name}</span>
        </Show>
        <span class="status-item">ReqLite v0.1.0</span>
      </div>
    </div>
  );
};
