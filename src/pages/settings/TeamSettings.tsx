import { Component, Show, For, createSignal, createResource } from "solid-js";
import { isAuthenticated, authUser, signOut, activeTeamId, switchTeam } from "../../lib/auth";
import { getConvexClient } from "../../lib/convex";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { stopSync } from "../../lib/sync";

export const TeamSettings: Component = () => {
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteStatus, setInviteStatus] = createSignal<{ type: "success" | "error"; msg: string } | null>(null);
  const [inviting, setInviting] = createSignal(false);
  const [newTeamName, setNewTeamName] = createSignal("");
  const [creatingTeam, setCreatingTeam] = createSignal(false);
  const [showCreateTeam, setShowCreateTeam] = createSignal(false);

  // Fetch teams for the current user
  const [teams, { refetch: refetchTeams }] = createResource(
    () => isAuthenticated(),
    async (authed) => {
      if (!authed) return [];
      try {
        return await getConvexClient().query(api.teams.list, {});
      } catch { return []; }
    }
  );

  const currentTeam = () => (teams() || []).find((t: any) => t._id === activeTeamId());
  const isOwner = () => currentTeam()?.role === "owner";

  // Fetch members for active team
  const [members, { refetch: refetchMembers }] = createResource(
    () => activeTeamId(),
    async (teamId) => {
      if (!teamId) return [];
      try {
        return await getConvexClient().query(api.teams.listMembers, { teamId: teamId as Id<"teams"> });
      } catch { return []; }
    }
  );

  const handleInvite = async () => {
    const email = inviteEmail().trim();
    if (!email || !activeTeamId()) return;
    setInviting(true);
    setInviteStatus(null);
    try {
      await getConvexClient().mutation(api.teams.invite, {
        teamId: activeTeamId()! as Id<"teams">,
        email,
      });
      setInviteStatus({ type: "success", msg: `Invited ${email}` });
      setInviteEmail("");
    } catch (err: unknown) {
      setInviteStatus({ type: "error", msg: err instanceof Error ? err.message : "Failed to invite" });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeTeamId()) return;
    try {
      await getConvexClient().mutation(api.teams.removeMember, {
        teamId: activeTeamId()! as Id<"teams">,
        userId: userId as Id<"users">,
      });
      refetchMembers();
    } catch (err: unknown) {
      console.error("Remove member failed:", err);
    }
  };

  const handleCreateTeam = async () => {
    const name = newTeamName().trim();
    if (!name) return;
    setCreatingTeam(true);
    try {
      const team = await getConvexClient().mutation(api.teams.create, { name });
      if (team) {
        switchTeam((team as any)._id);
        refetchTeams();
      }
      setNewTeamName("");
      setShowCreateTeam(false);
    } catch (err: unknown) {
      console.error("Create team failed:", err);
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleSignOut = async () => {
    stopSync();
    await signOut();
  };

  return (
    <Show when={isAuthenticated() && authUser()}>
      <div class="settings-card">
        <div class="settings-card-header">
          <span class="settings-card-title">Account</span>
        </div>
        <div class="settings-account">
          <Show when={authUser()?.image}>
            <img class="settings-account-avatar" src={authUser()!.image!} alt="" />
          </Show>
          <div class="settings-account-info">
            <span class="settings-account-name">{authUser()?.name || "User"}</span>
            <span class="settings-account-email">{authUser()?.email || ""}</span>
          </div>
          <button class="btn-sm btn-danger" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>

      {/* Team section */}
      <div class="settings-card">
        <div class="settings-card-header">
          <span class="settings-card-title">Team</span>
          <button class="btn-sm" onClick={() => setShowCreateTeam(!showCreateTeam())}>
            {showCreateTeam() ? "Cancel" : "New team"}
          </button>
        </div>

        <Show when={showCreateTeam()}>
          <div class="settings-create-team">
            <input
              class="add-input"
              placeholder="Team name..."
              value={newTeamName()}
              onInput={(e) => setNewTeamName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); if (e.key === "Escape") setShowCreateTeam(false); }}
              autofocus
            />
            <button class="btn-sm btn-primary" onClick={handleCreateTeam} disabled={creatingTeam() || !newTeamName().trim()}>
              Create
            </button>
          </div>
        </Show>

        {/* Team switcher */}
        <Show when={(teams() || []).length > 1}>
          <div class="settings-team-switcher">
            <label class="settings-label">Active team</label>
            <select
              class="settings-select"
              value={activeTeamId() || ""}
              onChange={(e) => switchTeam(e.currentTarget.value)}
            >
              <For each={teams() || []}>
                {(team: any) => (
                  <option value={team._id}>
                    {team.name}{team.isPersonal ? " (Personal)" : ""}
                  </option>
                )}
              </For>
            </select>
          </div>
        </Show>

        <Show when={(teams() || []).length === 1}>
          <div class="settings-team-current">
            <span class="settings-label">Active team</span>
            <span>{currentTeam()?.name || "Personal"}</span>
          </div>
        </Show>

        {/* Members list */}
        <div class="settings-members">
          <span class="settings-label">Members</span>
          <For each={members() || []} fallback={<span class="text-muted">Loading...</span>}>
            {(member: any) => (
              <div class="member-row">
                <Show when={member.image}>
                  <img class="member-avatar" src={member.image} alt="" />
                </Show>
                <Show when={!member.image}>
                  <div class="member-avatar-fallback">{(member.name || "U")[0].toUpperCase()}</div>
                </Show>
                <div class="member-info">
                  <span class="member-name">{member.name}</span>
                  <span class="member-email">{member.email}</span>
                </div>
                <span class={`role-badge role-${member.role}`}>{member.role}</span>
                <Show when={isOwner() && member.userId !== authUser()?._id}>
                  <button class="icon-btn danger" title="Remove" onClick={() => handleRemoveMember(member.userId)}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* Invite form */}
        <Show when={isOwner()}>
          <div class="settings-invite">
            <span class="settings-label">Invite member</span>
            <div class="invite-form">
              <input
                class="add-input"
                type="email"
                placeholder="Email address..."
                value={inviteEmail()}
                onInput={(e) => setInviteEmail(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
              />
              <button class="btn-sm btn-primary" onClick={handleInvite} disabled={inviting() || !inviteEmail().trim()}>
                {inviting() ? "Sending..." : "Invite"}
              </button>
            </div>
            <Show when={inviteStatus()}>
              <span class={`invite-status invite-${inviteStatus()!.type}`}>
                {inviteStatus()!.msg}
              </span>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};
