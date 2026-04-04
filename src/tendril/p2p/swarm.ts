// ─── Tendril Swarm ────────────────────────────────────────────────────────────
// Hyperswarm wrapper — DHT-based peer discovery with NAT traversal.
// Adapted from TendrilHive's swarm.ts to use Worldpool conventions.

import Hyperswarm from 'hyperswarm';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'events';
import { encode, decode, createMessage } from './protocol.js';
import { PeerTracker } from './peer.js';
import { MessageType } from '../types.js';
import type { Message } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:swarm');

interface SwarmConfig {
  topic: string;
  nodeId?: string;
}

interface PeerSocket {
  socket: any;
  publicKey: Buffer;
}

/** Hash a topic string to a 32-byte buffer for DHT discovery. */
function hashTopic(topic: string): Buffer {
  return createHash('sha256').update(topic).digest();
}

export class TendrilSwarm extends EventEmitter {
  private swarm: Hyperswarm;
  private topic: Buffer;
  private connection: Map<string, PeerSocket> = new Map();
  private peerTracker: PeerTracker;
  public nodeId: string;

  constructor(config: SwarmConfig) {
    super();
    const topicKey = hashTopic(config.topic);
    this.topic = crypto.discoveryKey(topicKey);
    this.peerTracker = new PeerTracker();

    this.swarm = new Hyperswarm();
    this.nodeId = config.nodeId || b4a.toString(this.swarm.keyPair.publicKey, 'hex');

    this.setupEventHandlers();
    log.info('Swarm created', { node_id: this.nodeId.slice(0, 12), topic: config.topic });
  }

  private setupEventHandlers(): void {
    this.swarm.on('connection', (socket: any, info: any) => {
      const peerId = b4a.toString(info.publicKey, 'hex');

      this.connection.set(peerId, { socket, publicKey: info.publicKey });
      this.peerTracker.addPeer(peerId);

      // Handle incoming data
      socket.on('data', (data: Buffer) => {
        try {
          const message = decode(data);
          this.peerTracker.recordReceived(peerId);
          this.emit('message', peerId, message);
        } catch (err) {
          log.error('Failed to decode message', { peer_id: peerId.slice(0, 12), error: String(err) });
        }
      });

      // Handle disconnect
      socket.on('close', () => {
        this.connection.delete(peerId);
        this.peerTracker.removePeer(peerId);
        this.emit('peer:disconnected', peerId);
      });

      socket.on('error', (err: Error) => {
        log.error('Socket error', { peer_id: peerId.slice(0, 12), error: err.message });
      });

      // Emit connection event
      this.emit('peer:connected', peerId, info.client);

      // Send hello
      this.send(peerId, createMessage(MessageType.HELLO, this.nodeId, {
        version: '0.1.0',
        nodeId: this.nodeId,
      }));
    });
  }

  /** Join the Hyperswarm DHT topic. */
  async join(): Promise<void> {
    const discovery = this.swarm.join(this.topic, { server: true, client: true });
    await discovery.flushed();
    log.info('Joined swarm', { topic_hash: b4a.toString(this.topic, 'hex').slice(0, 16) });
  }

  /** Leave the swarm and destroy connections. */
  async leave(): Promise<void> {
    await this.swarm.leave(this.topic);
    await this.swarm.destroy();
    log.info('Left swarm');
  }

  /** Send a message to a specific peer. */
  send(peerId: string, message: Message): boolean {
    const peer = this.connection.get(peerId);
    if (!peer) return false;

    try {
      peer.socket.write(encode(message));
      this.peerTracker.recordSent(peerId);
      return true;
    } catch (err) {
      log.error('Send failed', { peer_id: peerId.slice(0, 12), error: String(err) });
      return false;
    }
  }

  /** Broadcast a message to all connected peers. */
  broadcast(message: Message): number {
    let sent = 0;
    for (const peerId of this.connection.keys()) {
      if (this.send(peerId, message)) sent++;
    }
    return sent;
  }

  /** Get the peer tracker instance. */
  getPeerTracker(): PeerTracker {
    return this.peerTracker;
  }

  /** Get connected peer count. */
  getPeerCount(): number {
    return this.peerTracker.getPeerCount();
  }

  /** Get all connected peer IDs. */
  getConnectedPeers(): string[] {
    return Array.from(this.connection.keys());
  }

  /** Check if connected to a specific peer. */
  isConnected(peerId: string): boolean {
    return this.connection.has(peerId);
  }
}
