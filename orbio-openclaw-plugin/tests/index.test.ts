import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerOrbioPlugin from "../src/index";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

type ToolSpec = {
  description: string;
  parameters: unknown;
  optional?: boolean;
};

type ToolHandler = (args: unknown) => Promise<ToolResult>;

type SetupOptions = {
  config?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
};

const SAFE_FIELDS = [
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
];

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
];

const fetchMock = vi.fn();

function jsonResponse(
  payload: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function textResponse(text: string, status = 200, headers?: Record<string, string>): Response {
  return new Response(text, { status, headers });
}

function capabilitiesResponse(fieldAllowlist: string[] = SAFE_FIELDS): Response {
  return jsonResponse({
    current_snapshot: "2026-02",
    snapshot_date: "2026-02-01",
    plan_tier: "pro",
    limits: {},
    broad_query_rules: {
      require_cnae: false,
      require_geo: "city",
      free_minimum: "none",
    },
    allowed_sort_fields: ["cnpj"],
    field_allowlist: fieldAllowlist,
  });
}

function searchResponse(accountsCount = 3): Response {
  const accounts = Array.from({ length: accountsCount }, (_, idx) => ({
    cnpj: `00000000000${idx}`,
    legal_name: `Company ${idx}`,
    has_email: true,
    has_phone: true,
  }));
  return jsonResponse({
    request_id: "req-search",
    snapshot: "2026-02",
    snapshot_date: "2026-02-01",
    accounts,
    has_more: false,
    next_cursor: null,
  });
}

function exportResponse(): Response {
  return jsonResponse({
    request_id: "req-export",
    snapshot: "2026-02",
    snapshot_date: "2026-02-01",
    preview_accounts: [{ cnpj: "001" }],
    export: {
      export_id: "exp-123",
      status: "queued",
      format: "csv",
      row_count: null,
      size_bytes: null,
      expires_at: null,
      download_url: null,
    },
  });
}

function exportStatusResponse(): Response {
  return jsonResponse({
    export_id: "exp-123",
    status: "ready",
    format: "csv",
    row_count: 10,
    size_bytes: 100,
    expires_at: "2026-02-28T00:00:00Z",
    download_url: "https://storage.example.com/file.csv",
  });
}

function parseJsonBlock(text: string): Record<string, unknown> {
  const match = text.match(/```json\n([\s\S]+)\n```/);
  if (!match || !match[1]) {
    throw new Error(`JSON block not found in result: ${text}`);
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function setupPlugin(options?: SetupOptions): {
  plugin: { id: string; name: string; tools: unknown[] };
  handlers: Map<string, ToolHandler>;
  specs: Map<string, ToolSpec>;
} {
  const handlers = new Map<string, ToolHandler>();
  const specs = new Map<string, ToolSpec>();

  const api = {
    config: {
      baseUrl: "https://api.orbio.test",
      apiKey: "api-key",
      workspaceId: "workspace-1",
      timeoutMs: 1000,
      maxRequestsPerMinute: 30,
      retryCount: 0,
      retryBackoffMs: 0,
      capabilitiesTtlMs: 60000,
      ...(options?.config ?? {}),
    },
    env: options?.env ?? {},
    registerTool(name: string, spec: ToolSpec, handler: ToolHandler): unknown {
      handlers.set(name, handler);
      specs.set(name, spec);
      return { name };
    },
  };

  const plugin = registerOrbioPlugin(api) as { id: string; name: string; tools: unknown[] };
  return { plugin, handlers, specs };
}

async function invokeTool(
  handlers: Map<string, ToolHandler>,
  toolName: string,
  args: unknown,
): Promise<string> {
  const handler = handlers.get(toolName);
  if (!handler) {
    throw new Error(`Tool not registered: ${toolName}`);
  }
  const result = await handler(args);
  return result.content[0]?.text ?? "";
}

function requestInitAt(index: number): RequestInit {
  const call = fetchMock.mock.calls[index] as [string, RequestInit] | undefined;
  if (!call || !call[1]) {
    throw new Error(`Missing fetch call at index ${index}`);
  }
  return call[1];
}

function requestBodyAt(index: number): Record<string, unknown> {
  const init = requestInitAt(index);
  return JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
}

function headerRecord(init: RequestInit): Record<string, string> {
  const headers = init.headers;
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers as Record<string, string>;
}

function executionContextHeaderAt(index: number): Record<string, unknown> {
  const headers = headerRecord(requestInitAt(index));
  const raw = headers["X-Orbio-Execution-Context"];
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("orbio-openclaw plugin", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("registers stable metadata and all official tools", () => {
    const { plugin, handlers, specs } = setupPlugin();

    expect(plugin.id).toBe("orbio-openclaw");
    expect(plugin.name).toBe("Orbio (official)");
    expect(plugin.tools).toHaveLength(4);

    expect([...handlers.keys()].sort()).toEqual([
      "orbio_command",
      "orbio_export",
      "orbio_export_status",
      "orbio_search",
    ]);

    expect(specs.get("orbio_search")?.optional).toBe(true);
    expect(specs.get("orbio_export")?.optional).toBe(true);
    expect(specs.get("orbio_export_status")?.optional).toBe(true);
    expect(specs.get("orbio_command")?.optional).toBe(true);
  });

  it("fails fast when mandatory config is missing", () => {
    expect(() => registerOrbioPlugin({ config: { apiKey: "abc" } })).toThrow(
      "Missing plugin config: baseUrl",
    );
    expect(() => registerOrbioPlugin({ config: { baseUrl: "https://api.orbio.test" } })).toThrow(
      "Missing plugin config: apiKey",
    );
    expect(() => registerOrbioPlugin(null)).toThrow("Missing plugin config: baseUrl");
  });

  it("reads credentials from env and normalizes baseUrl", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin({
      config: {
        baseUrl: " https://api.orbio.test/ ",
        apiKey: undefined,
        timeoutMs: -1,
        maxRequestsPerMinute: -1,
        retryCount: -1,
        retryBackoffMs: -1,
        capabilitiesTtlMs: -1,
      },
      env: {
        ORBIO_API_KEY: "env-api-key",
      },
    });

    const text = await invokeTool(handlers, "orbio_search", { query_text: "software b2b" });
    expect(text).toContain("Search completed.");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.orbio.test/v1/capabilities");
    const headers = headerRecord(requestInitAt(0));
    expect(headers.Authorization).toBe("Bearer env-api-key");
    const executionContext = executionContextHeaderAt(0);
    expect(executionContext.integration).toBe("openclaw");
    expect(executionContext.channel).toBe("chat");
    expect(executionContext.workspace).toBe("workspace-1");
    expect(executionContext.run_id).toBe(headers["X-Request-Id"]);
  });

  it("supports env-only workspace identity for plugin-scoped throttling", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin({
      config: {
        baseUrl: undefined,
        apiKey: undefined,
        workspaceId: undefined,
        maxRequestsPerMinute: 1,
      },
      env: {
        ORBIO_BASE_URL: "https://api.orbio.test",
        ORBIO_API_KEY: "env-key",
        ORBIO_WORKSPACE_ID: "env-workspace",
        ORBIO_CHANNEL: "whatsapp",
        ORBIO_SEND_EXECUTION_CONTEXT: "true",
      },
    });

    const first = await invokeTool(handlers, "orbio_search", { query_text: "first" });
    const second = await invokeTool(handlers, "orbio_search", { query_text: "second" });

    expect(first).toContain("Search completed.");
    expect(executionContextHeaderAt(0).channel).toBe("whatsapp");
    expect(second).toContain("Rate limited by plugin policy");
  });

  it("parses execution-context env toggles and channel normalization", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(searchResponse(1))
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(searchResponse(1));

    const withDisabledHeader = setupPlugin({
      config: {
        sendExecutionContext: undefined,
        channel: undefined,
      },
      env: {
        ORBIO_SEND_EXECUTION_CONTEXT: "false",
        ORBIO_CHANNEL: "@@@",
      },
    });
    await invokeTool(withDisabledHeader.handlers, "orbio_search", { query_text: "no ctx header" });
    expect(headerRecord(requestInitAt(0))["X-Orbio-Execution-Context"]).toBeUndefined();

    const withBlankChannel = setupPlugin({
      config: {
        channel: "   ",
      },
    });
    await invokeTool(withBlankChannel.handlers, "orbio_search", { query_text: "blank channel" });
    expect(executionContextHeaderAt(2).channel).toBe("chat");
  });

  it("searches with safe defaults and clamps large limits", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse([...SAFE_FIELDS, ...CONTACT_FIELDS]))
      .mockResolvedValueOnce(searchResponse(12));

    const { handlers } = setupPlugin();
    const text = await invokeTool(handlers, "orbio_search", {
      query_text: "software b2b em sp",
      limit: 999_999,
    });

    expect(text).toContain("Search completed.");
    const payload = parseJsonBlock(text);
    expect(payload.result_count).toBe(12);
    expect((payload.accounts as unknown[]).length).toBe(10);
    expect(payload.fields).toEqual(SAFE_FIELDS);

    const searchBody = requestBodyAt(1);
    expect(searchBody.limit).toBe(50_000);
    expect((searchBody.output as Record<string, unknown>).format).toBe("json");
    expect((searchBody.output as Record<string, unknown>).include_explain).toBe(false);
    const searchHeader = executionContextHeaderAt(1);
    expect(searchHeader.integration).toBe("openclaw");
  });

  it("allows opting out of execution-context header", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin({
      config: { sendExecutionContext: false },
    });

    const text = await invokeTool(handlers, "orbio_search", { query_text: "without ctx" });
    expect(text).toContain("Search completed.");
    const headers = headerRecord(requestInitAt(0));
    expect(headers["X-Orbio-Execution-Context"]).toBeUndefined();
  });

  it("enables contact fields only with explicit opt-in and allowlist", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse([...SAFE_FIELDS, ...CONTACT_FIELDS]))
      .mockResolvedValueOnce(searchResponse(2));

    const { handlers } = setupPlugin();
    const text = await invokeTool(handlers, "orbio_search", {
      query_text: "saas",
      with_contact: true,
      limit: 20,
    });

    const payload = parseJsonBlock(text);
    const fields = payload.fields as string[];
    expect(fields).toContain("email");
    expect(fields).toContain("phone1");
    expect(text).not.toContain("restricted by plan");

    const searchBody = requestBodyAt(1);
    const bodyFields = (searchBody.output as Record<string, unknown>).fields as string[];
    expect(bodyFields).toContain("email");
  });

  it("keeps responses masked when contact fields are not allowed", async () => {
    fetchMock.mockResolvedValueOnce(capabilitiesResponse()).mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin();
    const text = await invokeTool(handlers, "orbio_search", {
      query_text: "fintech",
      with_contact: true,
    });

    expect(text).toContain("restricted by plan");
    const payload = parseJsonBlock(text);
    expect(payload.fields).toEqual(SAFE_FIELDS);
  });

  it("creates exports with idempotency key and format flags", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse([...SAFE_FIELDS, ...CONTACT_FIELDS]))
      .mockResolvedValueOnce(exportResponse());

    const { handlers } = setupPlugin();
    const text = await invokeTool(handlers, "orbio_export", {
      query_text: "agencias de marketing em sp",
      format: "html",
      with_contact: true,
      limit: 30,
    });

    expect(text).toContain("Export requested.");
    const payload = parseJsonBlock(text);
    expect((payload.export as Record<string, unknown>).export_id).toBe("exp-123");
    expect((payload.fields as string[]).includes("email")).toBe(true);

    const exportInit = requestInitAt(1);
    const headers = headerRecord(exportInit);
    expect(headers["Idempotency-Key"]).toMatch(/^openclaw:export:/);

    const exportBody = requestBodyAt(1);
    expect((exportBody.output as Record<string, unknown>).format).toBe("html");
    expect(exportBody.limit).toBe(30);
  });

  it("uses csv as default export format when omitted", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse(SAFE_FIELDS))
      .mockResolvedValueOnce(exportResponse());

    const { handlers } = setupPlugin();
    await invokeTool(handlers, "orbio_export", {
      query_text: "default format export",
      with_contact: false,
    });

    const exportBody = requestBodyAt(1);
    expect((exportBody.output as Record<string, unknown>).format).toBe("csv");
  });

  it("adds masking note for exports when contact is requested but unavailable", async () => {
    fetchMock.mockResolvedValueOnce(capabilitiesResponse(SAFE_FIELDS)).mockResolvedValueOnce(exportResponse());

    const { handlers } = setupPlugin();
    const text = await invokeTool(handlers, "orbio_export", {
      query_text: "restricted contacts",
      with_contact: true,
    });

    expect(text).toContain("export uses masked fields only.");
  });

  it("returns export status payload from endpoint", async () => {
    fetchMock.mockResolvedValueOnce(exportStatusResponse());
    const { handlers } = setupPlugin();

    const text = await invokeTool(handlers, "orbio_export_status", { export_id: "exp-123" });
    expect(text).toContain("Export status:");

    const payload = parseJsonBlock(text);
    expect(payload.export_id).toBe("exp-123");
    expect(payload.status).toBe("ready");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.orbio.test/v1/exports/exp-123");
  });

  it("supports command-dispatch with quoted args and aliases", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse([...SAFE_FIELDS, ...CONTACT_FIELDS]))
      .mockResolvedValueOnce(searchResponse(2))
      .mockResolvedValueOnce(exportStatusResponse());

    const { handlers } = setupPlugin();
    const searchText = await invokeTool(handlers, "orbio_command", {
      command: 'search "software b2b" --limit 7 --with-contact',
    });
    expect(searchText).toContain("Search completed.");

    const searchBody = requestBodyAt(1);
    expect(searchBody.query_text).toBe("software b2b");
    expect(searchBody.limit).toBe(7);

    const statusText = await invokeTool(handlers, "orbio_command", {
      commandName: "status exp-123",
    });
    expect(statusText).toContain("Export status:");
  });

  it("supports export through command dispatch", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse([...SAFE_FIELDS, ...CONTACT_FIELDS]))
      .mockResolvedValueOnce(exportResponse());

    const { handlers } = setupPlugin();
    const exportText = await invokeTool(handlers, "orbio_command", {
      commandArg: "export 'agencias em sp' --format html --limit 9 --with-contact",
    });

    expect(exportText).toContain("Export requested.");
    const exportBody = requestBodyAt(1);
    expect(exportBody.query_text).toBe("agencias em sp");
    expect(exportBody.limit).toBe(9);
    expect((exportBody.output as Record<string, unknown>).format).toBe("html");
  });

  it("returns parser-level command validation errors", async () => {
    const { handlers } = setupPlugin();

    await expect(
      invokeTool(handlers, "orbio_command", {
        command: "export hello --format xlsx",
      }),
    ).resolves.toContain("Invalid --format value");

    await expect(
      invokeTool(handlers, "orbio_command", {
        command: "search hello --limit nope",
      }),
    ).resolves.toContain("Invalid --limit value");

    await expect(
      invokeTool(handlers, "orbio_command", {
        command: "search hello --limit",
      }),
    ).resolves.toContain("Invalid --limit value");

    await expect(
      invokeTool(handlers, "orbio_command", {
        command: "export-status",
      }),
    ).resolves.toContain("Missing export_id");

    await expect(
      invokeTool(handlers, "orbio_command", {
        command_arg: "unknown test",
      }),
    ).resolves.toContain("Unknown command");

    await expect(
      invokeTool(handlers, "orbio_command", {
        command_name: "search",
      }),
    ).resolves.toContain("Missing query text");

    await expect(invokeTool(handlers, "orbio_command", {})).resolves.toContain("Usage:");

    await expect(
      invokeTool(handlers, "orbio_command", {
        command: "export hello --format",
      }),
    ).resolves.toContain("Invalid --format value");

    await expect(
      invokeTool(handlers, "orbio_command", {
        command_name: "   ",
      }),
    ).resolves.toContain("Usage:");
  });

  it("enforces plugin-side rate limiting per workspace and tool", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin({
      config: { maxRequestsPerMinute: 1 },
    });

    const first = await invokeTool(handlers, "orbio_search", { query_text: "first" });
    const second = await invokeTool(handlers, "orbio_search", { query_text: "second" });

    expect(first).toContain("Search completed.");
    expect(second).toContain("Rate limited by plugin policy");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches capabilities for the configured TTL", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(searchResponse(1))
      .mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin({
      config: { capabilitiesTtlMs: 120000 },
    });

    await invokeTool(handlers, "orbio_search", { query_text: "a" });
    await invokeTool(handlers, "orbio_search", { query_text: "b" });

    const capabilityCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/v1/capabilities"),
    );
    expect(capabilityCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects search when allowlist has no safe fields", async () => {
    fetchMock.mockResolvedValueOnce(capabilitiesResponse(["email"]));

    const { handlers } = setupPlugin();
    const text = await invokeTool(handlers, "orbio_search", { query_text: "invalid" });

    expect(text).toContain("Unexpected error");
    expect(text).toContain("No safe output fields are allowed for this plan.");
  });

  it("retries transient 5xx responses", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(jsonResponse({ detail: "downstream" }, 503))
      .mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin({
      config: { retryCount: 1, retryBackoffMs: 0 },
    });

    const text = await invokeTool(handlers, "orbio_search", { query_text: "retry" });
    expect(text).toContain("Search completed.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries transient network failures", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockRejectedValueOnce(new TypeError("socket closed"))
      .mockResolvedValueOnce(searchResponse(1));

    const { handlers } = setupPlugin({
      config: { retryCount: 1, retryBackoffMs: 0 },
    });

    const text = await invokeTool(handlers, "orbio_search", { query_text: "retry network" });
    expect(text).toContain("Search completed.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps timeout abort errors to a clear API message", async () => {
    const abortError = new Error("timeout");
    abortError.name = "AbortError";

    fetchMock.mockResolvedValueOnce(capabilitiesResponse()).mockRejectedValueOnce(abortError);

    const { handlers } = setupPlugin({
      config: { retryCount: 0, timeoutMs: 1500 },
    });

    const text = await invokeTool(handlers, "orbio_search", { query_text: "timeout" });
    expect(text).toContain("Orbio API error: Request timed out after 1500 ms.");
  });

  it("maps direct network failures without retry to network error message", async () => {
    fetchMock.mockResolvedValueOnce(capabilitiesResponse()).mockRejectedValueOnce(new TypeError("offline"));

    const { handlers } = setupPlugin({
      config: { retryCount: 0 },
    });

    const text = await invokeTool(handlers, "orbio_search", { query_text: "network fail" });
    expect(text).toContain("Orbio API error: Network failure while calling Orbio API.");
  });

  it.each([
    {
      title: "429 rate limit with retry-after and request id",
      status: 429,
      payload: { error: { code: "rate_limit_exceeded", message: "slow down" } },
      headers: { "Retry-After": "8", "X-Request-Id": "req-429" },
      expected: "Orbio rate limit exceeded. Retry-After=8s. (request_id=req-429)",
    },
    {
      title: "429 by code without retry-after",
      status: 400,
      payload: { error: { code: "rate_limit_exceeded", message: "slow down" } },
      headers: { "X-Request-Id": "req-code-429" },
      expected: "Orbio rate limit exceeded. (request_id=req-code-429)",
    },
    {
      title: "quota exceeded",
      status: 403,
      payload: { error: { code: "quota_exceeded", message: "quota" } },
      headers: { "X-Request-Id": "req-403" },
      expected: "Orbio quota exceeded for this API key/workspace. (request_id=req-403)",
    },
    {
      title: "authentication failure",
      status: 401,
      payload: { error: { code: "authentication_invalid", message: "bad key" } },
      headers: { "X-Request-Id": "req-401" },
      expected: "Orbio authentication failed. Check plugin apiKey. (request_id=req-401)",
    },
    {
      title: "invalid query",
      status: 422,
      payload: { detail: "query too broad" },
      headers: { "X-Request-Id": "req-422" },
      expected: "Query is invalid or too broad. Narrow filters and retry. (request_id=req-422)",
    },
    {
      title: "dependency unavailable",
      status: 503,
      payload: { error: { code: "dependency_unavailable", message: "provider down" } },
      headers: { "X-Request-Id": "req-503" },
      expected: "Orbio dependency is temporarily unavailable. Retry shortly. (request_id=req-503)",
    },
    {
      title: "generic problem detail",
      status: 400,
      payload: { detail: "bad payload" },
      headers: { "X-Request-Id": "req-400" },
      expected: "Orbio API error: bad payload (request_id=req-400)",
    },
    {
      title: "empty detail falls back to constructor default message",
      status: 400,
      payload: { detail: "" },
      headers: { "X-Request-Id": "req-empty-detail" },
      expected: "Orbio API error:  (request_id=req-empty-detail)",
    },
    {
      title: "nested code with fallback detail",
      status: 400,
      payload: { code: "top", detail: "fallback detail", error: { code: "nested" } },
      headers: { "X-Request-Id": "req-nested" },
      expected: "Orbio API error: fallback detail (request_id=req-nested)",
    },
    {
      title: "nested and direct details both missing use default problem text",
      status: 400,
      payload: { error: {} },
      headers: { "X-Request-Id": "req-default-problem" },
      expected: "Orbio API error: Orbio API returned an error. (request_id=req-default-problem)",
    },
  ])("$title", async ({ status, payload, headers, expected }) => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(jsonResponse(payload, status, headers));

    const { handlers } = setupPlugin({ config: { retryCount: 0 } });
    const text = await invokeTool(handlers, "orbio_search", { query_text: "error mapping" });
    expect(text).toContain(expected);
  });

  it("handles non-json error payloads safely", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilitiesResponse())
      .mockResolvedValueOnce(textResponse("not-json", 400, { "X-Request-Id": "req-text" }));

    const { handlers } = setupPlugin();
    const text = await invokeTool(handlers, "orbio_search", { query_text: "non-json error" });
    expect(text).toContain("Orbio API error: Orbio API returned an error. (request_id=req-text)");
  });

  it("handles non-json successful payloads safely", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("ok-but-not-json", 200));
    const { handlers } = setupPlugin();

    const text = await invokeTool(handlers, "orbio_export_status", { export_id: "exp-123" });
    expect(text).toContain("Export status:");
    expect(parseJsonBlock(text)).toEqual({});
  });

  it("handles 204 successful payloads safely", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { handlers } = setupPlugin();

    const text = await invokeTool(handlers, "orbio_export_status", { export_id: "exp-123" });
    expect(text).toContain("Export status:");
    expect(parseJsonBlock(text)).toEqual({});
  });

  it("maps non-error throws to unknown error message", async () => {
    const { handlers } = setupPlugin();
    const args = Object.defineProperty({}, "command", {
      get() {
        throw "boom";
      },
    });
    const text = await invokeTool(handlers, "orbio_command", args);
    expect(text).toContain("Unexpected unknown error.");
  });
});
