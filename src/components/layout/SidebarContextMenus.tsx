import { Component, Show, createSignal, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { collections, addCollection, removeCollection, addRequest, removeRequest, moveRequest, activeWorkspace, CollectionNode, expandFolder, loadCollections } from "../../stores/collections";
import * as api from "../../lib/api";
import { buildCurlCommand } from "../../lib/curl";
import { triggerPush } from "../../lib/sync";
import { kbd } from "../../lib/platform";
import { CollectionPickerDialog } from "../shared/CollectionPickerDialog";

// Single global context menu state — only one menu open at a time
export const [activeCtxMenu, setActiveCtxMenu] = createSignal<{ req: api.SavedRequest; pos: { x: number; y: number } } | null>(null);
export const [activeFolderCtxMenu, setActiveFolderCtxMenu] = createSignal<{ node: CollectionNode; pos: { x: number; y: number } } | null>(null);

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

export const RequestContextMenu: Component<{
  req: api.SavedRequest;
  position: { x: number; y: number };
  onClose: () => void;
}> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [adjustedPos, setAdjustedPos] = createSignal(props.position);
  const [renaming, setRenaming] = createSignal(false);
  const [renameName, setRenameName] = createSignal(props.req.name);
  const [showMovePicker, setShowMovePicker] = createSignal(false);

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

  const handleMove = (targetCollectionId: string) => {
    moveRequest(props.req.id, targetCollectionId);
    setShowMovePicker(false);
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
        <button class="dropdown-item" onClick={() => setShowMovePicker(true)}>
          <span class="ctx-label">Move to...</span>
        </button>
        <div class="dropdown-sep" />

        <Show when={showMovePicker()}>
          <Portal mount={document.body}>
            <CollectionPickerDialog
              onSelect={handleMove}
              onClose={() => setShowMovePicker(false)}
            />
          </Portal>
        </Show>
        <button class="dropdown-item danger" onClick={handleDelete}>
          <span class="ctx-label">Delete</span>
          <span class="ctx-shortcut">{kbd("Del")}</span>
        </button>
      </div>
    </Show>
  );
};

// Folder context menu for top-level collections
export const FolderContextMenu: Component<{
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
