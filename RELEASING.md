# Releasing `@orbio/orbio-openclaw`

**Owner:** OpenClaw Integration / Release
**Última verificação:** 2026-04-08 (rodada beta)
**Evidência de referência:** https://github.com/orbio-api/orbio-openclaw/issues/9

## Prerequisites

- `pnpm` 10+
- npm publish access for `@orbio` scope
- npm Trusted Publisher configured for `orbio-api/orbio-openclaw` on workflow `publish.yml`

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
1. `pnpm verify`
2. Automated live smoke (`pnpm --filter @orbio/orbio-openclaw smoke:live`)
3. Manual sandbox OpenClaw runtime test

Reference: `REAL_ENV_TESTING.md`
