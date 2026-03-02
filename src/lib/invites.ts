import { createSignal } from "solid-js";
import { getConvexClient } from "./convex";
import { api } from "../../convex/_generated/api";

export interface PendingInvite {
  _id: string;
  token: string;
  teamId: string;
  teamName: string;
  inviterName: string;
}

const [pendingInvites, setPendingInvites] = createSignal<PendingInvite[]>([]);
export { pendingInvites };

export const pendingInviteCount = () => pendingInvites().length;

let unsubscribe: (() => void) | null = null;

export function startInviteWatch() {
  if (unsubscribe) return;
  const client = getConvexClient();
  unsubscribe = client.onUpdate(api.teams.pendingInvites, {}, (invites) => {
    setPendingInvites((invites as PendingInvite[]) ?? []);
  });
}

export function stopInviteWatch() {
  unsubscribe?.();
  unsubscribe = null;
  setPendingInvites([]);
}

export async function acceptInvite(token: string) {
  await getConvexClient().mutation(api.teams.acceptInvite, { token });
}

export async function declineInvite(token: string) {
  await getConvexClient().mutation(api.teams.declineInvite, { token });
}

export async function blockInvite(token: string) {
  await getConvexClient().mutation(api.teams.blockInvite, { token });
}
