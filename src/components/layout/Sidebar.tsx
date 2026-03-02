import { Component, For, Show, createSignal } from "solid-js";
import { collections, addCollection, removeCollection, addRequest, removeRequest, loading, CollectionNode } from "../../stores/collections";
import { openRequestInTab } from "../../stores/request";

const METHOD_COLORS: Record<string, string> = {
  GET: "var(--method-get)",
  POST: "var(--method-post)",
  PUT: "var(--method-put)",
  DELETE: "var(--method-delete)",
  PATCH: "var(--method-patch)",
  HEAD: "var(--method-head)",
  OPTIONS: "var(--method-options)",
};

const FolderNode: Component<{ node: CollectionNode; depth: number }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const [showMenu, setShowMenu] = createSignal(false);
  const [adding, setAdding] = createSignal<"request" | "folder" | null>(null);
  const [newName, setNewName] = createSignal("");

  const handleAdd = async (type: "request" | "folder") => {
    const name = newName().trim();
    if (!name) return;
    if (type === "folder") {
      await addCollection(name, props.node.collection.id);
    } else {
      await addRequest(props.node.collection.id, name);
    }
    setNewName("");
    setAdding(null);
    setExpanded(true);
  };

  return (
    <div class="folder-node">
      <div
        class="tree-item folder"
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={() => setExpanded(!expanded())}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu()); }}
      >
        <span class="expand-icon">{expanded() ? "▼" : "▶"}</span>
        <span class="folder-icon">📁</span>
        <span class="item-name">{props.node.collection.name}</span>
        <div class="item-actions">
          <button class="icon-btn" title="Add request" onClick={(e) => { e.stopPropagation(); setAdding("request"); setExpanded(true); }}>+</button>
          <button class="icon-btn" title="Add folder" onClick={(e) => { e.stopPropagation(); setAdding("folder"); setExpanded(true); }}>📁</button>
          <button class="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); removeCollection(props.node.collection.id); }}>×</button>
        </div>
      </div>

      <Show when={expanded()}>
        <Show when={adding()}>
          <div class="add-input-row" style={{ "padding-left": `${(props.depth + 1) * 16 + 8}px` }}>
            <input
              class="add-input"
              placeholder={adding() === "folder" ? "Folder name..." : "Request name..."}
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(adding()!); if (e.key === "Escape") setAdding(null); }}
              autofocus
            />
          </div>
        </Show>

        <For each={props.node.children}>
          {(child) => <FolderNode node={child} depth={props.depth + 1} />}
        </For>

        <For each={props.node.requests}>
          {(req) => (
            <div
              class="tree-item request"
              style={{ "padding-left": `${(props.depth + 1) * 16 + 8}px` }}
              onClick={() => openRequestInTab(req)}
            >
              <span class="method-badge" style={{ color: METHOD_COLORS[req.method] || "var(--text-secondary)" }}>
                {req.method}
              </span>
              <span class="item-name">{req.name}</span>
              <div class="item-actions">
                <button class="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); removeRequest(req.id); }}>×</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export const Sidebar: Component = () => {
  const [adding, setAdding] = createSignal(false);
  const [newName, setNewName] = createSignal("");

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
        <button class="icon-btn" onClick={() => setAdding(true)} title="New collection">+</button>
      </div>

      <Show when={adding()}>
        <div class="add-input-row" style={{ padding: "4px 8px" }}>
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
    </div>
  );
};
