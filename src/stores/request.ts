import { createSignal } from "solid-js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as api from "../lib/api";
import { resolveGlobals } from "./globals";
import { loadHistory, parseHistoryRequestData } from "./history";
import { triggerPush } from "../lib/sync";
import { getDefaultCollectionId, setLastUsedCollectionId, addCollection, triggerRefresh, expandFolder, activeWorkspace } from "./collections";
import { scheduleSave, scheduleImmediateSave } from "../lib/session";

export interface WsMessage {
  id: string;
  content: string;
  direction: "sent" | "received" | "system";
  timestamp: number;
  format: "text" | "json";
}

export interface Tab {
  id: string;
  name: string;
  method: string;
  url: string;
  protocolType: "http" | "ws";
  secure: boolean;
  headers: api.KeyValue[];
  params: api.KeyValue[];
  body: api.RequestBody;
  auth: api.AuthConfig;
  preScript: string;
  postScript: string;
  response: api.HttpResponse | null;
  loading: boolean;
  savedRequestId: string | null;
  dirty: boolean;
  // WS ephemeral state (not persisted)
  wsStatus: "disconnected" | "connecting" | "connected";
  wsMessages: WsMessage[];
  wsComposerContent: string;
  wsComposerFormat: "text" | "json";
  // WS templates (persisted with saved request)
  wsTemplates: api.WsMessageTemplate[];
  // Stashed state per protocol for reversible switching
  _protocolStash: Partial<Record<"http" | "ws", ProtocolStash>>;
}

interface ProtocolStash {
  url: string;
  method: string;
  headers: api.KeyValue[];
  params: api.KeyValue[];
  body: api.RequestBody;
  auth: api.AuthConfig;
  preScript: string;
  postScript: string;
  wsTemplates: api.WsMessageTemplate[];
}

const [tabs, setTabs] = createSignal<Tab[]>([]);
const [activeTabId, setActiveTabId] = createSignal<string | null>(null);

export { tabs, setTabs, activeTabId, setActiveTabId };

export function switchActiveTab(id: string) {
  setActiveTabId(id);
  scheduleImmediateSave();
}

// Track Tauri event unlisten functions per tab for WS cleanup
const wsUnlisteners = new Map<string, UnlistenFn[]>();

const WS_MESSAGE_CAP = 10_000;

let tabCounter = 0;

// --- Helpers ---

export function getProtocolPrefix(tab: Tab): string {
  if (tab.protocolType === "ws") return tab.secure ? "wss://" : "ws://";
  return tab.secure ? "https://" : "http://";
}

export function isWebSocketTab(tab: Tab): boolean {
  return tab.protocolType === "ws";
}

function defaultWsFields(): Pick<Tab, "wsStatus" | "wsMessages" | "wsComposerContent" | "wsComposerFormat" | "wsTemplates"> {
  return {
    wsStatus: "disconnected",
    wsMessages: [],
    wsComposerContent: "",
    wsComposerFormat: "text",
    wsTemplates: [],
  };
}

