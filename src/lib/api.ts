import { invoke } from "@tauri-apps/api/core";

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  sync_url: string | null;
  api_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; config: { token: string } }
  | { type: "api_key"; config: { key: string; value: string; add_to: string } }
  | { type: "basic"; config: { username: string; password: string } };

export type RequestBody =
  | { type: "none" }
  | { type: "raw"; data: { content: string; content_type: string } }
  | { type: "json"; data: { content: string } }
  | { type: "form_urlencoded"; data: { params: KeyValue[] } }
  | { type: "form_data"; data: { params: FormDataParam[] } }
  | { type: "binary"; data: { path: string } }
  | { type: "graphql"; data: { query: string; variables: string } };

export interface FormDataParam {
  key: string;
  value: string;
  param_type: string;
  enabled: boolean;
}

export interface SavedRequest {
  id: string;
  collection_id: string;
  name: string;
  method: string;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  body: RequestBody;
  auth: AuthConfig;
  pre_script: string;
  post_script: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Environment {
  id: string;
  workspace_id: string;
  name: string;
  variables: KeyValue[];
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  id: string;
  workspace_id: string;
  method: string;
  url: string;
  status: number;
  duration_ms: number;
  response_size: number;
  timestamp: string;
  request_data: string;
  response_headers: string;
  response_body_preview: string;
}

export interface TimingBreakdown {
  dns_ms: number;
  connect_ms: number;
  tls_ms: number;
  first_byte_ms: number;
  total_ms: number;
  download_ms: number;
}

export interface HttpResponse {
  status: number;
  status_text: string;
  headers: KeyValue[];
  body: string;
  size_bytes: number;
  timing: TimingBreakdown;
}

export interface SyncStatus {
  connected: boolean;
  server_url: string | null;
  last_revision: number;
}

// Workspace API
export const listWorkspaces = () => invoke<Workspace[]>("list_workspaces");
export const createWorkspace = (name: string) => invoke<Workspace>("create_workspace", { name });

// Collection API
export const listCollections = (workspaceId: string) => invoke<Collection[]>("list_collections", { workspaceId });
export const createCollection = (workspaceId: string, parentId: string | null, name: string) =>
  invoke<Collection>("create_collection", { workspaceId, parentId, name });
export const updateCollection = (id: string, name: string) => invoke<void>("update_collection", { id, name });
export const deleteCollection = (id: string) => invoke<void>("delete_collection", { id });

// Request API
export const listRequests = (collectionId: string) => invoke<SavedRequest[]>("list_requests", { collectionId });
export const getRequest = (id: string) => invoke<SavedRequest | null>("get_request", { id });
export const createRequest = (collectionId: string, name: string, method: string, url: string) =>
  invoke<SavedRequest>("create_request", { collectionId, name, method, url });
export const updateRequest = (request: SavedRequest) => invoke<void>("update_request", { request });
export const deleteRequest = (id: string) => invoke<void>("delete_request", { id });

// HTTP API
export const sendRequest = (
  method: string, url: string, headers: KeyValue[], params: KeyValue[],
  body: RequestBody, auth: AuthConfig, workspaceId: string
) => invoke<HttpResponse>("send_request", { method, url, headers, params, body, auth, workspaceId });

// Environment API
export const listEnvironments = (workspaceId: string) => invoke<Environment[]>("list_environments", { workspaceId });
export const createEnvironment = (workspaceId: string, name: string) => invoke<Environment>("create_environment", { workspaceId, name });
export const updateEnvironment = (environment: Environment) => invoke<void>("update_environment", { environment });
export const deleteEnvironment = (id: string) => invoke<void>("delete_environment", { id });
export const getActiveEnvironment = () => invoke<string | null>("get_active_environment");
export const setActiveEnvironment = (envId: string | null) => invoke<void>("set_active_environment", { envId });

// History API
export const listHistory = (workspaceId: string, limit?: number) => invoke<HistoryEntry[]>("list_history", { workspaceId, limit });
export const clearHistory = (workspaceId: string) => invoke<void>("clear_history", { workspaceId });

// Import API
export const importCurl = (curlCommand: string) => invoke<SavedRequest>("import_curl", { curlCommand });
export const importOpenapi = (specJson: string, workspaceId: string) => invoke<Collection[]>("import_openapi", { specJson, workspaceId });

// Code Generation API
export const generateCode = (method: string, url: string, headers: KeyValue[], body: RequestBody, language: string) =>
  invoke<string>("generate_code", { method, url, headers, body, language });

// Script API
export const runScript = (script: string, context: Record<string, unknown>) => invoke<unknown>("run_script", { script, context });

// WebSocket API
export const wsConnect = (id: string, url: string, headers: KeyValue[]) => invoke<void>("ws_connect", { id, url, headers });
export const wsSend = (id: string, message: string) => invoke<void>("ws_send", { id, message });
export const wsDisconnect = (id: string) => invoke<void>("ws_disconnect", { id });

// Sync API
export const connectSync = (serverUrl: string, token: string, workspaceId: string) =>
  invoke<void>("connect_sync", { serverUrl, token, workspaceId });
export const disconnectSync = () => invoke<void>("disconnect_sync");
export const getSyncStatus = () => invoke<SyncStatus>("get_sync_status");
