import { Component, For, createSignal } from "solid-js";
import type { KeyValue } from "../../lib/api";

interface Props {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  placeholder?: { key: string; value: string };
}

export const KeyValueGrid: Component<Props> = (props) => {
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

  return (
    <div class="kv-grid">
      <div class="kv-header">
        <span class="kv-check"></span>
        <span class="kv-key">Key</span>
        <span class="kv-value">Value</span>
        <span class="kv-actions"></span>
      </div>
      <For each={props.items}>
        {(item, index) => (
          <div class="kv-row">
            <label class="kv-check">
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => updateRow(index(), "enabled", e.currentTarget.checked)}
              />
            </label>
            <input
              class="kv-input"
              placeholder={props.placeholder?.key || "Key"}
              value={item.key}
              onInput={(e) => updateRow(index(), "key", e.currentTarget.value)}
            />
            <input
              class="kv-input"
              placeholder={props.placeholder?.value || "Value"}
              value={item.value}
              onInput={(e) => updateRow(index(), "value", e.currentTarget.value)}
            />
            <button class="icon-btn danger" onClick={() => removeRow(index())}>×</button>
          </div>
        )}
      </For>
      <button class="kv-add-btn" onClick={addRow}>+ Add</button>
    </div>
  );
};
