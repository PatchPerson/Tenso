import { Component, For, Show, createSignal } from "solid-js";
import { environments, activeEnvId, addEnvironment, saveEnvironment, removeEnvironment, switchEnvironment, loadEnvironments } from "../../stores/environments";
import { activeWorkspace } from "../../stores/collections";
import { KeyValueGrid } from "../shared/KeyValueGrid";
import type { Environment, KeyValue } from "../../lib/api";

export const EnvManager: Component = () => {
  const [editingEnv, setEditingEnv] = createSignal<Environment | null>(null);
  const [newEnvName, setNewEnvName] = createSignal("");
  const [showCreate, setShowCreate] = createSignal(false);

  const handleCreate = async () => {
    const name = newEnvName().trim();
    const wsId = activeWorkspace();
    if (!name || !wsId) return;
    await addEnvironment(wsId, name);
    setNewEnvName("");
    setShowCreate(false);
  };

  const handleSave = async () => {
    const env = editingEnv();
    if (!env) return;
    await saveEnvironment(env);
    setEditingEnv(null);
  };

  return (
    <div class="env-manager">
      <div class="env-header">
        <h3>Environments</h3>
        <button class="btn-sm" onClick={() => setShowCreate(true)}>+ New</button>
      </div>

      <Show when={showCreate()}>
        <div class="env-create">
          <input
            class="env-input"
            placeholder="Environment name..."
            value={newEnvName()}
            onInput={(e) => setNewEnvName(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
            autofocus
          />
          <button class="btn-sm" onClick={handleCreate}>Create</button>
        </div>
      </Show>

      <div class="env-list">
        <For each={environments()} fallback={<div class="env-empty">No environments</div>}>
          {(env) => (
            <div class={`env-item ${env.id === activeEnvId() ? "active" : ""}`}>
              <div class="env-item-header" onClick={() => switchEnvironment(env.id === activeEnvId() ? null : env.id)}>
                <span class="env-radio">{env.id === activeEnvId() ? "●" : "○"}</span>
                <span class="env-name">{env.name}</span>
                <div class="env-actions">
                  <button class="icon-btn" onClick={(e) => { e.stopPropagation(); setEditingEnv({ ...env, variables: [...env.variables] }); }}>✏</button>
                  <button class="icon-btn danger" onClick={(e) => { e.stopPropagation(); removeEnvironment(env.id, activeWorkspace()); }}>×</button>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={editingEnv()}>
        <div class="env-editor-overlay" onClick={() => setEditingEnv(null)}>
          <div class="env-editor" onClick={(e) => e.stopPropagation()}>
            <div class="env-editor-header">
              <h3>Edit: {editingEnv()!.name}</h3>
              <button class="icon-btn" onClick={() => setEditingEnv(null)}>×</button>
            </div>
            <KeyValueGrid
              items={editingEnv()!.variables}
              onChange={(variables) => setEditingEnv({ ...editingEnv()!, variables })}
              placeholder={{ key: "Variable name", value: "Variable value" }}
            />
            <div class="env-editor-footer">
              <button class="btn-primary" onClick={handleSave}>Save</button>
              <button class="btn-sm" onClick={() => setEditingEnv(null)}>Cancel</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
