import { createSignal, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import * as api from "../lib/api";

export interface CollectionNode {
  collection: api.Collection;
  children: CollectionNode[];
  requests: api.SavedRequest[];
  expanded: boolean;
}

const [workspaces, setWorkspaces] = createSignal<api.Workspace[]>([]);
const [activeWorkspace, setActiveWorkspace] = createSignal<string>("");
const [collections, setCollections] = createStore<CollectionNode[]>([]);
const [loading, setLoading] = createSignal(false);

export { workspaces, activeWorkspace, collections, loading };

export async function loadWorkspaces() {
  const ws = await api.listWorkspaces();
  setWorkspaces(ws);
  if (ws.length > 0 && !activeWorkspace()) {
    setActiveWorkspace(ws[0].id);
    await loadCollections(ws[0].id);
  }
}

export async function loadCollections(workspaceId: string) {
  setLoading(true);
  try {
    const cols = await api.listCollections(workspaceId);
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
  const wsId = activeWorkspace();
  if (!wsId) return;
  await api.createCollection(wsId, parentId, name);
  await loadCollections(wsId);
}

export async function removeCollection(id: string) {
  await api.deleteCollection(id);
  const wsId = activeWorkspace();
  if (wsId) await loadCollections(wsId);
}

export async function addRequest(collectionId: string, name: string, method: string = "GET") {
  await api.createRequest(collectionId, name, method, "");
  const wsId = activeWorkspace();
  if (wsId) await loadCollections(wsId);
}

export async function removeRequest(id: string) {
  await api.deleteRequest(id);
  const wsId = activeWorkspace();
  if (wsId) await loadCollections(wsId);
}
