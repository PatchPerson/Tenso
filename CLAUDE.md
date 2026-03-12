# Project Guidelines

## Commits
- Never include Claude Code attribution (Co-Authored-By) in commit messages

## Releasing

To release a new version:

```bash
./scripts/release.sh 0.2.0
```

This bumps version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, commits, tags, and pushes. The `v*` tag triggers the GitHub Actions release workflow which:

1. Deploys Convex functions to production
2. Builds for macOS (universal), Windows, and Linux
3. Generates an AI changelog via OpenRouter
4. Creates a draft GitHub Release with all artifacts + `latest.json` for auto-updates

### Required GitHub Secrets

| Secret | Required |
|--------|----------|
| `CONVEX_DEPLOY_KEY` | Yes |
| `VITE_CONVEX_URL` | Yes |
| `VITE_CONVEX_SITE_URL` | Yes |
| `TAURI_SIGNING_PRIVATE_KEY` | Yes |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Yes |
| `OPENROUTER_API_KEY` | Yes |
| `OPENROUTER_MODEL` | No (default: `openrouter/free`) |
| `VITE_SENTRY_DSN` | No (telemetry disabled if absent) |

### Production Convex

- Deployment: `exuberant-mink-69`
- URL: `https://exuberant-mink-69.eu-west-1.convex.cloud`
- Site: `https://exuberant-mink-69.eu-west-1.convex.site`

## Code Conventions

### TypeScript
- Use `unknown` (not `any`) in catch blocks; narrow with `instanceof Error`
- No `vite-env.d.ts` exists — `import.meta.env` access requires `as any` cast (known tech debt)
- Prefer typed API wrappers from `src/lib/api.ts` over raw `invoke<>()` calls
- Import components share common UI via `src/components/import/shared.tsx` (`FilePickerDropzone`, `ImportModalWrapper`, `readJsonFile`)

### Build
- `npm run build` runs `tsc && vite build` — must pass with zero warnings
- Vendor chunks are split via `manualChunks` in `vite.config.ts` (Solid, Convex, Sentry) — keep main chunk under 500 kB
- Avoid mixing static and dynamic `import()` of the same module — use static imports when the module is already in the dependency graph
