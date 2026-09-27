// Turns scanned strings into items: reassembles streams, opens what arrives under the current
// keys and trust state, and describes it for the library. No React Native imports, so it is tested
// in Node (test/inbox.test.ts).
import type { Progress } from '@qretina/protocol/fountain.js';
import type { StreamReceiver } from './engine.ts';
import { openContainer, type Key, type Opened } from '@qretina/protocol/containers.js';
import { checkVersion, type Trust } from './trust.ts';

export type Kind = 'file' | 'code' | 'cert' | 'crl' | 'locked';

// What the library records about an item; the container itself is stored beside it.
export type Meta = {
  id: string;         // stream id, which also names the stored container
  kind: Kind;
  name: string;
  size: number;       // bytes of the container as received
  received: number;   // ms since the epoch
  mime?: string;
  code?: { type: string; id: string; version: number; signer: string; publisher?: string };
  private?: boolean;  // sealed under a group key, beyond the app key
  keyId?: string;     // for locked items: the group key they need
};

export type Keys = { roots: Key[]; keys: Uint8Array[] };

// Opens a container and describes it. Opening never throws for a missing key (the item is
// locked); it throws for anything invalid, such as a bad signature or an older version.
export function describe(id: string, container: Uint8Array, keys: Keys, trust: Trust, now = Date.now()): { meta: Meta; opened: Opened } {
  const opened = openContainer(container, {
    roots: keys.roots, keys: keys.keys, revoked: trust.crl.serials, now: now / 1000,
    accept: code => checkVersion(trust, code),
  });
  const base = { id, size: container.length, received: now, private: (opened.sealed?.length ?? 0) > 1 };
  let meta: Meta;
  if (opened.file) meta = { ...base, kind: 'file', name: opened.file.name, mime: opened.file.mime };
  else if (opened.code) {
    const { type, id: codeId, version, signer, publisher } = opened.code;
    meta = { ...base, kind: 'code', name: codeId, code: { type, id: codeId, version, signer, publisher: publisher?.name } };
  } else if (opened.cert) meta = { ...base, kind: 'cert', name: `Certificate: ${opened.cert.name}` };
  else if (opened.crl) meta = { ...base, kind: 'crl', name: `Revocation list ${opened.crl.number}` };
  else meta = { ...base, kind: 'locked', name: 'Locked item', private: true, keyId: opened.locked };
  return { meta, opened };
}

export type Event =
  | { kind: 'progress'; progress: Progress }
  | { kind: 'ready'; progress: Progress } // complete: call finish(id) to reassemble it
  | { kind: 'item'; meta: Meta; opened: Opened; container: Uint8Array }
  | { kind: 'error'; id: string; error: string };

export class Inbox {
  private rx: StreamReceiver;
  private keys: () => Keys;
  private trust: () => Trust;

  // `rx` is the native receiver in the app (engine.ts); the tests pass the JavaScript one.
  constructor(keys: () => Keys, trust: () => Trust, rx: StreamReceiver) {
    this.keys = keys;
    this.trust = trust;
    this.rx = rx;
  }

  // Feeds one scanned string; returns what happened, or null for anything that is not a frame
  // (such as the countdown link) or a frame of a stream that is already done.
  push(raw: string): Event | null {
    const r = this.rx.push(raw);
    if (!r) return null;
    if (r.error) return { kind: 'error', id: r.id, error: r.error };
    return { kind: r.ready ? 'ready' : 'progress', progress: r };
  }

  // Reassembles and opens a stream that push() reported ready. For megabytes this takes a while.
  async finish(id: string, now = Date.now()): Promise<Event> {
    const r = await this.rx.finish(id);
    if (r.error || !r.container) return { kind: 'error', id, error: r.error ?? 'corrupt stream' };
    try {
      return { kind: 'item', container: r.container, ...describe(id, r.container, this.keys(), this.trust(), now) };
    } catch (e) {
      return { kind: 'error', id, error: (e as Error).message };
    }
  }
}