/** Parse a URL to detect protocol type and secure flag. Returns null if no protocol found. */
export function detectProtocol(url: string): { protocolType: "http" | "ws"; secure: boolean; bareUrl: string } | null {
  const match = url.match(/^(https?|wss?):\/\//i);
  if (!match) return null;
  const proto = match[1].toLowerCase();
  return {
    protocolType: proto === "ws" || proto === "wss" ? "ws" : "http",
    secure: proto === "https" || proto === "wss",
    bareUrl: url.slice(match[0].length),
  };
}

function generateMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Tab CRUD ---

export function createNewTab(): Tab {
  tabCounter++;
  const id = `tab-${tabCounter}-${Date.now()}`;
  const tab: Tab = {
    id,
    name: `New Request ${tabCounter}`,
    method: "GET",
    url: "",
    protocolType: "http",
    secure: true,
    headers: [],
    params: [],
    body: { type: "none" },
    auth: { type: "none" },
    preScript: "",
    postScript: "",
    response: null,
    loading: false,
    savedRequestId: null,
    dirty: false,
    ...defaultWsFields(),
    _protocolStash: {},
  };
  setTabs([...tabs(), tab]);
  setActiveTabId(id);
  scheduleImmediateSave();
  return tab;
}

export function openRequestInTab(req: api.SavedRequest) {
  setLastUsedCollectionId(req.collection_id);
  const existing = tabs().find(t => t.savedRequestId === req.id);
  if (existing) {
    setActiveTabId(existing.id);
    scheduleImmediateSave();
    return;
  }

  // Detect protocol from saved URL
  const detected = detectProtocol(req.url);
  const protocolType = detected?.protocolType ?? "http";
  const secure = detected?.secure ?? true;
  const bareUrl = detected?.bareUrl ?? req.url;

  tabCounter++;
  const id = `tab-${tabCounter}-${Date.now()}`;
  const tab: Tab = {
    id,
    name: req.name,
    method: req.method,
    url: bareUrl,
    protocolType,
    secure,
    headers: [...req.headers],
    params: [...req.params],
    body: req.body,
    auth: req.auth,
    preScript: req.pre_script,
    postScript: req.post_script,
    response: null,
    loading: false,
    savedRequestId: req.id,
    dirty: false,
    ...defaultWsFields(),
    wsTemplates: req.ws_messages ? [...req.ws_messages] : [],
    _protocolStash: {},
  };
  setTabs([...tabs(), tab]);
  setActiveTabId(id);
  scheduleImmediateSave();
}

export function openHistoryInTab(entry: api.HistoryEntry): Tab {
  const { headers, params, body, auth } = parseHistoryRequestData(entry);
  const detected = detectProtocol(entry.url);
  const protocolType = detected?.protocolType ?? "http";
  const secure = detected?.secure ?? true;
  const bareUrl = detected?.bareUrl ?? entry.url;

  tabCounter++;
  const id = `tab-${tabCounter}-${Date.now()}`;
  const tab: Tab = {
    id,
    name: `${entry.method} ${bareUrl}`,
    method: entry.method,
    url: bareUrl,
    protocolType,
    secure,
    headers: [...headers],
    params: [...params],
    body,
    auth,
    preScript: "",
    postScript: "",
    response: null,
    loading: false,
    savedRequestId: null,
    dirty: false,
    ...defaultWsFields(),
    _protocolStash: {},
  };
  setTabs([...tabs(), tab]);
  setActiveTabId(id);
  scheduleImmediateSave();
  return tab;
}

export async function openHistoryInTabWithResponse(entry: api.HistoryEntry) {
  const tab = openHistoryInTab(entry);
  try {
    const full = await api.getHistoryEntry(entry.id, activeWorkspace());
    if (full) {
      let respHeaders: api.KeyValue[] = [];
      try { respHeaders = JSON.parse(entry.response_headers); } catch { /* empty */ }
      updateTab(tab.id, {
        response: {
          status: entry.status,
          status_text: `${entry.status}`,
          headers: respHeaders,
          body: full.response_body ?? "",
          size_bytes: entry.response_size,
          timing: { dns_ms: 0, connect_ms: 0, tls_ms: 0, first_byte_ms: entry.duration_ms, total_ms: entry.duration_ms, download_ms: 0 },
        },
      });
    }
  } catch { /* failed to fetch full entry — tab still usable without response */ }
}

export function closeTab(tabId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (tab && tab.wsStatus !== "disconnected") {
    disconnectWebSocket(tabId);
  }

  const current = tabs();
  const idx = current.findIndex(t => t.id === tabId);
  const newTabs = current.filter(t => t.id !== tabId);
  setTabs(newTabs);
  if (activeTabId() === tabId) {
    if (newTabs.length > 0) {
      const newIdx = Math.min(idx, newTabs.length - 1);
      setActiveTabId(newTabs[newIdx].id);
    } else {
      setActiveTabId(null);
    }
  }
  scheduleImmediateSave();
}

export function closeAllTabs() {
  // Disconnect any active WS connections
  for (const tab of tabs()) {
    if (tab.wsStatus !== "disconnected") {
      disconnectWebSocket(tab.id);
    }
  }
  setTabs([]);
  setActiveTabId(null);
  scheduleImmediateSave();
}

export function closeOtherTabs(keepTabId: string) {
  for (const tab of tabs()) {
    if (tab.id !== keepTabId && tab.wsStatus !== "disconnected") {
      disconnectWebSocket(tab.id);
    }
  }
  const kept = tabs().filter(t => t.id === keepTabId);
  setTabs(kept);
  if (kept.length > 0) {
    setActiveTabId(kept[0].id);
  } else {
    setActiveTabId(null);
  }
  scheduleImmediateSave();
}

// Fields that indicate user edits (not internal state changes like loading/response/wsStatus)
const DIRTY_FIELDS = new Set([
  "name", "method", "url", "protocolType", "secure",
  "headers", "params", "body", "auth", "preScript", "postScript",
  "wsTemplates",
]);

// Fields that are persisted to session — superset of DIRTY_FIELDS plus state fields
const SESSION_FIELDS = new Set([
  ...DIRTY_FIELDS,
  "savedRequestId", "dirty", "_protocolStash",
]);

export function updateTab(tabId: string, updates: Partial<Tab>) {
  const shouldDirty = Object.keys(updates).some((k) => DIRTY_FIELDS.has(k));
  setTabs(tabs().map(t => t.id === tabId ? { ...t, ...updates, ...(shouldDirty ? { dirty: true } : {}) } : t));
  if (Object.keys(updates).some((k) => SESSION_FIELDS.has(k))) {
    scheduleSave();
  }
}

export function getActiveTab(): Tab | undefined {
  return tabs().find(t => t.id === activeTabId());
}

// --- Protocol switching ---

export function switchProtocolType(tabId: string, newType: "http" | "ws") {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab || tab.protocolType === newType) return;

  // Disconnect active WS if switching away
  if (tab.wsStatus !== "disconnected") {
    disconnectWebSocket(tabId);
  }

  // Stash current protocol's state
  const stash: ProtocolStash = {
    url: tab.url,
    method: tab.method,
    headers: tab.headers,
    params: tab.params,
    body: tab.body,
    auth: tab.auth,
    preScript: tab.preScript,
    postScript: tab.postScript,
    wsTemplates: tab.wsTemplates,
  };
  const newStash = { ...tab._protocolStash, [tab.protocolType]: stash };

  // Restore stashed state for target protocol, or start fresh
  const restored = newStash[newType];
  if (restored) {
    updateTab(tabId, {
      protocolType: newType,
      response: null,
      loading: false,
      ...defaultWsFields(),
      url: restored.url,
      method: restored.method,
      headers: restored.headers,
      params: restored.params,
      body: restored.body,
      auth: restored.auth,
      preScript: restored.preScript,
      postScript: restored.postScript,
      wsTemplates: restored.wsTemplates,
      _protocolStash: newStash,
    });
  } else {
    updateTab(tabId, {
      protocolType: newType,
      url: "",
      method: "GET",
      headers: [],
      params: [],
      body: { type: "none" },
      auth: { type: "none" },
      preScript: "",
      postScript: "",
      response: null,
      loading: false,
      ...defaultWsFields(),
      _protocolStash: newStash,
    });
  }
}

