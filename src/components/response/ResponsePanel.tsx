import { Component, Show, Match, Switch, createSignal, createMemo, createEffect } from "solid-js";
import type { HttpResponse } from "../../lib/api";
import { JsonTreeView } from "./JsonTreeView";
import { SyntaxView, LangDropdown, detectLanguage, type SyntaxLang } from "./SyntaxView";

interface Props {
  response: HttpResponse | null;
  loading: boolean;
}

type ResponseTab = "body" | "headers" | "timing";

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "success";
  if (status >= 400 && status < 500) return "warning";
  return "error";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tryParseJson(text: string): { parsed: unknown; isJson: boolean; formatted: string } {
  try {
    const parsed = JSON.parse(text);
    return { parsed, isJson: true, formatted: JSON.stringify(parsed, null, 2) };
  } catch {
    return { parsed: null, isJson: false, formatted: text };
  }
}

// --- Main component ---

export const ResponsePanel: Component<Props> = (props) => {
  const [activeTab, setActiveTab] = createSignal<ResponseTab>("body");
  const [wordWrap, setWordWrap] = createSignal(true);
  const [viewMode, setViewMode] = createSignal<"tree" | "raw">("tree");
  const [languageOverride, setLanguageOverride] = createSignal<SyntaxLang | null>(null);
  const [copied, setCopied] = createSignal(false);

  const parsedBody = createMemo(() => {
    if (!props.response) return { parsed: null, isJson: false, formatted: "" };
    return tryParseJson(props.response.body);
  });

  const detectedLang = createMemo((): SyntaxLang => {
    if (!props.response) return "plaintext";
    return detectLanguage(props.response.headers, props.response.body);
  });

  const language = createMemo((): SyntaxLang => languageOverride() ?? detectedLang());

  // Reset override when response changes
  createEffect(() => {
    props.response;
    setLanguageOverride(null);
  });

  const isJson = () => language() === "json" && parsedBody().isJson;

  const copyBody = () => {
    const text = language() === "json" && parsedBody().isJson
      ? parsedBody().formatted
      : props.response?.body || "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

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
          <span class="response-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </span>
          <span style={{ "font-size": "13px" }}>Send a request to see the response</span>
        </div>
      </Show>

      <Show when={!props.loading && props.response}>
        <div class="response-meta">
          <span class={`response-status ${getStatusClass(props.response!.status)}`}>
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
            <Show when={activeTab() === "body"}>
              {/* Language dropdown */}
              <LangDropdown
                value={language()}
                onChange={(val) => setLanguageOverride(val)}
              />

              {/* Tree/Raw toggle — only for JSON */}
              <Show when={isJson()}>
                <button
                  class={`icon-btn small ${viewMode() === "tree" ? "active" : ""}`}
                  onClick={() => setViewMode(viewMode() === "tree" ? "raw" : "tree")}
                  title={viewMode() === "tree" ? "Raw view" : "Tree view"}
                >
                  <Show when={viewMode() === "tree"} fallback={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17 10H3" /><path d="M21 6H3" /><path d="M21 14H3" /><path d="M17 18H3" />
                    </svg>
                  }>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="4 7 4 4 20 4 20 7" /><polyline points="4 17 4 20 20 20 20 17" /><line x1="12" y1="4" x2="12" y2="20" />
                    </svg>
                  </Show>
                </button>
              </Show>

              {/* Word wrap toggle */}
              <button
                class={`icon-btn small ${wordWrap() ? "active" : ""}`}
                onClick={() => setWordWrap(!wordWrap())}
                title="Word wrap"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" /><path d="M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="13 16 11 18 13 20" />
                </svg>
              </button>

              {/* Copy button */}
              <button
                class={`icon-btn small ${copied() ? "active" : ""}`}
                onClick={copyBody}
                title={copied() ? "Copied!" : "Copy response"}
              >
                <Show when={copied()} fallback={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                }>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </Show>
              </button>
            </Show>
          </div>
        </div>

        <div class="response-content">
          <Switch>
            <Match when={activeTab() === "body"}>
              <Show when={isJson() && viewMode() === "tree"} fallback={
                <SyntaxView
                  code={language() === "json" && parsedBody().isJson ? parsedBody().formatted : (props.response?.body || "")}
                  language={language()}
                  wrap={wordWrap()}
                />
              }>
                <div class={`response-body json-tree-container ${wordWrap() ? "wrap" : ""}`}>
                  <JsonTreeView data={parsedBody().parsed} />
                </div>
              </Show>
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
