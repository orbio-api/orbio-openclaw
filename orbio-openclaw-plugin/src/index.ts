import { createHash, randomUUID } from "node:crypto";

import { Type, type Static } from "@sinclair/typebox";

type JsonRecord = Record<string, unknown>;

const PLUGIN_ID = "orbio-openclaw";
const PLUGIN_NAME = "Orbio (official)";
const PLUGIN_VERSION = "0.1.0";

type OrbioPluginConfig = {
  baseUrl: string;
  apiKey: string;
  workspaceId: string;
  timeoutMs: number;
  maxRequestsPerMinute: number;
  retryCount: number;
  retryBackoffMs: number;
  capabilitiesTtlMs: number;
  userAgent: string;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

type CapabilitiesResponse = {
  current_snapshot: string;
  snapshot_date: string;
  plan_tier: string;
  limits: JsonRecord;
  broad_query_rules: {
    require_cnae: boolean;
    require_geo: string;
    free_minimum: string;
  };
  allowed_sort_fields: string[];
  field_allowlist: string[];
};

type AccountSearchResponse = {
  request_id: string;
  snapshot: string;
  snapshot_date: string;
  accounts: JsonRecord[];
  has_more: boolean;
  next_cursor: string | null;
};

type ExportCreateResponse = {
  request_id: string;
  snapshot: string;
  snapshot_date: string;
  preview_accounts: JsonRecord[];
  export: {
    export_id: string;
    status: string;
    format: string;
    row_count: number | null;
    size_bytes: number | null;
    expires_at: string | null;
    download_url: string | null;
  };
};

type ExportStatusResponse = {
  export_id: string;
  status: string;
  format: string;
  row_count: number | null;
  size_bytes: number | null;
  expires_at: string | null;
  download_url: string | null;
};

const SAFE_DEFAULT_FIELDS = [
  "cnpj",
  "legal_name",
  "trade_name",
  "uf",
  "municipality_ibge",
  "cnae_primary",
  "company_size_code",
  "registration_status",
  "started_at",
  "has_email",
  "has_phone",
] as const;

const CONTACT_FIELDS = [
  "email",
  "phone1",
  "area_code1",
  "phone2",
  "area_code2",
  "street_type",
  "street",
  "street_number",
  "address_complement",
  "neighborhood",
  "postal_code",
] as const;

const SearchToolInput = Type.Object(
  {
    query_text: Type.String({ minLength: 1, maxLength: 500 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50000 })),
    with_contact: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

type SearchToolInput = Static<typeof SearchToolInput>;

const ExportToolInput = Type.Object(
  {
    query_text: Type.String({ minLength: 1, maxLength: 500 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50000 })),
    format: Type.Optional(Type.Union([Type.Literal("csv"), Type.Literal("html")])),
    with_contact: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

type ExportToolInput = Static<typeof ExportToolInput>;

const ExportStatusToolInput = Type.Object(
  {
    export_id: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);

type ExportStatusToolInput = Static<typeof ExportStatusToolInput>;

const CommandToolInput = Type.Object(
  {
    command: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    command_arg: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    commandArg: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    command_name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    commandName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    skill_name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    skillName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  },
  { additionalProperties: true },
);

type CommandToolInput = Static<typeof CommandToolInput>;

class PluginRateLimitError extends Error {
  public readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super("plugin_rate_limited");
    this.retryAfterSec = retryAfterSec;
  }
}

class OrbioApiError extends Error {
  public readonly status: number;
  public readonly code: string | null;
  public readonly detail: string;
  public readonly requestId: string | null;
  public readonly retryAfter: string | null;

  constructor(params: {
    status: number;
    code: string | null;
    detail: string;
    requestId: string | null;
    retryAfter: string | null;
  }) {
    super(params.detail || "orbio_api_error");
    this.status = params.status;
    this.code = params.code;
    this.detail = params.detail;
    this.requestId = params.requestId;
    this.retryAfter = params.retryAfter;
  }
}

class MinuteWindowLimiter {
  private readonly events = new Map<string, number[]>();

  check(key: string, limit: number): void {
    const now = Date.now();
    const cutoff = now - 60_000;
    const current = this.events.get(key) ?? [];
    const kept = current.filter((ts) => ts >= cutoff);

    if (kept.length >= limit) {
      const oldest = kept[0] ?? now;
      const retryAfterMs = Math.max(1, 60_000 - (now - oldest));
      throw new PluginRateLimitError(Math.ceil(retryAfterMs / 1000));
    }

    kept.push(now);
    this.events.set(key, kept);
  }
}

class OrbioHttpClient {
  private readonly cfg: OrbioPluginConfig;

  constructor(cfg: OrbioPluginConfig) {
    this.cfg = cfg;
  }

  async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.cfg.baseUrl}${path}`;

    for (let attempt = 0; attempt <= this.cfg.retryCount; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.cfg.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": this.cfg.userAgent,
            "X-Request-Id": randomUUID(),
            ...(extraHeaders ?? {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          if (response.status === 204) {
            return {} as T;
          }
          const payload = await this.parseJsonSafe(response);
          return (payload ?? {}) as T;
        }

        if (response.status >= 500 && attempt < this.cfg.retryCount) {
          await sleep(this.cfg.retryBackoffMs * (attempt + 1));
          continue;
        }

        const payload = await this.parseJsonSafe(response);
        const { code, detail } = parseProblem(payload);
        throw new OrbioApiError({
          status: response.status,
          code,
          detail,
          requestId: response.headers.get("X-Request-Id"),
          retryAfter: response.headers.get("Retry-After"),
        });
      } catch (error) {
        clearTimeout(timeout);
        const isAbort = error instanceof Error && error.name === "AbortError";
        if ((isAbort || isNetworkError(error)) && attempt < this.cfg.retryCount) {
          await sleep(this.cfg.retryBackoffMs * (attempt + 1));
          continue;
        }
        if (error instanceof OrbioApiError) {
          throw error;
        }
        const detail = isAbort
          ? `Request timed out after ${this.cfg.timeoutMs} ms.`
          : "Network failure while calling Orbio API.";
        throw new OrbioApiError({
          status: 0,
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
          detail,
          requestId: null,
          retryAfter: null,
        });
      }
    }

    throw new OrbioApiError({
      status: 0,
      code: "RETRY_EXHAUSTED",
      detail: "Transient retries exhausted.",
      requestId: null,
      retryAfter: null,
    });
  }

  private async parseJsonSafe(response: Response): Promise<unknown | null> {
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}

function parseProblem(payload: unknown): { code: string | null; detail: string } {
  if (!payload || typeof payload !== "object") {
    return { code: null, detail: "Orbio API returned an error." };
  }
  const record = payload as JsonRecord;

  const directCode = typeof record.code === "string" ? record.code : null;
  const directDetail = typeof record.detail === "string" ? record.detail : null;

  const nested = record.error;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as JsonRecord;
    const nestedCode = typeof nestedRecord.code === "string" ? nestedRecord.code : null;
    const nestedMessage =
      typeof nestedRecord.message === "string" ? nestedRecord.message : directDetail;
    return {
      code: nestedCode ?? directCode,
      detail: nestedMessage ?? "Orbio API returned an error.",
    };
  }

  return {
    code: directCode,
    detail: directDetail ?? "Orbio API returned an error.",
  };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function readConfig(api: unknown): OrbioPluginConfig {
  const asRecord = (api ?? {}) as JsonRecord;
  const rawConfig = ((asRecord.config ?? {}) as JsonRecord) ?? {};
  const env = ((asRecord.env ?? {}) as Record<string, string | undefined>) ?? {};

  const baseUrl = String(rawConfig.baseUrl ?? env.ORBIO_BASE_URL ?? "").trim();
  const apiKey = String(rawConfig.apiKey ?? env.ORBIO_API_KEY ?? "").trim();

  if (!baseUrl) {
    throw new Error("Missing plugin config: baseUrl");
  }
  if (!apiKey) {
    throw new Error("Missing plugin config: apiKey");
  }

  const timeoutMs = parsePositiveInt(rawConfig.timeoutMs, 20_000);
  const maxRequestsPerMinute = parsePositiveInt(rawConfig.maxRequestsPerMinute, 30);
  const retryCount = Math.min(3, parseNonNegativeInt(rawConfig.retryCount, 1));
  const retryBackoffMs = parsePositiveInt(rawConfig.retryBackoffMs, 300);
  const capabilitiesTtlMs = parsePositiveInt(rawConfig.capabilitiesTtlMs, 60_000);

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    workspaceId: String(rawConfig.workspaceId ?? env.ORBIO_WORKSPACE_ID ?? "default"),
    timeoutMs,
    maxRequestsPerMinute,
    retryCount,
    retryBackoffMs,
    capabilitiesTtlMs,
    userAgent: `${PLUGIN_ID}/${PLUGIN_VERSION}`,
  };
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampLimit(raw: number | undefined): number {
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

type ParsedCommand =
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

function parseCommand(raw: string): ParsedCommand | { error: string } {
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

function usageText(): string {
  return [
    "Usage:",
    "/orbio search <query> [--limit N] [--with-contact]",
    "/orbio export <query> [--limit N] [--format csv|html] [--with-contact]",
    "/orbio export-status <export_id>",
  ].join("\n");
}

function buildIdempotencyKey(prefix: string, payload: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  return `openclaw:${prefix}:${digest}:${suffix}`;
}

function chooseOutputFields(
  allowlist: string[],
  withContact: boolean,
): { fields: string[]; contactGranted: boolean } {
  const allowed = new Set(allowlist);
  const safe = SAFE_DEFAULT_FIELDS.filter((field) => allowed.has(field));
  if (safe.length === 0) {
    throw new Error("No safe output fields are allowed for this plan.");
  }

  if (!withContact) {
    return { fields: safe, contactGranted: false };
  }

  const contact = CONTACT_FIELDS.filter((field) => allowed.has(field));
  if (contact.length === 0) {
    return { fields: safe, contactGranted: false };
  }

  return { fields: [...safe, ...contact], contactGranted: true };
}

function topAccounts(accounts: JsonRecord[], limit = 10): JsonRecord[] {
  return accounts.slice(0, limit);
}

function renderSearchText(
  payload: AccountSearchResponse,
  opts: { withContactRequested: boolean; contactGranted: boolean; fields: string[] },
): string {
  const note =
    opts.withContactRequested && !opts.contactGranted
      ? "\nNote: contact fields are restricted by plan; returning masked fields only."
      : "";

  const body = {
    request_id: payload.request_id,
    snapshot: payload.snapshot,
    snapshot_date: payload.snapshot_date,
    result_count: payload.accounts.length,
    has_more: payload.has_more,
    next_cursor: payload.next_cursor,
    fields: opts.fields,
    accounts: topAccounts(payload.accounts),
  };

  return `Search completed.${note}\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\``;
}

function renderExportText(
  payload: ExportCreateResponse,
  opts: { withContactRequested: boolean; contactGranted: boolean; fields: string[] },
): string {
  const note =
    opts.withContactRequested && !opts.contactGranted
      ? "\nNote: contact fields are restricted by plan; export uses masked fields only."
      : "";

  const body = {
    request_id: payload.request_id,
    snapshot: payload.snapshot,
    snapshot_date: payload.snapshot_date,
    export: payload.export,
    fields: opts.fields,
    preview_accounts: topAccounts(payload.preview_accounts),
  };

  return `Export requested.${note}\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\``;
}

function renderExportStatusText(payload: ExportStatusResponse): string {
  const body = {
    export_id: payload.export_id,
    status: payload.status,
    format: payload.format,
    row_count: payload.row_count,
    size_bytes: payload.size_bytes,
    expires_at: payload.expires_at,
    download_url: payload.download_url,
  };
  return `Export status:\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\``;
}

function errorText(error: unknown): string {
  if (error instanceof PluginRateLimitError) {
    return `Rate limited by plugin policy. Retry in ~${error.retryAfterSec}s.`;
  }

  if (error instanceof OrbioApiError) {
    const code = (error.code ?? "").toLowerCase();
    const requestIdSuffix = error.requestId ? ` (request_id=${error.requestId})` : "";

    if (error.status === 429 || code === "rate_limit_exceeded") {
      const retry = error.retryAfter ? ` Retry-After=${error.retryAfter}s.` : "";
      return `Orbio rate limit exceeded.${retry}${requestIdSuffix}`;
    }
    if (code === "quota_exceeded") {
      return `Orbio quota exceeded for this API key/workspace.${requestIdSuffix}`;
    }
    if (
      code === "authentication_required" ||
      code === "authentication_invalid" ||
      code === "authentication_disabled" ||
      error.status === 401
    ) {
      return `Orbio authentication failed. Check plugin apiKey.${requestIdSuffix}`;
    }
    if (code === "invalid_spec" || code === "query_too_broad" || error.status === 422) {
      return `Query is invalid or too broad. Narrow filters and retry.${requestIdSuffix}`;
    }
    if (code === "dependency_unavailable" || error.status >= 500) {
      return `Orbio dependency is temporarily unavailable. Retry shortly.${requestIdSuffix}`;
    }
    return `Orbio API error: ${error.detail}${requestIdSuffix}`;
  }

  if (error instanceof Error) {
    return `Unexpected error: ${error.message}`;
  }
  return "Unexpected unknown error.";
}

function result(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export default function registerOrbioPlugin(api: unknown): unknown {
  const cfg = readConfig(api);
  const http = new OrbioHttpClient(cfg);
  const limiter = new MinuteWindowLimiter();

  let capabilitiesCache: { expiresAt: number; value: CapabilitiesResponse } | null = null;

  const getCapabilities = async (): Promise<CapabilitiesResponse> => {
    const now = Date.now();
    if (capabilitiesCache && capabilitiesCache.expiresAt > now) {
      return capabilitiesCache.value;
    }
    const response = await http.request<CapabilitiesResponse>("GET", "/v1/capabilities");
    capabilitiesCache = { expiresAt: now + cfg.capabilitiesTtlMs, value: response };
    return response;
  };

  const runGuarded = async (toolName: string, fn: () => Promise<string>): Promise<ToolResult> => {
    try {
      limiter.check(`${cfg.workspaceId}:${toolName}`, cfg.maxRequestsPerMinute);
      const text = await fn();
      return result(text);
    } catch (error) {
      return result(errorText(error));
    }
  };

  const doSearch = async (args: SearchToolInput): Promise<string> => {
    const caps = await getCapabilities();
    const withContact = Boolean(args.with_contact);
    const { fields, contactGranted } = chooseOutputFields(caps.field_allowlist, withContact);

    const payload = await http.request<AccountSearchResponse>("POST", "/v1/accounts/search", {
      query_text: args.query_text,
      limit: clampLimit(args.limit),
      output: {
        format: "json",
        include_explain: false,
        fields,
      },
    });

    return renderSearchText(payload, {
      withContactRequested: withContact,
      contactGranted,
      fields,
    });
  };

  const doExport = async (args: ExportToolInput): Promise<string> => {
    const caps = await getCapabilities();
    const withContact = Boolean(args.with_contact);
    const { fields, contactGranted } = chooseOutputFields(caps.field_allowlist, withContact);
    const format = args.format ?? "csv";

    const requestBody = {
      query_text: args.query_text,
      limit: clampLimit(args.limit),
      output: {
        format,
        include_explain: false,
        fields,
      },
    };

    const idempotencyKey = buildIdempotencyKey("export", requestBody);
    const payload = await http.request<ExportCreateResponse>(
      "POST",
      "/v1/exports",
      requestBody,
      { "Idempotency-Key": idempotencyKey },
    );

    return renderExportText(payload, {
      withContactRequested: withContact,
      contactGranted,
      fields,
    });
  };

  const doExportStatus = async (args: ExportStatusToolInput): Promise<string> => {
    const payload = await http.request<ExportStatusResponse>(
      "GET",
      `/v1/exports/${encodeURIComponent(args.export_id)}`,
    );
    return renderExportStatusText(payload);
  };

  const resolveCommandRaw = (args: CommandToolInput): string => {
    const raw = args.command ?? args.command_arg ?? args.commandArg;
    const commandName = args.command_name ?? args.commandName;
    if (raw && raw.trim()) {
      return raw.trim();
    }
    if (commandName && commandName.trim()) {
      return commandName.trim();
    }
    return "";
  };

  const doCommand = async (args: CommandToolInput): Promise<string> => {
    const raw = resolveCommandRaw(args);
    const parsed = parseCommand(raw);
    if ("error" in parsed) {
      return parsed.error;
    }

    if (parsed.action === "search") {
      return doSearch({
        query_text: parsed.queryText,
        limit: parsed.limit,
        with_contact: parsed.withContact,
      });
    }

    if (parsed.action === "export") {
      return doExport({
        query_text: parsed.queryText,
        limit: parsed.limit,
        with_contact: parsed.withContact,
        format: parsed.format,
      });
    }

    return doExportStatus({ export_id: parsed.exportId });
  };

  const pluginApi = api as {
    registerTool: (
      name: string,
      spec: {
        description: string;
        parameters: unknown;
        optional?: boolean;
      },
      handler: (args: any) => Promise<ToolResult>,
    ) => unknown;
  };

  return {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: "Official Orbio account discovery tools for OpenClaw.",
    tools: [
      pluginApi.registerTool(
        "orbio_search",
        {
          description:
            "Search Brazilian companies with chat-safe defaults. Use with_contact=true to request contact fields when plan allows.",
          parameters: SearchToolInput,
          optional: true,
        },
        async (args: SearchToolInput) => runGuarded("orbio_search", () => doSearch(args)),
      ),
      pluginApi.registerTool(
        "orbio_export",
        {
          description:
            "Create Orbio export jobs (csv/html). Uses Idempotency-Key and chat-safe field policy.",
          parameters: ExportToolInput,
          optional: true,
        },
        async (args: ExportToolInput) => runGuarded("orbio_export", () => doExport(args)),
      ),
      pluginApi.registerTool(
        "orbio_export_status",
        {
          description: "Get current status for an Orbio export job.",
          parameters: ExportStatusToolInput,
          optional: true,
        },
        async (args: ExportStatusToolInput) =>
          runGuarded("orbio_export_status", () => doExportStatus(args)),
      ),
      pluginApi.registerTool(
        "orbio_command",
        {
          description:
            "Command dispatcher for /orbio slash commands. Examples: search, export, export-status.",
          parameters: CommandToolInput,
          optional: true,
        },
        async (args: CommandToolInput) => runGuarded("orbio_command", () => doCommand(args)),
      ),
    ],
  };
}
