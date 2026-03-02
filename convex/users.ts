import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const teams = await Promise.all(
      memberships.map(async (m) => {
        const team = await ctx.db.get(m.teamId);
        return team ? { ...team, role: m.role } : null;
      })
    );

    return {
      ...user,
      teams: teams.filter(Boolean),
    };
  },
});

export const ensurePersonalTeam = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (team?.isPersonal) return team;
    }

    // No personal team found, create one
    const teamId = await ctx.db.insert("teams", {
      name: "Personal",
      createdBy: userId,
      isPersonal: true,
    });

    await ctx.db.insert("teamMembers", {
      teamId,
      userId,
      role: "owner",
    });

    return await ctx.db.get(teamId);
  },
});
