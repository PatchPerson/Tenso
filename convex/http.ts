import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";

const http = httpRouter();

auth.addHttpRoutes(http);

// After GitHub OAuth, Convex Auth redirects to SITE_URL/?code=XXX
// This page captures the code and redirects to the tenso:// deep link
// so the Tauri app can complete authentication.
http.route({
  path: "/",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (code) {
      const deepLink = `tenso://auth/callback?code=${encodeURIComponent(code)}`;
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tenso - Completing Sign In</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #e0e0e0; }
    .card { text-align: center; padding: 2rem; }
    h1 { font-size: 1.2rem; margin-bottom: 1rem; }
    p { color: #888; margin-bottom: 1.5rem; }
    a { display: inline-block; padding: 0.6rem 1.5rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
    a:hover { background: #2563eb; }
    .code { font-family: monospace; background: #1a1a1a; padding: 0.3rem 0.6rem; border-radius: 4px; user-select: all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Redirecting to Tenso...</h1>
    <p>If the app didn't open automatically, click the button below.</p>
    <a href="${deepLink}">Open Tenso</a>
    <p style="margin-top: 2rem; font-size: 0.8rem;">Or manually enter code: <span class="code">${code}</span></p>
  </div>
  <script>window.location.href = "${deepLink}";</script>
</body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Tenso API", { status: 200 });
  }),
});

export default http;
