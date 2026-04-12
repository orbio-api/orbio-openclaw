# Releasing `@orbio/orbio-openclaw`

**Owner:** OpenClaw Integration / Release
**Última verificação:** 2026-04-08 (rodada beta)
**Evidência de referência:** https://github.com/orbio-api/orbio-openclaw/issues/9

## Prerequisites

- `pnpm` 10+
- npm publish access for `@orbio` scope
- npm Trusted Publisher configured for `orbio-api/orbio-openclaw` on workflow `publish.yml`
- GitHub Actions secrets configured for smoke:live validation (see below)

## GitHub Actions Secrets for Smoke:live

Configure these secrets in repository settings (Settings → Secrets and variables → Actions → New repository secret):

| Secret | Required | Description | Example |
|--------|----------|-------------|---------|
| `ORBIO_BASE_URL` | ✅ Yes | Orbio API base URL | `https://api.orbioapi.com.br` |
| `ORBIO_API_KEY` | ✅ Yes | Orbio API sandbox key | `orbio_sandbox_...` |
| `ORBIO_WORKSPACE_ID` | No | Workspace ID for smoke tests | `openclaw-smoke` (default) |
| `ORBIO_SMOKE_QUERY` | No | Search query for validation | `software b2b em sao paulo` (default) |
| `ORBIO_SMOKE_LIMIT` | No | Number of results to validate | `3` (default) |

**Important:** Use sandbox/development API keys for smoke tests, not production credentials.

## CI Gate (Automated)

PRs are automatically validated by GitHub Actions CI:
- Runs on every push to `main` and on all pull requests.
- Executes `pnpm verify` (includes lint, typecheck, coverage, env:audit, and build).
- PR will fail if any quality gate fails.
- Uploads build artifacts and logs on failure for troubleshooting.

View CI results: Actions → CI

## Smoke:live Gate (Manual Trigger)

Before publishing, run the live environment validation:

1. Go to Actions → `Smoke Live Validation`.
2. Click `Run workflow`.
3. Optionally provide a `run_id` (from a PR CI run) to link results back to the PR.
4. The workflow validates all required secrets are configured, then runs `pnpm smoke:live`.
5. On success, it uploads logs and optionally adds a comment to the PR (if `run_id` was provided).

**This gate must pass before any release.**

## Manual local release

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter @orbio/orbio-openclaw smoke:live
cd orbio-openclaw-plugin
pnpm pack --dry-run
pnpm publish --access public --no-git-checks --provenance
```

## Version sync checklist

1. Bump version in `orbio-openclaw-plugin/package.json`.
2. Sync version in `orbio-openclaw-plugin/openclaw.plugin.json`.
3. Sync `PLUGIN_VERSION` in `orbio-openclaw-plugin/src/index.ts`.
4. Re-run `pnpm verify`.

## GitHub Actions publish

1. Go to Actions -> `Publish npm package`.
2. Choose the npm dist-tag (`latest`, `next`, etc.).
3. Workflow uses OIDC trusted publishing (no `NPM_TOKEN` secret), validates version sync, builds, and publishes to npm.

## Post-release

1. Update ClawHub listing to the new pinned package version.
2. Validate in a sandbox OpenClaw workspace before broad rollout.

## Mandatory real-environment gate

Before publishing, complete all gates:
1. `pnpm verify` (automated CI gate on PR)
2. Automated live smoke (`pnpm --filter @orbio/orbio-openclaw smoke:live`) — **required, run via GitHub Actions or locally**
3. Manual sandbox OpenClaw runtime test

Reference: `REAL_ENV_TESTING.md`
