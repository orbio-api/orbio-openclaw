# AGENTS

Bootstrap guide for AI agents working in `orbio-openclaw-integration/`.

## Scope
- OpenClaw plugin package and official skill artifacts for Orbio integration.
- Sibling repos: `../orbio-api/`, `../frontend/`.

## Inheritance
- Follow `../AGENTS.md` as canonical global governance (policy precedence, shared-dev rules, GitFlow authority, and cross-repo rules).
- This file contains only `orbio-openclaw-integration`-specific addenda.

## Required Skills
- Start with `orbio-workspace-router` when scope is unclear or may cross repositories.
- `GitFlow` is mandatory for every code change.
- Use `orbio-openclaw-delivery` for implementation and validation in this repo.
- Use `implementation-spec-writer` only when the change spans multiple packages/flows or materially changes plugin behavior.
- Use `adr-writer` only for plugin contract, security posture, dependency, or release-model decisions.

## Must-Read Docs
- `README.md`
- `RELEASING.md`
- `SECURITY.md`
- `orbio-openclaw-plugin/README.md`

## Repo-Specific Hard Rules (explicit approval required)
- Architectural changes to plugin contract/command surface/API semantics/security posture.
- Behavior-changing fallback paths.
- No TODO/stub/placeholder/dead code.
- No skipping/disabling/ignoring lint/typecheck/coverage/build failures.
- Do not introduce shell execution in plugin runtime (`exec`, `curl`, subprocesses).

## Pre-Launch Policy
- Prefer secure/simple behavior over compatibility shims.
- Replace incorrect behavior directly unless compatibility path is explicitly approved.

## Mandatory Quality Gates
```bash
pnpm verify
```

## Security Addendum
- Never commit secrets/keys/tokens.
- Avoid logging PII/contact fields.
- Keep plugin runtime shell-free.
- Use scoped workspace tokens for API authentication.

## CI Policy
- Required PR checks are `plugin` and `review`.
- `codex-pr-review` blocks on execution failure, parse failure, or P0/P1 findings.

## References
- `../AGENTS.md`
- Skill: `orbio-openclaw-delivery`
- Skill: `GitFlow`
