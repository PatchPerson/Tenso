import { Component, Match, Switch } from "solid-js";
import type { AuthConfig } from "../../lib/api";

interface Props {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

type AuthType = "none" | "bearer" | "basic" | "api_key";

export const AuthEditor: Component<Props> = (props) => {
  const authType = (): AuthType => props.auth.type as AuthType;

  return (
    <div class="auth-editor">
      <div class="auth-type-selector">
        <select
          class="auth-select"
          value={authType()}
          onChange={(e) => {
            const type = e.currentTarget.value as AuthType;
            switch (type) {
              case "none": props.onChange({ type: "none" }); break;
              case "bearer": props.onChange({ type: "bearer", config: { token: "" } }); break;
              case "basic": props.onChange({ type: "basic", config: { username: "", password: "" } }); break;
              case "api_key": props.onChange({ type: "api_key", config: { key: "", value: "", add_to: "header" } }); break;
            }
          }}
        >
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="api_key">API Key</option>
        </select>
      </div>

      <div class="auth-config">
        <Switch>
          <Match when={authType() === "none"}>
            <div class="auth-empty">No authentication configured for this request.</div>
          </Match>
          <Match when={authType() === "bearer" && props.auth.type === "bearer"}>
            <div class="auth-field">
              <label>Token</label>
              <input
                type="text"
                class="auth-input"
                placeholder="Enter bearer token..."
                value={props.auth.config.token}
                onInput={(e) => props.onChange({ type: "bearer", config: { token: e.currentTarget.value } })}
              />
            </div>
          </Match>
          <Match when={authType() === "basic" && props.auth.type === "basic"}>
            <div class="auth-field">
              <label>Username</label>
              <input
                type="text"
                class="auth-input"
                placeholder="Username"
                value={props.auth.config.username}
                onInput={(e) => props.onChange({ type: "basic", config: { ...props.auth.config as any, username: e.currentTarget.value } })}
              />
            </div>
            <div class="auth-field">
              <label>Password</label>
              <input
                type="password"
                class="auth-input"
                placeholder="Password"
                value={props.auth.config.password}
                onInput={(e) => props.onChange({ type: "basic", config: { ...props.auth.config as any, password: e.currentTarget.value } })}
              />
            </div>
          </Match>
          <Match when={authType() === "api_key" && props.auth.type === "api_key"}>
            <div class="auth-field">
              <label>Key</label>
              <input
                type="text"
                class="auth-input"
                placeholder="e.g. X-API-Key"
                value={props.auth.config.key}
                onInput={(e) => props.onChange({ type: "api_key", config: { ...props.auth.config as any, key: e.currentTarget.value } })}
              />
            </div>
            <div class="auth-field">
              <label>Value</label>
              <input
                type="text"
                class="auth-input"
                placeholder="API key value"
                value={props.auth.config.value}
                onInput={(e) => props.onChange({ type: "api_key", config: { ...props.auth.config as any, value: e.currentTarget.value } })}
              />
            </div>
            <div class="auth-field">
              <label>Add to</label>
              <select
                class="auth-select"
                value={props.auth.config.add_to}
                onChange={(e) => props.onChange({ type: "api_key", config: { ...props.auth.config as any, add_to: e.currentTarget.value } })}
              >
                <option value="header">Header</option>
                <option value="query">Query Param</option>
              </select>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
