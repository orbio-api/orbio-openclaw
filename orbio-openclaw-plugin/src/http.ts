import { randomUUID } from "node:crypto";

import { EXECUTION_CONTEXT_HEADER, EXECUTION_CONTEXT_INTEGRATION } from "./constants";
import type { JsonRecord, OrbioPluginConfig } from "./types";

export class PluginRateLimitError extends Error {
  public readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super("plugin_rate_limited");
    this.retryAfterSec = retryAfterSec;
  }
}

export class OrbioApiError extends Error {
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

export class MinuteWindowLimiter {
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

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OrbioHttpClient {
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
    const requestId = randomUUID();

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
            "X-Request-Id": requestId,
            ...this.buildExecutionContextHeader(requestId),
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

  private buildExecutionContextHeader(requestId: string): Record<string, string> {
    if (!this.cfg.sendExecutionContext) {
      return {};
    }
    const payload = {
      v: 1,
      integration: EXECUTION_CONTEXT_INTEGRATION,
      channel: this.cfg.channel,
      workspace: this.cfg.workspaceId,
      run_id: requestId,
    };
    return {
      [EXECUTION_CONTEXT_HEADER]: JSON.stringify(payload),
    };
  }
}
