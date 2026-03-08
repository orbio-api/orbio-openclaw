import { createHash, randomUUID } from "node:crypto";

import { toTrimmedString } from "./config";
import type { CommandToolInput } from "./schemas";

export type ParsedCommand =
  | {
      action: "search";
      queryText: string;
      limit: number | undefined;
      withContact: boolean;
    }
  | {
      action: "export";
      queryText: string;
      limit: number | undefined;
      withContact: boolean;
      format: "csv" | "html";
    }
  | {
      action: "export-status";
      exportId: string;
    };

export function clampLimit(raw: number | undefined): number {
  const fallback = 20;
  if (raw === undefined || raw === null || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(50000, Math.max(1, Math.floor(raw)));
}

function parseTokens(raw: string): string[] {
  const out: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? "";
    if (token) {
      out.push(token);
    }
  }
  return out;
}

export function usageText(): string {
  return [
    "Usage:",
    "/orbio search <query> [--limit N] [--with-contact]",
    "/orbio export <query> [--limit N] [--format csv|html] [--with-contact]",
    "/orbio export-status <export_id>",
  ].join("\n");
}

export function parseCommand(raw: string): ParsedCommand | { error: string } {
  const tokens = parseTokens(raw);
  if (tokens.length === 0) {
    return { error: usageText() };
  }

  const action = tokens[0]?.toLowerCase();
  const rest = tokens.slice(1);

  if (action === "search" || action === "export") {
    let withContact = false;
    let limit: number | undefined;
    let format: "csv" | "html" = "csv";
    const queryParts: string[] = [];

    for (let idx = 0; idx < rest.length; idx += 1) {
      const token = rest[idx] ?? "";
      if (token === "--with-contact") {
        withContact = true;
        continue;
      }
      if (token === "--limit") {
        const rawLimit = rest[idx + 1];
        const parsed = rawLimit ? Number(rawLimit) : Number.NaN;
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return { error: "Invalid --limit value. Use an integer >= 1." };
        }
        limit = Math.floor(parsed);
        idx += 1;
        continue;
      }
      if (action === "export" && token === "--format") {
        const rawFormat = String(rest[idx + 1] ?? "").toLowerCase();
        if (rawFormat !== "csv" && rawFormat !== "html") {
          return { error: "Invalid --format value. Use csv or html." };
        }
        format = rawFormat;
        idx += 1;
        continue;
      }
      queryParts.push(token);
    }

    const queryText = queryParts.join(" ").trim();
    if (!queryText) {
      return { error: `Missing query text.\n\n${usageText()}` };
    }

    if (action === "search") {
      return { action: "search", queryText, limit, withContact };
    }

    return { action: "export", queryText, limit, withContact, format };
  }

  if (action === "export-status" || action === "status") {
    const exportId = (rest[0] ?? "").trim();
    if (!exportId) {
      return { error: "Missing export_id. Use: /orbio export-status <export_id>" };
    }
    return { action: "export-status", exportId };
  }

  return { error: `Unknown command: ${action}\n\n${usageText()}` };
}

export function buildIdempotencyKey(prefix: string, payload: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  return `openclaw:${prefix}:${digest}:${suffix}`;
}

export function resolveCommandRaw(args: CommandToolInput): string {
  const raw = args.command ?? args.command_arg ?? args.commandArg;
  const commandName = args.command_name ?? args.commandName;
  const rawText = toTrimmedString(raw);
  if (rawText) {
    return rawText;
  }
  const commandText = toTrimmedString(commandName);
  if (commandText) {
    return commandText;
  }
  return "";
}
