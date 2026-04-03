// ─── TCP Probe ────────────────────────────────────────────────────────────────
// Pure Node.js TCP prober — no external binary dependencies.
// Works on GitHub Actions runners and any VPS.

import * as net from 'net';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('scanner:tcp-probe');

/**
 * Probe a single TCP port on a host.
 * Returns true if the port accepts a connection, false otherwise.
 */
export function probePort(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('close', () => finish(false));

    socket.connect(port, host);
  });
}

/** Result of a batch probe for a single target. */
export interface ProbeResult {
  ip: string;
  port: number;
}

/**
 * Probe an array of ip:port pairs with configurable concurrency and rate limiting.
 * Returns all pairs where the port was open.
 *
 * @param targets    - Array of { ip, port } objects to probe
 * @param concurrency - Max concurrent TCP connections (default 100)
 * @param ratePps    - Max probes per second (default 500); 0 = unlimited
 * @param timeoutMs  - Per-connection timeout in milliseconds (default 2000)
 */
export async function probeBatch(
  targets: ProbeResult[],
  concurrency = 100,
  ratePps = 500,
  timeoutMs = 2000,
): Promise<ProbeResult[]> {
  const open: ProbeResult[] = [];
  let idx = 0;
  let inFlight = 0;
  let probesThisSecond = 0;
  let windowStart = Date.now();

  await new Promise<void>((resolve) => {
    const tryNext = () => {
      // Rate-limit: reset counter each second
      const now = Date.now();
      if (now - windowStart >= 1000) {
        probesThisSecond = 0;
        windowStart = now;
      }

      // Drain the queue
      while (
        idx < targets.length &&
        inFlight < concurrency &&
        (ratePps === 0 || probesThisSecond < ratePps)
      ) {
        const target = targets[idx++];
        inFlight++;
        probesThisSecond++;

        probePort(target.ip, target.port, timeoutMs)
          .then((isOpen) => {
            if (isOpen) open.push(target);
          })
          .catch(() => {
            // ignore individual errors
          })
          .finally(() => {
            inFlight--;
            tryNext();
          });
      }

      if (idx >= targets.length && inFlight === 0) {
        resolve();
        return;
      }

      // If rate limit hit but work remains, retry after 1 ms
      if (idx < targets.length && ratePps > 0 && probesThisSecond >= ratePps) {
        setTimeout(tryNext, 1);
      }
    };

    tryNext();
  });

  log.info(`Probe complete`, { total: targets.length, open: open.length });
  return open;
}
