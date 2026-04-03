// ─── Proxy Fingerprinter ──────────────────────────────────────────────────────
// After a TCP port is confirmed open, sends protocol-appropriate handshakes
// to determine whether the service is actually a proxy.

import * as net from 'net';
import type { ProxyProtocol } from '../../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('scanner:fingerprint');

/** Result of fingerprinting a single open port. */
export interface FingerprintResult {
  ip: string;
  port: number;
  protocol: ProxyProtocol;
  alive: boolean;
}

/**
 * Send a raw buffer to a TCP endpoint and return the first response chunk.
 * Returns null on timeout or connection error.
 */
function sendAndReceive(
  host: string,
  port: number,
  payload: Buffer,
  timeoutMs: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (data: Buffer | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(data);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));

    socket.once('connect', () => {
      socket.write(payload);
    });

    socket.once('data', (chunk) => finish(chunk));

    socket.connect(port, host);
  });
}

/**
 * Attempt SOCKS5 handshake (RFC 1928 — no-auth greeting).
 * Returns true if the server responds with a valid SOCKS5 greeting.
 */
async function trySocks5(host: string, port: number, timeoutMs: number): Promise<boolean> {
  // VER=5, NMETHODS=1, METHOD=0 (no auth)
  const greeting = Buffer.from([0x05, 0x01, 0x00]);
  const response = await sendAndReceive(host, port, greeting, timeoutMs);
  if (!response || response.length < 2) return false;
  // Server must reply with VER=5, METHOD=0 (or any accepted method)
  return response[0] === 0x05;
}

/**
 * Attempt SOCKS4 handshake (CONNECT to 0.0.0.0:0 as a probe).
 * Returns true if the server responds with a SOCKS4 reply (0x00 prefix).
 */
async function trySocks4(host: string, port: number, timeoutMs: number): Promise<boolean> {
  // VER=4, CMD=CONNECT, DSTPORT=80, DSTIP=0.0.0.0, USERID=\0
  const request = Buffer.from([0x04, 0x01, 0x00, 0x50, 0x00, 0x00, 0x00, 0x01, 0x00]);
  const response = await sendAndReceive(host, port, request, timeoutMs);
  if (!response || response.length < 2) return false;
  // SOCKS4 reply begins with 0x00
  return response[0] === 0x00;
}

/**
 * Attempt HTTP CONNECT handshake.
 * Returns true if the server responds with HTTP/1.x 200 (tunnel established)
 * or 407 (proxy auth required — still confirms it's an HTTP proxy).
 */
async function tryHttpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const request = Buffer.from(
    `CONNECT 1.1.1.1:443 HTTP/1.1\r\nHost: 1.1.1.1:443\r\n\r\n`,
    'ascii',
  );
  const response = await sendAndReceive(host, port, request, timeoutMs);
  if (!response) return false;
  const text = response.toString('ascii', 0, Math.min(response.length, 64));
  return /^HTTP\/1\.[01] (200|407)/.test(text);
}

/**
 * Fingerprint an open TCP port to identify the proxy type.
 * Returns a FingerprintResult with alive=false if the port does not respond
 * to any known proxy handshake.
 *
 * @param ip        - Target IP address
 * @param port      - Target port number
 * @param timeoutMs - Per-handshake timeout in milliseconds (default 2000)
 */
export async function fingerprintProxy(
  ip: string,
  port: number,
  timeoutMs = 2000,
): Promise<FingerprintResult> {
  const base = { ip, port };

  try {
    // SOCKS5 first (most common on 1080)
    if (await trySocks5(ip, port, timeoutMs)) {
      log.debug(`SOCKS5 confirmed`, { ip, port });
      return { ...base, protocol: 'socks5', alive: true };
    }

    // SOCKS4
    if (await trySocks4(ip, port, timeoutMs)) {
      log.debug(`SOCKS4 confirmed`, { ip, port });
      return { ...base, protocol: 'socks4', alive: true };
    }

    // HTTP CONNECT (common on 3128, 8080)
    if (await tryHttpConnect(ip, port, timeoutMs)) {
      log.debug(`HTTP proxy confirmed`, { ip, port });
      return { ...base, protocol: 'http', alive: true };
    }
  } catch (err) {
    log.debug(`Fingerprint error`, { ip, port, error: String(err) });
  }

  return { ...base, protocol: 'http', alive: false };
}
