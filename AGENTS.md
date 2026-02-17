# AGENTS

This file is for AI agents working in this repository.

## Scope (short)
- Official Orbio integration for OpenClaw.
- npm plugin package (`@orbio/orbio-openclaw`) and official skill artifacts.
- Focus: secure account discovery + export workflows through Orbio API.

## Must-read docs
- `README.md`
- `RELEASING.md`
- `SECURITY.md`
- `orbio-openclaw-plugin/README.md`

## Hard rules (require explicit approval)
- Architectural changes (plugin contract, command surface, API semantics, security posture).
- Adding fallback behavior that changes runtime outcomes.
- Adding TODOs, stubs, placeholders, or dead code.
- Skipping/disabling linters or tests, or merging with failing checks.
- Introducing shell execution paths (`exec`, `curl`, subprocesses) in plugin runtime.

## Pre-launch policy (active)
- Prioritize secure and simple behavior over backward-compatibility shims.
- Replace incorrect behavior directly instead of layering compatibility paths.

## Repo structure rules
- `orbio-openclaw-plugin/` contains all importable plugin code and test/runtime configs.
- `skill-orbio-official/` contains standalone skill artifact(s) for ClawHub.
- Root docs (`README.md`, `RELEASING.md`, `SECURITY.md`) define operating policy and release process.
- Shared runtime logic must stay in `orbio-openclaw-plugin/src/`.
- Tests must live in `orbio-openclaw-plugin/tests/` and mirror source behavior.

## Stack
| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict mode) |
| Package manager | pnpm |
| Test runner | Vitest (`@vitest/coverage-v8`) |
| Lint | ESLint 9 flat config + `typescript-eslint` |
| CI | GitHub Actions |

## Testing rules
- Every change in `orbio-openclaw-plugin/src/` must include or update tests in `orbio-openclaw-plugin/tests/`.
- Coverage threshold is strict: **95%** for lines, branches, functions, and statements.
- Tests must cover security-critical behavior:
  - contact masking default
  - plan allowlist enforcement
  - throttling and retry policy
  - error mapping and request-id propagation
- Avoid superficial render/smoke-only tests; assert observable behavior and contract outputs.

## Quality gates (must pass)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm coverage`
- `pnpm build`
- Use `pnpm verify` to run the full gate (`quality + build`).

## Workflow
- Run all package operations with `pnpm`.
- This repo uses a `pnpm` workspace (`pnpm-workspace.yaml`); run installs from the repo root.
- Prefer `pnpm install --frozen-lockfile` for deterministic local/CI installs.
- Commit hooks are managed by Husky (`.husky/pre-commit`) and must stay enabled.
- Before publish, run real-environment validation in `REAL_ENV_TESTING.md`.
- Keep release version synchronized across:
  - `orbio-openclaw-plugin/package.json`
  - `orbio-openclaw-plugin/openclaw.plugin.json`
  - `PLUGIN_VERSION` in `orbio-openclaw-plugin/src/index.ts`
- Keep package publishing through documented flow in `RELEASING.md`.

## Security baseline
- Never commit secrets, keys, or tokens.
- Avoid logging PII/contact fields unless explicitly required for secure debugging.
- Keep plugin runtime shell-free.
- Keep API requests authenticated with scoped workspace tokens only.

## Generated artifacts
- Do not commit generated artifacts (`dist/`, coverage outputs, tarballs).
