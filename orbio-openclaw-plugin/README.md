# Orbio OpenClaw Plugin (official)

Official OpenClaw plugin for Orbio account discovery.

## Package

- npm package: `@orbio/orbio-openclaw`
- plugin id: `orbio-openclaw`

## What it provides

- `orbio_search`: chat-safe account search.
- `orbio_export`: export job creation (`csv`/`html`).
- `orbio_export_status`: export status polling.
- `orbio_command`: command dispatcher used by `/orbio ...` skill.

## Security posture

- No `exec`, `curl`, or subprocess execution.
- Workspace-scoped API key authentication (`Authorization: Bearer <api_key>`).
- Contact data masked by default.
- Plugin-side request throttling (`maxRequestsPerMinute`) in addition to server-side limits.
- Retries only for transient failures (timeouts and 5xx), never for 4xx.

## Required configuration

- `baseUrl`: Orbio API base URL (for example, `https://api.orbioapi.com.br`)
- `apiKey`: Orbio API key for the workspace

Optional:

- `workspaceId` (default: `default`)
- `timeoutMs` (default: `20000`)
- `maxRequestsPerMinute` (default: `30`)
- `retryCount` (default: `1`)
- `retryBackoffMs` (default: `300`)
- `capabilitiesTtlMs` (default: `60000`)

## Development

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm pack --dry-run
```

## Release checklist

1. Bump version in `package.json`.
2. Sync version in `openclaw.plugin.json`.
3. Sync `PLUGIN_VERSION` in `src/index.ts`.
4. Run `pnpm verify` and `pnpm pack --dry-run`.
5. Publish with `pnpm publish --access public --no-git-checks --provenance`.
