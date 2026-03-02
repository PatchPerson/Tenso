import { Component, For, Show } from "solid-js";
import { tabs, activeTabId, setActiveTabId, closeTab, createNewTab, type Tab } from "../../stores/request";

const METHOD_COLORS: Record<string, string> = {
  GET: "var(--method-get)",
  POST: "var(--method-post)",
  PUT: "var(--method-put)",
  DELETE: "var(--method-delete)",
  PATCH: "var(--method-patch)",
};

export const TabBar: Component = () => {
  return (
    <div class="tab-bar">
      <div class="tab-list">
        <For each={tabs()}>
          {(tab) => (
            <div
              class={`tab-item ${tab.id === activeTabId() ? "active" : ""}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span class="tab-method" style={{ color: METHOD_COLORS[tab.method] || "var(--text-secondary)" }}>
                {tab.method}
              </span>
              <span class="tab-name">{tab.name}</span>
              <Show when={tab.dirty}>
                <span class="tab-dirty">●</span>
              </Show>
              <button
                class="tab-close"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              >×</button>
            </div>
          )}
        </For>
      </div>
      <button class="tab-new" onClick={() => createNewTab()} title="New tab">+</button>
    </div>
  );
};
