import { Component, For, onMount, onCleanup } from "solid-js";
import { collections, type CollectionNode } from "../../stores/collections";

interface Props {
  onSelect: (collectionId: string) => void;
  onClose: () => void;
}

interface FlatItem {
  id: string;
  name: string;
  depth: number;
  hasChildren: boolean;
}

function flattenTree(nodes: CollectionNode[], depth = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    result.push({
      id: node.collection.id,
      name: node.collection.name,
      depth,
      hasChildren: node.children.length > 0
    });
    result.push(...flattenTree(node.children, depth + 1));
  }
  return result;
}

export const CollectionPickerDialog: Component<Props> = (props) => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  const items = () => flattenTree(collections);

  return (
    <div class="auth-code-overlay" onClick={props.onClose}>
      <div class="auth-code-modal" onClick={(e) => e.stopPropagation()} style={{ "max-height": "400px" }}>
        <div class="auth-code-header">
          <span>Save to Collection</span>
          <button class="icon-btn" onClick={props.onClose}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
          </button>
        </div>
        <div style={{ "overflow-y": "auto", "max-height": "300px", padding: "4px 0" }}>
          <For each={items()} fallback={<div class="sidebar-empty">No collections</div>}>
            {(item) => (
              <button
                class="dropdown-item"
                onClick={() => props.onSelect(item.id)}
              >
                <div style={{ width: `${item.depth * 16}px`, "flex-shrink": 0 }} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ "flex-shrink": "0", "margin-right": "8px", opacity: 0.7 }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span class="ctx-label" style={{ "font-weight": item.depth === 0 ? "500" : "400" }}>{item.name}</span>
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
