import { createSignal } from "solid-js";
import { getConvexClient, setConvexAuth } from "./convex";
import { api } from "../../convex/_generated/api";
import { startSync, stopSync } from "./sync";
import { startInviteWatch, stopInviteWatch } from "./invites";
import { activeTeam } from "../stores/collections";
import { migrateLocalData } from "./migration";
import { showToast } from "../stores/toast";
import { captureError } from "./telemetry";

export interface AuthUser {
  _id: string;
  name?: string;
  email?: string;
  image?: string;
  githubId?: string;
  teams: Array<{
    _id: string;
    name: string;
    isPersonal: boolean;
    role: string;
  }>;
}

const [authUser, setAuthUser] = createSignal<AuthUser | null>(null);
const [authLoading, setAuthLoading] = createSignal(false);
const [activeTeamId, setActiveTeamId] = createSignal<string | null>(null);
const [showCodeEntry, setShowCodeEntry] = createSignal(false);
const [authError, setAuthError] = createSignal<string | null>(null);

export { authUser, setAuthUser, authLoading, activeTeamId, setActiveTeamId, showCodeEntry, authError };

export function isAuthenticated(): boolean {
  return authUser() !== null;
}

export async function initAuth() {
  const storedToken = localStorage.getItem("convex_auth_token");
  if (!storedToken) return;

  try {
    setConvexAuth(storedToken);

    let user = await getConvexClient().query(api.users.getMe, {});

    // JWT may be expired — try refreshing via refresh token
    if (!user) {
      const refreshToken = localStorage.getItem("convex_refresh_token");
      if (refreshToken) {
        try {
          const result = await getConvexClient().action(api.auth.signIn, { refreshToken });
          if (result && typeof result === "object" && "tokens" in result) {
            const newTokens = (result as any).tokens;
            localStorage.setItem("convex_auth_token", newTokens.token);
            localStorage.setItem("convex_refresh_token", newTokens.refreshToken);
            setConvexAuth(newTokens.token);
            user = await getConvexClient().query(api.users.getMe, {});
          }
        } catch (err) {
          // Transient failure (network, reconnecting) — keep tokens for next launch
          console.warn("Token refresh failed, keeping tokens for retry:", err);
          captureError(err, { context: "token_refresh" });
          setConvexAuth(null); // Clear client auth so actions aren't blocked
          return;
        }
      }
    }

    if (user) {
      setAuthUser(user as AuthUser);
      const storedTeam = localStorage.getItem("active_team_id");
      if (storedTeam) {
        setActiveTeamId(storedTeam);
      } else if (user.teams && user.teams.length > 0) {
        const personal = (user.teams as any[]).find((t: any) => t.isPersonal);
        setActiveTeamId((personal || user.teams[0])._id);
      }
      // Auto-start sync + invite watch
      startInviteWatch();
      const localTeamId = activeTeam();
      const convexTeamId = activeTeamId();
      if (localTeamId && convexTeamId) {
        await migrateLocalData(convexTeamId, localTeamId);
        startSync(convexTeamId, localTeamId);
      }
    } else {
      // Server confirmed no valid session — clear tokens
      localStorage.removeItem("convex_auth_token");
      localStorage.removeItem("convex_refresh_token");
      setConvexAuth(null);
    }
  } catch (err) {
    // Transient failure — keep tokens for retry on next launch
    console.warn("Auth init failed, keeping tokens for retry:", err);
    captureError(err, { context: "auth_init" });
    setConvexAuth(null); // Clear client auth so actions aren't blocked
  }
}

export async function signInWithGitHub() {
  try {
    setAuthLoading(true);
    setAuthError(null);
    const client = getConvexClient();

    const result = await Promise.race([
      client.action(api.auth.signIn, { provider: "github" }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Sign in timed out — please try again")), 10_000)
      ),
    ]);

    if (result && typeof result === "object" && "redirect" in result) {
      if ("verifier" in result) {
        localStorage.setItem("convex_oauth_verifier", (result as any).verifier);
      }
      // Open GitHub OAuth in system browser
      const { open } = await import("@tauri-apps/plugin-shell");
      await open((result as any).redirect);
      // Show code entry modal
      setShowCodeEntry(true);
    } else {
      setAuthError("Unexpected sign-in response");
      showToast("Sign in failed: unexpected response");
    }
  } catch (err) {
    console.error("Sign in failed:", err);
    captureError(err, { context: "github_sign_in" });
    setAuthError("Failed to start sign in");
    showToast("Failed to start sign in");
  } finally {
    setAuthLoading(false);
  }
}

export async function submitAuthCode(code: string) {
  try {
    setAuthLoading(true);
    setAuthError(null);
    const client = getConvexClient();
    const verifier = localStorage.getItem("convex_oauth_verifier");
    localStorage.removeItem("convex_oauth_verifier");

    if (!verifier) {
      setAuthError("No sign-in session found. Try again.");
      return;
    }

    const result = await client.action(api.auth.signIn, {
      provider: "github",
      params: { code },
      verifier,
    });

    if (result && typeof result === "object" && "tokens" in result) {
      const tokens = (result as any).tokens;
      const token = tokens?.token;
      if (token) {
        localStorage.setItem("convex_auth_token", token);
        if (tokens.refreshToken) {
          localStorage.setItem("convex_refresh_token", tokens.refreshToken);
        }
        setConvexAuth(token);

        const user = await client.query(api.users.getMe, {});
        if (user) {
          setAuthUser(user as AuthUser);
          const teams = (user as AuthUser).teams;
          if (teams.length > 0) {
            const personal = teams.find((t) => t.isPersonal);
            const teamId = (personal || teams[0])._id;
            setActiveTeamId(teamId);
            localStorage.setItem("active_team_id", teamId);
          }
        }
        setShowCodeEntry(false);
        // Auto-start sync + invite watch
        startInviteWatch();
        const localTeamId = activeTeam();
        const convexTeamId = activeTeamId();
        if (localTeamId && convexTeamId) {
          await migrateLocalData(convexTeamId, localTeamId);
          startSync(convexTeamId, localTeamId);
        }
        return;
      }
    }
    setAuthError("Invalid code. Try again.");
  } catch (err) {
    console.error("Code verification failed:", err);
    captureError(err, { context: "auth_code_submit" });
    setAuthError("Verification failed. Try again.");
  } finally {
    setAuthLoading(false);
  }
}

export function cancelCodeEntry() {
  setShowCodeEntry(false);
  setAuthError(null);
  localStorage.removeItem("convex_oauth_verifier");
}

export async function signOut() {
  stopSync();
  stopInviteWatch();
  try {
    await getConvexClient().action(api.auth.signOut, {});
  } catch {
    // Ignore errors on sign out
  }
  localStorage.removeItem("convex_auth_token");
  localStorage.removeItem("convex_refresh_token");
  localStorage.removeItem("active_team_id");
  localStorage.removeItem("convex_oauth_verifier");
  setConvexAuth(null);
  setAuthUser(null);
  setActiveTeamId(null);
}

export async function switchTeam(teamId: string) {
  stopSync();
  setActiveTeamId(teamId);
  localStorage.setItem("active_team_id", teamId);
  const localTeamId = activeTeam();
  if (localTeamId) {
    await migrateLocalData(teamId, localTeamId);
    startSync(teamId, localTeamId);
  }
}
