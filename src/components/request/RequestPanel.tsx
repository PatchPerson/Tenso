import { Component, Show, createSignal, createMemo } from "solid-js";
import { UrlBar } from "./UrlBar";
import { KeyValueGrid, COMMON_HEADERS } from "../shared/KeyValueGrid";
import { BodyEditor } from "./BodyEditor";
import { AuthEditor } from "./AuthEditor";
import { WsMessagesTab } from "./WsMessagesTab";
import { isWebSocketTab, switchProtocolType, connectWebSocket, disconnectWebSocket } from "../../stores/request";
import type { Tab } from "../../stores/request";
import type { KeyValue, RequestBody, AuthConfig } from "../../lib/api";
import { activeWorkspace } from "../../stores/collections";

function parseQueryParams(url: string): KeyValue[] {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return [];
  const queryStr = url.slice(qIdx + 1);
  const params: KeyValue[] = [];
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
  return params;
}

function buildUrlWithParams(baseUrl: string, params: KeyValue[]): string {
  const enabled = params.filter(p => p.enabled && p.key);
  if (enabled.length === 0) return baseUrl;
  const qs = enabled.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
  return `${baseUrl}?${qs}`;
}

function getBaseUrl(url: string): string {
  const qIdx = url.indexOf("?");
  return qIdx === -1 ? url : url.slice(0, qIdx);
}

interface Props {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
  onSend: () => void;
}

type HttpTab = "params" | "headers" | "body" | "auth" | "scripts";
type WsTab = "messages" | "headers" | "auth";

export const RequestPanel: Component<Props> = (props) => {
  const [activeHttpSection, setActiveHttpSection] = createSignal<HttpTab>("params");
  const [activeWsSection, setActiveWsSection] = createSignal<WsTab>("messages");

  const isWs = createMemo(() => isWebSocketTab(props.tab));

  const handleUrlChange = (url: string) => {
    const params = parseQueryParams(url);
    props.onUpdate({ url, params });
  };

  const handleParamsChange = (params: KeyValue[]) => {
    const base = getBaseUrl(props.tab.url);
    const url = buildUrlWithParams(base, params);
    props.onUpdate({ params, url });
  };

  const handleProtocolTypeChange = (type: "http" | "ws") => {
    switchProtocolType(props.tab.id, type);
  };

  const handleConnect = () => {
    connectWebSocket(props.tab.id);
  };

  const handleDisconnect = () => {
    disconnectWebSocket(props.tab.id);
  };

  return (
    <div class="request-panel">
      <UrlBar
        method={props.tab.method}
        url={props.tab.url}
        protocolType={props.tab.protocolType}
        secure={props.tab.secure}
        loading={props.tab.loading}
        wsStatus={props.tab.wsStatus}
        onMethodChange={(method) => props.onUpdate({ method })}
        onUrlChange={handleUrlChange}
        onProtocolTypeChange={handleProtocolTypeChange}
        onSecureChange={(secure) => props.onUpdate({ secure })}
        onSend={props.onSend}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onCurlPaste={(parsed) => {
          if (parsed.protocolType !== props.tab.protocolType) {
            switchProtocolType(props.tab.id, parsed.protocolType);
          }
          props.onUpdate({
            method: parsed.method,
            url: parsed.url,
            headers: parsed.headers,
            params: parsed.params,
            body: parsed.body,
            auth: parsed.auth,
            secure: parsed.secure,
            name: `${parsed.method} ${parsed.url}`,
          });
        }}
      />

      {/* Tab sections — different for HTTP vs WS */}
      <Show when={isWs()} fallback={
        <>
          <div class="request-tabs">
            {(["params", "headers", "body", "auth", "scripts"] as HttpTab[]).map((tab) => (
              <button
                class={`request-tab ${activeHttpSection() === tab ? "active" : ""}`}
                onClick={() => setActiveHttpSection(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                <Show when={tab === "params" && props.tab.params.length > 0}>
                  <span class="tab-count">{props.tab.params.filter(p => p.enabled).length}</span>
                </Show>
                <Show when={tab === "headers" && props.tab.headers.length > 0}>
                  <span class="tab-count">{props.tab.headers.filter(h => h.enabled).length}</span>
                </Show>
              </button>
            ))}
          </div>

          <div class="request-content">
            <Show when={activeHttpSection() === "params"}>
              <KeyValueGrid
                items={props.tab.params}
                onChange={handleParamsChange}
                placeholder={{ key: "Parameter", value: "Value" }}
              />
            </Show>
            <Show when={activeHttpSection() === "headers"}>
              <KeyValueGrid
                items={props.tab.headers}
                onChange={(headers) => props.onUpdate({ headers })}
                placeholder={{ key: "Header", value: "Value" }}
                keySuggestions={COMMON_HEADERS}
              />
            </Show>
            <Show when={activeHttpSection() === "body"}>
              <BodyEditor
                body={props.tab.body}
                onChange={(body) => props.onUpdate({ body })}
              />
            </Show>
            <Show when={activeHttpSection() === "auth"}>
              <AuthEditor
                auth={props.tab.auth}
                onChange={(auth) => props.onUpdate({ auth })}
              />
            </Show>
            <Show when={activeHttpSection() === "scripts"}>
              <div class="scripts-editor">
                <div class="script-section">
                  <label class="script-label">Pre-request Script</label>
                  <textarea
                    class="script-textarea"
                    placeholder="// Pre-request script (JavaScript)&#10;// Use pm.variables.set('key', 'value')"
                    value={props.tab.preScript}
                    onInput={(e) => props.onUpdate({ preScript: e.currentTarget.value })}
                  />
                </div>
                <div class="script-section">
                  <label class="script-label">Post-response Script</label>
                  <textarea
                    class="script-textarea"
                    placeholder="// Post-response script (JavaScript)&#10;// Use pm.response.json() to access response"
                    value={props.tab.postScript}
                    onInput={(e) => props.onUpdate({ postScript: e.currentTarget.value })}
                  />
                </div>
              </div>
            </Show>
          </div>
        </>
      }>
        {/* WebSocket tabs */}
        <div class="request-tabs">
          {(["messages", "headers", "auth"] as WsTab[]).map((tab) => (
            <button
              class={`request-tab ${activeWsSection() === tab ? "active" : ""}`}
              onClick={() => setActiveWsSection(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <Show when={tab === "headers" && props.tab.headers.length > 0}>
                <span class="tab-count">{props.tab.headers.filter(h => h.enabled).length}</span>
              </Show>
              <Show when={tab === "messages" && props.tab.wsTemplates.length > 0}>
                <span class="tab-count">{props.tab.wsTemplates.length}</span>
              </Show>
            </button>
          ))}
        </div>

        <div class="request-content">
          <Show when={activeWsSection() === "messages"}>
            <WsMessagesTab tab={props.tab} />
          </Show>
          <Show when={activeWsSection() === "headers"}>
            <KeyValueGrid
              items={props.tab.headers}
              onChange={(headers) => props.onUpdate({ headers })}
              placeholder={{ key: "Header", value: "Value" }}
              keySuggestions={COMMON_HEADERS}
            />
          </Show>
          <Show when={activeWsSection() === "auth"}>
            <AuthEditor
              auth={props.tab.auth}
              onChange={(auth) => props.onUpdate({ auth })}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
};
