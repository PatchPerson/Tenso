import { Component, Show, createSignal } from "solid-js";
import { UrlBar } from "./UrlBar";
import { KeyValueGrid, COMMON_HEADERS } from "../shared/KeyValueGrid";
import { BodyEditor } from "./BodyEditor";
import { AuthEditor } from "./AuthEditor";
import type { Tab } from "../../stores/request";
import type { KeyValue, RequestBody, AuthConfig } from "../../lib/api";

interface Props {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
  onSend: () => void;
}

type RequestTab = "params" | "headers" | "body" | "auth" | "scripts";

export const RequestPanel: Component<Props> = (props) => {
  const [activeSection, setActiveSection] = createSignal<RequestTab>("params");

  return (
    <div class="request-panel">
      <UrlBar
        method={props.tab.method}
        url={props.tab.url}
        protocol={props.tab.protocol}
        loading={props.tab.loading}
        onMethodChange={(method) => props.onUpdate({ method })}
        onUrlChange={(url) => props.onUpdate({ url })}
        onProtocolChange={(protocol) => props.onUpdate({ protocol })}
        onSend={props.onSend}
      />

      <div class="request-tabs">
        {(["params", "headers", "body", "auth", "scripts"] as RequestTab[]).map((tab) => (
          <button
            class={`request-tab ${activeSection() === tab ? "active" : ""}`}
            onClick={() => setActiveSection(tab)}
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
        <Show when={activeSection() === "params"}>
          <KeyValueGrid
            items={props.tab.params}
            onChange={(params) => props.onUpdate({ params })}
            placeholder={{ key: "Parameter", value: "Value" }}
          />
        </Show>
        <Show when={activeSection() === "headers"}>
          <KeyValueGrid
            items={props.tab.headers}
            onChange={(headers) => props.onUpdate({ headers })}
            placeholder={{ key: "Header", value: "Value" }}
            keySuggestions={COMMON_HEADERS}
          />
        </Show>
        <Show when={activeSection() === "body"}>
          <BodyEditor
            body={props.tab.body}
            onChange={(body) => props.onUpdate({ body })}
          />
        </Show>
        <Show when={activeSection() === "auth"}>
          <AuthEditor
            auth={props.tab.auth}
            onChange={(auth) => props.onUpdate({ auth })}
          />
        </Show>
        <Show when={activeSection() === "scripts"}>
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
    </div>
  );
};
