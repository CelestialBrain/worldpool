// ─── Proxy Tester ─────────────────────────────────────────────────────────────
// Quick test: pick proxies from the pool and verify they work with real requests.
// Usage: npx tsx src/test-proxies.ts [count] [file]
//   count — number of proxies to test (default 10)
//   file  — proxy file to use (default proxies/google-pass.txt)

import { readFileSync } from 'node:fs';
import axios from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

const count = parseInt(process.argv[2] ?? '10', 10);
const file = process.argv[3] ?? 'proxies/google-pass.txt';

const proxies = readFileSync(file, 'utf-8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0);

if (proxies.length === 0) {
  console.log('No proxies found in', file);
  process.exit(1);
}

// Shuffle and pick
const sample = proxies.sort(() => Math.random() - 0.5).slice(0, count);

interface TestResult {
  proxy: string;
  ip: string | null;
  latency: number;
  google: boolean;
  httpbin: boolean;
  error: string | null;
}

const TESTS = [
  { name: 'httpbin', url: 'http://httpbin.org/ip', extract: (d: any) => d?.origin ?? null },
  { name: 'google204', url: 'https://www.google.com/generate_204', extract: () => 'ok' },
];

async function testProxy(proxyAddr: string): Promise<TestResult> {
  const proxyUrl = `http://${proxyAddr}`;
  const httpAgent = new HttpProxyAgent(proxyUrl);
  const httpsAgent = new HttpsProxyAgent(proxyUrl);
  const result: TestResult = {
    proxy: proxyAddr,
    ip: null,
    latency: -1,
    google: false,
    httpbin: false,
    error: null,
  };

  // Test 1: httpbin — verify connectivity and get exit IP
  const start = Date.now();
  try {
    const res = await axios.get('http://httpbin.org/ip', {
      httpAgent,
      httpsAgent,
      timeout: 8000,
      validateStatus: () => true,
    });
    result.latency = Date.now() - start;
    if (res.status === 200 && typeof res.data === 'object') {
      result.httpbin = true;
      result.ip = res.data.origin ?? null;
    }
  } catch (err) {
    result.error = String(err).split('\n')[0];
    return result;
  }

  // Test 2: Google 204 — can this proxy reach Google?
  try {
    const gRes = await axios.get('https://www.google.com/generate_204', {
      httpAgent,
      httpsAgent,
      timeout: 8000,
      validateStatus: () => true,
    });
    result.google = gRes.status === 204;
  } catch {
    result.google = false;
  }

  return result;
}

async function main() {
  console.log(`Testing ${sample.length} proxies from ${file}\n`);
  console.log('  PROXY                    LATENCY   EXIT IP              HTTPBIN  GOOGLE');
  console.log('  ─────────────────────    ───────   ──────────────────   ───────  ──────');

  let alive = 0;
  let googlePass = 0;

  for (const proxy of sample) {
    const r = await testProxy(proxy);

    const latStr = r.latency > 0 ? `${r.latency}ms` : 'n/a';
    const ipStr = r.ip ?? 'n/a';
    const httpbinStr = r.httpbin ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const googleStr = r.google ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';

    console.log(
      `  ${proxy.padEnd(24)} ${latStr.padStart(7)}   ${ipStr.padEnd(20)} ${httpbinStr.padEnd(16)} ${googleStr}`
    );

    if (r.httpbin) alive++;
    if (r.google) googlePass++;
  }

  console.log('\n  ─────────────────────────────────────────────────────────────────────');
  console.log(`  Tested: ${sample.length}  |  Alive: ${alive}  |  Google Pass: ${googlePass}  |  Dead: ${sample.length - alive}`);
  console.log(`  Alive rate: ${((alive / sample.length) * 100).toFixed(1)}%`);
}

main().catch(console.error);
