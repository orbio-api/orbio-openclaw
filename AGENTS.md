# AGENTS

This file is the bootstrap guide for AI agents working in `orbio-openclaw-integration/`.

## Scope
- OpenClaw plugin package and official skill artifacts for Orbio integration.
- Sibling repos: `../orbio-api/`, `../frontend/`.

## Required Skills (order)

1. `orbio-workspace-router`
- Confirm repository scope and cross-project impact.

2. `implementation-spec-writer` (if long/non-trivial)
- Mandatory before significant behavior changes.

3. `adr-writer` (if architectural decision exists)

4. `git-worktree-flow`
- Mandatory git/worktree/PR lifecycle.

5. `orbio-openclaw-delivery`
- Plugin/runtime policy, security constraints, and release validations.

## Must-Read Docs
- `README.md`
- `RELEASING.md`
- `SECURITY.md`
- `orbio-openclaw-plugin/README.md`

## Hard Rules (explicit approval required)
- Architectural changes to plugin contract/command surface/API semantics/security posture.
- Behavior-changing fallback paths.
- TODO/stub/placeholder/dead code.
- Skipping/disabling/ignoring lint/typecheck/coverage/build failures.
- Introducing shell execution in plugin runtime (`exec`, `curl`, subprocesses).

## Pre-Launch Policy
- Prefer secure/simple behavior over compatibility shims.
- Replace incorrect behavior directly unless compatibility path is explicitly approved.

## Mandatory Quality Gates
```bash
pnpm verify
```

## Security Baseline
- Never commit secrets/keys/tokens.
- Avoid logging PII/contact fields.
- Keep plugin runtime shell-free.
- Use scoped workspace tokens for API authentication.

## References
- `../AGENTS.md`
- Skill: `orbio-openclaw-delivery`
- Skill: `git-worktree-flow`
