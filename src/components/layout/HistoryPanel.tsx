import { Component, Show, For, createSignal, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { filteredHistory, historySearch, setHistorySearch, clearAllHistory, parseHistoryRequestData } from "../../stores/history";
import { openHistoryInTab, openHistoryInTabWithResponse, executeRequest } from "../../stores/request";
import { activeWorkspace } from "../../stores/collections";
import { buildCurlCommand } from "../../lib/curl";
import { CollectionPickerDialog } from "../shared/CollectionPickerDialog";
import { saveHistoryAsRequest } from "../../stores/history";
import * as apiTypes from "../../lib/api";

// --- History context menu state ---
const [historyCtxMenu, setHistoryCtxMenu] = createSignal<{ entry: apiTypes.HistoryEntry; pos: { x: number; y: number } } | null>(null);
const [showCollectionPicker, setShowCollectionPicker] = createSignal<apiTypes.HistoryEntry | null>(null);

export { historyCtxMenu, showCollectionPicker, setShowCollectionPicker };

const HistoryContextMenu: Component<{
  entry: apiTypes.HistoryEntry;
  position: { x: number; y: number };
  onClose: () => void;
}> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [adjustedPos, setAdjustedPos] = createSignal(props.position);

  onMount(() => {
    if (!menuRef) return;
    const rect = menuRef.getBoundingClientRect();
    let { x, y } = props.position;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    if (x < 0) x = 4;
    if (y < 0) y = 4;
    setAdjustedPos({ x, y });
  });

  const menuStyle = () => ({
    position: "fixed" as const,
    left: `${adjustedPos().x}px`,
    top: `${adjustedPos().y}px`,
    "z-index": "9999",
  });

  const handleOpen = () => {
    openHistoryInTabWithResponse(props.entry);
    props.onClose();
  };

  const handleRerun = () => {
    const tab = openHistoryInTab(props.entry);
    props.onClose();
    const wsId = activeWorkspace();
    if (wsId) executeRequest(tab.id, wsId);
  };

  const handleCopyCurl = () => {
    const { headers, params, body, auth } = parseHistoryRequestData(props.entry);
    const cmd = buildCurlCommand(props.entry.method, props.entry.url, headers, body, auth);
    navigator.clipboard.writeText(cmd).catch(() => {});
    props.onClose();
  };

  const handleSaveAsRequest = () => {
    setShowCollectionPicker(props.entry);
    props.onClose();
  };

  return (
    <div ref={menuRef} class="req-context-menu" style={menuStyle()} onClick={(e) => e.stopPropagation()}>
      <button class="dropdown-item" onClick={handleOpen}>
        <span class="ctx-label">Open in Tab</span>
      </button>
      <button class="dropdown-item" onClick={handleRerun}>
        <span class="ctx-label">Re-run</span>
      </button>
      <div class="dropdown-sep" />
      <button class="dropdown-item" onClick={handleCopyCurl}>
        <span class="ctx-label">Copy as cURL</span>
      </button>
      <button class="dropdown-item" onClick={handleSaveAsRequest}>
        <span class="ctx-label">Save as Request</span>
      </button>
    </div>
  );
};

export const HistoryPanel: Component = () => {
  return (
    <div class="history-panel">
      <div class="sidebar-header">
        <span class="sidebar-title">History</span>
        <Show when={filteredHistory().length > 0}>
          <button class="icon-btn danger" title="Clear history" onClick={() => clearAllHistory(activeWorkspace())}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
          </button>
        </Show>
      </div>
      <div class="history-search">
        <input
          class="add-input"
          placeholder="Search history..."
          value={historySearch()}
          onInput={(e) => setHistorySearch(e.currentTarget.value)}
        />
      </div>
      <div class="sidebar-tree">
        <Show when={filteredHistory().length > 0} fallback={<div class="sidebar-empty">No history entries yet.</div>}>
          <For each={filteredHistory()}>
            {(entry) => {
              const date = new Date(entry.timestamp);
              const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const statusClass = entry.status >= 200 && entry.status < 300 ? "success" : entry.status >= 400 ? "error" : "";
              return (
                <div
                  class="tree-item request history-entry"
                  onClick={() => openHistoryInTabWithResponse(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setHistoryCtxMenu({ entry, pos: { x: e.clientX, y: e.clientY } });
                  }}
                >
                  <span class={`method-badge ${entry.method.toLowerCase()}`}>
                    {entry.method}
                  </span>
                  <div class="history-info">
                    <span class="item-name">{entry.url}</span>
                    <div class="history-meta">
                      <span class={`history-status ${statusClass}`}>{entry.status}</span>
                      <span class="history-time">{entry.duration_ms}ms</span>
                      <span class="history-timestamp">{timeStr}</span>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
};

// --- Portal overlays for history context menu + collection picker ---

export const HistoryOverlays: Component = () => (
  <>
    <Show when={historyCtxMenu()} keyed>
      {(menu) => (
        <Portal mount={document.body}>
          <HistoryContextMenu
            entry={menu.entry}
            position={menu.pos}
            onClose={() => setHistoryCtxMenu(null)}
          />
        </Portal>
      )}
    </Show>

    <Show when={showCollectionPicker()} keyed>
      {(entry) => (
        <CollectionPickerDialog
          onSelect={async (collectionId) => {
            await saveHistoryAsRequest(entry, collectionId);
            setShowCollectionPicker(null);
          }}
          onClose={() => setShowCollectionPicker(null)}
        />
      )}
    </Show>
  </>
);

// Hook for setting up dismiss handlers
export function useHistoryCtxDismiss() {
  const handleMousedown = (e: MouseEvent) => {
    if (!historyCtxMenu()) return;
    if ((e.target as HTMLElement).closest(".req-context-menu")) return;
    if (e.button === 2) return;
    setHistoryCtxMenu(null);
  };
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") setHistoryCtxMenu(null);
  };
  onMount(() => {
    document.addEventListener("mousedown", handleMousedown);
    document.addEventListener("keydown", handleKeydown);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", handleMousedown);
    document.removeEventListener("keydown", handleKeydown);
  });
}
