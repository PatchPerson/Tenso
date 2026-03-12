import { Component, Show, For, createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { createCssVariablesTheme } from "shiki/core";
import type { KeyValue } from "../../lib/api";

export type SyntaxLang = "json" | "html" | "xml" | "css" | "javascript" | "plaintext";

export const LANG_OPTIONS: { value: SyntaxLang; label: string }[] = [
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JavaScript" },
  { value: "plaintext", label: "Plain Text" },
];

export function detectLanguage(headers: KeyValue[], body: string): SyntaxLang {
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

interface ShikiToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

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

// --- Syntax-highlighted code view ---

export const SyntaxView: Component<{ code: string; language: SyntaxLang; wrap: boolean }> = (props) => {
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

export const LangDropdown: Component<{ value: SyntaxLang; onChange: (lang: SyntaxLang) => void }> = (props) => {
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
