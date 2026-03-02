import { Component, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { globalVars, saveGlobalVars, getGlobalVarNames } from "../../stores/globals";
import { environments, activeEnvId, addEnvironment, saveEnvironment, switchEnvironment, loadEnvironments } from "../../stores/environments";
import { activeWorkspace } from "../../stores/collections";

interface Props {
  method: string;
  url: string;
  protocol: string;
  loading: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onProtocolChange: (protocol: string) => void;
  onSend: () => void;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const DEFAULT_PROTOCOLS = ["https://", "http://", "ws://", "wss://"];

export const UrlBar: Component<Props> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  const [tooltip, setTooltip] = createSignal<{ varName: string; x: number; y: number } | null>(null);
  const [editValue, setEditValue] = createSignal("");
  const [showProtocolMenu, setShowProtocolMenu] = createSignal(false);
  const [showMethodMenu, setShowMethodMenu] = createSignal(false);
  const [customProtocol, setCustomProtocol] = createSignal("");
  const [tooltipLocked, setTooltipLocked] = createSignal(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const urlHasProtocol = createMemo(() => {
    const url = props.url;
    return /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url);
  });

  const highlightedParts = createMemo(() => {
    const url = props.url;
    if (!url) return [];

    const parts: { text: string; isVar: boolean; resolved: boolean; varName: string }[] = [];
    const varNames = getGlobalVarNames();
    let lastIdx = 0;

    const regex = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = regex.exec(url)) !== null) {
      if (match.index > lastIdx) {
        parts.push({ text: url.slice(lastIdx, match.index), isVar: false, resolved: false, varName: "" });
      }
      parts.push({ text: match[0], isVar: true, resolved: varNames.has(match[1]), varName: match[1] });
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < url.length) {
      parts.push({ text: url.slice(lastIdx), isVar: false, resolved: false, varName: "" });
    }
    return parts;
  });

  const hasVars = createMemo(() => highlightedParts().some(p => p.isVar));

  // Compute variable character ranges for hover detection
  const varRanges = createMemo(() => {
    const url = props.url;
    const ranges: { start: number; end: number; varName: string }[] = [];
    const regex = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = regex.exec(url)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, varName: match[1] });
    }
    return ranges;
  });

  // Measure character offset from mouse position on input
  let measureCanvas: HTMLCanvasElement | null = null;
  const getCharIndexAtX = (mouseX: number): number => {
    if (!inputRef) return -1;
    const rect = inputRef.getBoundingClientRect();
    const style = getComputedStyle(inputRef);
    const paddingLeft = parseFloat(style.paddingLeft);
    const x = mouseX - rect.left - paddingLeft + inputRef.scrollLeft;

    if (!measureCanvas) measureCanvas = document.createElement("canvas");
    const ctx = measureCanvas.getContext("2d");
    if (!ctx) return -1;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const text = props.url;
    // Binary search for the character at position x
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const w = ctx.measureText(text.slice(0, mid + 1)).width;
      if (w < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const scheduleClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!tooltipLocked()) {
        setTooltip(null);
      }
    }, 300);
  };

  const cancelClose = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  };

  const handleInputMouseMove = (e: MouseEvent) => {
    if (!hasVars()) return;
    // If tooltip is locked (mouse is inside tooltip), don't change anything
    if (tooltipLocked()) return;

    const charIdx = getCharIndexAtX(e.clientX);
    const ranges = varRanges();
    const hoveredVar = ranges.find(r => charIdx >= r.start && charIdx < r.end);
    if (hoveredVar) {
      cancelClose();
      const currentTip = tooltip();
      // Only update if different variable or no tooltip yet
      if (!currentTip || currentTip.varName !== hoveredVar.varName) {
        const info = getVarInfo(hoveredVar.varName);
        setEditValue(info.value || "");
        const rect = inputRef!.getBoundingClientRect();
        setTooltip({ varName: hoveredVar.varName, x: e.clientX - 40, y: rect.bottom + 4 });
      }
    } else {
      // Mouse moved off variable - use delayed close so user can reach the tooltip
      if (tooltip()) {
        scheduleClose();
      }
    }
  };

  const handleInputMouseLeave = (e: MouseEvent) => {
    const related = e.relatedTarget as HTMLElement;
    if (related?.closest?.(".url-var-tooltip")) {
      // Moving to tooltip - lock it open
      setTooltipLocked(true);
      cancelClose();
      return;
    }
    // Leaving input but not to tooltip - delayed close
    if (tooltip()) {
      scheduleClose();
    }
  };

  const handleTooltipMouseEnter = () => {
    setTooltipLocked(true);
    cancelClose();
  };

  const handleTooltipMouseLeave = () => {
    setTooltipLocked(false);
    scheduleClose();
  };

  const syncScroll = () => {
    const overlay = inputRef?.parentElement?.querySelector(".url-highlight-overlay") as HTMLElement;
    if (overlay && inputRef) {
      overlay.scrollLeft = inputRef.scrollLeft;
    }
  };

  const getVarInfo = (varName: string): { value: string | null; source: string; sourceType: "G" | "E" | null } => {
    // Check active environment first (higher priority)
    const envId = activeEnvId();
    if (envId) {
      const env = environments().find(e => e.id === envId);
      if (env) {
        const ev = env.variables.find(v => v.key === varName && v.enabled);
        if (ev) return { value: ev.value, source: env.name, sourceType: "E" };
      }
    }
    // Then check globals
    const v = globalVars().find(v => v.key === varName && v.enabled);
    if (v) return { value: v.value, source: "Globals", sourceType: "G" };
    return { value: null, source: "", sourceType: null };
  };

  const getVarValue = (varName: string): string | null => {
    return getVarInfo(varName).value;
  };

  const hideTooltip = () => {
    cancelClose();
    setTooltipLocked(false);
    setTooltip(null);
  };

  const saveVarValue = async (varName: string, value: string) => {
    const wsId = activeWorkspace();
    let envId = activeEnvId();

    // If no active environment, create a default one
    if (!envId && wsId) {
      await addEnvironment(wsId, "Default");
      await loadEnvironments(wsId);
      const envs = environments();
      const defaultEnv = envs.find(e => e.name === "Default");
      if (defaultEnv) {
        await switchEnvironment(defaultEnv.id);
        envId = defaultEnv.id;
      }
    }

    // Save to active environment
    if (envId) {
      const env = environments().find(e => e.id === envId);
      if (env) {
        const vars = [...env.variables];
        const idx = vars.findIndex(v => v.key === varName);
        if (idx >= 0) {
          vars[idx] = { ...vars[idx], value, enabled: true };
        } else {
          vars.push({ key: varName, value, enabled: true });
        }
        await saveEnvironment({ ...env, variables: vars });
      }
    }

    // Also save to global vars as fallback
    const gvars = [...globalVars()];
    const gidx = gvars.findIndex(v => v.key === varName);
    if (gidx >= 0) {
      gvars[gidx] = { ...gvars[gidx], value, enabled: true };
    } else {
      gvars.push({ key: varName, value, enabled: true });
    }
    saveGlobalVars(gvars);
  };

  const closeTooltipOnClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".url-var-tooltip")) {
      setTooltip(null);
    }
  };

  const closeProtocolOnClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".protocol-pill-container")) {
      setShowProtocolMenu(false);
    }
  };

  const closeMethodOnClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".method-dropdown-container")) {
      setShowMethodMenu(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", closeTooltipOnClick);
    document.addEventListener("click", closeProtocolOnClick);
    document.addEventListener("click", closeMethodOnClick);
    onCleanup(() => {
      document.removeEventListener("mousedown", closeTooltipOnClick);
      document.removeEventListener("click", closeProtocolOnClick);
      document.removeEventListener("click", closeMethodOnClick);
      if (closeTimer) clearTimeout(closeTimer);
    });
  });

  return (
    <div class="url-bar">
      <div class="method-dropdown-container">
        <button
          class={`method-select ${props.method.toLowerCase()}`}
          onClick={() => setShowMethodMenu(!showMethodMenu())}
        >
          {props.method}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ "margin-left": "6px" }}>
            <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <Show when={showMethodMenu()}>
          <div class="dropdown method-menu">
            {METHODS.map((m) => (
              <button
                class={`dropdown-item method-menu-item ${props.method === m ? "active" : ""} ${m.toLowerCase()}`}
                onClick={(e) => { e.stopPropagation(); props.onMethodChange(m); setShowMethodMenu(false); }}
              >
                {m}
              </button>
            ))}
          </div>
        </Show>
      </div>

      <Show when={!urlHasProtocol()}>
        <div class="protocol-pill-container">
          <button
            class="protocol-pill"
            onClick={() => setShowProtocolMenu(!showProtocolMenu())}
            title="Protocol"
          >
            {props.protocol || "http://"}
          </button>
          <Show when={showProtocolMenu()}>
            <div class="dropdown protocol-menu">
              {DEFAULT_PROTOCOLS.map(p => (
                <button
                  class={`dropdown-item protocol-menu-item ${props.protocol === p ? "active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); props.onProtocolChange(p); setShowProtocolMenu(false); }}
                >
                  {p}
                </button>
              ))}
              <div class="dropdown-sep" />
              <div class="protocol-custom-row">
                <input
                  class="protocol-custom-input"
                  placeholder="custom://"
                  value={customProtocol()}
                  onInput={(e) => setCustomProtocol(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customProtocol().trim()) {
                      let proto = customProtocol().trim();
                      if (!proto.endsWith("://")) proto += "://";
                      props.onProtocolChange(proto);
                      setCustomProtocol("");
                      setShowProtocolMenu(false);
                    }
                  }}
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <div class="url-input-wrapper">
        {hasVars() && (
          <div class="url-highlight-overlay" aria-hidden="true">
            {highlightedParts().map(part =>
              part.isVar
                ? <span class={`url-var ${part.resolved ? "" : "unresolved"}`}>{part.text}</span>
                : <span>{part.text}</span>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          class={`url-input ${hasVars() ? "has-vars" : ""}`}
          type="text"
          spellcheck={false}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          placeholder="Enter request URL..."
          value={props.url}
          onInput={(e) => props.onUrlChange(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") props.onSend(); }}
          onScroll={syncScroll}
          onMouseMove={handleInputMouseMove}
          onMouseLeave={handleInputMouseLeave}
        />
      </div>
      <button
        class={`send-btn ${props.loading ? "loading" : ""}`}
        onClick={(e) => {
          const btn = e.currentTarget;
          btn.classList.remove("clicked");
          void btn.offsetWidth;
          btn.classList.add("clicked");
          props.onSend();
        }}
        disabled={props.loading}
      >
        {props.loading ? (
          <>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 0.7s linear infinite" }}>
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" opacity="0.3" />
              <path d="M14 8A6 6 0 0 0 8 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Sending
          </>
        ) : (
          <>
            Send
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ "margin-left": "4px" }}>
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </>
        )}
      </button>

      <Show when={tooltip()}>
        {(tip) => {
          const info = () => getVarInfo(tip().varName);
          return (
            <div
              class="url-var-tooltip"
              style={{ left: `${tip().x}px`, top: `${tip().y}px` }}
              onMouseEnter={handleTooltipMouseEnter}
              onMouseLeave={handleTooltipMouseLeave}
            >
              {info().value !== null ? (
                <div class="url-var-tooltip-resolved">{info().value}</div>
              ) : (
                <div class="url-var-tooltip-empty">Unresolved variable</div>
              )}
              <div class="url-var-tooltip-input-row">
                <input
                  class="url-var-tooltip-input"
                  placeholder="Set value..."
                  value={editValue()}
                  onInput={(e) => setEditValue(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      saveVarValue(tip().varName, editValue());
                      hideTooltip();
                    }
                    if (e.key === "Escape") hideTooltip();
                  }}
                />
              </div>
              {info().sourceType !== null && (
                <div class="url-var-tooltip-footer">
                  <span class="url-var-tooltip-source">
                    <span class="url-var-tooltip-source-badge">{info().sourceType}</span>
                    {info().source}
                  </span>
                </div>
              )}
            </div>
          );
        }}
      </Show>
    </div>
  );
};
