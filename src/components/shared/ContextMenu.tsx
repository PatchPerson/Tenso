import { Component, For, Show, createSignal, onCleanup, onMount } from "solid-js";

interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export const ContextMenu: Component<Props> = (props) => {
  let ref: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (ref && !ref.contains(e.target as Node)) {
      props.onClose();
    }
  };

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  return (
    <div
      ref={ref}
      class="context-menu"
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
    >
      <For each={props.items}>
        {(item) => (
          <Show when={!item.separator} fallback={<div class="context-separator" />}>
            <button
              class={`context-item ${item.danger ? "danger" : ""}`}
              onClick={() => { item.action(); props.onClose(); }}
            >
              {item.label}
            </button>
          </Show>
        )}
      </For>
    </div>
  );
};
