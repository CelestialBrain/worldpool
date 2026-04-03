// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProxyProtocol = 'http' | 'socks4' | 'socks5';
export type AnonymityLevel = 'elite' | 'anonymous' | 'transparent' | 'unknown';

// ─── Scraper Output ───────────────────────────────────────────────────────────

/** Raw proxy as returned by a scraper — no validation yet. */
export interface RawProxy {
  host: string;
  port: number;
  protocol: ProxyProtocol;
  country?: string;
  source?: string;
}

// ─── Database Row ─────────────────────────────────────────────────────────────

/** Matches the `proxy` table exactly. All snake_case. */
export interface ProxyRow {
  proxy_id: string;       // "host:port"
  host: string;
  port: number;
  protocol: ProxyProtocol;
  anonymity: AnonymityLevel;
  latency_ms: number;
  google_pass: number;    // 0 | 1 (SQLite boolean)
  alive: number;          // 0 | 1
  hijacked: number;       // 0 | 1
  country: string | null;
  source: string | null;
  last_checked: number;   // unix epoch seconds
  created_at: number;     // unix epoch seconds
}

// ─── Validated Proxy (Internal) ───────────────────────────────────────────────

/** Result after validation — TypeScript-native types (boolean, not 0|1). */
export interface ValidatedProxy {
  proxy_id: string;
  host: string;
  port: number;
  protocol: ProxyProtocol;
  anonymity: AnonymityLevel;
  latency_ms: number;
  google_pass: boolean;
  alive: boolean;
  hijacked: boolean;
  country?: string;
  source?: string;
  last_checked: number;
}

// ─── API Response ─────────────────────────────────────────────────────────────

/** Clean shape for API consumers. proxy_id aliased to id. */
export interface ProxyResponse {
  id: string;             // proxy_id aliased
  host: string;
  port: number;
  protocol: ProxyProtocol;
  anonymity: AnonymityLevel;
  latency_ms: number;
  google_pass: boolean;
  hijacked: boolean;
  country: string | null;
  last_checked: number;
}

/** GET /stats response shape. */
export interface PoolStatsResponse {
  proxy_count: number;
  alive_count: number;
  elite_count: number;
  google_pass_count: number;
  hijacked_count: number;
  avg_latency_ms: number;
  by_protocol: ProtocolBreakdown[];
  last_updated: number | null;
}

export interface ProtocolBreakdown {
  protocol: ProxyProtocol;
  proxy_count: number;
}

// ─── Query Options ────────────────────────────────────────────────────────────

export interface ProxyQueryOption {
  protocol?: ProxyProtocol;
  anonymity?: AnonymityLevel;
  google_pass?: boolean;
  alive_only?: boolean;
  max_latency_ms?: number;
  limit?: number;
  offset?: number;
}
