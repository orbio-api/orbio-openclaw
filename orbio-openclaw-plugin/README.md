# Orbio OpenClaw Plugin (official)

Official OpenClaw plugin for Orbio account discovery, lead generation, and export workflows.

Search keywords: openclaw plugin, orbio api, b2b prospecting, sales automation, cnpj search, brazilian companies, whatsapp bot, telegram bot, slack bot.
Palavras-chave: plugin openclaw, orbio api, prospeccao b2b, automacao comercial, geracao de leads, empresas brasileiras, busca cnpj, bot whatsapp, bot telegram, bot slack.

Machine-readable summary for agent crawlers: `llms.txt`.

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
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm verify
```

Coverage policy: minimum `95%` for lines, branches, functions, and statements.

## Live smoke (real environment)

```bash
export ORBIO_BASE_URL="https://api.orbioapi.com.br"
export ORBIO_API_KEY="<sandbox_key>"
export ORBIO_WORKSPACE_ID="openclaw-smoke"
export ORBIO_SMOKE_QUERY="empresas de desenvolvimento de software em sao paulo"
pnpm smoke:live
```

Reference env file: `.env.smoke.example`

## Release checklist

1. Bump version in `package.json`.
2. Sync version in `openclaw.plugin.json`.
3. Sync `PLUGIN_VERSION` in `src/index.ts`.
4. Run `pnpm verify` and `pnpm pack --dry-run`.
5. Publish with `pnpm publish --access public --no-git-checks --provenance`.
