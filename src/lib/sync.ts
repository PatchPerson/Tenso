import { createSignal } from "solid-js";
import { getConvexClient } from "./convex";
import { api } from "../../convex/_generated/api";
import { invoke } from "@tauri-apps/api/core";
import type { Id } from "../../convex/_generated/dataModel";

export type SyncState = "offline" | "syncing" | "synced" | "error";

const [syncState, setSyncState] = createSignal<SyncState>("offline");
export { syncState };

let unsubscribe: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushedAt = 0;
const recentlyPushedClientIds = new Set<string>();

export function startSync(convexTeamId: string, localTeamId: string) {
  stopSync();
  setSyncState("syncing");

  const client = getConvexClient();
  const teamId = convexTeamId as Id<"teams">;

  // Get sync state from local DB
  invoke<{ lastPullAt: number; lastPushAt: number }>("get_sync_state", { teamId: localTeamId })
    .then((state) => {
      lastPushedAt = state.lastPushAt;

      // Subscribe to pull query for real-time updates
      unsubscribe = client.onUpdate(
        api.sync.pull,
        { teamId, since: state.lastPullAt },
        async (result) => {
          if (!result) return;
          try {
            await applyRemoteChanges(result, localTeamId);
            setSyncState("synced");
          } catch (err) {
            console.error("Sync pull error:", err);
            setSyncState("error");
          }
        }
      );
    })
    .catch((err) => {
      console.error("Failed to start sync:", err);
      setSyncState("error");
    });
}

async function applyRemoteChanges(result: any, localTeamId: string) {
  const { collections, requests, environments, history } = result;

  // Apply collections
  for (const col of collections || []) {
    // Skip echo (our own changes bouncing back)
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
          created_at: new Date(col.updatedAt).toISOString(),
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
          sort_order: req.sortOrder,
          created_at: new Date(req.updatedAt).toISOString(),
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
          created_at: new Date(env.updatedAt).toISOString(),
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
  const maxUpdatedAt = Math.max(
    ...([...(collections || []), ...(requests || []), ...(environments || [])].map(
      (e: any) => e.updatedAt || 0
    )),
    ...(history || []).map((h: any) => h._creationTime || 0),
    0
  );

  if (maxUpdatedAt > 0) {
    const currentState = await invoke<{ lastPullAt: number; lastPushAt: number }>(
      "get_sync_state",
      { teamId: localTeamId }
    );
    await invoke("set_sync_state", {
      teamId: localTeamId,
      lastPull: maxUpdatedAt,
      lastPush: currentState.lastPushAt,
    });
  }
}

export function schedulePush(convexTeamId: string, localTeamId: string) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushChanges(convexTeamId, localTeamId), 2000);
}

async function pushChanges(convexTeamId: string, localTeamId: string) {
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

    const deletions = (deletes || []).map((d) => ({
      entityType: d.entityType,
      clientId: d.entityId,
    }));

    // Only push if there's something to push
    if (collections.length || requests.length || environments.length || history.length || deletions.length) {
      // Track pushed client IDs to avoid echo
      for (const c of collections) recentlyPushedClientIds.add(c.clientId);
      for (const r of requests) recentlyPushedClientIds.add(r.clientId);
      for (const e of environments) recentlyPushedClientIds.add(e.clientId);
      for (const h of history) recentlyPushedClientIds.add(h.clientId);

      // Clear old tracked IDs after 10s
      setTimeout(() => {
        for (const c of collections) recentlyPushedClientIds.delete(c.clientId);
        for (const r of requests) recentlyPushedClientIds.delete(r.clientId);
        for (const e of environments) recentlyPushedClientIds.delete(e.clientId);
        for (const h of history) recentlyPushedClientIds.delete(h.clientId);
      }, 10000);

      const client = getConvexClient();
      await client.mutation(api.sync.push, {
        teamId,
        collections,
        requests,
        environments,
        history,
        deletions,
      });

      // Mark deletes as synced
      if (deletes.length) {
        await invoke("mark_deletes_synced", { ids: deletes.map((d) => d.id) });
      }
    }

    // Update push timestamp
    const now = Date.now();
    lastPushedAt = now;
    await invoke("set_sync_state", {
      teamId: localTeamId,
      lastPull: syncState.lastPullAt,
      lastPush: now,
    });

    setSyncState("synced");
  } catch (err) {
    console.error("Sync push error:", err);
    setSyncState("error");
  }
}

export function stopSync() {
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
