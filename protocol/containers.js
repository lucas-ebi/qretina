// Containers (spec/qretina.yaml `containers`): signed code, files, certificates, revocation lists and
// sealed (encrypted) containers. Pure JS. Code runs only when signed by a root key, or by a
// publisher whose certificate a root key issued; files are data and are never run, whatever their type.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

export const CODE = 1, FILE = 2, FILE_STORED = 3, CERT = 4, CRL = 5, SEALED = 6;
export const TYPES = ['html', 'json'];
export const DOMAIN = strToU8('qretina code\0'), CERT_DOMAIN = strToU8('qretina cert\0'), CRL_DOMAIN = strToU8('qretina crl\0');
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

const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

const line = raw => {
  const nl = raw.indexOf(10);
  if (nl < 0) throw new Error('malformed container');
  return [strFromU8(raw.subarray(0, nl)).split(' '), raw.subarray(nl + 1)];
};

// ---- Keys ---------------------------------------------------------------------

// A public key (base64url) with a short fingerprint, its first 8 characters, to show people.
export function loadKey(b64) {
  const key = b64url(b64);
  if (key.length !== 32) throw new Error('an Ed25519 public key is 32 bytes');
  return { fp: b64.slice(0, 8), key };
}

const keyOf = bytes => ({ fp: toB64url(bytes).slice(0, 8), key: bytes });

// Everything after the signature is signed, prefixed with the container type's domain.
const signed = (tag, domain, secretKey, rest) => concat([tag], ed25519.sign(concat(domain, rest), secretKey), rest);

function verify(container, tag, domain, keys) {
  if (container[0] !== tag || container.length < 66) throw new Error('malformed container');
  const sig = container.subarray(1, 65), rest = container.subarray(65), msg = concat(domain, rest);
  const signer = keys.find(k => { try { return ed25519.verify(sig, msg, k.key); } catch { return false; } });
  if (!signer) throw new Error(keys.length ? 'bad signature' : 'no trusted key');
  return [signer, rest];
}

const uint = (s, what) => {
  if (!/^\d{1,15}$/.test(s ?? '')) throw new Error(`malformed ${what}`);
  return +s;
};

// ---- Certificates and revocation lists -------------------------------------------

// A root key certifies a publisher's key for ids that begin with `namespace`, between two times.
export function issueCert(rootSecret, { publicKey, name, namespace, notBefore, notAfter, serial = Date.now() }) {
  if (!ID.test(namespace)) throw new Error('namespace is 1 to 64 letters, digits, _ . -');
  if (!name) throw new Error('a certificate needs a name');
  for (const v of [serial, notBefore, notAfter]) uint(String(v), 'certificate');
  if (notAfter < notBefore) throw new Error('the certificate ends before it starts');
  const key = typeof publicKey === 'string' ? b64url(publicKey) : publicKey;
  if (key.length !== 32) throw new Error('an Ed25519 public key is 32 bytes');
  const header = `${serial} ${notBefore} ${notAfter} ${namespace} ${encodeURIComponent(name)}\n`;
  return signed(CERT, CERT_DOMAIN, rootSecret, concat(strToU8(header), key));
}

export function openCert(container, roots) {
  const [root, rest] = verify(container, CERT, CERT_DOMAIN, roots);
  const [f, key] = line(rest);
  if (f.length !== 5 || key.length !== 32 || !ID.test(f[3])) throw new Error('malformed certificate');
  const [serial, notBefore, notAfter] = f.slice(0, 3).map(v => uint(v, 'certificate'));
  return { serial, notBefore, notAfter, namespace: f[3], name: decodeURIComponent(f[4]), ...keyOf(key), root: root.fp };
}

export function issueCrl(rootSecret, { number, serials = [] }) {
  for (const v of [number, ...serials]) uint(String(v), 'revocation list');
  return signed(CRL, CRL_DOMAIN, rootSecret, strToU8(`${number}\n${serials.join(' ')}`));
}

export function openCrl(container, roots) {
  const [, rest] = verify(container, CRL, CRL_DOMAIN, roots);
  const [[number], list] = line(rest);
  const text = strFromU8(list);
  return { number: uint(number, 'revocation list'), serials: text ? text.split(' ').map(v => uint(v, 'revocation list')) : [] };
}

// ---- Code -------------------------------------------------------------------------

