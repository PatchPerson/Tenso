import { Component, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { globalVars, saveGlobalVars, getGlobalVarNames } from "../../stores/globals";
import { environments, activeEnvId, addEnvironment, saveEnvironment, switchEnvironment, loadEnvironments } from "../../stores/environments";
import { activeWorkspace } from "../../stores/collections";
import { detectProtocol } from "../../stores/request";
import * as api from "../../lib/api";

interface Props {
  method: string;
  url: string;
  protocolType: "http" | "ws";
  secure: boolean;
  loading: boolean;
  wsStatus: "disconnected" | "connecting" | "connected";
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onProtocolTypeChange: (type: "http" | "ws") => void;
  onSecureChange: (secure: boolean) => void;
  onSend: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onCurlPaste?: (parsed: { method: string; url: string; headers: api.KeyValue[]; params: api.KeyValue[]; body: api.RequestBody; auth: api.AuthConfig }) => void;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const PROTOCOL_TYPES: Array<"http" | "ws"> = ["http", "ws"];

export const UrlBar: Component<Props> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  const [tooltip, setTooltip] = createSignal<{ varName: string; x: number; y: number } | null>(null);
  const [editValue, setEditValue] = createSignal("");
  const [showMethodMenu, setShowMethodMenu] = createSignal(false);
  const [showProtocolTypeMenu, setShowProtocolTypeMenu] = createSignal(false);
  const [tooltipLocked, setTooltipLocked] = createSignal(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const isWs = createMemo(() => props.protocolType === "ws");

  const effectiveProtocol = createMemo(() => {
    if (props.protocolType === "ws") return props.secure ? "WSS" : "WS";
    return props.secure ? "HTTPS" : "HTTP";
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
    if (tooltipLocked()) return;

    const charIdx = getCharIndexAtX(e.clientX);
    const ranges = varRanges();
    const hoveredVar = ranges.find(r => charIdx >= r.start && charIdx < r.end);
    if (hoveredVar) {
      cancelClose();
      const currentTip = tooltip();
      if (!currentTip || currentTip.varName !== hoveredVar.varName) {
        const info = getVarInfo(hoveredVar.varName);
        setEditValue(info.value || "");
        const rect = inputRef!.getBoundingClientRect();
        setTooltip({ varName: hoveredVar.varName, x: e.clientX - 40, y: rect.bottom + 4 });
      }
    } else {
      if (tooltip()) {
        scheduleClose();
      }
    }
  };

  const handleInputMouseLeave = (e: MouseEvent) => {
    const related = e.relatedTarget as HTMLElement;
    if (related?.closest?.(".url-var-tooltip")) {
      setTooltipLocked(true);
      cancelClose();
      return;
    }
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
    const envId = activeEnvId();
    if (envId) {
      const env = environments().find(e => e.id === envId);
      if (env) {
        const ev = env.variables.find(v => v.key === varName && v.enabled);
        if (ev) return { value: ev.value, source: env.name, sourceType: "E" };
      }
    }
    const v = globalVars().find(v => v.key === varName && v.enabled);
    if (v) return { value: v.value, source: "Globals", sourceType: "G" };
    return { value: null, source: "", sourceType: null };
  };

  const hideTooltip = () => {
    cancelClose();
    setTooltipLocked(false);
    setTooltip(null);
  };

  const saveVarValue = async (varName: string, value: string) => {
    const wsId = activeWorkspace();
    let envId = activeEnvId();

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

  const extractQueryParams = (url: string): { baseUrl: string; params: api.KeyValue[] } => {
    const qIdx = url.indexOf("?");
    if (qIdx === -1) return { baseUrl: url, params: [] };
    const baseUrl = url.slice(0, qIdx);
    const queryStr = url.slice(qIdx + 1);
    const params: api.KeyValue[] = [];
    for (const pair of queryStr.split("&")) {
      if (!pair) continue;
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) {
        params.push({ key: decodeURIComponent(pair), value: "", enabled: true });
      } else {
        params.push({
          key: decodeURIComponent(pair.slice(0, eqIdx)),
          value: decodeURIComponent(pair.slice(eqIdx + 1)),
          enabled: true,
        });
      }
    }
    return { baseUrl, params };
  };

  const handlePaste = async (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text")?.trim();
    if (!text) return;

    // Detect cURL commands
    if (/^curl\s/i.test(text) && props.onCurlPaste) {
      e.preventDefault();
      try {
        const parsed = await api.importCurl(text);
        const { baseUrl, params: queryParams } = extractQueryParams(parsed.url);
        const allParams = [...(parsed.params || []), ...queryParams];
        props.onCurlPaste({
          method: parsed.method,
          url: queryParams.length > 0 ? baseUrl : parsed.url,
          headers: parsed.headers,
          params: allParams,
          body: parsed.body,
          auth: parsed.auth,
        });
      } catch {
        props.onUrlChange(text);
      }
      return;
    }

    // Auto-detect protocol from pasted URL
    const detected = detectProtocol(text);
    if (detected) {
      e.preventDefault();
      props.onProtocolTypeChange(detected.protocolType);
      props.onSecureChange(detected.secure);
      props.onUrlChange(detected.bareUrl);
    }
  };

  const closeMethodOnClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".method-dropdown-container")) {
      setShowMethodMenu(false);
    }
  };

  const closeProtocolTypeOnClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".protocol-type-dropdown-container")) {
      setShowProtocolTypeMenu(false);
    }
  };

  const handleAction = () => {
    if (isWs()) {
      if (props.wsStatus === "connected") {
        props.onDisconnect();
      } else if (props.wsStatus === "disconnected") {
        props.onConnect();
      }
    } else {
      props.onSend();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleAction();
  };

  onMount(() => {
    document.addEventListener("mousedown", closeTooltipOnClick);
    document.addEventListener("click", closeMethodOnClick);
    document.addEventListener("click", closeProtocolTypeOnClick);
    onCleanup(() => {
      document.removeEventListener("mousedown", closeTooltipOnClick);
      document.removeEventListener("click", closeMethodOnClick);
      document.removeEventListener("click", closeProtocolTypeOnClick);
      if (closeTimer) clearTimeout(closeTimer);
    });
  });

  return (
    <div class="url-bar">
      {/* Method dropdown — only for HTTP */}
      <Show when={!isWs()}>
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
      </Show>

      {/* Protocol type dropdown (HTTP / WS) */}
      <div class="protocol-type-dropdown-container">
        <button
          class={`protocol-type-select ${props.protocolType}`}
          onClick={() => setShowProtocolTypeMenu(!showProtocolTypeMenu())}
        >
          {props.protocolType.toUpperCase()}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ "margin-left": "6px" }}>
            <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <Show when={showProtocolTypeMenu()}>
          <div class="dropdown protocol-type-menu">
            {PROTOCOL_TYPES.map((pt) => (
              <button
                class={`dropdown-item protocol-type-menu-item ${props.protocolType === pt ? "active" : ""}`}
                onClick={(e) => { e.stopPropagation(); props.onProtocolTypeChange(pt); setShowProtocolTypeMenu(false); }}
              >
                {pt.toUpperCase()}
              </button>
            ))}
          </div>
        </Show>
      </div>

      {/* URL input with lock icon */}
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
        <button
          class={`url-lock-icon ${props.secure ? "locked" : "unlocked"}`}
          onClick={() => props.onSecureChange(!props.secure)}
          title={effectiveProtocol()}
        >
          <Show when={props.secure} fallback={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
            </svg>
          }>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
            </svg>
          </Show>
        </button>
        <input
          ref={inputRef}
          class={`url-input has-lock ${hasVars() ? "has-vars" : ""}`}
          type="text"
          spellcheck={false}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          placeholder={isWs() ? "Enter WebSocket URL..." : "Enter request URL..."}
          value={props.url}
          onInput={(e) => props.onUrlChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onScroll={syncScroll}
          onMouseMove={handleInputMouseMove}
          onMouseLeave={handleInputMouseLeave}
        />
      </div>

      {/* Action button */}
      <Show when={isWs()} fallback={
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
      }>
        {/* WS action buttons */}
        <Show when={props.wsStatus === "connecting"}>
          <button class="send-btn ws-connecting" disabled>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 0.7s linear infinite" }}>
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" opacity="0.3" />
              <path d="M14 8A6 6 0 0 0 8 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Connecting
          </button>
        </Show>
        <Show when={props.wsStatus === "disconnected"}>
          <button class="send-btn ws-connect" onClick={props.onConnect}>
            Connect
          </button>
        </Show>
        <Show when={props.wsStatus === "connected"}>
          <button class="send-btn ws-disconnect" onClick={props.onDisconnect}>
            <span class="ws-connected-dot" />
            Disconnect
          </button>
        </Show>
      </Show>

      {/* Variable tooltip */}
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
