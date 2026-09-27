// Checks the protocol against the spec's vectors on the device itself, and times a transfer. The
// libraries it exercises (SHA-256, Ed25519, XChaCha20-Poly1305, scrypt, deflate) are the ones whose
// behaviour under Hermes cannot be tested anywhere else.
import { PROTOCOL, b45encode, blockFor, hex, mask, mulberry32, streamId } from '@qretina/protocol/fountain.js';
import { keyFromPassphrase, keyId, loadKey, openContainer, packFile, seal, signCode, toB64url } from '@qretina/protocol/containers.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import v from './vectors.json' with { type: 'json' };
import type { Engine } from './engine.ts';

export type Check = { name: string; ok: boolean; detail?: string };

const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], x => parseInt(x, 16));
const utf8 = (s: string) => Uint8Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0));

function run(name: string, f: () => boolean | string): Check {
  try {
    const r = f();
    return r === true ? { name, ok: true } : { name, ok: false, detail: r === false ? 'mismatch' : r };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message };
  }
}

// Frames and decoding run on `engine`, the rest on the protocol library. `slow` includes the
// passphrase key, which takes a few seconds on a phone.
export async function checks(engine: Engine, { slow = true } = {}): Promise<Check[]> {
  const list = [
    run('Protocol identifier', () => PROTOCOL === v.protocol || `${PROTOCOL} ≠ ${v.protocol}`),
    run('Masks', () => mask(v.mask.seed, v.mask.n).join('') === v.mask.bits),
    run('Base45', () => v.base45.every(x => b45encode(utf8(x.text)) === x.base45)),
    run('SHA-256 stream id', () => streamId(unhex(v.stream.container)) === v.stream['stream-id']),
    run('Frames', () => {
      const e = engine.encoder(unhex(v.stream.container), v.stream.block);
      return v.stream.frames.every((f, i) => e.frame(i + 1) === f);
    }),
    await decoding(engine),
    run('Sealing (XChaCha20-Poly1305)', () => {
      const key = unhex(v.sealed.key);
      if (keyId(key) !== v.sealed['key-id']) return 'key id';
      if (hex(seal(key, unhex(v.stream.container))) !== v.sealed.container) return 'sealed bytes';
      return openContainer(unhex(v.sealed.container), { keys: [key] }).file?.name === 'hello.txt';
    }),
    run('Signatures (Ed25519) and deflate', () => {
      const k = ed25519.keygen();
      const c = signCode(k.secretKey, { type: 'html', id: 'selftest', payload: utf8('<p>ok</p>'.repeat(50)), version: 1 });
      const code = openContainer(c, { roots: [loadKey(toB64url(k.publicKey))] }).code;
      return code?.id === 'selftest' && code.payload.length === 450;
    }),
  ];
  if (slow) list.push(run('Passphrase keys (scrypt)', () => hex(keyFromPassphrase(v['passphrase-key'].passphrase)) === v['passphrase-key'].key));
  return list;
}

async function decoding(engine: Engine): Promise<Check> {
  const name = 'Decoding';
  try {
    const e = engine.encoder(unhex(v.stream.container), v.stream.block), rx = engine.receiver();
    for (let s = 1; s < 100; s++) {
      const r = rx.push(e.frame(s));
      if (!r?.ready) continue;
      const done = await rx.finish(r.id);
      return done.container && hex(done.container) === v.stream.container ? { name, ok: true } : { name, ok: false, detail: done.error ?? 'mismatch' };
    }
    return { name, ok: false, detail: 'did not complete' };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message };
  }
}

// Packs `size` bytes of noise, as broadcasting a file does, then makes every frame and receives
// it in order, as a perfect camera would, on the given engine. Times in milliseconds.
export async function speed(size: number, engine: Engine) {
  const rng = mulberry32(size), bytes = Uint8Array.from({ length: size }, () => rng() & 255);
  let t = Date.now();
  const container = packFile('test.bin', 'application/octet-stream', bytes);
  const pack = Date.now() - t;
  t = Date.now();
  const e = engine.encoder(container, blockFor(container.length)), rx = engine.receiver();
  let r = null, s = 1;
  for (; !r?.ready; s++) r = rx.push(e.frame(s));
  const scan = Date.now() - t;
  t = Date.now();
  const done = await rx.finish(r.id);
  const assemble = Date.now() - t;
  return { n: e.n, block: e.b, pack, scan, assemble, ok: done.container?.length === container.length && s - 1 >= e.n };
}
