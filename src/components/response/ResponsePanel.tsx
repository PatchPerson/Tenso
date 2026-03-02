import { Component, Show, createSignal, Match, Switch, createMemo } from "solid-js";
import type { HttpResponse, KeyValue } from "../../lib/api";

interface Props {
  response: HttpResponse | null;
  loading: boolean;
}

type ResponseTab = "body" | "headers" | "timing";

const STATUS_COLORS: Record<string, string> = {
  "2": "var(--success)",
  "3": "var(--accent)",
  "4": "var(--warning)",
  "5": "var(--error)",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tryFormatJson(text: string): { formatted: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(text);
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { formatted: text, isJson: false };
  }
}

export const ResponsePanel: Component<Props> = (props) => {
  const [activeTab, setActiveTab] = createSignal<ResponseTab>("body");
  const [wordWrap, setWordWrap] = createSignal(true);

  const formattedBody = createMemo(() => {
    if (!props.response) return { formatted: "", isJson: false };
    return tryFormatJson(props.response.body);
  });

  return (
    <div class="response-panel">
      <Show when={props.loading}>
        <div class="response-loading">
          <div class="spinner"></div>
          <span>Sending request...</span>
        </div>
      </Show>

      <Show when={!props.loading && !props.response}>
        <div class="response-empty">
          <span class="response-empty-icon">⚡</span>
          <span>Send a request to see the response</span>
        </div>
      </Show>

      <Show when={!props.loading && props.response}>
        <div class="response-meta">
          <span
            class="response-status"
            style={{ color: STATUS_COLORS[String(props.response!.status)[0]] || "var(--text-primary)" }}
          >
            {props.response!.status} {props.response!.status_text}
          </span>
          <span class="response-timing">{props.response!.timing.total_ms}ms</span>
          <span class="response-size">{formatBytes(props.response!.size_bytes)}</span>
        </div>

        <div class="response-tabs">
          {(["body", "headers", "timing"] as ResponseTab[]).map((tab) => (
            <button
              class={`request-tab ${activeTab() === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <Show when={tab === "headers"}>
                <span class="tab-count">{props.response!.headers.length}</span>
              </Show>
            </button>
          ))}
          <div class="response-tab-actions">
            <button
              class={`icon-btn small ${wordWrap() ? "active" : ""}`}
              onClick={() => setWordWrap(!wordWrap())}
              title="Word wrap"
            >↩</button>
          </div>
        </div>

        <div class="response-content">
          <Switch>
            <Match when={activeTab() === "body"}>
              <pre
                class={`response-body ${wordWrap() ? "wrap" : ""}`}
                style={{ "font-family": "var(--font-mono)" }}
              >
                {formattedBody().formatted}
              </pre>
            </Match>
            <Match when={activeTab() === "headers"}>
              <div class="response-headers">
                {props.response!.headers.map((h) => (
                  <div class="response-header-row">
                    <span class="header-key">{h.key}</span>
                    <span class="header-value">{h.value}</span>
                  </div>
                ))}
              </div>
            </Match>
            <Match when={activeTab() === "timing"}>
              <div class="timing-chart">
                <div class="timing-row">
                  <span class="timing-label">DNS Lookup</span>
                  <div class="timing-bar-container">
                    <div class="timing-bar dns" style={{ width: `${Math.max(2, (props.response!.timing.dns_ms / Math.max(1, props.response!.timing.total_ms)) * 100)}%` }} />
                  </div>
                  <span class="timing-value">{props.response!.timing.dns_ms}ms</span>
                </div>
                <div class="timing-row">
                  <span class="timing-label">Connection</span>
                  <div class="timing-bar-container">
                    <div class="timing-bar connect" style={{ width: `${Math.max(2, (props.response!.timing.connect_ms / Math.max(1, props.response!.timing.total_ms)) * 100)}%` }} />
                  </div>
                  <span class="timing-value">{props.response!.timing.connect_ms}ms</span>
                </div>
                <div class="timing-row">
                  <span class="timing-label">TLS</span>
                  <div class="timing-bar-container">
                    <div class="timing-bar tls" style={{ width: `${Math.max(2, (props.response!.timing.tls_ms / Math.max(1, props.response!.timing.total_ms)) * 100)}%` }} />
                  </div>
                  <span class="timing-value">{props.response!.timing.tls_ms}ms</span>
                </div>
                <div class="timing-row">
                  <span class="timing-label">First Byte</span>
                  <div class="timing-bar-container">
                    <div class="timing-bar ttfb" style={{ width: `${Math.max(2, (props.response!.timing.first_byte_ms / Math.max(1, props.response!.timing.total_ms)) * 100)}%` }} />
                  </div>
                  <span class="timing-value">{props.response!.timing.first_byte_ms}ms</span>
                </div>
                <div class="timing-row">
                  <span class="timing-label">Download</span>
                  <div class="timing-bar-container">
                    <div class="timing-bar download" style={{ width: `${Math.max(2, (props.response!.timing.download_ms / Math.max(1, props.response!.timing.total_ms)) * 100)}%` }} />
                  </div>
                  <span class="timing-value">{props.response!.timing.download_ms}ms</span>
                </div>
                <div class="timing-row total">
                  <span class="timing-label">Total</span>
                  <div class="timing-bar-container">
                    <div class="timing-bar total" style={{ width: "100%" }} />
                  </div>
                  <span class="timing-value">{props.response!.timing.total_ms}ms</span>
                </div>
              </div>
            </Match>
          </Switch>
        </div>
      </Show>
    </div>
  );
};