// --- Variable resolution ---

function resolveKeyValues(items: api.KeyValue[]): api.KeyValue[] {
  return items.map(kv => ({ ...kv, key: resolveGlobals(kv.key), value: resolveGlobals(kv.value) }));
}

function resolveBody(body: api.RequestBody): api.RequestBody {
  switch (body.type) {
    case "raw": return { type: "raw", data: { content: resolveGlobals(body.data.content), content_type: body.data.content_type } };
    case "json": return { type: "json", data: { content: resolveGlobals(body.data.content) } };
    case "form_urlencoded": return { type: "form_urlencoded", data: { params: resolveKeyValues(body.data.params) } };
    case "form_data": return { type: "form_data", data: { params: body.data.params.map(p => ({ ...p, key: resolveGlobals(p.key), value: resolveGlobals(p.value) })) } };
    case "graphql": return { type: "graphql", data: { query: resolveGlobals(body.data.query), variables: resolveGlobals(body.data.variables) } };
    default: return body;
  }
}

function resolveAuth(auth: api.AuthConfig): api.AuthConfig {
  switch (auth.type) {
    case "bearer": return { type: "bearer", config: { token: resolveGlobals(auth.config.token) } };
    case "api_key": return { type: "api_key", config: { key: resolveGlobals(auth.config.key), value: resolveGlobals(auth.config.value), add_to: auth.config.add_to } };
    case "basic": return { type: "basic", config: { username: resolveGlobals(auth.config.username), password: resolveGlobals(auth.config.password) } };
    default: return auth;
  }
}

