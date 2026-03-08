import { PLUGIN_ID, PLUGIN_NAME } from "./constants";
import { asJsonRecord, readConfig } from "./config";
import {
  buildIdempotencyKey,
  clampLimit,
  parseCommand,
  resolveCommandRaw,
} from "./commands";
import {
  chooseOutputFields,
  errorText,
  renderExportStatusText,
  renderExportText,
  renderSearchText,
  result,
} from "./formatters";
import { MinuteWindowLimiter, OrbioHttpClient } from "./http";
import {
  CommandToolInput,
  ExportStatusToolInput,
  ExportToolInput,
  SearchToolInput,
} from "./schemas";
import type {
  AccountSearchResponse,
  CapabilitiesResponse,
  ExportCreateResponse,
  ExportStatusResponse,
  JsonRecord,
  OutputSpec,
  SpecResponse,
  ToolResult,
} from "./types";

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

  const resolveSpecFromQuery = async (
    queryText: string,
    limit: number,
    output: OutputSpec,
  ): Promise<JsonRecord> => {
    const payload = await http.request<SpecResponse>("POST", "/v1/specs", {
      query_text: queryText,
      limit,
      output,
      include_explain: false,
    });
    const generatedSpec = asJsonRecord(payload?.spec);
    if (!generatedSpec) {
      throw new Error("Spec generation failed: /v1/specs returned empty spec.");
    }

    const normalizedPayload = await http.request<SpecResponse>("POST", "/v1/specs/normalize", {
      spec: generatedSpec,
    });
    const normalizedSpec = asJsonRecord(normalizedPayload?.spec);
    if (!normalizedSpec) {
      throw new Error("Spec normalization failed: /v1/specs/normalize returned empty spec.");
    }
    return normalizedSpec;
  };

  const doSearch = async (args: SearchToolInput): Promise<string> => {
    const caps = await getCapabilities();
    const withContact = Boolean(args.with_contact);
    const { fields, contactGranted } = chooseOutputFields(caps.field_allowlist, withContact);
    const limit = clampLimit(args.limit);
    const output: OutputSpec = {
      format: "json",
      include_explain: false,
      fields,
    };
    const spec = await resolveSpecFromQuery(args.query_text, limit, output);

    const payload = await http.request<AccountSearchResponse>("POST", "/v1/accounts/search", {
      spec,
      limit,
      output,
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
    const limit = clampLimit(args.limit);
    const output: OutputSpec = {
      format,
      include_explain: false,
      fields,
    };
    const spec = await resolveSpecFromQuery(args.query_text, limit, output);

    const requestBody = {
      spec,
      limit,
      output,
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

  type RegisterToolLegacyFn = (
    name: string,
    spec: {
      description: string;
      parameters: unknown;
      optional?: boolean;
    },
    handler: (args: unknown) => Promise<ToolResult>,
  ) => unknown;

  type RegisterToolModernFn = (
    tool: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (id: string, args: unknown) => Promise<ToolResult>;
    },
    options?: {
      optional?: boolean;
    },
  ) => unknown;

  const pluginApi = api as {
    registerTool: RegisterToolLegacyFn | RegisterToolModernFn;
  };

  const registerToolCompat = (
    name: string,
    description: string,
    parameters: unknown,
    handler: (args: unknown) => Promise<ToolResult>,
  ): unknown => {
    const registerTool = pluginApi.registerTool as (...args: unknown[]) => unknown;

    // OpenClaw 2026+ expects registerTool({ name, description, parameters, execute }, { optional }).
    // Keep a fallback for older runtimes that still use (name, spec, handler).
    const registerModern = () =>
      (pluginApi.registerTool as RegisterToolModernFn)(
        {
          name,
          description,
          parameters,
          execute: async (_id, args) => handler(args),
        },
        { optional: true },
      );

    const registerLegacy = () =>
      (pluginApi.registerTool as RegisterToolLegacyFn)(
        name,
        {
          description,
          parameters,
          optional: true,
        },
        handler,
      );

    if (registerTool.length >= 3) {
      return registerLegacy();
    }

    try {
      return registerModern();
    } catch (error) {
      if (error instanceof TypeError) {
        return registerLegacy();
      }
      throw error;
    }
  };

  return {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: "Official Orbio account discovery tools for OpenClaw.",
    tools: [
      registerToolCompat(
        "orbio_search",
        "Search Brazilian companies with chat-safe defaults. Use with_contact=true to request contact fields when plan allows.",
        SearchToolInput,
        async (args: unknown) =>
          runGuarded("orbio_search", () => doSearch(args as SearchToolInput)),
      ),
      registerToolCompat(
        "orbio_export",
        "Create Orbio export jobs (csv/html). Uses Idempotency-Key and chat-safe field policy.",
        ExportToolInput,
        async (args: unknown) =>
          runGuarded("orbio_export", () => doExport(args as ExportToolInput)),
      ),
      registerToolCompat(
        "orbio_export_status",
        "Get current status for an Orbio export job.",
        ExportStatusToolInput,
        async (args: unknown) =>
          runGuarded("orbio_export_status", () => doExportStatus(args as ExportStatusToolInput)),
      ),
      registerToolCompat(
        "orbio_command",
        "Command dispatcher for /orbio slash commands. Examples: search, export, export-status.",
        CommandToolInput,
        async (args: unknown) =>
          runGuarded("orbio_command", () => doCommand(args as CommandToolInput)),
      ),
    ],
  };
}
