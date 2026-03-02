import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    githubId: v.optional(v.string()),
  }).index("email", ["email"]),

  teams: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    isPersonal: v.boolean(),
  })
    .index("by_creator", ["createdBy"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("member")),
  })
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"])
    .index("by_team_user", ["teamId", "userId"]),

  teamInvites: defineTable({
    teamId: v.id("teams"),
    email: v.string(),
    invitedBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("blocked")
    ),
    token: v.string(),
  })
    .index("by_team", ["teamId"])
    .index("by_email", ["email"])
    .index("by_token", ["token"]),

  collections: defineTable({
    teamId: v.id("teams"),
    clientId: v.string(),
    parentClientId: v.optional(v.string()),
    name: v.string(),
    sortOrder: v.number(),
    deleted: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_clientId", ["clientId"])
    .index("by_team_updated", ["teamId", "updatedAt"]),

  requests: defineTable({
    teamId: v.id("teams"),
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
  })
    .index("by_team", ["teamId"])
    .index("by_clientId", ["clientId"])
    .index("by_collection", ["collectionClientId"])
    .index("by_team_updated", ["teamId", "updatedAt"]),

  environments: defineTable({
    teamId: v.id("teams"),
    clientId: v.string(),
    name: v.string(),
    variables: v.string(),
    deleted: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_clientId", ["clientId"])
    .index("by_team_updated", ["teamId", "updatedAt"]),

  history: defineTable({
    teamId: v.id("teams"),
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
    userId: v.id("users"),
  })
    .index("by_team", ["teamId"])
    .index("by_clientId", ["clientId"])
    .index("by_team_timestamp", ["teamId", "timestamp"]),
});
