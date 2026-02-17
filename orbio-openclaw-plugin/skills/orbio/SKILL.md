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

Use this skill to search Brazilian companies and create exports using Orbio.

## Commands

- `/orbio search <query> [--limit N] [--with-contact]`
- `/orbio export <query> [--limit N] [--format csv|html] [--with-contact]`
- `/orbio export-status <export_id>`

## Security defaults

- Contact fields are masked by default.
- `--with-contact` only returns contact fields when the tenant plan allows them.
- Commands never execute shell commands.

## Examples

- `/orbio search software b2b em sp --limit 20`
- `/orbio export software b2b em sp --format csv`
- `/orbio export-status aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
