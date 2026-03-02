import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

async function assertTeamMember(ctx: any, teamId: any, userId: any) {
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q: any) => q.eq("teamId", teamId).eq("userId", userId))
    .first();
  if (!membership) throw new Error("Not a team member");
  return membership;
}

const collectionValidator = v.object({
  clientId: v.string(),
  parentClientId: v.optional(v.string()),
  name: v.string(),
  sortOrder: v.number(),
  deleted: v.boolean(),
  updatedAt: v.number(),
});

const requestValidator = v.object({
  clientId: v.string(),
  collectionClientId: v.string(),
  name: v.string(),
  method: v.string(),
  url: v.string(),
  headers: v.string(),
  params: v.string(),
  body: v.string(),
  auth: v.string(),
  preScript: v.string(),
  postScript: v.string(),
  sortOrder: v.number(),
  deleted: v.boolean(),
  updatedAt: v.number(),
});

const environmentValidator = v.object({
  clientId: v.string(),
  name: v.string(),
  variables: v.string(),
  deleted: v.boolean(),
  updatedAt: v.number(),
});

const historyValidator = v.object({
  clientId: v.string(),
  method: v.string(),
  url: v.string(),
  status: v.number(),
  durationMs: v.number(),
  responseSize: v.number(),
  timestamp: v.string(),
  requestData: v.string(),
  responseHeaders: v.string(),
  responseBodyPreview: v.string(),
});

const deletionValidator = v.object({
  entityType: v.string(),
  clientId: v.string(),
});

export const push = mutation({
  args: {
    teamId: v.id("teams"),
    collections: v.array(collectionValidator),
    requests: v.array(requestValidator),
    environments: v.array(environmentValidator),
    history: v.array(historyValidator),
    deletions: v.array(deletionValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await assertTeamMember(ctx, args.teamId, userId);

    // Upsert collections
    for (const col of args.collections) {
      const existing = await ctx.db
        .query("collections")
        .withIndex("by_clientId", (q) => q.eq("clientId", col.clientId))
        .first();

      if (existing) {
        if (existing.updatedAt >= col.updatedAt) continue; // LWW
        await ctx.db.patch(existing._id, { ...col, teamId: args.teamId });
      } else {
        await ctx.db.insert("collections", { ...col, teamId: args.teamId });
      }
    }

    // Upsert requests
    for (const req of args.requests) {
      const existing = await ctx.db
        .query("requests")
        .withIndex("by_clientId", (q) => q.eq("clientId", req.clientId))
        .first();

      if (existing) {
        if (existing.updatedAt >= req.updatedAt) continue;
        await ctx.db.patch(existing._id, { ...req, teamId: args.teamId });
      } else {
        await ctx.db.insert("requests", { ...req, teamId: args.teamId });
      }
    }

    // Upsert environments
    for (const env of args.environments) {
      const existing = await ctx.db
        .query("environments")
        .withIndex("by_clientId", (q) => q.eq("clientId", env.clientId))
        .first();

      if (existing) {
        if (existing.updatedAt >= env.updatedAt) continue;
        await ctx.db.patch(existing._id, { ...env, teamId: args.teamId });
      } else {
        await ctx.db.insert("environments", { ...env, teamId: args.teamId });
      }
    }

    // Append history (insert only, no upsert)
    for (const h of args.history) {
      const existing = await ctx.db
        .query("history")
        .withIndex("by_clientId", (q) => q.eq("clientId", h.clientId))
        .first();

      if (!existing) {
        await ctx.db.insert("history", { ...h, teamId: args.teamId, userId });
      }
    }

    // Process deletions (soft-delete on Convex side)
    for (const del of args.deletions) {
      const table = del.entityType as "collections" | "requests" | "environments";
      if (!["collections", "requests", "environments"].includes(table)) continue;

      const existing = await ctx.db
        .query(table)
        .withIndex("by_clientId", (q) => q.eq("clientId", del.clientId))
        .first();

      if (existing && !existing.deleted) {
        await ctx.db.patch(existing._id, { deleted: true, updatedAt: Date.now() });
      }
    }
  },
});

export const pull = query({
  args: {
    teamId: v.id("teams"),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await assertTeamMember(ctx, args.teamId, userId);

    const collections = await ctx.db
      .query("collections")
      .withIndex("by_team_updated", (q) =>
        q.eq("teamId", args.teamId).gt("updatedAt", args.since)
      )
      .collect();

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_team_updated", (q) =>
        q.eq("teamId", args.teamId).gt("updatedAt", args.since)
      )
      .collect();

    const environments = await ctx.db
      .query("environments")
      .withIndex("by_team_updated", (q) =>
        q.eq("teamId", args.teamId).gt("updatedAt", args.since)
      )
      .collect();

    // History doesn't have updatedAt, use _creationTime
    const history = await ctx.db
      .query("history")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.gt(q.field("_creationTime"), args.since))
      .collect();

    return { collections, requests, environments, history };
  },
});

export const pullInitial = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await assertTeamMember(ctx, args.teamId, userId);

    const collections = await ctx.db
      .query("collections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("deleted"), false))
      .collect();

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("deleted"), false))
      .collect();

    const environments = await ctx.db
      .query("environments")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("deleted"), false))
      .collect();

    const history = await ctx.db
      .query("history")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(500);

    return { collections, requests, environments, history };
  },
});

export const pruneHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all teams
    const teams = await ctx.db.query("teams").collect();

    for (const team of teams) {
      const history = await ctx.db
        .query("history")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .order("desc")
        .collect();

      // Delete entries beyond 500
      if (history.length > 500) {
        const toDelete = history.slice(500);
        for (const entry of toDelete) {
          await ctx.db.delete(entry._id);
        }
      }
    }
  },
});
