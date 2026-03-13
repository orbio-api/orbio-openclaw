# AGENTS

This file is the bootstrap guide for AI agents working in `orbio-openclaw-integration/`.

## Scope
- OpenClaw plugin package and official skill artifacts for Orbio integration.
- Sibling repos: `../orbio-api/`, `../frontend/`.

## Required Skills
- Start with `orbio-workspace-router` when scope is unclear or may cross repositories.
- `git-worktree-flow` is mandatory for every code change.
- Use `orbio-openclaw-delivery` for implementation and validation in this repo.
- Use `implementation-spec-writer` only when the change spans multiple packages/flows or materially changes plugin behavior.
- Use `adr-writer` only for plugin contract, security posture, dependency, or release model decisions.

## Must-Read Docs
- `README.md`
- `RELEASING.md`
- `SECURITY.md`
- `orbio-openclaw-plugin/README.md`

## Hard Rules (explicit approval required)
- Architectural changes to plugin contract/command surface/API semantics/security posture.
- Behavior-changing fallback paths.
- Workarounds, compatibility shims, and dual-path fixes in place of a correct solution.
- TODO/stub/placeholder/dead code.
- Skipping/disabling/ignoring lint/typecheck/coverage/build failures.
- Introducing shell execution in plugin runtime (`exec`, `curl`, subprocesses).

## Pre-Launch Policy
- Prefer secure/simple behavior over compatibility shims.
- Replace incorrect behavior directly unless compatibility path is explicitly approved.

## Worktree and PR Policy
- Keep the primary checkout clean on `main`.
- Create feature branches from a fresh worktree based on `origin/main`.
- Use `tools/dev/wt-new --branch <branch>` to start work and `tools/dev/wt-cleanup --branch <branch>` after merge.
- Merge through PRs targeting `main` only.

## Mandatory Quality Gates
```bash
pnpm verify
```

## Security Baseline
- Never commit secrets/keys/tokens.
- Avoid logging PII/contact fields.
- Keep plugin runtime shell-free.
- Use scoped workspace tokens for API authentication.

## CI Policy
- Required PR checks are `plugin` and `review`.
- `codex-pr-review` is always part of CI and blocks on execution failure, parse failure, or P0/P1 findings.

## References
- `../AGENTS.md`
- Skill: `orbio-openclaw-delivery`
- Skill: `git-worktree-flow`
