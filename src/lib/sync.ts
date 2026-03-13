import { createSignal } from "solid-js";
import { getConvexClient } from "./convex";
import { api } from "../../convex/_generated/api";
import { invoke } from "@tauri-apps/api/core";
import type { Id } from "../../convex/_generated/dataModel";
import { activeTeamId, isAuthenticated } from "./auth";
import { activeTeam } from "../stores/collections";
import { tabs, updateTab } from "../stores/request";
import * as localApi from "./api";
import { showToast } from "../stores/toast";
import { captureError } from "./telemetry";

export type SyncState = "offline" | "syncing" | "synced" | "error";

export interface SyncErrorEntry {
  timestamp: number;
  message: string;
}

const [syncState, setSyncState] = createSignal<SyncState>("offline");
const [syncError, setSyncError] = createSignal<string | null>(null);
const [syncErrorLog, setSyncErrorLog] = createSignal<SyncErrorEntry[]>([]);
export { syncState, syncError, syncErrorLog };

function addSyncError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  setSyncError(message);
  setSyncErrorLog(prev => [...prev, { timestamp: Date.now(), message }]);
}

export function clearSyncErrorLog() {
  setSyncErrorLog([]);
}

let unsubscribe: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushedAt = 0;
let syncStopped = false;
let isPushing = false;
let hasReconciled = false;
const recentlyPushedClientIds = new Set<string>();

// Map singular entity types from Rust tombstones to plural Convex table names
const ENTITY_TYPE_MAP: Record<string, "collections" | "requests" | "environments"> = {
  collection: "collections",
  request: "requests",
  environment: "environments",
};

export function startSync(convexTeamId: string, localTeamId: string) {
  stopSync();
  syncStopped = false;
  setSyncState("syncing");

  const client = getConvexClient();
  const teamId = convexTeamId as Id<"teams">;

  // Get sync state from local DB
  invoke<{ lastPullAt: number; lastPushAt: number }>("get_sync_state", { teamId: localTeamId })
    .then((state) => {
      // Guard against stopSync() called while invoke was pending
      if (syncStopped) return;

      lastPushedAt = state.lastPushAt;

      // Subscribe to pull query for real-time updates
      unsubscribe = client.onUpdate(
        api.sync.pull,
        { teamId, since: state.lastPullAt },
        async (result) => {
          if (syncStopped || !result) return;
          try {
            await applyRemoteChanges(result, localTeamId);
            if (syncStopped) return;
            setSyncState("synced");
            setSyncError(null);
            if (!hasReconciled) {
              hasReconciled = true;
              reconcileRestoredTabs();
            }
          } catch (err) {
            console.error("Sync pull error:", err);
            captureError(err, { context: "sync_pull" });
            if (syncStopped) return;
            setSyncState("error");
            addSyncError(err);
          }
        }
      );
    })
    .catch((err) => {
      console.error("Failed to start sync:", err);
      captureError(err, { context: "sync_start" });
      if (!syncStopped) {
        setSyncState("error");
        addSyncError(err);
      }
    });
}

