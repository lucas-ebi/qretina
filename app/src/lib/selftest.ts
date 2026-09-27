// Checks the protocol against the spec's vectors on the device itself, and times a transfer. The
// libraries it exercises (SHA-256, Ed25519, XChaCha20-Poly1305, scrypt, deflate) are the ones whose
// behaviour under Hermes cannot be tested anywhere else.
import { PROTOCOL, Receiver, b45encode, blockFor, encoder, hex, mask, mulberry32, streamId } from '@qretina/protocol/fountain.js';
import { keyFromPassphrase, keyId, loadKey, openContainer, packFile, seal, signCode, toB64url } from '@qretina/protocol/containers.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import v from './vectors.json' with { type: 'json' };

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

// `slow` includes the passphrase key, which takes a few seconds on a phone.
export function checks({ slow = true } = {}): Check[] {
  const list = [
    run('Protocol identifier', () => PROTOCOL === v.protocol || `${PROTOCOL} ≠ ${v.protocol}`),
    run('Masks', () => mask(v.mask.seed, v.mask.n).join('') === v.mask.bits),
    run('Base45', () => v.base45.every(x => b45encode(utf8(x.text)) === x.base45)),
    run('SHA-256 stream id', () => streamId(unhex(v.stream.container)) === v.stream['stream-id']),
    run('Frames', () => {
      const e = encoder(unhex(v.stream.container), v.stream.block);
      return v.stream.frames.every((f, i) => e.frame(i + 1) === f);
    }),
    run('Decoding', () => {
      const e = encoder(unhex(v.stream.container), v.stream.block), rx = new Receiver();
      for (let s = 1; s < 100; s++) { const r = rx.push(e.frame(s)); if (r?.container) return hex(r.container) === v.stream.container; }
      return 'did not complete';
    }),
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

// Packs `size` bytes of noise, as broadcasting a file does, and receives every frame in order, as a
// perfect camera would. Returns the time each half took, in milliseconds.
export function speed(size: number) {
  const rng = mulberry32(size), bytes = Uint8Array.from({ length: size }, () => rng() & 255);
  let t = Date.now();
  const container = packFile('test.bin', 'application/octet-stream', bytes), e = encoder(container, blockFor(container.length));
  const pack = Date.now() - t;
  t = Date.now();
  const rx = new Receiver();
  let r = null;
  for (let s = 1; !r?.container; s++) r = rx.push(e.frame(s));
  const total = Date.now() - t;
  return { n: e.n, block: e.b, pack, receive: total, ok: r.container.length === container.length };
}