// --- HTTP execution ---

export async function executeRequest(tabId: string, workspaceId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab) return;

  updateTab(tabId, { loading: true, response: null });

  try {
    let resolvedUrl = resolveGlobals(tab.url);
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(resolvedUrl)) {
      resolvedUrl = getProtocolPrefix(tab) + resolvedUrl;
    }
    const response = await api.sendRequest(
      tab.method,
      resolvedUrl,
      resolveKeyValues(tab.headers),
      resolveKeyValues(tab.params),
      resolveBody(tab.body),
      resolveAuth(tab.auth),
      workspaceId
    );
    updateTab(tabId, { response, loading: false });
    loadHistory(workspaceId).catch(() => {});
    triggerPush();
  } catch (err) {
    updateTab(tabId, {
      loading: false,
      response: {
        status: 0,
        status_text: String(err),
        headers: [],
        body: String(err),
        size_bytes: 0,
        timing: { dns_ms: 0, connect_ms: 0, tls_ms: 0, first_byte_ms: 0, total_ms: 0, download_ms: 0 },
      },
    });
  }
}

// --- WebSocket actions ---

function appendWsMessage(tabId: string, msg: WsMessage) {
  setTabs(tabs().map(t => {
    if (t.id !== tabId) return t;
    const msgs = [...t.wsMessages, msg];
    // Cap messages to prevent memory bloat
    return { ...t, wsMessages: msgs.length > WS_MESSAGE_CAP ? msgs.slice(-WS_MESSAGE_CAP) : msgs };
  }));
}

export async function connectWebSocket(tabId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab || tab.wsStatus !== "disconnected") return;

  updateTab(tabId, { wsStatus: "connecting" });

  try {
    const resolvedUrl = getProtocolPrefix(tab) + resolveGlobals(tab.url);
    const resolvedHeaders = resolveKeyValues(tab.headers);

    // Set up event listeners before connecting
    const unlisteners: UnlistenFn[] = [];

    const msgUn = await listen<{ content: string; timestamp: number }>(`ws-message-${tabId}`, (event) => {
      const { content, timestamp } = event.payload;
      let format: "text" | "json" = "text";
      try { JSON.parse(content); format = "json"; } catch { /* text */ }
      appendWsMessage(tabId, {
        id: generateMsgId(),
        content,
        direction: "received",
        timestamp,
        format,
      });
    });
    unlisteners.push(msgUn);

    const closeUn = await listen<string | null>(`ws-closed-${tabId}`, (event) => {
      const reason = event.payload;
      appendWsMessage(tabId, {
        id: generateMsgId(),
        content: reason ? `Disconnected: ${reason}` : "Disconnected",
        direction: "system",
        timestamp: Date.now(),
        format: "text",
      });
      updateTab(tabId, { wsStatus: "disconnected" });
      cleanupWsListeners(tabId);
    });
    unlisteners.push(closeUn);

    wsUnlisteners.set(tabId, unlisteners);

    await api.wsConnect(tabId, resolvedUrl, resolvedHeaders);

    appendWsMessage(tabId, {
      id: generateMsgId(),
      content: `Connected to ${resolvedUrl}`,
      direction: "system",
      timestamp: Date.now(),
      format: "text",
    });
    updateTab(tabId, { wsStatus: "connected" });
  } catch (err) {
    appendWsMessage(tabId, {
      id: generateMsgId(),
      content: `Connection failed: ${String(err)}`,
      direction: "system",
      timestamp: Date.now(),
      format: "text",
    });
    updateTab(tabId, { wsStatus: "disconnected" });
    cleanupWsListeners(tabId);
  }
}

export async function disconnectWebSocket(tabId: string) {
  try {
    await api.wsDisconnect(tabId);
  } catch { /* already disconnected */ }
  cleanupWsListeners(tabId);
  updateTab(tabId, { wsStatus: "disconnected" });
}

function cleanupWsListeners(tabId: string) {
  const unlisteners = wsUnlisteners.get(tabId);
  if (unlisteners) {
    for (const un of unlisteners) un();
    wsUnlisteners.delete(tabId);
  }
}

