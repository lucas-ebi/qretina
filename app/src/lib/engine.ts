// The transfer layer the app runs on: the native one (native/, C++). It is built into every release;
// without it the app does not start (_layout.tsx), rather than running a hundred times slower.
import { loadTransfer } from '@qretina/native';
import type { Encoder, Pushed } from '@qretina/protocol/fountain.js';

// What the inbox needs from a receiver. push() is called for every scanned string; finish()
// reassembles a stream reported ready, off the JavaScript thread.
export type StreamReceiver = {
  push(raw: string): Pushed | null;
  finish(id: string): Promise<{ container?: Uint8Array; error?: string }>;
  hold(id: string, ms: number): void;
};

export type Engine = {
  encoder(container: Uint8Array, block: number): Encoder;
  receiver(): StreamReceiver;
};

const transfer = loadTransfer();

// Why the app cannot run, or null.
export const engineError = transfer ? null : 'This build of QRetina lacks its transfer engine. Install a release build.';

function need() {
  if (!transfer) throw new Error(engineError!);
  return transfer;
}

export const engine: Engine = {
  receiver() {
    const rx = need().createReceiver(8);
    return {
      push(raw) {
        const r = rx.push(raw, Date.now());
        if (r.status === 'ignored') return null;
        const progress = { id: r.id, n: r.n, len: r.len, rank: r.rank };
        if (r.status === 'ready') return { ...progress, ready: true };
        if (r.status === 'corrupt') return { ...progress, error: 'corrupt stream' };
        return progress;
      },
      async finish(id) {
        const r = await rx.finish(id);
        return r.container ? { container: new Uint8Array(r.container) } : { error: r.error ?? 'corrupt stream' };
      },
      hold: (id, ms) => rx.hold(id, Date.now() + ms),
    };
  },
  encoder(container, block) {
    // An ArrayBuffer holding exactly the container's bytes.
    const buffer = container.byteOffset === 0 && container.byteLength === container.buffer.byteLength
      ? (container.buffer as ArrayBuffer) : container.slice().buffer;
    return need().createEncoder(buffer, block);
  },
};
