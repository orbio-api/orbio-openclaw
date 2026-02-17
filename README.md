# Orbio OpenClaw Integration (official)

Standalone repository for the official Orbio integration with OpenClaw.

## Contents

- `orbio-openclaw-plugin/`: npm plugin (`@orbio/orbio-openclaw`) with Orbio tools.
- `skill-orbio-official/`: standalone skill artifact for ClawHub publication.

## Quickstart

```bash
cd orbio-openclaw-plugin
pnpm install --frozen-lockfile
pnpm verify
pnpm pack --dry-run
```

## OpenClaw install example

```yaml
plugins:
  entries:
    orbio-openclaw:
      package: "@orbio/orbio-openclaw@0.1.0"
      config:
        baseUrl: "https://api.orbioapi.com.br"
        apiKey: "${ORBIO_API_KEY}"
        workspaceId: "acme-workspace"
```

## Skill commands

- `/orbio search <query> [--limit N] [--with-contact]`
- `/orbio export <query> [--limit N] [--format csv|html] [--with-contact]`
- `/orbio export-status <export_id>`

## Security defaults

- No shell execution (`exec`, `curl`, subprocesses).
- Contact fields masked by default.
- Contact fields only returned with explicit opt-in (`--with-contact`) and plan permission.
- Plugin-side throttling in addition to backend rate limits.

## Publishing

- npm package publication workflow: `.github/workflows/publish.yml`
- CI validation workflow: `.github/workflows/ci.yml`
- detailed release steps: `RELEASING.md`
