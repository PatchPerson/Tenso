import { Component, Show, For, createSignal, Match, Switch, createMemo } from "solid-js";
import type { HttpResponse, KeyValue } from "../../lib/api";

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

// --- Postman-style line-based JSON renderer ---

interface JsonLine {
  indent: number;
  content: LineContent[];
  collapsible: boolean;
  collapsedPreview?: string;
  groupId?: number;
  isClose?: boolean;
}

type LineContent =
  | { type: "key"; text: string }
  | { type: "string"; text: string }
  | { type: "number"; text: string }
  | { type: "boolean"; text: string }
  | { type: "null" }
  | { type: "bracket"; text: string }
  | { type: "colon" }
  | { type: "comma" }
  | { type: "space" };

let groupCounter = 0;

function jsonToLines(value: unknown, indent: number, isLast: boolean): JsonLine[] {
  const lines: JsonLine[] = [];

  if (value === null) {
    lines.push({
      indent,
      content: [{ type: "null" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (typeof value === "string") {
    lines.push({
      indent,
      content: [{ type: "string", text: `"${value}"` }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (typeof value === "number") {
    lines.push({
      indent,
      content: [{ type: "number", text: String(value) }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (typeof value === "boolean") {
    lines.push({
      indent,
      content: [{ type: "boolean", text: String(value) }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (Array.isArray(value)) {
    const gid = ++groupCounter;
    if (value.length === 0) {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "[]" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
      });
    } else {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "[" }],
        collapsible: true,
        collapsedPreview: `${value.length} items`,
        groupId: gid,
      });
      for (let i = 0; i < value.length; i++) {
        const childLines = jsonToLines(value[i], indent + 1, i === value.length - 1);
        for (const cl of childLines) {
          cl.groupId = cl.groupId || gid;
        }
        lines.push(...childLines);
      }
      lines.push({
        indent,
        content: [{ type: "bracket", text: "]" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
        groupId: gid,
        isClose: true,
      });
    }
  } else if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    const gid = ++groupCounter;
    if (entries.length === 0) {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "{}" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
      });
    } else {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "{" }],
        collapsible: true,
        collapsedPreview: `${entries.length} keys`,
        groupId: gid,
      });
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        const last = i === entries.length - 1;
        // For primitives & empty collections, render key: value on one line
        if (v === null || typeof v !== "object" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && Object.keys(v as object).length === 0)) {
          const valContent = renderValueInline(v);
          lines.push({
            indent: indent + 1,
            content: [
              { type: "key", text: `"${k}"` },
              { type: "colon" },
              { type: "space" },
              ...valContent,
              ...(last ? [] : [{ type: "comma" } as LineContent]),
            ],
            collapsible: false,
            groupId: gid,
          });
        } else {
          // Complex value: key: on the open line, then nested
          const childLines = jsonToLines(v, indent + 1, last);
          if (childLines.length > 0) {
            // Merge key onto the opening bracket line
            const first = childLines[0];
            first.content = [
              { type: "key", text: `"${k}"` },
              { type: "colon" },
              { type: "space" },
              ...first.content,
            ];
            for (const cl of childLines) {
              cl.groupId = cl.groupId || gid;
            }
            lines.push(...childLines);
          }
        }
      }
      lines.push({
        indent,
        content: [{ type: "bracket", text: "}" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
        groupId: gid,
        isClose: true,
      });
    }
  }

  return lines;
}

function renderValueInline(v: unknown): LineContent[] {
  if (v === null) return [{ type: "null" }];
  if (typeof v === "string") return [{ type: "string", text: `"${v}"` }];
  if (typeof v === "number") return [{ type: "number", text: String(v) }];
  if (typeof v === "boolean") return [{ type: "boolean", text: String(v) }];
  if (Array.isArray(v) && v.length === 0) return [{ type: "bracket", text: "[]" }];
  if (typeof v === "object" && v !== null && Object.keys(v).length === 0) return [{ type: "bracket", text: "{}" }];
  return [{ type: "string", text: String(v) }];
}

const ContentSpan: Component<{ c: LineContent }> = (props) => {
  switch (props.c.type) {
    case "key": return <span class="json-key">{props.c.text}</span>;
    case "string": return <span class="json-string">{props.c.text}</span>;
    case "number": return <span class="json-number">{props.c.text}</span>;
    case "boolean": return <span class="json-boolean">{props.c.text}</span>;
    case "null": return <span class="json-null">null</span>;
    case "bracket": return <span class="json-bracket">{props.c.text}</span>;
    case "colon": return <span class="json-colon">:</span>;
    case "comma": return <span class="json-comma">,</span>;
    case "space": return <span>{"\u00A0"}</span>;
    default: return null;
  }
};

const JsonTreeView: Component<{ data: unknown }> = (props) => {
  const allLines = createMemo(() => {
    groupCounter = 0;
    return jsonToLines(props.data, 0, true);
  });

  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<number>>(new Set());

  const toggleGroup = (gid: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  const visibleLines = createMemo(() => {
    const lines = allLines();
    const collapsed = collapsedGroups();
    const result: { line: JsonLine; lineNum: number }[] = [];
    let hideDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (hideDepth > 0) {
        // We're inside a collapsed section — track nesting to find the matching closer
        if (line.collapsible) hideDepth++;
        if (line.isClose) hideDepth--;
        // This line stays hidden (including the closing bracket)
        continue;
      }

      // This line is visible
      result.push({ line, lineNum: i + 1 });

      // If this is a collapsed opener, start hiding everything after it
      if (line.collapsible && line.groupId !== undefined && collapsed.has(line.groupId)) {
        hideDepth = 1;
      }
    }
    return result;
  });

  const INDENT_WIDTH = 20;

  return (
    <div class="json-tree">
      <For each={visibleLines()}>
        {({ line, lineNum }) => {
          const isCollapsed = () => line.collapsible && line.groupId !== undefined && collapsedGroups().has(line.groupId);
          return (
            <div class="json-line">
              <span class="json-gutter">
                <span class="json-line-num">{lineNum}</span>
                <span class="json-arrow-slot">
                  {line.collapsible && (
                    <span class={`json-arrow ${isCollapsed() ? "collapsed" : ""}`} onClick={() => line.groupId !== undefined && toggleGroup(line.groupId)}>
                      {isCollapsed() ? "▶" : "▼"}
                    </span>
                  )}
                </span>
              </span>
              <span class="json-line-body">
                {/* Indent guides */}
                {line.indent > 0 && (
                  <span class="json-indent-guides" style={{ width: `${line.indent * INDENT_WIDTH}px` }}>
                    {Array.from({ length: line.indent }, (_, i) => (
                      <span class="json-indent-guide" style={{ left: `${i * INDENT_WIDTH + 9}px` }} />
                    ))}
                  </span>
                )}
                <span class="json-line-content">
                  <For each={line.content}>
                    {(c) => <ContentSpan c={c} />}
                  </For>
                  {isCollapsed() && (
                    <>
                      <span class="json-collapsed" onClick={() => line.groupId !== undefined && toggleGroup(line.groupId)}>
                        {line.collapsedPreview}
                      </span>
                      <span class="json-bracket">{line.content[line.content.length - 1]?.type === "bracket" && (line.content[line.content.length - 1] as any).text === "[" ? "]" : "}"}</span>
                    </>
                  )}
                </span>
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
};

// --- Main component ---

export const ResponsePanel: Component<Props> = (props) => {
  const [activeTab, setActiveTab] = createSignal<ResponseTab>("body");
  const [wordWrap, setWordWrap] = createSignal(true);
  const [viewMode, setViewMode] = createSignal<"tree" | "raw">("tree");

  const parsedBody = createMemo(() => {
    if (!props.response) return { parsed: null, isJson: false, formatted: "" };
    return tryParseJson(props.response.body);
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
            <Show when={activeTab() === "body" && parsedBody().isJson}>
              <button
                class={`icon-btn small ${viewMode() === "tree" ? "active" : ""}`}
                onClick={() => setViewMode(viewMode() === "tree" ? "raw" : "tree")}
                title={viewMode() === "tree" ? "Raw view" : "Tree view"}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <Show when={viewMode() === "tree"}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </Show>
                  <Show when={viewMode() !== "tree"}>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="6" y1="10" x2="21" y2="10" />
                    <line x1="6" y1="14" x2="21" y2="14" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </Show>
                </svg>
              </button>
            </Show>
            <button
              class={`icon-btn small ${wordWrap() ? "active" : ""}`}
              onClick={() => setWordWrap(!wordWrap())}
              title="Word wrap"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>
        </div>

        <div class="response-content">
          <Switch>
            <Match when={activeTab() === "body"}>
              <Show when={parsedBody().isJson && viewMode() === "tree"} fallback={
                <pre
                  class={`response-body ${wordWrap() ? "wrap" : ""}`}
                  style={{ "font-family": "var(--font-mono)" }}
                >
                  {parsedBody().formatted}
                </pre>
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
