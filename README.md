# Tenso

High-performance API testing desktop app built with Tauri 2.0 and SolidJS. A lightweight, fast alternative to Postman with real-time team sync via Convex.

## Download

| Platform | Install | Manual Download |
|:---------|:--------|:----------------|
| **macOS** (Apple Silicon) | `brew install PatchPerson/tenso/tenso` | [`.dmg`](https://github.com/PatchPerson/Tenso/releases/latest) |
| **Windows** | — | [`.exe`](https://github.com/PatchPerson/Tenso/releases/latest) · [`.msi`](https://github.com/PatchPerson/Tenso/releases/latest) |
| **Linux** | — | [`.AppImage`](https://github.com/PatchPerson/Tenso/releases/latest) · [`.deb`](https://github.com/PatchPerson/Tenso/releases/latest) |

> **macOS note:** If you download the `.dmg` directly and see _"Tenso.app is damaged"_, run:
> ```bash
> xattr -cr /Applications/Tenso.app
> ```
> Installing via Homebrew avoids this.

---

## Features

### Core
- **HTTP Client** — Send GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS requests with full control over headers, query params, body, and auth
- **Multi-Tab Interface** — Work on multiple requests simultaneously with tab state management
- **Collection Tree** — Organize requests into nested folders with drag-friendly sort ordering
- **Environment Variables** — Define variables per environment and use `{{variable}}` syntax in URLs, headers, and body content
- **Request History** — Auto-saved execution log with search and filtering

### Request Body Types
- **JSON** — Syntax-highlighted JSON editor
- **Raw** — Plain text, HTML, XML with content-type selector
- **Form URL-Encoded** — Key-value pairs
- **Multipart Form Data** — Text fields and file uploads
- **GraphQL** — Query and variables editors
- **Binary** — File upload

### Authentication
- **Bearer Token**
- **Basic Auth** (username/password)
- **API Key** (header or query param)

### Response Viewer
- **Auto-formatted JSON** with word wrap toggle
- **Response Headers** table
- **Timing Chart** — Visual breakdown of DNS, connection, TLS, TTFB, and download phases
- **Status, duration, and size** at a glance

### Advanced
- **cURL Import** — Paste a cURL command to populate a request (Ctrl+I)
- **OpenAPI Import** — Import an OpenAPI 3.0 spec to generate a full collection tree
- **Code Generation** — Export any request as cURL, Python (requests), or JavaScript (fetch)
- **Pre/Post-Request Scripts** — JavaScript scripting via sandboxed Boa engine with `pm.*` API (Postman-compatible)
- **WebSocket Client** — Connect, send/receive messages, real-time message stream via Tauri events

### Team Sync
- **Convex real-time sync** — Collections, requests, environments, and history sync across team members
- **GitHub OAuth** — Sign in with GitHub, auto-created personal team
- **Team invitations** — Invite by email, accept/decline/block in-app
- **Last-write-wins** — Conflict resolution by `updatedAt` timestamp
- **Offline-first** — App works fully without login; SQLite remains the local source of truth

### Performance
- ~10MB binary (Tauri + rustls, no runtime deps)
- SQLite with WAL mode for <5ms startup and concurrent reads
- reqwest connection pool with keep-alive
- SolidJS fine-grained reactivity (no virtual DOM diffing)
- Boa JS engine pool for zero cold-start scripting
- Virtualized lists for large response bodies and history

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri 2.0 (Rust) |
| Frontend | SolidJS + Vite |
| Styling | Plain CSS + CSS custom properties |
| Local database | SQLite (rusqlite, bundled, WAL mode) |
| HTTP client | reqwest (rustls-tls) |
| JS scripting | Boa engine (Rust-native, sandboxed) |
| Backend / Sync | Convex (real-time queries, mutations, auth) |
| Auth | GitHub OAuth via @convex-dev/auth |

---

## Prerequisites

### Rust
```bash
# Linux/macOS
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows — download installer from https://rustup.rs
```

### Node.js (v18+)
Download from [nodejs.org](https://nodejs.org) or install via nvm.

### Tauri System Dependencies

**Windows:** Microsoft Visual Studio C++ Build Tools + WebView2 (pre-installed on Windows 11).

**macOS:** Xcode Command Line Tools:
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## Quick Start

```bash
cd tenso

# Install frontend dependencies
bun install   # or: npm install

# Run in development mode (hot-reload)
bun run tauri dev   # or: npm run tauri dev
```

This launches the Vite dev server for the frontend and compiles/runs the Tauri Rust backend. The app window opens automatically.

---

## Building for Production

```bash
bun run tauri build   # or: npm run tauri build
```

Outputs:
- **Binary:** `src-tauri/target/release/tenso` (or `tenso.exe` on Windows)
- **Installer:** `.msi` (Windows), `.dmg` (macOS), `.deb`/`.AppImage` (Linux) in `src-tauri/target/release/bundle/`

---

## Convex Backend Setup

Convex powers auth, teams, and real-time sync. The app works fully offline without it — Convex is optional for collaboration features.

### 1. Install Convex CLI

```bash
bun add convex   # or: npm install convex
```

### 2. Create a Convex project (first time only)

```bash
npx convex init
```

Or link to the existing project — the deployment config is in `.env.local`:

```env
CONVEX_DEPLOYMENT=dev:shiny-porcupine-825
VITE_CONVEX_URL=https://shiny-porcupine-825.eu-west-1.convex.cloud
VITE_CONVEX_SITE_URL=https://shiny-porcupine-825.eu-west-1.convex.site
```

### 3. Set environment variables on the Convex deployment

```bash
# GitHub OAuth App credentials
npx convex env set AUTH_GITHUB_ID <your-github-oauth-client-id>
npx convex env set AUTH_GITHUB_SECRET <your-github-oauth-client-secret>

# Site URL (the Convex HTTP endpoint that serves the OAuth callback page)
npx convex env set SITE_URL <your-convex-site-url>

# JWT keys (auto-generated)
npx @convex-dev/auth
```

The `npx @convex-dev/auth` command auto-generates `JWT_PRIVATE_KEY` and `JWKS` env vars on your deployment.

### 4. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Set:
   - **Application name:** Tenso (or anything)
   - **Homepage URL:** `http://localhost:1420`
   - **Authorization callback URL:** `<your-convex-site-url>/api/auth/callback/github`
4. Copy the Client ID and Client Secret into the env vars above

### 5. Deploy Convex functions

```bash
# Development (watches for changes, auto-deploys)
npx convex dev

# One-shot deploy
npx convex dev --once

# Production deploy
npx convex deploy
```

### 6. Verify deployment

```bash
# Check tables exist
npx convex data --table users

# Check functions are deployed
npx convex functions
```

### Convex Architecture

| What | Where |
|------|-------|
| Schema | `convex/schema.ts` |
| Auth (GitHub OAuth) | `convex/auth.ts` |
| User queries | `convex/users.ts` |
| Teams, invites, members | `convex/teams.ts` |
| Sync (push/pull) | `convex/sync.ts` |
| Cron jobs (history prune, invite cleanup) | `convex/crons.ts` |
| HTTP routes (OAuth callback page) | `convex/http.ts` |

### Key Convex Functions

| Function | Type | Description |
|----------|------|-------------|
| `users.getMe` | Query | Current user + their teams |
| `teams.list` | Query | Teams for current user |
| `teams.create` | Mutation | Create a new team |
| `teams.invite` | Mutation | Invite user by email |
| `teams.acceptInvite` | Mutation | Accept invite by token |
| `teams.declineInvite` | Mutation | Decline invite |
| `teams.blockInvite` | Mutation | Block future invites from team |
| `teams.pendingInvites` | Query | Pending invites for current user |
| `teams.listMembers` | Query | Members of a team |
| `teams.removeMember` | Mutation | Remove member (owner only) |
| `sync.push` | Mutation | Push local changes to Convex |
| `sync.pull` | Query | Pull changes since timestamp (real-time subscription) |
| `sync.pullInitial` | Query | Full data dump for first sync |

### Auth Flow

1. User clicks "Sign in with GitHub" (bottom-left of activity bar)
2. App calls `auth.signIn({ provider: "github" })` → gets `{ redirect, verifier }`
3. System browser opens GitHub OAuth
4. After auth, Convex redirects to `SITE_URL?code=XXX`
5. User copies the code from the browser page
6. Pastes code into the app's modal → `auth.signIn({ provider: "github", params: { code }, verifier })`
7. Token stored locally, sync starts automatically

### Sync Flow

- **Reads:** Real-time Convex subscription on `sync.pull(teamId, since)` → writes to local SQLite → UI updates
- **Writes:** Local edit → SQLite save → debounced push to `sync.push` (2s delay)
- **Conflicts:** Last-write-wins by `updatedAt` timestamp
- **Offline:** App works normally; changes pushed when back online
- **Deletes:** Tombstone table locally, soft-delete flag on Convex side

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New request tab |
| `Ctrl+W` | Close active tab |
| `Ctrl+S` | Save request |
| `Ctrl+Shift+S` | Save all tabs |
| `Ctrl+Enter` | Send request / Connect WebSocket |
| `Shift+Ctrl+Enter` | Send WebSocket message |
| `Ctrl+I` | Import cURL |

---

## Project Structure

```
tenso/
├── Cargo.toml                    # Workspace root
├── package.json                  # Frontend dependencies
├── vite.config.ts                # Vite configuration
├── tsconfig.json                 # TypeScript configuration
│
├── convex/                       # Convex backend
│   ├── schema.ts                 # Database schema
│   ├── auth.ts                   # GitHub OAuth setup
│   ├── auth.config.ts            # Auth provider config
│   ├── users.ts                  # User queries
│   ├── teams.ts                  # Teams, invites, members
│   ├── sync.ts                   # Push/pull sync mutations/queries
│   ├── crons.ts                  # Scheduled jobs
│   └── http.ts                   # HTTP routes (OAuth callback)
│
├── shared/                       # Shared Rust types
│   └── src/
│       └── models.rs             # Data model structs
│
├── src-tauri/                    # Tauri Rust backend
│   ├── tauri.conf.json           # Tauri app configuration
│   └── src/
│       ├── main.rs               # Entry point
│       ├── lib.rs                # Plugin + command registration
│       ├── state.rs              # AppState (DB, HTTP client, WS, scripting)
│       ├── db/                   # SQLite migrations and CRUD
│       ├── commands/             # Tauri IPC command handlers
│       │   ├── collections.rs    # Workspace, collection, request CRUD
│       │   ├── http.rs           # HTTP execution with timing
│       │   ├── environments.rs   # Environment CRUD
│       │   ├── history.rs        # Request history
│       │   ├── import.rs         # cURL and OpenAPI import
│       │   ├── codegen.rs        # Code generation
│       │   ├── scripting.rs      # JavaScript script execution
│       │   ├── websocket.rs      # WebSocket connections
│       │   └── sync.rs           # Convex sync Tauri commands
│       ├── http/                 # reqwest client utilities
│       ├── websocket/            # WebSocket connection manager
│       ├── scripting/            # Boa JS engine with pm.* API
│       ├── import/               # cURL parser, OpenAPI importer
│       └── codegen/              # cURL, Python, JS code generators
│
├── src/                          # SolidJS frontend
│   ├── index.html                # HTML entry with CSS variables
│   ├── index.tsx                 # Render entry point
│   ├── App.tsx                   # Root component
│   ├── styles.css                # All component styles
│   ├── lib/
│   │   ├── api.ts                # Typed Tauri invoke wrappers
│   │   ├── convex.ts             # ConvexClient wrapper
│   │   ├── auth.ts               # Auth state (GitHub OAuth)
│   │   ├── sync.ts               # SyncManager (subscribe + push)
│   │   └── invites.ts            # Pending invite subscription
│   ├── stores/
│   │   ├── collections.ts        # Collection tree state
│   │   ├── request.ts            # Tab and request state
│   │   ├── environments.ts       # Environment state
│   │   └── history.ts            # History state
│   ├── components/
│   │   ├── layout/               # Sidebar, TabBar, StatusBar
│   │   ├── request/              # UrlBar, RequestPanel, BodyEditor, AuthEditor
│   │   ├── response/             # ResponsePanel (body, headers, timing)
│   │   ├── environments/         # EnvManager
│   │   ├── import/               # CurlImport dialog
│   │   └── shared/               # KeyValueGrid, VirtualList, ContextMenu
│   └── pages/
│       ├── MainWorkspace.tsx      # Main app layout
│       └── Settings.tsx           # Settings page
```

---

## Database Schema

SQLite with WAL mode. All IDs are ULIDs.

**Local (SQLite):** `teams`, `collections` (nested via `parent_id`), `requests` (headers/params/body as JSON), `environments` (variables as JSON array), `history` (append-only), `websocket_connections`, `deleted_entities` (tombstones), `convex_sync_state`

**Convex:** `users`, `teams`, `teamMembers`, `teamInvites`, `collections`, `requests`, `environments`, `history` — see `convex/schema.ts` for full schema

---

## License

MIT
