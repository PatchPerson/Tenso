import { Component, For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { collections, addCollection, loading, CollectionNode } from "../../stores/collections";
import { ExportDialog } from "../import/ExportDialog";
import { activeCtxMenu, setActiveCtxMenu, activeFolderCtxMenu, setActiveFolderCtxMenu, RequestContextMenu, FolderContextMenu } from "./SidebarContextMenus";
import { FolderNode } from "./CollectionTree";

export const Sidebar: Component = () => {
  const [adding, setAdding] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [exportNode, setExportNode] = createSignal<CollectionNode | null>(null);

  const handleAddCollection = async () => {
    const name = newName().trim();
    if (!name) return;
    await addCollection(name);
    setNewName("");
    setAdding(false);
  };

  return (
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Collections</span>
        <button class="icon-btn" onClick={() => setAdding(true)} title="New collection">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" /></svg>
        </button>
      </div>

      <Show when={adding()}>
        <div class="add-input-row" style={{ padding: "4px 6px" }}>
          <input
            class="add-input"
            placeholder="Collection name..."
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddCollection(); if (e.key === "Escape") setAdding(false); }}
            autofocus
          />
        </div>
      </Show>

      <div class="sidebar-tree">
        <Show when={!loading()} fallback={<div class="sidebar-loading">Loading...</div>}>
          <For each={collections} fallback={<div class="sidebar-empty">No collections yet</div>}>
            {(node) => <FolderNode node={node} depth={0} />}
          </For>
        </Show>
      </div>

      <Show when={activeCtxMenu()} keyed>
        {(menu) => (
          <Portal mount={document.body}>
            <RequestContextMenu
              req={menu.req}
              position={menu.pos}
              onClose={() => setActiveCtxMenu(null)}
            />
          </Portal>
        )}
      </Show>

      <Show when={activeFolderCtxMenu()} keyed>
        {(menu) => (
          <Portal mount={document.body}>
            <FolderContextMenu
              node={menu.node}
              position={menu.pos}
              onClose={() => setActiveFolderCtxMenu(null)}
              onExport={(node) => setExportNode(node)}
            />
          </Portal>
        )}
      </Show>

      <Show when={exportNode()} keyed>
        {(node) => (
          <ExportDialog
            node={node}
            onClose={() => setExportNode(null)}
          />
        )}
      </Show>
    </div>
  );
};
