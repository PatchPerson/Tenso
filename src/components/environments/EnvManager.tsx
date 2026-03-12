import { Component, For, Show, createSignal } from "solid-js";
import { environments, activeEnvId, addEnvironment, saveEnvironment, removeEnvironment, switchEnvironment, loadEnvironments } from "../../stores/environments";
import { activeTeam } from "../../stores/collections";
import { KeyValueGrid } from "../shared/KeyValueGrid";
import type { Environment, KeyValue } from "../../lib/api";

export const EnvManager: Component = () => {
  const [editingEnv, setEditingEnv] = createSignal<Environment | null>(null);
  const [newEnvName, setNewEnvName] = createSignal("");
  const [showCreate, setShowCreate] = createSignal(false);
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null);
  const [shatteringId, setShatteringId] = createSignal<string | null>(null);

  const handleCreate = async () => {
    const name = newEnvName().trim();
    const wsId = activeTeam();
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

  const handleDeleteClick = (e: MouseEvent, envId: string) => {
    e.stopPropagation();
    setConfirmingId(envId);
  };

  const handleConfirmYes = (e: MouseEvent, envId: string) => {
    e.stopPropagation();
    setConfirmingId(null);
    setShatteringId(envId);
  };

  const handleConfirmNo = (e: MouseEvent) => {
    e.stopPropagation();
    setConfirmingId(null);
  };

  const handleAnimationEnd = async (e: AnimationEvent, envId: string) => {
    if (e.animationName === "env-dismiss" && shatteringId() === envId) {
      await removeEnvironment(envId, activeTeam());
      setShatteringId(null);
    }
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
            <div
              class={`env-item ${env.id === activeEnvId() ? "active" : ""} ${shatteringId() === env.id ? "shattering" : ""}`}
              onAnimationEnd={(e) => handleAnimationEnd(e, env.id)}
            >
              <div
                class={`env-item-header ${confirmingId() === env.id ? "env-confirming" : ""}`}
                onClick={() => {
                  if (confirmingId() === env.id || shatteringId() === env.id) return;
                  switchEnvironment(env.id === activeEnvId() ? null : env.id);
                }}
              >
                {/* Normal state */}
                <div class="env-item-normal">
                  <span class="env-radio">
                    <Show when={env.id === activeEnvId()} fallback={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    }>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="5" fill="currentColor" />
                      </svg>
                    </Show>
                  </span>
                  <span class="env-name">{env.name}</span>
                  <div class="env-actions">
                    <button class="icon-btn" onClick={(e) => { e.stopPropagation(); setEditingEnv({ ...env, variables: [...env.variables] }); }} title="Edit environment">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" stroke-width="0">
                        <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z" />
                      </svg>
                    </button>
                    <button class="icon-btn danger" onClick={(e) => handleDeleteClick(e, env.id)} title="Delete environment">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke-width="0">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Confirm state (overlaid) */}
                <div class="env-item-confirm">
                  <span class="env-confirm-text">Delete?</span>
                  <div class="env-confirm-actions">
                    <button class="env-confirm-yes" onClick={(e) => handleConfirmYes(e, env.id)}>Yes</button>
                    <button class="env-confirm-no" onClick={(e) => handleConfirmNo(e)}>No</button>
                  </div>
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
              <button class="icon-btn" onClick={() => setEditingEnv(null)} title="Close">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
              </button>
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
