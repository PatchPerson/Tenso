import { tabs, setTabs, activeTabId, setActiveTabId, type Tab } from "../stores/request";
import { activeTeam, expandedFolders, setExpandedFolders } from "../stores/collections";
import * as api from "./api";
import { showToast } from "../stores/toast";

// --- Types ---

interface PersistedSession {
  version: 1;
  teamId: string;
  activeTabId: string | null;
  tabs: PersistedTab[];
  expandedFolders: string[];
  savedAt: number;
}

interface PersistedTab {
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
  savedRequestId: string | null;
  dirty: boolean;
  wsTemplates: api.WsMessageTemplate[];
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

// --- Constants ---

const SESSION_KEY_PREFIX = "tenso-session:";
const SUPPRESS_KEY = "tenso-suppress-close-warning";

// --- Close warning preference ---

export function isCloseWarningSuppressed(): boolean {
  return localStorage.getItem(SUPPRESS_KEY) === "true";
}

export function suppressCloseWarning(): void {
  localStorage.setItem(SUPPRESS_KEY, "true");
}

export function resetCloseWarning(): void {
  localStorage.removeItem(SUPPRESS_KEY);
}

// --- Serialization ---

function serializeTab(tab: Tab): PersistedTab {
  return {
    id: tab.id,
    name: tab.name,
    method: tab.method,
    url: tab.url,
    protocolType: tab.protocolType,
    secure: tab.secure,
    headers: tab.headers,
    params: tab.params,
    body: tab.body,
    auth: tab.auth,
    preScript: tab.preScript,
    postScript: tab.postScript,
    savedRequestId: tab.savedRequestId,
    dirty: tab.dirty,
    wsTemplates: tab.wsTemplates,
    _protocolStash: tab._protocolStash,
  };
}

function deserializeTab(pt: PersistedTab): Tab {
  return {
    ...pt,
    response: null,
    loading: false,
    wsStatus: "disconnected",
    wsMessages: [],
    wsComposerContent: "",
    wsComposerFormat: "text",
  };
}

// --- Save / Restore ---

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let restoring = false;

export function saveSession(): void {
  const teamId = activeTeam();
  if (!teamId || restoring) return;

  const session: PersistedSession = {
    version: 1,
    teamId,
    activeTabId: activeTabId(),
    tabs: tabs().map(serializeTab),
    expandedFolders: Array.from(expandedFolders()),
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(SESSION_KEY_PREFIX + teamId, JSON.stringify(session));
  } catch (err) {
    console.warn("Failed to persist session:", err);
  }
}

export function restoreSession(teamId: string): boolean {
  if (!teamId) return false;

  const raw = localStorage.getItem(SESSION_KEY_PREFIX + teamId);
  if (!raw) return false;

  try {
    const session: PersistedSession = JSON.parse(raw);
    if (session.version !== 1 || session.teamId !== teamId) return false;
    if (!Array.isArray(session.tabs)) return false;

    restoring = true;

    const restoredTabs = session.tabs.map(deserializeTab);
    setTabs(restoredTabs);

    if (session.activeTabId && restoredTabs.some(t => t.id === session.activeTabId)) {
      setActiveTabId(session.activeTabId);
    } else if (restoredTabs.length > 0) {
      setActiveTabId(restoredTabs[0].id);
    }

    if (Array.isArray(session.expandedFolders)) {
      setExpandedFolders(new Set(session.expandedFolders));
    }

    restoring = false;
    return true;
  } catch (err) {
    restoring = false;
    console.warn("Failed to restore session, starting fresh:", err);
    localStorage.removeItem(SESSION_KEY_PREFIX + teamId);
    return false;
  }
}

export function clearSession(teamId: string): void {
  localStorage.removeItem(SESSION_KEY_PREFIX + teamId);
}

export async function reconcileRestoredTabs(): Promise<void> {
  const detached: string[] = [];
  for (const tab of tabs()) {
    if (tab.savedRequestId) {
      try {
        const exists = await api.getRequest(tab.savedRequestId);
        if (!exists) {
          setTabs(tabs().map(t =>
            t.id === tab.id ? { ...t, savedRequestId: null, dirty: true } : t
          ));
          detached.push(tab.name);
        }
      } catch {
        // Local DB query failed — leave tab as-is
      }
    }
  }
  if (detached.length > 0) {
    showToast(`${detached.length} tab(s) detached as drafts (original requests deleted): ${detached.join(", ")}`);
    scheduleImmediateSave();
  }
}

// --- Debounced save scheduling ---

export function scheduleSave(): void {
  if (restoring) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSession();
  }, 500);
}

export function scheduleImmediateSave(): void {
  if (restoring) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSession();
  }, 50);
}
