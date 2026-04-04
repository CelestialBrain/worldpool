// ─── Peer Tracker ─────────────────────────────────────────────────────────────
// Tracks connected peers and their send/receive stats.

import type { PeerInfo } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:peer');

export class PeerTracker {
  private peer: Map<string, PeerInfo> = new Map();

  addPeer(peerId: string): void {
    if (this.peer.has(peerId)) return;
    this.peer.set(peerId, {
      id: peerId,
      connectedAt: Math.floor(Date.now() / 1000),
      stat: { received: 0, sent: 0 },
    });
    log.info('Peer connected', { peer_id: peerId.slice(0, 12) });
  }

  removePeer(peerId: string): void {
    this.peer.delete(peerId);
    log.info('Peer disconnected', { peer_id: peerId.slice(0, 12) });
  }

  recordReceived(peerId: string): void {
    const p = this.peer.get(peerId);
    if (p) p.stat.received++;
  }

  recordSent(peerId: string): void {
    const p = this.peer.get(peerId);
    if (p) p.stat.sent++;
  }

  getPeerCount(): number {
    return this.peer.size;
  }

  getAllPeers(): PeerInfo[] {
    return Array.from(this.peer.values());
  }

  hasPeer(peerId: string): boolean {
    return this.peer.has(peerId);
  }
}
