import GitHub from "@auth/core/providers/github";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    GitHub({
      profile(githubProfile) {
        return {
          id: String(githubProfile.id),
          name: githubProfile.name ?? githubProfile.login,
          email: githubProfile.email,
          image: githubProfile.avatar_url,
          githubId: String(githubProfile.id),
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }

      const userId = await ctx.db.insert("users", {
        name: args.profile.name ?? args.profile.email ?? "User",
        email: args.profile.email ?? undefined,
        image: args.profile.image ?? undefined,
        githubId: (args.profile as any).githubId ?? undefined,
      });

      // Auto-create personal team
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

      return userId;
    },
    async redirect({ redirectTo }) {
      return redirectTo;
    },
  },
});
