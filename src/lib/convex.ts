import { ConvexClient } from "convex/browser";

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
  if (token) {
    c.setAuth(() => Promise.resolve(token));
  } else {
    c.setAuth(() => Promise.resolve(null));
  }
}
