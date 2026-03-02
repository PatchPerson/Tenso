import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "prune-history",
  { hourUTC: 3, minuteUTC: 0 },
  internal.sync.pruneHistory
);

crons.weekly(
  "cleanup-invites",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.teams.cleanupInvites
);

export default crons;
