import { Component, For, Show, createSignal, createMemo } from "solid-js";
import type { KeyValue } from "../../lib/api";

interface Props {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  placeholder?: { key: string; value: string };
  keySuggestions?: string[];
}

const COMMON_HEADERS = [
  "Accept",
  "Accept-Encoding",
  "Accept-Language",
  "Authorization",
  "Cache-Control",
  "Content-Type",
  "Cookie",
  "Host",
  "If-Modified-Since",
  "If-None-Match",
  "Origin",
  "Referer",
  "User-Agent",
  "X-Api-Key",
  "X-Forwarded-For",
  "X-Request-ID",
  "X-Requested-With",
];

const COMMON_CONTENT_TYPES = [
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
  "text/html",
  "application/xml",
  "application/octet-stream",
];

export const KeyValueGrid: Component<Props> = (props) => {
  const [focusedKey, setFocusedKey] = createSignal<number | null>(null);
  const [focusedValue, setFocusedValue] = createSignal<number | null>(null);
  const [keyFilter, setKeyFilter] = createSignal("");
  const [valueFilter, setValueFilter] = createSignal("");

  const suggestions = createMemo(() => props.keySuggestions || []);
  const hasSuggestions = createMemo(() => suggestions().length > 0);

  const filteredKeySuggestions = createMemo(() => {
    const q = keyFilter().toLowerCase();
    const existing = new Set(props.items.map(i => i.key.toLowerCase()));
    return suggestions().filter(s =>
      !existing.has(s.toLowerCase()) &&
      (q === "" || s.toLowerCase().includes(q))
    );
  });

  const getValueSuggestions = createMemo(() => {
    const idx = focusedValue();
    if (idx === null) return [];
    const key = props.items[idx]?.key?.toLowerCase();
    const q = valueFilter().toLowerCase();
    if (key === "content-type" || key === "accept") {
      const opts = key === "accept" ? [...COMMON_CONTENT_TYPES, "*/*"] : COMMON_CONTENT_TYPES;
      return opts.filter(v => q === "" || v.toLowerCase().includes(q));
    }
    if (key === "cache-control") {
      return ["no-cache", "no-store", "max-age=0", "max-age=3600", "must-revalidate"].filter(v => q === "" || v.toLowerCase().includes(q));
    }
    if (key === "accept-encoding") {
      return ["gzip", "deflate", "br", "gzip, deflate, br"].filter(v => q === "" || v.toLowerCase().includes(q));
    }
    return [];
  });

  const addRow = () => {
    props.onChange([...props.items, { key: "", value: "", enabled: true }]);
  };

  const updateRow = (index: number, field: keyof KeyValue, value: string | boolean) => {
    const newItems = [...props.items];
    newItems[index] = { ...newItems[index], [field]: value };
    props.onChange(newItems);
  };

  const removeRow = (index: number) => {
    props.onChange(props.items.filter((_, i) => i !== index));
  };

  const selectKeySuggestion = (index: number, key: string) => {
    updateRow(index, "key", key);
    setFocusedKey(null);
    setKeyFilter("");
  };

  const selectValueSuggestion = (index: number, value: string) => {
    updateRow(index, "value", value);
    setFocusedValue(null);
    setValueFilter("");
  };

  return (
    <div class="kv-grid">
      <div class="kv-header">
        <span class="kv-check-col"></span>
        <span class="kv-key">KEY</span>
        <span class="kv-value">VALUE</span>
        <span class="kv-actions-col"></span>
      </div>
      <For each={props.items}>
        {(item, index) => (
          <div class={`kv-row ${!item.enabled ? "disabled" : ""}`}>
            <label class="kv-check-col">
              <input
                type="checkbox"
                class="kv-checkbox"
                checked={item.enabled}
                onChange={(e) => updateRow(index(), "enabled", e.currentTarget.checked)}
              />
              <span class="kv-checkbox-custom" />
            </label>
            <div class="kv-cell">
              <input
                class="kv-input"
                placeholder={props.placeholder?.key || "Key"}
                value={item.key}
                onInput={(e) => {
                  updateRow(index(), "key", e.currentTarget.value);
                  setKeyFilter(e.currentTarget.value);
                }}
                onFocus={() => { setFocusedKey(index()); setKeyFilter(item.key); }}
                onBlur={() => setTimeout(() => setFocusedKey(null), 150)}
              />
              <Show when={hasSuggestions() && focusedKey() === index() && filteredKeySuggestions().length > 0}>
                <div class="kv-suggestions">
                  <For each={filteredKeySuggestions().slice(0, 8)}>
                    {(s) => (
                      <button
                        class="kv-suggestion-item"
                        onMouseDown={(e) => { e.preventDefault(); selectKeySuggestion(index(), s); }}
                      >
                        {s}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <div class="kv-cell">
              <input
                class="kv-input"
                placeholder={props.placeholder?.value || "Value"}
                value={item.value}
                onInput={(e) => {
                  updateRow(index(), "value", e.currentTarget.value);
                  setValueFilter(e.currentTarget.value);
                }}
                onFocus={() => { setFocusedValue(index()); setValueFilter(item.value); }}
                onBlur={() => setTimeout(() => setFocusedValue(null), 150)}
              />
              <Show when={focusedValue() === index() && getValueSuggestions().length > 0}>
                <div class="kv-suggestions">
                  <For each={getValueSuggestions().slice(0, 8)}>
                    {(s) => (
                      <button
                        class="kv-suggestion-item"
                        onMouseDown={(e) => { e.preventDefault(); selectValueSuggestion(index(), s); }}
                      >
                        {s}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <button class="kv-delete-btn" onClick={() => removeRow(index())} title="Remove">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
        )}
      </For>
      <button class="kv-add-btn" onClick={addRow}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" />
        </svg>
        Add
      </button>
    </div>
  );
};

export { COMMON_HEADERS };
