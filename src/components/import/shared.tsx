import { Component, JSX } from "solid-js";

// --- File reading helper ---

export async function readJsonFile(e: Event): Promise<string | null> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return null;
  return file.text();
}

// --- File picker dropzone ---

export const FilePickerDropzone: Component<{
  onChange: (e: Event) => void;
}> = (props) => (
  <div style={{ "margin-bottom": "12px" }}>
    <label
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "8px",
        padding: "8px 16px",
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        "border-radius": "var(--radius-md)",
        cursor: "pointer",
        "font-size": "13px",
        color: "var(--text-secondary)",
        transition: "all 200ms",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      Choose .json file
      <input
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={props.onChange}
      />
    </label>
  </div>
);

// --- Modal wrapper ---

export const ImportModalWrapper: Component<{
  title: string;
  embedded?: boolean;
  onClose: () => void;
  children: JSX.Element;
}> = (props) => {
  if (props.embedded) return <>{props.children}</>;

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()} style={{ width: "640px" }}>
        <div class="modal-header">
          <h3>{props.title}</h3>
          <button class="icon-btn" onClick={props.onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
};
