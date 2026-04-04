// ─── Third-Party Type Declarations ────────────────────────────────────────────
// These Holepunch ecosystem packages don't ship types. Declare them here.

declare module 'hyperswarm' {
  import { EventEmitter } from 'events';

  interface KeyPair {
    publicKey: Buffer;
    secretKey: Buffer;
  }

  interface PeerInfo {
    publicKey: Buffer;
    client: boolean;
  }

  interface Discovery {
    flushed(): Promise<void>;
  }

  class Hyperswarm extends EventEmitter {
    keyPair: KeyPair;
    constructor(opts?: Record<string, unknown>);
    join(topic: Buffer, opts?: { server?: boolean; client?: boolean }): Discovery;
    leave(topic: Buffer): Promise<void>;
    destroy(): Promise<void>;
    on(event: 'connection', listener: (socket: any, info: PeerInfo) => void): this;
  }

  export default Hyperswarm;
}

declare module 'hypercore-crypto' {
  export function discoveryKey(key: Buffer): Buffer;
  export function keyPair(): { publicKey: Buffer; secretKey: Buffer };
  export function randomBytes(n: number): Buffer;
}

declare module 'b4a' {
  export function toString(buf: Buffer, encoding?: string): string;
  export function from(str: string, encoding?: string): Buffer;
  export function alloc(size: number): Buffer;
  export function isBuffer(value: unknown): value is Buffer;
}

declare module 'msgpack-lite' {
  export function encode(obj: unknown): Buffer;
  export function decode(buf: Buffer): unknown;
}
