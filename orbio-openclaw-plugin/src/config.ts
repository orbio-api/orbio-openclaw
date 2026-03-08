import { PLUGIN_ID, PLUGIN_VERSION } from "./constants";
import type { JsonRecord, OrbioPluginConfig } from "./types";

export function toTrimmedString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return String(value ?? "").trim();
  }
  try {
    return String(value).trim();
  } catch {
    return "";
  }
}

export function asJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? (value as JsonRecord) : null;
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

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string" || value instanceof String) {
    const normalized = toTrimmedString(value).toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeChannel(value: unknown): string {
  const raw = toTrimmedString(value).toLowerCase();
  if (!raw) {
    return "chat";
  }
  const normalized = raw.replaceAll(" ", "_").replace(/[^a-z0-9_-]/g, "").slice(0, 64);
  return normalized || "chat";
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function readConfig(api: unknown): OrbioPluginConfig {
  const asRecord = (api ?? {}) as JsonRecord;
  const pluginConfigEnvelope = asJsonRecord(asRecord.pluginConfig);
  const pluginConfig = asJsonRecord(pluginConfigEnvelope?.config) ?? pluginConfigEnvelope;
  const rootConfig = asJsonRecord(asRecord.config);
  const rootPlugins = asJsonRecord(rootConfig?.plugins);
  const rootPluginEntries = asJsonRecord(rootPlugins?.entries);
  const rootPluginEntry = asJsonRecord(rootPluginEntries?.[PLUGIN_ID]);
  const rootPluginConfig = asJsonRecord(rootPluginEntry?.config) ?? rootPluginEntry;
  const legacyConfig =
    rootConfig &&
    (Object.prototype.hasOwnProperty.call(rootConfig, "baseUrl") ||
      Object.prototype.hasOwnProperty.call(rootConfig, "apiKey"))
      ? rootConfig
      : null;
  const rawConfig = pluginConfig ?? rootPluginConfig ?? legacyConfig ?? {};
  const envSource = asJsonRecord(asRecord.env);
  const env = ((envSource ?? process.env) as Record<string, string | undefined>) ?? {};

  const baseUrl = toTrimmedString(rawConfig.baseUrl ?? env.ORBIO_BASE_URL ?? "");
  const apiKey = toTrimmedString(rawConfig.apiKey ?? env.ORBIO_API_KEY ?? "");

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
  const workspaceId = toTrimmedString(rawConfig.workspaceId ?? env.ORBIO_WORKSPACE_ID ?? "default");
  const channel = normalizeChannel(rawConfig.channel ?? env.ORBIO_CHANNEL ?? "chat");
  const sendExecutionContext = parseBoolean(
    rawConfig.sendExecutionContext ?? env.ORBIO_SEND_EXECUTION_CONTEXT,
    true,
  );

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    workspaceId: workspaceId || "default",
    channel,
    sendExecutionContext,
    timeoutMs,
    maxRequestsPerMinute,
    retryCount,
    retryBackoffMs,
    capabilitiesTtlMs,
    userAgent: `${PLUGIN_ID}/${PLUGIN_VERSION}`,
  };
}
