import { Component, Show, createSignal, Match, Switch } from "solid-js";
import { KeyValueGrid } from "../shared/KeyValueGrid";
import type { RequestBody, KeyValue } from "../../lib/api";

interface Props {
  body: RequestBody;
  onChange: (body: RequestBody) => void;
}

type BodyType = "none" | "json" | "raw" | "form_urlencoded" | "form_data" | "binary" | "graphql";

export const BodyEditor: Component<Props> = (props) => {
  const bodyType = (): BodyType => props.body.type;

  const setBodyType = (type: BodyType) => {
    switch (type) {
      case "none": props.onChange({ type: "none" }); break;
      case "json": props.onChange({ type: "json", data: { content: "{\n  \n}" } }); break;
      case "raw": props.onChange({ type: "raw", data: { content: "", content_type: "text/plain" } }); break;
      case "form_urlencoded": props.onChange({ type: "form_urlencoded", data: { params: [] } }); break;
      case "form_data": props.onChange({ type: "form_data", data: { params: [] } }); break;
      case "binary": props.onChange({ type: "binary", data: { path: "" } }); break;
      case "graphql": props.onChange({ type: "graphql", data: { query: "", variables: "{}" } }); break;
    }
  };

  return (
    <div class="body-editor">
      <div class="body-type-selector">
        {(["none", "json", "raw", "form_urlencoded", "form_data", "graphql"] as BodyType[]).map((type) => (
          <button
            class={`body-type-btn ${bodyType() === type ? "active" : ""}`}
            onClick={() => setBodyType(type)}
          >
            {type === "form_urlencoded" ? "x-www-form" : type === "form_data" ? "form-data" : type}
          </button>
        ))}
      </div>

      <div class="body-content">
        <Switch>
          <Match when={bodyType() === "none"}>
            <div class="body-empty">No body for this request</div>
          </Match>
          <Match when={bodyType() === "json"}>
            <textarea
              class="body-textarea mono"
              placeholder='{"key": "value"}'
              value={props.body.type === "json" ? props.body.data.content : ""}
              onInput={(e) => props.onChange({ type: "json", data: { content: e.currentTarget.value } })}
            />
          </Match>
          <Match when={bodyType() === "raw"}>
            <div class="raw-body">
              <select
                class="raw-content-type"
                value={props.body.type === "raw" ? props.body.data.content_type : "text/plain"}
                onChange={(e) => {
                  if (props.body.type === "raw") {
                    props.onChange({ type: "raw", data: { ...props.body.data, content_type: e.currentTarget.value } });
                  }
                }}
              >
                <option value="text/plain">Text</option>
                <option value="text/html">HTML</option>
                <option value="text/xml">XML</option>
                <option value="application/xml">Application/XML</option>
              </select>
              <textarea
                class="body-textarea"
                placeholder="Raw body content..."
                value={props.body.type === "raw" ? props.body.data.content : ""}
                onInput={(e) => {
                  if (props.body.type === "raw") {
                    props.onChange({ type: "raw", data: { ...props.body.data, content: e.currentTarget.value } });
                  }
                }}
              />
            </div>
          </Match>
          <Match when={bodyType() === "form_urlencoded"}>
            <KeyValueGrid
              items={props.body.type === "form_urlencoded" ? props.body.data.params : []}
              onChange={(params) => props.onChange({ type: "form_urlencoded", data: { params } })}
            />
          </Match>
          <Match when={bodyType() === "form_data"}>
            <KeyValueGrid
              items={props.body.type === "form_data" ? props.body.data.params.map(p => ({ key: p.key, value: p.value, enabled: p.enabled })) : []}
              onChange={(params) => props.onChange({ type: "form_data", data: { params: params.map(p => ({ ...p, param_type: "text" })) } })}
            />
          </Match>
          <Match when={bodyType() === "graphql"}>
            <div class="graphql-editor">
              <div class="graphql-section">
                <label class="script-label">Query</label>
                <textarea
                  class="body-textarea mono"
                  placeholder="query { ... }"
                  value={props.body.type === "graphql" ? props.body.data.query : ""}
                  onInput={(e) => {
                    if (props.body.type === "graphql") {
                      props.onChange({ type: "graphql", data: { ...props.body.data, query: e.currentTarget.value } });
                    }
                  }}
                />
              </div>
              <div class="graphql-section">
                <label class="script-label">Variables</label>
                <textarea
                  class="body-textarea mono"
                  placeholder="{}"
                  value={props.body.type === "graphql" ? props.body.data.variables : "{}"}
                  onInput={(e) => {
                    if (props.body.type === "graphql") {
                      props.onChange({ type: "graphql", data: { ...props.body.data, variables: e.currentTarget.value } });
                    }
                  }}
                />
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
