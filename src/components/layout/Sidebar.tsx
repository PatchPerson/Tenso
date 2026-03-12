import { Component, For, Show, createSignal, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { collections, addCollection, removeCollection, addRequest, removeRequest, loading, activeWorkspace, CollectionNode, expandedFolders, expandFolder, toggleFolder } from "../../stores/collections";
import { openRequestInTab } from "../../stores/request";
import * as api from "../../lib/api";
import { buildCurlCommand } from "../../lib/curl";
import { triggerPush } from "../../lib/sync";
import { kbd } from "../../lib/platform";
import { ExportDialog } from "../import/ExportDialog";

const ThreeDotsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="7" cy="3" r="0.75" fill="currentColor" />
    <circle cx="7" cy="7" r="0.75" fill="currentColor" />
    <circle cx="7" cy="11" r="0.75" fill="currentColor" />
  </svg>
);

const RequestContextMenu: Component<{
  req: api.SavedRequest;
  position: { x: number; y: number };
  onClose: () => void;
}> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [adjustedPos, setAdjustedPos] = createSignal(props.position);
  const [renaming, setRenaming] = createSignal(false);
  const [renameName, setRenameName] = createSignal(props.req.name);

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
      triggerPush();
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
      triggerPush();
    }
    props.onClose();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(props.req.url).catch(() => {});
    props.onClose();
  };

  const handleCopyCurl = () => {
    const req = props.req;
    const cmd = buildCurlCommand(req.method, req.url, req.headers, req.body, req.auth);
    navigator.clipboard.writeText(cmd).catch(() => {});
    props.onClose();
  };

  const handleDelete = () => {
    removeRequest(props.req.id);
    props.onClose();
  };

  const menuStyle = () => ({
    position: "fixed" as const,
    left: `${adjustedPos().x}px`,
    top: `${adjustedPos().y}px`,
    "z-index": "9999",
  });

  return (
    <Show when={!renaming()} fallback={
      <div ref={menuRef} class="req-context-menu" style={menuStyle()} onClick={(e) => e.stopPropagation()}>
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
      <div ref={menuRef} class="req-context-menu" style={menuStyle()} onClick={(e) => e.stopPropagation()}>
        <button class="dropdown-item" onClick={() => setRenaming(true)}>
          <span class="ctx-label">Rename</span>
          <span class="ctx-shortcut">{kbd("Mod+E")}</span>
        </button>
        <button class="dropdown-item" onClick={handleCopyUrl}>
          <span class="ctx-label">Copy URL</span>
          <span class="ctx-shortcut">{kbd("Mod+C")}</span>
        </button>
        <button class="dropdown-item" onClick={handleCopyCurl}>
          <span class="ctx-label">Copy as cURL</span>
        </button>
        <button class="dropdown-item" onClick={handleDuplicate}>
          <span class="ctx-label">Duplicate</span>
          <span class="ctx-shortcut">{kbd("Mod+D")}</span>
        </button>
        <div class="dropdown-sep" />
        <button class="dropdown-item danger" onClick={handleDelete}>
          <span class="ctx-label">Delete</span>
          <span class="ctx-shortcut">{kbd("Del")}</span>
        </button>
      </div>
    </Show>
  );
};

// Folder context menu for top-level collections
const FolderContextMenu: Component<{
  node: CollectionNode;
  position: { x: number; y: number };
  onClose: () => void;
  onExport: (node: CollectionNode) => void;
}> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [adjustedPos, setAdjustedPos] = createSignal(props.position);
  const [renaming, setRenaming] = createSignal(false);
  const [renameName, setRenameName] = createSignal(props.node.collection.name);

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

  const handleRename = async () => {
    const name = renameName().trim();
    if (!name || name === props.node.collection.name) { setRenaming(false); return; }
    await api.updateCollection(props.node.collection.id, name);
    const wsId = activeWorkspace();
    if (wsId) {
      const { loadCollections } = await import("../../stores/collections");
      await loadCollections(wsId);
    }
    triggerPush();
    props.onClose();
  };

  const handleAddRequest = () => {
    // Trigger add-request inline input on the folder
    addRequest(props.node.collection.id, "New Request");
    expandFolder(props.node.collection.id);
    props.onClose();
  };

  const handleAddFolder = () => {
    addCollection("New Folder", props.node.collection.id);
    expandFolder(props.node.collection.id);
    props.onClose();
  };

  const handleExport = () => {
    props.onExport(props.node);
    props.onClose();
  };

  const handleDelete = () => {
    removeCollection(props.node.collection.id);
    props.onClose();
  };

  const menuStyle = () => ({
    position: "fixed" as const,
    left: `${adjustedPos().x}px`,
    top: `${adjustedPos().y}px`,
    "z-index": "9999",
  });

  return (
    <Show when={!renaming()} fallback={
      <div ref={menuRef} class="req-context-menu" style={menuStyle()} onClick={(e) => e.stopPropagation()}>
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
      <div ref={menuRef} class="req-context-menu" style={menuStyle()} onClick={(e) => e.stopPropagation()}>
        <button class="dropdown-item" onClick={handleExport}>
          <span class="ctx-label">Export Collection</span>
        </button>
        <div class="dropdown-sep" />
        <button class="dropdown-item" onClick={() => setRenaming(true)}>
          <span class="ctx-label">Rename</span>
        </button>
        <button class="dropdown-item" onClick={handleAddRequest}>
          <span class="ctx-label">Add Request</span>
        </button>
        <button class="dropdown-item" onClick={handleAddFolder}>
          <span class="ctx-label">Add Folder</span>
        </button>
        <div class="dropdown-sep" />
        <button class="dropdown-item danger" onClick={handleDelete}>
          <span class="ctx-label">Delete</span>
        </button>
      </div>
    </Show>
  );
};