// Signs a program with a 32-byte Ed25519 secret key: a root key, or a publisher key together with
// the certificate a root issued for it. The version defaults to the current Unix time, so later
// signatures are always newer.
export function signCode(secretKey, { type, id, payload, version = Math.floor(Date.now() / 1000), cert = new Uint8Array(0) }) {
  if (!TYPES.includes(type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
  if (!ID.test(id)) throw new Error('id is 1 to 64 letters, digits, _ . -');
  if (!Number.isSafeInteger(version) || version < 0 || version > 999999999999999) throw new Error('version must be a non-negative integer');
  if (cert.length > 0xFFFF) throw new Error('certificate too long');
  const body = deflate(concat(strToU8(`${type} ${id} ${version}\n`), payload));
  return signed(CODE, DOMAIN, secretKey, concat([cert.length >> 8, cert.length & 255], cert, body));
}

// Verifies a code container, then decompresses it. `roots` are the trusted root keys, `revoked` the
// serials of the newest revocation list, `now` the time in Unix seconds. Throws on failure.
// The result's `signer` is the fingerprint of the key that signed; `publisher` is set when that key
// holds a certificate.
export function openCode(container, { roots = [], revoked = [], now = Date.now() / 1000 } = {}) {
  if (container[0] !== CODE || container.length < 67) throw new Error(container[0] === CODE ? 'malformed container' : 'not a code container');
  const certLen = (container[65] << 8) | container[66], certBytes = container.subarray(67, 67 + certLen);
  if (certBytes.length !== certLen) throw new Error('malformed container');
  let keys = roots, publisher;
  if (certLen) {
    publisher = openCert(certBytes, roots);
    if (now < publisher.notBefore || now > publisher.notAfter) throw new Error('certificate not valid at this time');
    if ([...revoked].includes(publisher.serial)) throw new Error('certificate revoked');
    keys = [publisher];
  }
  const [signer] = verify(container, CODE, DOMAIN, keys);
  const [[type, id, v, ...more], payload] = line(inflate(container.subarray(67 + certLen)));
  if (!TYPES.includes(type) || !ID.test(id ?? '') || more.length) throw new Error('malformed container');
  if (publisher && !id.startsWith(publisher.namespace)) throw new Error(`${publisher.name} may not publish ${id}`);
  return { type, id, version: uint(v, 'container'), payload, signer: signer.fp, publisher };
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

// ---- Sealed containers ----------------------------------------------------------
// Encrypted under a 32-byte key that sender and receiver hold in advance. The nonce is derived from
// the content, so sealing one item under one key always gives the same bytes and the same stream:
// relays of the same item add up. It reveals only whether two sealed containers are equal.

const KEY_DOMAIN = strToU8('qretina key\0');

export const keyId = key => hex(sha256(concat(KEY_DOMAIN, key)).subarray(0, 8));

export const keyFromPassphrase = passphrase =>
  scrypt(strToU8(passphrase.normalize('NFC')), strToU8('qretina psk'), { N: 1 << 15, r: 8, p: 1, dkLen: 32 });

export function seal(key, inner) {
  if (key.length !== 32) throw new Error('a sealing key is 32 bytes');
  const id = sha256(concat(KEY_DOMAIN, key)).subarray(0, 8), ad = concat([SEALED], id);
  const nonce = hmac(sha256, hmac(sha256, key, strToU8('qretina iv')), inner).subarray(0, 24);
  return concat(ad, nonce, xchacha20poly1305(hmac(sha256, key, strToU8('qretina enc')), nonce, ad).encrypt(inner));
}

// Returns the inner container, or null when none of `keys` matches the container's key id.
export function unseal(container, keys) {
  if (container[0] !== SEALED || container.length < 1 + 8 + 24 + 16) throw new Error('malformed container');
  const id = hex(container.subarray(1, 9)), key = keys.find(k => keyId(k) === id);
  if (!key) return null;
  const ad = container.subarray(0, 9), nonce = container.subarray(9, 33);
  try {
    return xchacha20poly1305(hmac(sha256, key, strToU8('qretina enc')), nonce, ad).decrypt(container.subarray(33));
  } catch {
    throw new Error('sealed container does not authenticate');
  }
}

// ---- Any container ------------------------------------------------------------

// Opens any container. Returns { code } (verified, then accepted by `accept`, which may throw to
// refuse it), { file }, { cert }, { crl }, or { locked } (the key id) for a sealed container none of
// `keys` opens; throws on anything else. When sealed layers were opened, `sealed` lists their key
// ids, outermost first. Other options as for openCode.
export function openContainer(container, { accept, keys = [], depth = 0, ...trust } = {}) {
  switch (container[0]) {
    case FILE: case FILE_STORED: return { file: openFile(container) };
    case CERT: return { cert: openCert(container, trust.roots ?? []) };
    case CRL: return { crl: openCrl(container, trust.roots ?? []) };
    case CODE: {
      const code = openCode(container, trust);
      accept?.(code);
      return { code };
    }
    case SEALED: {
      if (depth >= 2) throw new Error('too many sealed layers');
      const inner = unseal(container, keys), id = hex(container.subarray(1, 9));
      if (!inner) return { locked: id };
      const r = openContainer(inner, { accept, keys, depth: depth + 1, ...trust });
      return { ...r, sealed: [id, ...(r.sealed ?? [])] };
    }
    default: throw new Error('unknown container type');
  }
}