/** @internal Exported for testing */
export async function applyRemoteChanges(result: any, localTeamId: string) {
  const { collections, requests, environments, history } = result;

  // Apply collections
  for (const col of collections || []) {
    if (recentlyPushedClientIds.has(col.clientId)) continue;

    if (col.deleted) {
      await invoke("soft_delete_entity", { entityType: "collection", entityId: col.clientId });
    } else {
      await invoke("upsert_collection", {
        collection: {
          id: col.clientId,
          team_id: localTeamId,
          parent_id: col.parentClientId || null,
          name: col.name,
          sort_order: col.sortOrder,
          // Use _creationTime for created_at (preserves original creation time)
          created_at: new Date(col._creationTime ?? col.updatedAt).toISOString(),
          updated_at: new Date(col.updatedAt).toISOString(),
        },
      });
    }
  }

  // Apply requests
  for (const req of requests || []) {
    if (recentlyPushedClientIds.has(req.clientId)) continue;

    if (req.deleted) {
      await invoke("soft_delete_entity", { entityType: "request", entityId: req.clientId });
    } else {
      await invoke("upsert_request", {
        request: {
          id: req.clientId,
          collection_id: req.collectionClientId,
          name: req.name,
          method: req.method,
          url: req.url,
          headers: JSON.parse(req.headers || "[]"),
          params: JSON.parse(req.params || "[]"),
          body: JSON.parse(req.body || '{"type":"none"}'),
          auth: JSON.parse(req.auth || '{"type":"none"}'),
          pre_script: req.preScript,
          post_script: req.postScript,
          ws_messages: JSON.parse(req.wsMessages || "[]"),
          sort_order: req.sortOrder,
          created_at: new Date(req._creationTime ?? req.updatedAt).toISOString(),
          updated_at: new Date(req.updatedAt).toISOString(),
        },
      });
    }
  }

  // Apply environments
  for (const env of environments || []) {
    if (recentlyPushedClientIds.has(env.clientId)) continue;

    if (env.deleted) {
      await invoke("soft_delete_entity", { entityType: "environment", entityId: env.clientId });
    } else {
      await invoke("upsert_environment", {
        environment: {
          id: env.clientId,
          team_id: localTeamId,
          name: env.name,
          variables: JSON.parse(env.variables || "[]"),
          created_at: new Date(env._creationTime ?? env.updatedAt).toISOString(),
          updated_at: new Date(env.updatedAt).toISOString(),
        },
      });
    }
  }

  // Apply history
  for (const h of history || []) {
    if (recentlyPushedClientIds.has(h.clientId)) continue;

    await invoke("upsert_history", {
      entry: {
        id: h.clientId,
        team_id: localTeamId,
        method: h.method,
        url: h.url,
        status: h.status,
        duration_ms: h.durationMs,
        response_size: h.responseSize,
        timestamp: h.timestamp,
        request_data: h.requestData,
        response_headers: h.responseHeaders,
        response_body_preview: h.responseBodyPreview,
      },
    });
  }

  // Update sync cursor
  const allItems = [
    ...(collections || []),
    ...(requests || []),
    ...(environments || []),
  ];
  const timestamps = [
    ...allItems.map((e: Record<string, unknown>) => (e.updatedAt as number) || 0),
    ...(history || []).map((h: Record<string, unknown>) => (h._creationTime as number) || 0),
  ];
  const maxUpdatedAt = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  if (maxUpdatedAt > 0) {
    const currentState = await invoke<{ lastPullAt: number; lastPushAt: number }>(
      "get_sync_state",
      { teamId: localTeamId }
    );
    await invoke("set_sync_state", {
      teamId: localTeamId,
      lastPull: Math.floor(maxUpdatedAt),
      lastPush: currentState.lastPushAt,
    });
  }
}

export function schedulePush(convexTeamId: string, localTeamId: string) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushChanges(convexTeamId, localTeamId), 2000);
}

