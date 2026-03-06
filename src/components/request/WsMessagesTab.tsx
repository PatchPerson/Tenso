import { Component, Show, For, createSignal } from "solid-js";
import type { Tab } from "../../stores/request";
import { kbd } from "../../lib/platform";
import {
  addWsTemplate,
  removeWsTemplate,
  updateWsTemplate,
  loadTemplateIntoComposer,
  sendWebSocketMessage,
  updateTab,
} from "../../stores/request";

interface Props {
  tab: Tab;
}

export const WsMessagesTab: Component<Props> = (props) => {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal("");
  const [savingNew, setSavingNew] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [jsonError, setJsonError] = createSignal<string | null>(null);

  const isConnected = () => props.tab.wsStatus === "connected";

  const handleTemplateClick = (templateId: string) => {
    loadTemplateIntoComposer(props.tab.id, templateId);
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const handleFinishRename = (id: string) => {
    const name = editName().trim();
    if (name) {
      updateWsTemplate(props.tab.id, id, { name });
    }
    setEditingId(null);
  };

  const handleDelete = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    removeWsTemplate(props.tab.id, id);
  };

  const handleSaveNew = () => {
    const name = newName().trim();
    if (!name || !props.tab.wsComposerContent.trim()) return;
    addWsTemplate(props.tab.id, name, props.tab.wsComposerContent, props.tab.wsComposerFormat);
    setNewName("");
    setSavingNew(false);
  };

  const handleComposerInput = (value: string) => {
    updateTab(props.tab.id, { wsComposerContent: value } as any);
    if (props.tab.wsComposerFormat === "json") {
      try {
        if (value.trim()) JSON.parse(value);
        setJsonError(null);
      } catch (e) {
        setJsonError(String(e));
      }
    } else {
      setJsonError(null);
    }
  };

  const handleFormatChange = (format: "text" | "json") => {
    updateTab(props.tab.id, { wsComposerFormat: format } as any);
    if (format === "json" && props.tab.wsComposerContent.trim()) {
      try {
        JSON.parse(props.tab.wsComposerContent);
        setJsonError(null);
      } catch (e) {
        setJsonError(String(e));
      }
    } else {
      setJsonError(null);
    }
  };

  const handleSend = () => {
    sendWebSocketMessage(props.tab.id);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div class="ws-messages-tab">
      {/* Saved Templates */}
      <div class="ws-templates-section">
        <div class="ws-templates-header">
          <span class="ws-templates-title">Saved Messages</span>
          <Show when={props.tab.wsComposerContent.trim()}>
            <Show when={savingNew()} fallback={
              <button class="ws-templates-action" onClick={() => setSavingNew(true)}>
                + Save Current
              </button>
            }>
              <div class="ws-save-new-row">
                <input
                  class="ws-save-new-input"
                  placeholder="Message name..."
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveNew();
                    if (e.key === "Escape") setSavingNew(false);
                  }}
                  autofocus
                />
                <button class="ws-save-new-btn" onClick={handleSaveNew} disabled={!newName().trim()}>Save</button>
                <button class="ws-save-new-btn ws-save-cancel" onClick={() => setSavingNew(false)}>Cancel</button>
              </div>
            </Show>
          </Show>
        </div>

        <Show when={props.tab.wsTemplates.length > 0} fallback={
          <div class="ws-templates-empty">No saved messages yet</div>
        }>
          <div class="ws-template-list">
            <For each={props.tab.wsTemplates}>
              {(template) => (
                <div class="ws-template-item" onClick={() => handleTemplateClick(template.id)}>
                  <span class="ws-template-format-badge">{template.format === "json" ? "JSON" : "TXT"}</span>
                  <Show when={editingId() === template.id} fallback={
                    <span
                      class="ws-template-name"
                      onDblClick={() => handleStartRename(template.id, template.name)}
                    >
                      {template.name}
                    </span>
                  }>
                    <input
                      class="ws-template-name-input"
                      value={editName()}
                      onInput={(e) => setEditName(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFinishRename(template.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleFinishRename(template.id)}
                      autofocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Show>
                  <span class="ws-template-preview">{template.content.slice(0, 60)}{template.content.length > 60 ? "..." : ""}</span>
                  <button
                    class="ws-template-delete"
                    onClick={(e) => handleDelete(e, template.id)}
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Composer */}
      <div class="ws-composer">
        <div class="ws-composer-header">
          <div class="ws-composer-format">
            <button
              class={`ws-format-btn ${props.tab.wsComposerFormat === "text" ? "active" : ""}`}
              onClick={() => handleFormatChange("text")}
            >
              Text
            </button>
            <button
              class={`ws-format-btn ${props.tab.wsComposerFormat === "json" ? "active" : ""}`}
              onClick={() => handleFormatChange("json")}
            >
              JSON
            </button>
          </div>
          <Show when={!isConnected()}>
            <span class="ws-composer-hint">Connect to send messages</span>
          </Show>
        </div>
        <textarea
          class={`ws-composer-input ${jsonError() ? "has-error" : ""}`}
          placeholder={props.tab.wsComposerFormat === "json" ? '{"type": "message", "data": "..."}' : "Enter message..."}
          value={props.tab.wsComposerContent}
          onInput={(e) => handleComposerInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <Show when={jsonError()}>
          <div class="ws-composer-error">{jsonError()}</div>
        </Show>
        <div class="ws-composer-footer">
          <span class="ws-composer-shortcut">{kbd("Mod+Enter")} to send</span>
          <button
            class="ws-composer-send"
            onClick={handleSend}
            disabled={!isConnected() || !props.tab.wsComposerContent.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
