// Runs a container through frames and a Receiver, as a camera would, and opens what arrives.
import { Receiver } from '../../protocol/fountain.js';
import { openContainer } from '../../protocol/containers.js';
import { makeFrames } from '../../tools/resqr.mjs';

export const enc = s => new TextEncoder().encode(s);
export const dec = b => new TextDecoder().decode(b);

export const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// Feeds `frames` until a stream completes; returns the Receiver result, plus `code` or `file` or
// `error` from opening the container.
export function receive(frames, opts = {}, rx = new Receiver()) {
  for (const f of frames) {
    const r = rx.push(f);
    if (r?.error) return r;
    if (r?.container) {
      try { return { ...r, ...openContainer(r.container, opts) }; } catch (e) { return { ...r, error: e.message }; }
    }
  }
  return null;
}

export const send = (container, opts, count = 100) => receive(makeFrames(container, { count }).frames, opts);
