import { Component, Show, For, createSignal, Match, Switch, createMemo, createEffect, onCleanup, onMount } from "solid-js";
import type { HttpResponse, KeyValue } from "../../lib/api";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { createCssVariablesTheme } from "shiki/core";

interface Props {
  response: HttpResponse | null;
  loading: boolean;
}

type ResponseTab = "body" | "headers" | "timing";
type SyntaxLang = "json" | "html" | "xml" | "css" | "javascript" | "plaintext";

const LANG_OPTIONS: { value: SyntaxLang; label: string }[] = [
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JavaScript" },
  { value: "plaintext", label: "Plain Text" },
];

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

function detectLanguage(headers: KeyValue[], body: string): SyntaxLang {
  const ct = headers.find(h => h.key.toLowerCase() === "content-type")?.value?.toLowerCase() || "";
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("css")) return "css";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "javascript";
  // Fallback: try parsing as JSON
  try { JSON.parse(body); return "json"; } catch {}
  return "plaintext";
}

// --- Shiki highlighter singleton ---

const shikiTheme = createCssVariablesTheme({
  name: "tenso-vars",
  variablePrefix: "--shiki-",
  variableDefaults: {},
  fontStyle: true,
});

type HighlighterCore = Awaited<ReturnType<typeof createHighlighterCore>>;
let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [shikiTheme],
      langs: [
        import("shiki/langs/json.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/xml.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/javascript.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

interface ShikiToken {
  content: string;
  color?: string;
  fontStyle?: number;
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
                      <span class="json-indent-guide" style={{ left: `${i * INDENT_WIDTH + 4}px` }} />
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

// --- Syntax-highlighted code view ---

const SyntaxView: Component<{ code: string; language: SyntaxLang; wrap: boolean }> = (props) => {
  const [tokens, setTokens] = createSignal<ShikiToken[][] | null>(null);

  createEffect(() => {
    const code = props.code;
    const lang = props.language;

    if (lang === "plaintext") {
      setTokens(null);
      return;
    }

    let cancelled = false;
    getHighlighter().then(hl => {
      if (cancelled) return;
      const result = hl.codeToTokens(code, { lang, theme: "tenso-vars" });
      setTokens(result.tokens);
    }).catch(() => {
      if (!cancelled) setTokens(null);
    });
    onCleanup(() => { cancelled = true; });
  });

  return (
    <pre
      class={`response-body syntax-highlight ${props.wrap ? "wrap" : ""}`}
      style={{ "font-family": "var(--font-mono)" }}
    >
      <Show when={tokens()} fallback={props.code}>
        <code>
          <For each={tokens()!}>
            {(line, lineIdx) => (
              <>
                <For each={line}>
                  {(token) => (
                    <span
                      style={{
                        color: token.color || undefined,
                        "font-style": token.fontStyle && (token.fontStyle & 1) ? "italic" : undefined,
                        "font-weight": token.fontStyle && (token.fontStyle & 2) ? "bold" : undefined,
                      }}
                    >
                      {token.content}
                    </span>
                  )}
                </For>
                {lineIdx() < tokens()!.length - 1 ? "\n" : ""}
              </>
            )}
          </For>
        </code>
      </Show>
    </pre>
  );
};

// --- Language dropdown ---

const LangDropdown: Component<{ value: SyntaxLang; onChange: (lang: SyntaxLang) => void }> = (props) => {
  const [open, setOpen] = createSignal(false);
  let ref: HTMLDivElement | undefined;

  const currentLabel = () => LANG_OPTIONS.find(o => o.value === props.value)?.label ?? "Plain Text";

  onMount(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref && !ref.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    onCleanup(() => document.removeEventListener("mousedown", handleClick));
  });

  return (
    <div class="lang-dropdown-container" ref={ref}>
      <button class="lang-dropdown-trigger" onClick={() => setOpen(!open())}>
        <span class="lang-dropdown-label">{currentLabel()}</span>
        <svg class={`lang-dropdown-chevron ${open() ? "open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      <Show when={open()}>
        <div class="dropdown lang-dropdown-menu">
          <For each={LANG_OPTIONS}>
            {(opt) => (
              <button
                class={`lang-dropdown-item ${props.value === opt.value ? "selected" : ""}`}
                onClick={() => { props.onChange(opt.value); setOpen(false); }}
              >
                <span>{opt.label}</span>
                <Show when={props.value === opt.value}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

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
