import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

let client: ConvexClient | null = null;

export function getConvexClient(): ConvexClient {
  if (!client) {
    const url = (import.meta as any).env?.VITE_CONVEX_URL;
    if (!url) throw new Error("VITE_CONVEX_URL not set");
    client = new ConvexClient(url);
  }
  return client;
}

export function setConvexAuth(token: string | null) {
  const c = getConvexClient();
  if (!token) {
    c.setAuth(() => Promise.resolve(null));
    return;
  }

  c.setAuth(async ({ forceRefreshToken }) => {
    if (!forceRefreshToken) {
      return localStorage.getItem("convex_auth_token");
    }

    const refreshToken = localStorage.getItem("convex_refresh_token");
    if (!refreshToken) return null;

    try {
      const result = await c.action(api.auth.signIn, { refreshToken });
      if (result && typeof result === "object" && "tokens" in result) {
        const newTokens = (result as any).tokens;
        localStorage.setItem("convex_auth_token", newTokens.token);
        localStorage.setItem("convex_refresh_token", newTokens.refreshToken);
        return newTokens.token;
      }
    } catch (err) {
      console.warn("Token refresh failed, keeping tokens for retry:", err);
    }
    return null;
  });
}
