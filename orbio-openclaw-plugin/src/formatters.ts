import { OrbioApiError, PluginRateLimitError } from "./http";
import type {
  AccountSearchResponse,
  ExportCreateResponse,
  ExportStatusResponse,
  JsonRecord,
  ToolResult,
} from "./types";

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

export function chooseOutputFields(
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

export function renderSearchText(
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

export function renderExportText(
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

export function renderExportStatusText(payload: ExportStatusResponse): string {
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

export function errorText(error: unknown): string {
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

export function result(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}
