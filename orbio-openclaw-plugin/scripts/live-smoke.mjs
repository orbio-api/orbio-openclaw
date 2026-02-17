import registerOrbioPlugin from "../dist/index.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function parseJsonBlock(text) {
  const match = text.match(/```json\n([\s\S]+?)\n```/);
  if (!match?.[1]) {
    throw new Error(`Expected JSON block in tool output:\n${text}`);
  }
  return JSON.parse(match[1]);
}

function getTool(handlers, name) {
  const handler = handlers.get(name);
  if (!handler) {
    throw new Error(`Tool not registered: ${name}`);
  }
  return handler;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function callTool(handlers, name, args) {
  const handler = getTool(handlers, name);
  const result = await handler(args);
  const text = result?.content?.[0]?.text ?? "";
  assert(text.length > 0, `${name}: empty response`);
  return text;
}

async function run() {
  const baseUrl = requiredEnv("ORBIO_BASE_URL");
  const apiKey = requiredEnv("ORBIO_API_KEY");
  const query = optionalEnv("ORBIO_SMOKE_QUERY", "software b2b em sao paulo");
  const workspaceId = optionalEnv("ORBIO_WORKSPACE_ID", "openclaw-smoke");
  const limit = Number(optionalEnv("ORBIO_SMOKE_LIMIT", "3"));

  const handlers = new Map();
  const api = {
    config: {
      baseUrl,
      apiKey,
      workspaceId,
      timeoutMs: 20000,
      maxRequestsPerMinute: 30,
      retryCount: 1,
      retryBackoffMs: 300,
      capabilitiesTtlMs: 60000,
    },
    registerTool(name, _spec, handler) {
      handlers.set(name, handler);
      return { name };
    },
  };

  const plugin = registerOrbioPlugin(api);
  assert(plugin?.id === "orbio-openclaw", `Unexpected plugin id: ${plugin?.id}`);

  console.log("[live-smoke] Step 1: orbio_search");
  const searchText = await callTool(handlers, "orbio_search", {
    query_text: query,
    limit,
    with_contact: false,
  });
  assert(searchText.includes("Search completed."), "Search did not complete successfully");
  const searchPayload = parseJsonBlock(searchText);
  assert(Array.isArray(searchPayload.accounts), "Search payload missing accounts");
  console.log(
    `[live-smoke] Search OK: ${searchPayload.result_count ?? 0} results (showing ${searchPayload.accounts.length})`,
  );

  console.log("[live-smoke] Step 2: orbio_export");
  const exportText = await callTool(handlers, "orbio_export", {
    query_text: query,
    limit,
    format: "csv",
    with_contact: false,
  });
  assert(exportText.includes("Export requested."), "Export was not accepted");
  const exportPayload = parseJsonBlock(exportText);
  const exportId = exportPayload?.export?.export_id;
  assert(typeof exportId === "string" && exportId.length > 0, "Missing export_id");
  console.log(`[live-smoke] Export OK: export_id=${exportId}`);

  console.log("[live-smoke] Step 3: orbio_export_status");
  const statusText = await callTool(handlers, "orbio_export_status", { export_id: exportId });
  assert(statusText.includes("Export status:"), "Export status call failed");
  const statusPayload = parseJsonBlock(statusText);
  assert(statusPayload.export_id === exportId, "Status payload export_id mismatch");
  assert(typeof statusPayload.status === "string", "Status payload missing status");
  console.log(`[live-smoke] Status OK: ${statusPayload.status}`);

  console.log("[live-smoke] Step 4: orbio_command");
  const commandText = await callTool(handlers, "orbio_command", {
    command: `search "${query}" --limit ${limit}`,
  });
  assert(commandText.includes("Search completed."), "Command dispatch failed");
  console.log("[live-smoke] Command dispatcher OK");

  console.log("[live-smoke] PASS");
}

run().catch((error) => {
  console.error("[live-smoke] FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
