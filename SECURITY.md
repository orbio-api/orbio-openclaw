# Security Policy

## Supported versions

- `main` branch (latest)
- Latest published npm tag of `@orbio/orbio-openclaw`

## Reporting a vulnerability

Report privately to `security@orbioapi.com.br` with:
- reproduction steps
- affected version/tag
- expected vs observed behavior

Do not disclose publicly before coordinated remediation.

## Security model

This integration intentionally avoids shell execution in runtime paths:
- no `exec`
- no `curl`
- no subprocess command dispatch from skill commands

Additional controls:
- workspace-scoped API key auth
- chat-safe contact masking by default
- plugin-side throttling in addition to server-side limits
- retry policy restricted to transient failures