export async function sendWebSocketMessage(tabId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab || tab.wsStatus !== "connected" || !tab.wsComposerContent.trim()) return;

  const resolved = resolveGlobals(tab.wsComposerContent);

  try {
    await api.wsSend(tabId, resolved);
    let format: "text" | "json" = "text";
    try { JSON.parse(resolved); format = "json"; } catch { /* text */ }
    appendWsMessage(tabId, {
      id: generateMsgId(),
      content: resolved,
      direction: "sent",
      timestamp: Date.now(),
      format,
    });
  } catch (err) {
    appendWsMessage(tabId, {
      id: generateMsgId(),
      content: `Send failed: ${String(err)}`,
      direction: "system",
      timestamp: Date.now(),
      format: "text",
    });
  }
}

export function clearWsMessages(tabId: string) {
  setTabs(tabs().map(t => t.id === tabId ? { ...t, wsMessages: [] } : t));
}

// --- WS Template management ---

export function addWsTemplate(tabId: string, name: string, content: string, format: "text" | "json") {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab) return;
  const template: api.WsMessageTemplate = {
    id: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    content,
    format,
  };
  updateTab(tabId, { wsTemplates: [...tab.wsTemplates, template] });
}

export function removeWsTemplate(tabId: string, templateId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab) return;
  updateTab(tabId, { wsTemplates: tab.wsTemplates.filter(t => t.id !== templateId) });
}

export function updateWsTemplate(tabId: string, templateId: string, updates: Partial<api.WsMessageTemplate>) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab) return;
  updateTab(tabId, {
    wsTemplates: tab.wsTemplates.map(t => t.id === templateId ? { ...t, ...updates } : t),
  });
}

export function loadTemplateIntoComposer(tabId: string, templateId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab) return;
  const template = tab.wsTemplates.find(t => t.id === templateId);
  if (!template) return;
  // Don't mark dirty — composer content is ephemeral
  setTabs(tabs().map(t => t.id === tabId ? { ...t, wsComposerContent: template.content, wsComposerFormat: template.format } : t));
}

// --- Save request ---

export async function saveRequest(tabId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab) return;

  // Unsaved tab — create in last used collection
  if (!tab.savedRequestId) {
    let collectionId = getDefaultCollectionId();
    if (!collectionId) {
      await addCollection("Default");
      collectionId = getDefaultCollectionId();
    }
    if (!collectionId) return;

    const fullUrl = getProtocolPrefix(tab) + tab.url;
    const saved = await api.createRequest(collectionId, tab.name, tab.method, fullUrl);
    await api.updateRequest({
      ...saved,
      headers: tab.headers,
      params: tab.params,
      body: tab.body,
      auth: tab.auth,
      pre_script: tab.preScript,
      post_script: tab.postScript,
      ws_messages: tab.wsTemplates,
    });
    setTabs(tabs().map(t => t.id === tabId ? { ...t, savedRequestId: saved.id, dirty: false, _protocolStash: {} } : t));
    setLastUsedCollectionId(collectionId);
    expandFolder(collectionId);
    triggerRefresh();
    triggerPush();
    scheduleImmediateSave();
    return;
  }

  // Existing saved request — update
  const fullUrl = getProtocolPrefix(tab) + tab.url;

  const original = await api.getRequest(tab.savedRequestId);
  if (!original) {
    console.error("Cannot save: request no longer exists", tab.savedRequestId);
    return;
  }

  await api.updateRequest({
    id: tab.savedRequestId,
    collection_id: original.collection_id,
    name: tab.name,
    method: tab.method,
    url: fullUrl,
    headers: tab.headers,
    params: tab.params,
    body: tab.body,
    auth: tab.auth,
    pre_script: tab.preScript,
    post_script: tab.postScript,
    ws_messages: tab.wsTemplates,
    sort_order: original.sort_order,
    created_at: original.created_at,
    updated_at: "",
  });
  setTabs(tabs().map(t => t.id === tabId ? { ...t, dirty: false, _protocolStash: {} } : t));
  triggerPush();
  scheduleImmediateSave();
}

export async function saveAllTabs() {
  const allTabs = tabs();
  for (const tab of allTabs) {
    if (tab.dirty) {
      await saveRequest(tab.id);
    }
  }
}
