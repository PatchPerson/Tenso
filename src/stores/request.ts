import { createSignal } from "solid-js";
import * as api from "../lib/api";
import { resolveGlobals } from "./globals";
import { loadHistory } from "./history";

export interface Tab {
  id: string;
  name: string;
  method: string;
  url: string;
  protocol: string;
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
}

const [tabs, setTabs] = createSignal<Tab[]>([]);
const [activeTabId, setActiveTabId] = createSignal<string | null>(null);

export { tabs, setTabs, activeTabId, setActiveTabId };

let tabCounter = 0;

export function createNewTab(): Tab {
  tabCounter++;
  const id = `tab-${tabCounter}-${Date.now()}`;
  const tab: Tab = {
    id,
    name: `New Request ${tabCounter}`,
    method: "GET",
    url: "",
    protocol: "http://",
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
  };
  setTabs([...tabs(), tab]);
  setActiveTabId(id);
  return tab;
}

export function openRequestInTab(req: api.SavedRequest) {
  // Check if already open
  const existing = tabs().find(t => t.savedRequestId === req.id);
  if (existing) {
    setActiveTabId(existing.id);
    return;
  }

  tabCounter++;
  const id = `tab-${tabCounter}-${Date.now()}`;
  const tab: Tab = {
    id,
    name: req.name,
    method: req.method,
    url: req.url,
    protocol: "http://",
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
  };
  setTabs([...tabs(), tab]);
  setActiveTabId(id);
}

export function closeTab(tabId: string) {
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
}

export function closeAllTabs() {
  setTabs([]);
  setActiveTabId(null);
}

export function closeOtherTabs(keepTabId: string) {
  const kept = tabs().filter(t => t.id === keepTabId);
  setTabs(kept);
  if (kept.length > 0) {
    setActiveTabId(kept[0].id);
  } else {
    setActiveTabId(null);
  }
}

export function updateTab(tabId: string, updates: Partial<Tab>) {
  setTabs(tabs().map(t => t.id === tabId ? { ...t, ...updates, dirty: true } : t));
}

export function getActiveTab(): Tab | undefined {
  return tabs().find(t => t.id === activeTabId());
}

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

export async function executeRequest(tabId: string, workspaceId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab) return;

  updateTab(tabId, { loading: true, response: null });

  try {
    let resolvedUrl = resolveGlobals(tab.url);
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(resolvedUrl)) {
      resolvedUrl = (tab.protocol || "http://") + resolvedUrl;
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

export async function saveRequest(tabId: string) {
  const tab = tabs().find(t => t.id === tabId);
  if (!tab || !tab.savedRequestId) return;

  const saved: api.SavedRequest = {
    id: tab.savedRequestId,
    collection_id: "",
    name: tab.name,
    method: tab.method,
    url: tab.url,
    headers: tab.headers,
    params: tab.params,
    body: tab.body,
    auth: tab.auth,
    pre_script: tab.preScript,
    post_script: tab.postScript,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };

  // Get the real collection_id from the original request
  const original = await api.getRequest(tab.savedRequestId);
  if (original) {
    saved.collection_id = original.collection_id;
    saved.sort_order = original.sort_order;
    saved.created_at = original.created_at;
  }

  await api.updateRequest(saved);
  updateTab(tabId, { dirty: false });
}
