// Containers (spec/resqr.yaml `containers`): signed code and plain files. Pure JS.
//   code:        0x01 || Ed25519 signature (64) || deflate-raw("<type> <id> <version>\n" payload),
//                signed over DOMAIN || the deflated part.
//   file:        0x02 || deflate-raw(meta),   file-stored: 0x03 || meta,
//                where meta = "<mime> <percent-encoded name>\n" bytes.
// Files are data: they are never run, whatever their type.
import { ed25519 } from '@noble/curves/ed25519.js';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

export const CODE = 1, FILE = 2, FILE_STORED = 3;
export const TYPES = ['html', 'json'];
export const DOMAIN = strToU8('resqr code\0');
const ID = /^[A-Za-z0-9_.-]{1,64}$/;

export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  parts.reduce((o, p) => (out.set(p, o), o + p.length), 0);
  return out;
};

export const deflate = bytes => deflateSync(bytes, { level: 9 });
export const inflate = bytes => inflateSync(bytes);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function b64url(s) {
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of s.replace(/=+$/, '')) {
    const v = B64.indexOf(ch === '+' ? '-' : ch === '/' ? '_' : ch);
    if (v < 0) throw new Error('bad base64url');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return Uint8Array.from(out);
}

export function toB64url(bytes) {
  let s = '', acc = 0, bits = 0;
  for (const x of bytes) {
    acc = (acc << 8) | x;
    bits += 8;
    while (bits >= 6) { bits -= 6; s += B64[(acc >> bits) & 63]; }
  }
  return bits ? s + B64[(acc << (6 - bits)) & 63] : s;
}

const line = raw => {
  const nl = raw.indexOf(10);
  if (nl < 0) throw new Error('malformed container');
  return [strFromU8(raw.subarray(0, nl)).split(' '), raw.subarray(nl + 1)];
};

// ---- Code -------------------------------------------------------------------

// A trusted public key (base64url) with a short fingerprint, its first 8 characters, to show people.
export function loadKey(b64) {
  const key = b64url(b64);
  if (key.length !== 32) throw new Error('an Ed25519 public key is 32 bytes');
  return { fp: b64.slice(0, 8), key };
}

// Signs a program with a 32-byte Ed25519 secret key. The version defaults to the current Unix
// time, so later signatures are always newer.
export function signCode(secretKey, { type, id, payload, version = Math.floor(Date.now() / 1000) }) {
  if (!TYPES.includes(type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
  if (!ID.test(id)) throw new Error('id is 1 to 64 letters, digits, _ . -');
  if (!Number.isSafeInteger(version) || version < 0 || version > 999999999999999) throw new Error('version must be a non-negative integer');
  const body = deflate(concat(strToU8(`${type} ${id} ${version}\n`), payload));
  return concat([CODE], ed25519.sign(concat(DOMAIN, body), secretKey), body);
}

// Verifies a code container against any trusted key, then decompresses. Throws on failure.
export function openCode(container, keys) {
  if (container[0] !== CODE) throw new Error('not a code container');
  const sig = container.subarray(1, 65), body = container.subarray(65), msg = concat(DOMAIN, body);
  const signer = keys.find(k => { try { return ed25519.verify(sig, msg, k.key); } catch { return false; } });
  if (!signer) throw new Error(keys.length ? 'bad signature' : 'no trusted key');
  const [[type, id, v, ...rest], payload] = line(inflate(body));
  if (!TYPES.includes(type) || !ID.test(id ?? '') || !/^\d{1,15}$/.test(v ?? '') || rest.length) throw new Error('malformed container');
  return { type, id, version: +v, payload, signer: signer.fp };
}

// ---- Files ------------------------------------------------------------------

export function packFile(name, mime, bytes) {
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime)) mime = 'application/octet-stream';
  const meta = concat(strToU8(`${mime} ${encodeURIComponent(name)}\n`), bytes), z = deflate(meta);
  return z.length < meta.length ? concat([FILE], z) : concat([FILE_STORED], meta);
}

export function openFile(container) {
  const tag = container[0];
  if (tag !== FILE && tag !== FILE_STORED) throw new Error('not a file container');
  const [[mime, name], bytes] = line(tag === FILE ? inflate(container.subarray(1)) : container.subarray(1));
  return { mime, name: decodeURIComponent(name || 'file'), bytes };
}

// ---- Any container ------------------------------------------------------------

// Returns { code } (verified, and accepted by `accept`, which may throw to refuse it) or { file }.
// Throws on anything else.
export function openContainer(container, { keys = [], accept } = {}) {
  if (container[0] === FILE || container[0] === FILE_STORED) return { file: openFile(container) };
  if (container[0] !== CODE) throw new Error('unknown container type');
  const code = openCode(container, keys);
  accept?.(code);
  return { code };
}
