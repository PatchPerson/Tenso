import { Component, For, Show, createSignal } from "solid-js";
import { CollectionNode, addCollection, removeCollection, addRequest, expandedFolders, expandFolder, toggleFolder } from "../../stores/collections";
import { openRequestInTab } from "../../stores/request";
import * as api from "../../lib/api";
import { activeCtxMenu, setActiveCtxMenu, activeFolderCtxMenu, setActiveFolderCtxMenu } from "./SidebarContextMenus";

export const ThreeDotsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="7" cy="3" r="0.75" fill="currentColor" />
    <circle cx="7" cy="7" r="0.75" fill="currentColor" />
    <circle cx="7" cy="11" r="0.75" fill="currentColor" />
  </svg>
);

export const RequestItem: Component<{ req: api.SavedRequest; depth: number }> = (props) => {
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

export const FolderNode: Component<{ node: CollectionNode; depth: number }> = (props) => {
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