const FolderNode: Component<{ node: CollectionNode; depth: number }> = (props) => {
  const id = () => props.node.collection.id;
  const expanded = () => expandedFolders().has(id());
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
        onContextMenu={(e) => {
          e.preventDefault();
          if (props.depth === 0) {
            setActiveCtxMenu(null);
            setActiveFolderCtxMenu({ node: props.node, pos: { x: e.clientX, y: e.clientY } });
          }
        }}
      >
        <span class="folder-icon">
          {expanded()
            ? <svg width="14" height="14" viewBox="0 0 576 512" fill="currentColor"><path d="m97.5 400 50-160h379.4l-50 160H97.5zm190.7 48H477c21 0 39.6-13.6 45.8-33.7l50-160c9.7-30.9-13.4-62.3-45.8-62.3H147.6c-21 0-39.6 13.6-45.8 33.7l-21.6 68.7V96c0-8.8 7.2-16 16-16h138.7c3.5 0 6.8 1.1 9.6 3.2l38.4 28.8c13.8 10.4 30.7 16 48 16h117.3c8.8 0 16 7.2 16 16h48c0-35.3-28.7-64-64-64H330.9c-6.9 0-13.7-2.2-19.2-6.4l-38.4-28.8C262.2 36.5 248.8 32 234.9 32H96.2c-35.3 0-64 28.7-64 64v288c0 35.3 28.7 64 64 64h192z" /></svg>
            : <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor"><path d="M64 400h384c8.8 0 16-7.2 16-16V144c0-8.8-7.2-16-16-16H298.7c-17.3 0-34.2-5.6-48-16l-38.4-28.8c-2.8-2.1-6.1-3.2-9.6-3.2H64c-8.8 0-16 7.2-16 16v288c0 8.8 7.2 16 16 16zm384 48H64c-35.3 0-64-28.7-64-64V96c0-35.3 28.7-64 64-64h138.7c13.8 0 27.3 4.5 38.4 12.8l38.4 28.8c5.5 4.2 12.3 6.4 19.2 6.4H448c35.3 0 64 28.7 64 64v240c0 35.3-28.7 64-64 64z" /></svg>
          }
        </span>
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

// Single global context menu state — only one menu open at a time
const [activeCtxMenu, setActiveCtxMenu] = createSignal<{ req: api.SavedRequest; pos: { x: number; y: number } } | null>(null);
const [activeFolderCtxMenu, setActiveFolderCtxMenu] = createSignal<{ node: CollectionNode; pos: { x: number; y: number } } | null>(null);

// Close on any mousedown outside the menu (mousedown fires before contextmenu,
// so we need to check if this is a right-click and skip closing — the contextmenu
// handler on the tree item will replace the menu)
document.addEventListener("mousedown", (e) => {
  if (!activeCtxMenu() && !activeFolderCtxMenu()) return;
  if ((e.target as HTMLElement).closest(".req-context-menu")) return;
  // Right-click on a tree item will trigger onContextMenu which replaces the menu
  if (e.button === 2) return;
  setActiveCtxMenu(null);
  setActiveFolderCtxMenu(null);
});

// Close on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setActiveCtxMenu(null);
    setActiveFolderCtxMenu(null);
  }
});

const RequestItem: Component<{ req: api.SavedRequest; depth: number }> = (props) => {
  return (
    <div
      class="tree-item request"
      style={{ "padding-left": `${props.depth * 16 + 8}px` }}
      onClick={() => openRequestInTab(props.req)}
      onContextMenu={(e) => { e.preventDefault(); setActiveFolderCtxMenu(null); setActiveCtxMenu({ req: props.req, pos: { x: e.clientX, y: e.clientY } }); }}
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
            onClick={(e) => {
              e.stopPropagation();
              const cur = activeCtxMenu();
              if (cur && cur.req.id === props.req.id) {
                setActiveCtxMenu(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setActiveCtxMenu({ req: props.req, pos: { x: rect.right, y: rect.bottom } });
              }
            }}
          >
            <ThreeDotsIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

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
