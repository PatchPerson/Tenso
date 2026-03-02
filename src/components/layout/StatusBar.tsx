import { Component, Show } from "solid-js";
import { activeWorkspace, workspaces } from "../../stores/collections";
import { activeEnvId, environments } from "../../stores/environments";

export const StatusBar: Component = () => {
  const currentWorkspace = () => workspaces().find(w => w.id === activeWorkspace());
  const currentEnv = () => environments().find(e => e.id === activeEnvId());

  return (
    <div class="status-bar">
      <div class="status-left">
        <span class="status-item">
          <Show when={currentWorkspace()} fallback="No workspace">
            {currentWorkspace()!.name}
          </Show>
        </span>
      </div>
      <div class="status-right">
        <Show when={currentEnv()}>
          <span class="status-item env-badge">{currentEnv()!.name}</span>
        </Show>
        <span class="status-item">ReqLite v0.1.0</span>
      </div>
    </div>
  );
};