async function pushChanges(convexTeamId: string, localTeamId: string) {
  // Guard against concurrent pushes
  if (isPushing) return;
  isPushing = true;

  try {
    setSyncState("syncing");
    const teamId = convexTeamId as Id<"teams">;

    const syncState = await invoke<{ lastPullAt: number; lastPushAt: number }>(
      "get_sync_state",
      { teamId: localTeamId }
    );

    // Get modified entities
    const modified = await invoke<{
      collections: any[];
      requests: any[];
      environments: any[];
      history: any[];
    }>("get_modified_since", { teamId: localTeamId, sinceMs: syncState.lastPushAt });

    // Get unsynced deletes
    const deletes = await invoke<Array<{ id: string; entityType: string; entityId: string }>>(
      "get_unsynced_deletes"
    );

    // Map local data to Convex format
    const collections = (modified.collections || []).map((c: any) => ({
      clientId: c.id,
      parentClientId: c.parent_id || undefined,
      name: c.name,
      sortOrder: c.sort_order,
      deleted: false,
      updatedAt: new Date(c.updated_at).getTime(),
    }));

    const requests = (modified.requests || []).map((r: any) => ({
      clientId: r.id,
      collectionClientId: r.collection_id,
      name: r.name,
      method: r.method,
      url: r.url,
      headers: JSON.stringify(r.headers),
      params: JSON.stringify(r.params),
      body: JSON.stringify(r.body),
      auth: JSON.stringify(r.auth),
      preScript: r.pre_script,
      postScript: r.post_script,
      wsMessages: JSON.stringify(r.ws_messages || []),
      sortOrder: r.sort_order,
      deleted: false,
      updatedAt: new Date(r.updated_at).getTime(),
    }));

    const environments = (modified.environments || []).map((e: any) => ({
      clientId: e.id,
      name: e.name,
      variables: JSON.stringify(e.variables),
      deleted: false,
      updatedAt: new Date(e.updated_at).getTime(),
    }));

    const history = (modified.history || []).map((h: any) => ({
      clientId: h.id,
      method: h.method,
      url: h.url,
      status: h.status,
      durationMs: h.duration_ms,
      responseSize: h.response_size,
      timestamp: h.timestamp,
      requestData: h.request_data,
      responseHeaders: h.response_headers,
      responseBodyPreview: h.response_body_preview,
    }));

    // Map singular entity types from Rust to plural Convex table names
    const deletions = (deletes || [])
      .map((d) => ({
        ...d,
        mappedType: ENTITY_TYPE_MAP[d.entityType],
      }))
      .filter((d) => d.mappedType !== undefined)
      .map((d) => ({
        entityType: d.mappedType!,
        clientId: d.entityId,
      }));

    // Only push if there's something to push
    if (collections.length || requests.length || environments.length || history.length || deletions.length) {
      const allClientIds = [
        ...collections.map((c) => c.clientId),
        ...requests.map((r) => r.clientId),
        ...environments.map((e) => e.clientId),
        ...history.map((h) => h.clientId),
      ];

      const client = getConvexClient();
      await client.mutation(api.sync.push, {
        teamId,
        collections,
        requests,
        environments,
        history,
        deletions,
      });

      // Track pushed IDs AFTER successful push to avoid suppressing on failure
      for (const id of allClientIds) recentlyPushedClientIds.add(id);
      setTimeout(() => {
        for (const id of allClientIds) recentlyPushedClientIds.delete(id);
      }, 10000);

      // Mark deletes as synced
      if (deletes.length) {
        await invoke("mark_deletes_synced", { ids: deletes.map((d) => d.id) });
      }

      // Update push timestamp only when data was actually pushed
      const now = Date.now();
      lastPushedAt = now;
      await invoke("set_sync_state", {
        teamId: localTeamId,
        lastPull: syncState.lastPullAt,
        lastPush: now,
      });
    }

    setSyncState("synced");
    setSyncError(null);
  } catch (err) {
    console.error("Sync push error:", err);
    captureError(err, { context: "sync_push" });
    setSyncState("error");
    addSyncError(err);
  } finally {
    isPushing = false;
  }
}

async function reconcileRestoredTabs() {
  const detached: string[] = [];
  for (const tab of tabs()) {
    if (tab.savedRequestId) {
      try {
        const exists = await localApi.getRequest(tab.savedRequestId);
        if (!exists) {
          updateTab(tab.id, { savedRequestId: null, dirty: true } as any);
          detached.push(tab.name);
        }
      } catch {
        // Request lookup failed — leave tab as-is
      }
    }
  }
  if (detached.length > 0) {
    showToast(`${detached.length} tab(s) detached as drafts (original requests were deleted): ${detached.join(", ")}`);
  }
}

export function stopSync() {
  syncStopped = true;
  hasReconciled = false;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  recentlyPushedClientIds.clear();
  setSyncState("offline");
}

export function triggerPush() {
  if (!isAuthenticated()) return;
  const convexId = activeTeamId();
  const localId = activeTeam();
  if (convexId && localId) {
    schedulePush(convexId, localId);
  }
}
