import { Component, createMemo } from "solid-js";

interface Props {
  method: string;
  url: string;
  loading: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const METHOD_COLORS: Record<string, string> = {
  GET: "var(--method-get)",
  POST: "var(--method-post)",
  PUT: "var(--method-put)",
  DELETE: "var(--method-delete)",
  PATCH: "var(--method-patch)",
  HEAD: "var(--method-head)",
  OPTIONS: "var(--method-options)",
};

export const UrlBar: Component<Props> = (props) => {
  return (
    <div class="url-bar">
      <select
        class="method-select"
        value={props.method}
        onChange={(e) => props.onMethodChange(e.currentTarget.value)}
        style={{ color: METHOD_COLORS[props.method] || "var(--text-primary)" }}
      >
        {METHODS.map((m) => (
          <option value={m} style={{ color: METHOD_COLORS[m] }}>{m}</option>
        ))}
      </select>
      <input
        class="url-input"
        type="text"
        placeholder="Enter URL or paste cURL..."
        value={props.url}
        onInput={(e) => props.onUrlChange(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Enter") props.onSend(); }}
      />
      <button
        class={`send-btn ${props.loading ? "loading" : ""}`}
        onClick={props.onSend}
        disabled={props.loading}
      >
        {props.loading ? "⏳" : "Send"}
      </button>
    </div>
  );
};
