import { getConvexClient } from "./convex";
import { api } from "../../convex/_generated/api";
import { getAllForTeam } from "./api";
import type { Id } from "../../convex/_generated/dataModel";

export async function migrateLocalData(
  convexTeamId: string,
  localTeamId: string
): Promise<void> {
  const migrationKey = `migrated_${localTeamId}_${convexTeamId}`;
  if (localStorage.getItem(migrationKey)) return;

  const data = await getAllForTeam(localTeamId);

  const client = getConvexClient();
  const teamId = convexTeamId as Id<"teams">;

  // Push in batches of 50
  const batchSize = 50;

  // Push collections
  for (let i = 0; i < data.collections.length; i += batchSize) {
    const batch = data.collections.slice(i, i + batchSize);
    await client.mutation(api.sync.push, {
      teamId,
      collections: batch.map((c) => ({
        clientId: c.id,
        parentClientId: c.parent_id || undefined,
        name: c.name,
        sortOrder: c.sort_order,
        deleted: false,
        updatedAt: new Date(c.updated_at).getTime(),
      })),
      requests: [],
      environments: [],
      history: [],
      deletions: [],
    });
  }

  // Push requests
  for (let i = 0; i < data.requests.length; i += batchSize) {
    const batch = data.requests.slice(i, i + batchSize);
    await client.mutation(api.sync.push, {
      teamId,
      collections: [],
      requests: batch.map((r) => ({
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
      })),
      environments: [],
      history: [],
      deletions: [],
    });
  }

  // Push environments
  for (let i = 0; i < data.environments.length; i += batchSize) {
    const batch = data.environments.slice(i, i + batchSize);
    await client.mutation(api.sync.push, {
      teamId,
      collections: [],
      requests: [],
      environments: batch.map((e) => ({
        clientId: e.id,
        name: e.name,
        variables: JSON.stringify(e.variables),
        deleted: false,
        updatedAt: new Date(e.updated_at).getTime(),
      })),
      history: [],
      deletions: [],
    });
  }

  // Push history (limited to most recent 500)
  const recentHistory = data.history.slice(0, 500);
  for (let i = 0; i < recentHistory.length; i += batchSize) {
    const batch = recentHistory.slice(i, i + batchSize);
    await client.mutation(api.sync.push, {
      teamId,
      collections: [],
      requests: [],
      environments: [],
      history: batch.map((h) => ({
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
      })),
      deletions: [],
    });
  }

  localStorage.setItem(migrationKey, "true");
}
