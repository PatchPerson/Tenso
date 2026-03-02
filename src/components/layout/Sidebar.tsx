import { Component, For, Show, createSignal, onMount, onCleanup } from "solid-js";
import { collections, addCollection, removeCollection, addRequest, removeRequest, loading, activeWorkspace, CollectionNode } from "../../stores/collections";
import { openRequestInTab } from "../../stores/request";
import * as api from "../../lib/api";

// Module-level expanded state that persists across re-renders from loadCollections
const [expandedFolders, setExpandedFolders] = createSignal<Set<string>>(new Set<string>());

const toggleFolder = (id: string) => {
  setExpandedFolders(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const expandFolder = (id: string) => {
  setExpandedFolders(prev => {
    if (prev.has(id)) return prev;
    const next = new Set(prev);
    next.add(id);
    return next;
  });
};

const METHOD_COLORS: Record<string, string> = {
  GET: "var(--method-get)",
  POST: "var(--method-post)",
  PUT: "var(--method-put)",
  DELETE: "var(--method-delete)",
  PATCH: "var(--method-patch)",
  HEAD: "var(--method-head)",
  OPTIONS: "var(--method-options)",
};

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ "flex-shrink": "0" }}>
    <path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" />
  </svg>
);

const ThreeDotsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="7" cy="3" r="0.75" fill="currentColor" />
    <circle cx="7" cy="7" r="0.75" fill="currentColor" />
    <circle cx="7" cy="11" r="0.75" fill="currentColor" />
  </svg>
);

const RequestContextMenu: Component<{
  req: api.SavedRequest;
  onClose: () => void;
}> = (props) => {
  const [renaming, setRenaming] = createSignal(false);
  const [renameName, setRenameName] = createSignal(props.req.name);

  const handleRename = async () => {
    const name = renameName().trim();
    if (!name || name === props.req.name) { setRenaming(false); return; }
    const original = await api.getRequest(props.req.id);
    if (original) {
      await api.updateRequest({ ...original, name });
      // Reload collections to reflect change
      const wsId = activeWorkspace();
      if (wsId) {
        const { loadCollections } = await import("../../stores/collections");
        await loadCollections(wsId);
      }
    }
    props.onClose();
  };

  const handleDuplicate = async () => {
    const original = await api.getRequest(props.req.id);
    if (original) {
      const created = await api.createRequest(
        original.collection_id,
        original.name + " (copy)",
        original.method,
        original.url
      );
      // Update the duplicated request with full data
      if (created) {
        await api.updateRequest({
          ...created,
          headers: original.headers,
          params: original.params,
          body: original.body,
          auth: original.auth,
          pre_script: original.pre_script,
          post_script: original.post_script,
        });
      }
      const wsId = activeWorkspace();
      if (wsId) {
        const { loadCollections } = await import("../../stores/collections");
        await loadCollections(wsId);
      }
    }
    props.onClose();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(props.req.url).catch(() => {});
    props.onClose();
  };

  const handleDelete = () => {
    removeRequest(props.req.id);
    props.onClose();
  };

  return (
    <Show when={!renaming()} fallback={
      <div class="dropdown req-context-menu" onClick={(e) => e.stopPropagation()}>
        <div class="req-rename-row">
          <input
            class="req-rename-input"
            value={renameName()}
            onInput={(e) => setRenameName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") props.onClose();
            }}
            autofocus
          />
        </div>
      </div>
    }>
      <div class="dropdown req-context-menu" onClick={(e) => e.stopPropagation()}>
        <button class="dropdown-item" onClick={() => setRenaming(true)}>
          <span class="ctx-label">Rename</span>
          <span class="ctx-shortcut">Ctrl+E</span>
        </button>
        <button class="dropdown-item" onClick={handleCopyUrl}>
          <span class="ctx-label">Copy URL</span>
          <span class="ctx-shortcut">Ctrl+C</span>
        </button>
        <button class="dropdown-item" onClick={handleDuplicate}>
          <span class="ctx-label">Duplicate</span>
          <span class="ctx-shortcut">Ctrl+D</span>
        </button>
        <div class="dropdown-sep" />
        <button class="dropdown-item danger" onClick={handleDelete}>
          <span class="ctx-label">Delete</span>
          <span class="ctx-shortcut">Del</span>
        </button>
      </div>
    </Show>
  );
};

const FolderNode: Component<{ node: CollectionNode; depth: number }> = (props) => {
  const id = () => props.node.collection.id;
  const expanded = () => expandedFolders().has(id());
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
    expandFolder(id());
  };

  return (
    <div class="folder-node">
      <div
        class="tree-item folder"
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={() => toggleFolder(id())}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu()); }}
      >
        <span class="expand-icon" style={{ transform: expanded() ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2L4 5L7 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <span class="folder-icon"><FolderIcon /></span>
        <span class="item-name">{props.node.collection.name}</span>
        <div class="item-actions">
          <button class="icon-btn" title="Add request" onClick={(e) => { e.stopPropagation(); setAdding("request"); expandFolder(id()); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
          </button>
          <button class="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); removeCollection(props.node.collection.id); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
          </button>
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
          {(req) => <RequestItem req={req} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  );
};

const RequestItem: Component<{ req: api.SavedRequest; depth: number }> = (props) => {
  const [showCtxMenu, setShowCtxMenu] = createSignal(false);

  const closeOnOutsideClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".req-ctx-container")) {
      setShowCtxMenu(false);
    }
  };

  onMount(() => {
    document.addEventListener("click", closeOnOutsideClick);
    onCleanup(() => document.removeEventListener("click", closeOnOutsideClick));
  });

  return (
    <div
      class="tree-item request"
      style={{ "padding-left": `${props.depth * 16 + 8}px` }}
      onClick={() => openRequestInTab(props.req)}
      onContextMenu={(e) => { e.preventDefault(); setShowCtxMenu(true); }}
    >
      <span class={`method-badge ${props.req.method.toLowerCase()}`}>
        {props.req.method}
      </span>
      <span class="item-name">{props.req.name}</span>
      <div class="item-actions">
        <div class="req-ctx-container">
          <button
            class="icon-btn req-dots-btn"
            title="More options"
            onClick={(e) => { e.stopPropagation(); setShowCtxMenu(!showCtxMenu()); }}
          >
            <ThreeDotsIcon />
          </button>
          <Show when={showCtxMenu()}>
            <RequestContextMenu
              req={props.req}
              onClose={() => setShowCtxMenu(false)}
            />
          </Show>
        </div>
      </div>
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
    </div>
  );
};
