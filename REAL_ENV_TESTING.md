# Real Environment Testing

This validation must be completed before publishing new package versions.

## 1) Live API smoke (automated)

Use sandbox credentials and run:

```bash
pnpm install --frozen-lockfile
export ORBIO_BASE_URL="https://api.orbioapi.com.br"
export ORBIO_API_KEY="<sandbox_key>"
export ORBIO_WORKSPACE_ID="openclaw-smoke"
pnpm --filter @orbio/orbio-openclaw smoke:live
```

The smoke test validates, against real API:
- `orbio_search`
- `orbio_export`
- `orbio_export_status`
- `orbio_command` dispatch

Expected final line:
- `[live-smoke] PASS`

## 2) Sandbox OpenClaw runtime test (manual)

Install plugin + skill in a sandbox OpenClaw workspace and run:

1. `/orbio search software b2b em sao paulo --limit 5`
2. `/orbio export software b2b em sao paulo --format csv --limit 5`
3. `/orbio export-status <export_id>`

Checks:
- no shell execution in runtime paths
- masked-by-default output (unless explicit contact opt-in)
- clear error messages for auth/rate-limit failures

## 3) Release gate

Only publish if:
- `pnpm verify` passes
- live smoke passes
- sandbox OpenClaw manual test passes
