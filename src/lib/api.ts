import { invoke } from "@tauri-apps/api/core";

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Team {
  id: string;
  name: string;
  convex_team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  team_id: string;
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

export interface WsMessageTemplate {
  id: string;
  name: string;
  content: string;
  format: "text" | "json";
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
  ws_messages: WsMessageTemplate[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Environment {
  id: string;
  team_id: string;
  name: string;
  variables: KeyValue[];
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  id: string;
  team_id: string;
  method: string;
  url: string;
  status: number;
  duration_ms: number;
  response_size: number;
  timestamp: string;
  request_data: string;
  response_headers: string;
  response_body_preview: string;
  response_body?: string; // only present when fetched via getHistoryEntry
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

// Team API
export const listTeams = () => invoke<Team[]>("list_teams");
export const createTeam = (name: string) => invoke<Team>("create_team", { name });

// Collection API
export const listCollections = (teamId: string) => invoke<Collection[]>("list_collections", { teamId });
export const createCollection = (teamId: string, parentId: string | null, name: string) =>
  invoke<Collection>("create_collection", { teamId, parentId, name });
export const updateCollection = (id: string, name: string) => invoke<void>("update_collection", { id, name });
export const deleteCollection = (id: string) => invoke<void>("delete_collection", { id });

// Request API
export const listRequests = (collectionId: string) => invoke<SavedRequest[]>("list_requests", { collectionId });
export const getRequest = (id: string) => invoke<SavedRequest | null>("get_request", { id });
export const createRequest = (collectionId: string, name: string, method: string, url: string) =>
  invoke<SavedRequest>("create_request", { collectionId, name, method, url });
export const updateRequest = (request: SavedRequest) => invoke<void>("update_request", { request });
export const deleteRequest = (id: string) => invoke<void>("delete_request", { id });
export const moveRequest = (id: string, collectionId: string) => invoke<void>("move_request", { id, collectionId });

// HTTP API
export const sendRequest = (
  method: string, url: string, headers: KeyValue[], params: KeyValue[],
  body: RequestBody, auth: AuthConfig, teamId: string
) => invoke<HttpResponse>("send_request", { method, url, headers, params, body, auth, teamId });

// Environment API
export const listEnvironments = (teamId: string) => invoke<Environment[]>("list_environments", { teamId });
export const createEnvironment = (teamId: string, name: string) => invoke<Environment>("create_environment", { teamId, name });
export const updateEnvironment = (environment: Environment) => invoke<void>("update_environment", { environment });
export const deleteEnvironment = (id: string) => invoke<void>("delete_environment", { id });
export const getActiveEnvironment = () => invoke<string | null>("get_active_environment");
export const setActiveEnvironment = (envId: string | null) => invoke<void>("set_active_environment", { envId });

// History API
export const listHistory = (teamId: string, limit?: number) => invoke<HistoryEntry[]>("list_history", { teamId, limit });
export const clearHistory = (teamId: string) => invoke<void>("clear_history", { teamId });
export const getHistoryEntry = (id: string, teamId: string) => invoke<HistoryEntry | null>("get_history_entry", { id, teamId });

// Import API
export const importCurl = (curlCommand: string) => invoke<SavedRequest>("import_curl", { curlCommand });
export const importOpenapi = (specJson: string, teamId: string) => invoke<Collection[]>("import_openapi", { specJson, teamId });

export interface ImportedCollection {
  name: string;
  children: ImportedCollection[];
  requests: SavedRequest[];
  variables: KeyValue[];
}

export const importPostman = (jsonContent: string) => invoke<ImportedCollection>("import_postman", { jsonContent });
export const importTenso = (jsonContent: string) => invoke<[ImportedCollection, Environment[]]>("import_tenso", { jsonContent });

// Code Generation API
export const generateCode = (method: string, url: string, headers: KeyValue[], body: RequestBody, language: string) =>
  invoke<string>("generate_code", { method, url, headers, body, language });

// Script API
export const runScript = (script: string, context: Record<string, unknown>) => invoke<unknown>("run_script", { script, context });

// WebSocket API
export const wsConnect = (id: string, url: string, headers: KeyValue[]) => invoke<void>("ws_connect", { id, url, headers });
export const wsSend = (id: string, message: string) => invoke<void>("ws_send", { id, message });
export const wsDisconnect = (id: string) => invoke<void>("ws_disconnect", { id });

// Sync Commands
export const getModifiedSince = (teamId: string, sinceMs: number) =>
  invoke<{ collections: Collection[]; requests: SavedRequest[]; environments: Environment[]; history: HistoryEntry[] }>("get_modified_since", { teamId, sinceMs });

export const getUnsyncedDeletes = () =>
  invoke<Array<{ id: string; entityType: string; entityId: string }>>("get_unsynced_deletes");

export const markDeletesSynced = (ids: string[]) =>
  invoke<void>("mark_deletes_synced", { ids });

export const upsertCollection = (collection: Collection) =>
  invoke<void>("upsert_collection", { collection });

export const upsertRequest = (request: SavedRequest) =>
  invoke<void>("upsert_request", { request });

export const upsertEnvironment = (environment: Environment) =>
  invoke<void>("upsert_environment", { environment });

export const upsertHistory = (entry: HistoryEntry) =>
  invoke<void>("upsert_history", { entry });

export const softDeleteEntity = (entityType: string, entityId: string) =>
  invoke<void>("soft_delete_entity", { entityType, entityId });

export const getSyncState = (teamId: string) =>
  invoke<{ lastPullAt: number; lastPushAt: number }>("get_sync_state", { teamId });

export const setSyncState = (teamId: string, lastPull: number, lastPush: number) =>
  invoke<void>("set_sync_state", { teamId, lastPull, lastPush });

export const getAllForTeam = (teamId: string) =>
  invoke<{ collections: Collection[]; requests: SavedRequest[]; environments: Environment[]; history: HistoryEntry[] }>("get_all_for_team", { teamId });
