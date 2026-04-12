// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProxyProtocol = 'http' | 'socks4' | 'socks5';
export type AnonymityLevel = 'elite' | 'anonymous' | 'transparent' | 'unknown';
export type SpeedTier = 'turbo' | 'fast' | 'medium' | 'slow';
export type SitePassKey = 'google' | 'discord' | 'tiktok' | 'instagram' | 'x' | 'reddit';
export type HijackType =
  | 'ad_injection'
  | 'redirect'
  | 'captive_portal'
  | 'content_substitution'
  | 'ssl_strip';

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
  hijack_type: string | null;
  hijack_body: string | null;
  asn: string | null;
  country: string | null;
  source: string | null;
  last_checked: number;   // unix epoch seconds
  created_at: number;     // unix epoch seconds
  check_count: number;    // total times checked
  alive_count: number;    // times found alive
  reliability_pct: number; // alive_count / check_count * 100, rounded to 1 dp
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
  hijack_type?: HijackType;
  hijack_body?: string;
  asn?: string;
  country?: string;
  source?: string;
  last_checked: number;
  /** Site-specific pass checks — which popular sites this proxy can reach. */
  site_pass?: Partial<Record<SitePassKey, boolean>>;
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
  reliability_pct: number;
}

/** GET /stats response shape. */
export interface PoolStatsResponse {
  proxy_count: number;
  alive_count: number;
  elite_count: number;
  google_pass_count: number;
  hijacked_count: number;
  avg_latency_ms: number;
  avg_reliability_pct: number;
  by_protocol: ProtocolBreakdown[];
  last_updated: number | null;
  source_quality?: SourceQuality[];
}

/** Per-source quality metrics stored in data/stats.json. */
export interface SourceQuality {
  source: string;
  total: number;
  alive: number;
  elite: number;
  google_pass: number;
  avg_latency_ms: number | null;
  alive_pct: number;
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
  country?: string;
  limit?: number;
  offset?: number;
}

// ─── Hijacked Proxy Output ────────────────────────────────────────────────────

/** Full-detail record written to proxies/hijacked.json. */
export interface HijackedProxyResponse {
  ip: string;
  port: number;
  hijack_type: HijackType;
  hijack_body: string | null;
  country: string | null;
  asn: string | null;
  detected_at: number;   // unix epoch seconds
}
