export type JsonRecord = Record<string, unknown>;

export type OrbioPluginConfig = {
  baseUrl: string;
  apiKey: string;
  workspaceId: string;
  channel: string;
  sendExecutionContext: boolean;
  timeoutMs: number;
  maxRequestsPerMinute: number;
  retryCount: number;
  retryBackoffMs: number;
  capabilitiesTtlMs: number;
  userAgent: string;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export type CapabilitiesResponse = {
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

export type AccountSearchResponse = {
  request_id: string;
  snapshot: string;
  snapshot_date: string;
  spec?: JsonRecord;
  accounts: JsonRecord[];
  has_more: boolean;
  next_cursor: string | null;
};

export type ExportCreateResponse = {
  request_id: string;
  snapshot: string;
  snapshot_date: string;
  spec?: JsonRecord;
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

export type ExportStatusResponse = {
  export_id: string;
  status: string;
  format: string;
  snapshot?: string;
  snapshot_date?: string;
  row_count: number | null;
  size_bytes: number | null;
  object_key?: string | null;
  expires_at: string | null;
  download_url: string | null;
};

export type SpecResponse = {
  spec: JsonRecord;
};

export type OutputSpec = {
  format: "json" | "csv" | "html";
  include_explain: boolean;
  fields: string[];
};
