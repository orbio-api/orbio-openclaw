---
name: orbio
description: Official Orbio account discovery commands for OpenClaw.
homepage: https://www.orbioapi.com.br
user-invocable: true
disable-model-invocation: true
command-dispatch: tool
command-tool: orbio_command
command-arg-mode: raw
metadata: {"vendor":"orbio","channel":"official","docs":"https://www.orbioapi.com.br"}
---

# Orbio

Use this skill to search companies and manage exports through Orbio.

## Commands

- `/orbio search <query> [--limit N] [--with-contact]`
- `/orbio export <query> [--limit N] [--format csv|html] [--with-contact]`
- `/orbio export-status <export_id>`

## Notes

- Contact fields are masked by default.
- `--with-contact` only returns contact fields when plan allows.
- The skill must be used with the official plugin tools.
