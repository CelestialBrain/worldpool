# Security

Threat model and mitigations for operating a free proxy aggregation pipeline.

## Threat Surface

When Worldpool validates a proxy, it makes an outbound HTTP request **through an untrusted server** to a judge endpoint. This creates several attack vectors.

## Threats — Ranked by Severity

### 1. Judge Server Abuse — HIGH if misconfigured

**Risk:** If the judge endpoint is a public HTTP endpoint with no auth, anyone can use it as an echo service. Burns bandwidth, gets the VPS flagged.

**Mitigation:**
- Judge endpoint requires `X-Judge-Token: {secret}` header
- Returns 403 without valid token
- Rate-limit at the HTTP framework level

### 2. MITM / Traffic Interception — MEDIUM

**Risk:** 79% of free proxies don't support HTTPS. The proxy operator can see all request content in plaintext, including headers, URLs, and bodies.

**Mitigation:**
- Worldpool only sends non-sensitive validation requests through proxies
- **NEVER** route authenticated requests (API keys, session tokens, credentials) through free proxies
- For downstream consumers: only use Worldpool proxies for public, unauthenticated scraping

### 3. Malicious Response Injection — MEDIUM

**Risk:** 17,000+ proxies in the research dataset were actively injecting malicious JavaScript into HTML responses. Could crash parsers or poison data.

**Mitigation:**
- Validator only parses HTTP status codes and JSON headers — never renders HTML
- All proxy responses wrapped in `try/catch` — malformed data cannot crash the validator
- Response body size capped to prevent memory exhaustion

### 4. Honeypots / Reverse Fingerprinting — LOW-MEDIUM

**Risk:** Some "proxies" on public lists are honeypots operated by security researchers or threat actors. They log connecting IPs and may port-scan back.

**Mitigation:**
- Validator runs on an isolated, throwaway VPS — not on production infrastructure
- Skip IPs from known research ASNs when identified
- VPS firewall allows only outbound connections on proxy ports + inbound on API port

### 5. VPS IP Reputation Degradation — LOW but annoying

**Risk:** After tens of thousands of daily validation requests, the VPS IP appears on abuse databases.

**Mitigation:**
- Use a separate, cheap VPS (Hetzner $4/mo) exclusively for Worldpool
- Never share the validator VPS with production apps (Presyo, SISIA, etc.)
- If flagged, nuke and spin up a fresh node

### 6. Resource Exhaustion / OOM — LOW with limits

**Risk:** 100+ concurrent outbound connections with 8s timeouts = ~800 half-open sockets at peak. On a 1GB VPS, this can OOM.

**Mitigation:**
- Hard concurrency cap at 100 via `p-limit`
- Circuit breaker: if memory usage exceeds 80%, pause validation
- Connection timeout set to 8s (not infinite)
- Use `AbortController` to enforce timeouts at the HTTP level

## What's NOT a Threat

| Concern | Why it's not a risk |
|---------|-------------------|
| Getting hacked through proxy responses | Validator doesn't execute returned content |
| Legal liability for discovered proxies | We catalog public proxies, we don't operate them |
| DDoS from proxies | They can't initiate inbound connections to us unless we give them a reason |
| Data exfiltration | We send no sensitive data through proxies |

## Operational Rules

1. **Isolation:** Worldpool validator MUST run on a separate VPS from all production services
2. **No auth through free proxies:** Never route cookies, tokens, API keys, or login flows through the pool
3. **Throwaway nodes:** Treat the validator VPS as disposable — if flagged, destroy and recreate
4. **Monitor:** Watch for unusual inbound traffic patterns that might indicate a honeypot probing back
5. **GitHub Actions preferred:** Running the pipeline in Actions uses Microsoft Azure runner IPs, not your own infrastructure

## Security Checklist for Contributors

- [ ] Judge endpoint has token validation
- [ ] All proxy response parsing is wrapped in try/catch
- [ ] No credentials or secrets appear in proxy request payloads
- [ ] Concurrency is hard-capped (check `config.ts`)
- [ ] Response body size is limited
- [ ] VPS firewall rules are documented and applied
