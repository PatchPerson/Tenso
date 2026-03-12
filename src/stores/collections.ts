import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import * as api from "../lib/api";
import { triggerPush } from "../lib/sync";
import { scheduleSave } from "../lib/session";

export interface CollectionNode {
  collection: api.Collection;
  children: CollectionNode[];
  requests: api.SavedRequest[];
  expanded: boolean;
}

const [teams, setTeams] = createSignal<api.Team[]>([]);
const [activeTeam, setActiveTeam] = createSignal<string>("");
const [collections, setCollections] = createStore<CollectionNode[]>([]);
const [loading, setLoading] = createSignal(false);

// Alias for backward compatibility
const activeWorkspace = activeTeam;

export { teams, activeTeam, activeWorkspace, collections, loading };

// --- Last used collection tracking ---
const LAST_COLLECTION_KEY = "last_used_collection_id";
const [lastUsedCollectionId, setLastUsedCollectionIdRaw] = createSignal<string | null>(
  localStorage.getItem(LAST_COLLECTION_KEY)
);

export function setLastUsedCollectionId(id: string) {
  setLastUsedCollectionIdRaw(id);
  localStorage.setItem(LAST_COLLECTION_KEY, id);
}

export function getDefaultCollectionId(): string | null {
  const last = lastUsedCollectionId();
  if (last) return last;
  if (collections.length > 0) return collections[0].collection.id;
  return null;
}

// --- Folder expand state ---
const [expandedFolders, setExpandedFolders] = createSignal<Set<string>>(new Set<string>());
export { expandedFolders, setExpandedFolders };

export function expandFolder(id: string) {
  setExpandedFolders(prev => {
    if (prev.has(id)) return prev;
    const next = new Set(prev);
    next.add(id);
    return next;
  });
  scheduleSave();
}

export function toggleFolder(id: string) {
  setExpandedFolders(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  scheduleSave();
}

const [refreshTrigger, setRefreshTrigger] = createSignal(0);
export { refreshTrigger };
export function triggerRefresh() {
  setRefreshTrigger(refreshTrigger() + 1);
  const teamId = activeTeam();
  if (teamId) loadCollections(teamId);
}

export async function loadTeams() {
  const ts = await api.listTeams();
  setTeams(ts);
  if (ts.length > 0 && !activeTeam()) {
    setActiveTeam(ts[0].id);
    await loadCollections(ts[0].id);
  }
}

export async function loadCollections(teamId: string) {
  setLoading(true);
  try {
    const cols = await api.listCollections(teamId);
    const nodes: CollectionNode[] = [];
    const map = new Map<string, CollectionNode>();

    for (const col of cols) {
      const node: CollectionNode = { collection: col, children: [], requests: [], expanded: false };
      map.set(col.id, node);
    }

    for (const col of cols) {
      const node = map.get(col.id)!;
      if (col.parent_id && map.has(col.parent_id)) {
        map.get(col.parent_id)!.children.push(node);
      } else {
        nodes.push(node);
      }
    }

    // Load requests for each collection
    for (const col of cols) {
      const reqs = await api.listRequests(col.id);
      const node = map.get(col.id)!;
      node.requests = reqs;
    }

    setCollections(nodes);
  } finally {
    setLoading(false);
  }
}

export async function addCollection(name: string, parentId: string | null = null) {
  const teamId = activeTeam();
  if (!teamId) return;
  await api.createCollection(teamId, parentId, name);
  await loadCollections(teamId);
  triggerPush();
}

export async function removeCollection(id: string) {
  const teamId = activeTeam();
  if (!teamId) return;

  // Rust backend handles recursive deletion of children + tombstone creation
  await api.deleteCollection(id);
  await loadCollections(teamId);
  triggerPush();
}

export async function addRequest(collectionId: string, name: string, method: string = "GET") {
  setLastUsedCollectionId(collectionId);
  await api.createRequest(collectionId, name, method, "");
  const teamId = activeTeam();
  if (teamId) await loadCollections(teamId);
  triggerPush();
}

export async function removeRequest(id: string) {
  try {
    await api.deleteRequest(id);
  } catch (err) {
    console.error("Failed to delete request:", err);
  }
  const teamId = activeTeam();
  if (teamId) await loadCollections(teamId);
  triggerPush();
}

export async function moveRequest(id: string, targetCollectionId: string) {
  try {
    await api.moveRequest(id, targetCollectionId);
    setLastUsedCollectionId(targetCollectionId);
    const teamId = activeTeam();
    if (teamId) await loadCollections(teamId);
    triggerPush();
  } catch (err) {
    console.error("Failed to move request:", err);
  }
}
