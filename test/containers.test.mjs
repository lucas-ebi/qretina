import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { CODE, DOMAIN, b64url, concat, deflate, issueCert, issueCrl, loadKey, openCert, openCode, openContainer, openFile, packFile, signCode, toB64url } from '../protocol/containers.js';
import { keygen, sign } from '../tools/resqr.mjs';
import { dec, enc, send } from './helpers/stream.mjs';

const html = '<!doctype html><title>demo</title>' + '<p>hello</p>'.repeat(200);

function setup(type = 'html', payload = enc(html), version = 1) {
  const { jwk, publicKey } = keygen();
  return { jwk, publicKey, roots: [loadKey(publicKey)], container: sign(jwk, { type, id: 'demo', payload, version }) };
}

test('base64url round-trips and accepts standard base64 too', () => {
  for (let len = 0; len < 40; len++) {
    const x = crypto.getRandomValues(new Uint8Array(len));
    assert.deepEqual(b64url(toB64url(x)), x);
    assert.deepEqual(b64url(Buffer.from(x).toString('base64')), x);
  }
  assert.throws(() => b64url('a!b'), /base64/);
});

test('keys are JWKs that WebCrypto can import, so existing keys keep working', async () => {
  const { jwk, publicKey } = keygen();
  const key = await crypto.subtle.importKey('jwk', jwk, 'Ed25519', false, ['sign']);
  const rest = concat([0, 0], deflate(enc('html x 1\n<p>')));
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, concat(DOMAIN, rest)));
  assert.equal(openCode(concat([CODE], sig, rest), { roots: [loadKey(publicKey)] }).id, 'x');
});

test('signed code survives the stream and opens with type, id, version and signer', () => {
  const { roots, publicKey, container } = setup();
  const r = send(container, { roots });
  assert.deepEqual([r.code.type, r.code.id, r.code.version, r.code.signer, r.code.publisher], ['html', 'demo', 1, publicKey.slice(0, 8), undefined]);
  assert.equal(dec(r.code.payload), html);
  assert.ok(container.length < html.length / 4, 'compressed');
});

test('tampered code and untrusted signers are rejected', () => {
  const { roots, container } = setup();
  const bad = container.slice();
  bad[bad.length - 5] ^= 1;
  assert.match(send(bad, { roots }).error, /bad signature/);
  assert.match(send(container, { roots: [loadKey(keygen().publicKey)] }).error, /bad signature/);
  assert.match(send(container, { roots: [] }).error, /no trusted key/);
});

test('signatures are domain-separated: a signature over the bare body is rejected', () => {
  const { jwk, roots, container } = setup();
  const rest = container.subarray(65), sk = b64url(jwk.d);
  assert.throws(() => openCode(concat([CODE], ed25519.sign(rest, sk), rest), { roots }), /bad signature/);
  assert.equal(openCode(concat([CODE], ed25519.sign(concat(DOMAIN, rest), sk), rest), { roots }).id, 'demo');
});

test('only html and json can be signed or opened; ids and versions are validated', () => {
  const { jwk, publicKey } = keygen();
  assert.throws(() => sign(jwk, { type: 'mjs', id: 'x', payload: enc('1') }), /type/);
  for (const id of ['', 'a b', 'x'.repeat(65), 'é']) assert.throws(() => sign(jwk, { type: 'json', id, payload: enc('1') }), /id/);
  for (const version of [-1, 1.5, NaN, 1e16]) assert.throws(() => sign(jwk, { type: 'json', id: 'x', payload: enc('1'), version }), /version/);
  // A validly signed body with a type this receiver does not run is refused after verification.
  const rest = concat([0, 0], deflate(enc('mjs x 1\nexport {}'))), sk = b64url(jwk.d);
  assert.throws(() => openCode(concat([CODE], ed25519.sign(concat(DOMAIN, rest), sk), rest), { roots: [loadKey(publicKey)] }), /malformed/);
});

test('the version defaults to the current Unix time', () => {
  const { jwk, publicKey } = keygen(), before = Math.floor(Date.now() / 1000);
  const { version } = openCode(sign(jwk, { type: 'json', id: 'x', payload: enc('1') }), { roots: [loadKey(publicKey)] });
  assert.ok(version >= before && version <= before + 5);
});

test('the accept hook can refuse older versions (replay protection)', () => {
  const { jwk, publicKey } = keygen(), roots = [loadKey(publicKey)], newest = 10;
  const accept = c => { if (c.version < newest) throw new Error('older version'); };
  const at = version => signCode(b64url(jwk.d), { type: 'json', id: 'app', payload: enc(`{"v":${version}}`), version });
  assert.equal(send(at(9), { roots, accept }).error, 'older version');
  for (const v of [10, 11]) assert.ok(send(at(v), { roots, accept }).code, `v${v}`);
});

test('files round-trip, compressed or stored, and are never code', () => {
  const text = enc('hello '.repeat(500)), noise = crypto.getRandomValues(new Uint8Array(3000));
  for (const [name, mime, bytes, tag] of [['a b/é.txt', 'text/plain', text, 2], ['x.jpg', 'image/jpeg', noise, 3], ['y', 'bad mime', text, 2], ['page.html', 'text/html', text, 2]]) {
    const c = packFile(name, mime, bytes);
    assert.equal(c[0], tag, name);
    const f = openFile(c);
    assert.deepEqual([f.name, f.mime, f.bytes], [name, mime === 'bad mime' ? 'application/octet-stream' : mime, bytes]);
    const r = send(c, {});
    assert.ok(r.file && !r.code, name);
  }
  assert.throws(() => openCode(packFile('a.html', 'text/html', text)), /not a code container/);
});

test('unknown container types are refused', () => {
  assert.throws(() => openContainer(Uint8Array.of(9, 1, 2)), /unknown container type/);
});

// ---- Certificates ---------------------------------------------------------------

const DAY = 86400, now = Math.floor(Date.now() / 1000);

function pki({ namespace = 'org.relief.', notBefore = now - DAY, notAfter = now + 365 * DAY, serial = 7 } = {}) {
  const root = keygen(), publisher = keygen();
  const cert = issueCert(b64url(root.jwk.d), { publicKey: publisher.publicKey, name: 'Relief Org', namespace, notBefore, notAfter, serial });
  const code = (id, opts = {}) => sign(publisher.jwk, { type: 'html', id, payload: enc(html), version: 3, cert, ...opts });
  return { root, publisher, cert, code, roots: [loadKey(root.publicKey)] };
}

test('a certificate names the publisher, its key, namespace, validity and serial', () => {
  const { cert, roots, publisher, root } = pki();
  const c = openCert(cert, roots);
  assert.deepEqual([c.name, c.namespace, c.serial, c.fp, c.root], ['Relief Org', 'org.relief.', 7, publisher.publicKey.slice(0, 8), root.publicKey.slice(0, 8)]);
  assert.deepEqual(openContainer(cert, { roots }).cert.name, 'Relief Org');
});

test('code signed by a certified publisher runs, and relays keep the certificate', () => {
  const { code, roots, publisher } = pki(), container = code('org.relief.map');
  const r = send(container, { roots });
  assert.deepEqual([r.code.id, r.code.signer, r.code.publisher.name], ['org.relief.map', publisher.publicKey.slice(0, 8), 'Relief Org']);
  assert.deepEqual(send(r.container, { roots }).code.id, 'org.relief.map', 'the received container is the relayed one');
});

test('a publisher cannot sign outside its namespace', () => {
  const { code, roots } = pki();
  assert.match(send(code('org.other.map'), { roots }).error, /Relief Org may not publish org\.other\.map/);
});

test('certificates outside their validity, revoked, or from an unknown root are refused', () => {
  assert.match(send(pki({ notAfter: now - DAY }).code('org.relief.x'), { roots: pki().roots }).error, /bad signature/);
  const expired = pki({ notBefore: now - 10 * DAY, notAfter: now - DAY }), future = pki({ notBefore: now + DAY });
  assert.match(send(expired.code('org.relief.x'), { roots: expired.roots }).error, /not valid at this time/);
  assert.match(send(future.code('org.relief.x'), { roots: future.roots }).error, /not valid at this time/);
  const p = pki({ serial: 42 });
  assert.match(send(p.code('org.relief.x'), { roots: p.roots, revoked: new Set([1, 42]) }).error, /revoked/);
  assert.ok(send(p.code('org.relief.x'), { roots: p.roots, revoked: [1, 2] }).code);
});

test('a publisher key cannot act as a root, and its certificate cannot be swapped', () => {
  const a = pki(), b = pki();
  // Signed by the publisher without a certificate: the publisher key is not a root.
  assert.match(send(sign(a.publisher.jwk, { type: 'html', id: 'org.relief.x', payload: enc('x') }), { roots: a.roots }).error, /bad signature/);
  // Another valid certificate put in place of the original breaks the publisher's signature.
  const c = a.code('org.relief.x'), certLen = (c[65] << 8) | c[66];
  const swapped = concat(c.subarray(0, 65), [b.cert.length >> 8, b.cert.length & 255], b.cert, c.subarray(67 + certLen));
  assert.match(send(swapped, { roots: [...a.roots, ...b.roots] }).error, /bad signature/);
});

test('certificates reject bad parameters and tampering', () => {
  const { root, publisher, cert, roots } = pki(), sk = b64url(root.jwk.d);
  const base = { publicKey: publisher.publicKey, name: 'X', namespace: 'x.', notBefore: 0, notAfter: 1 };
  assert.throws(() => issueCert(sk, { ...base, namespace: 'a b' }), /namespace/);
  assert.throws(() => issueCert(sk, { ...base, notAfter: -1 }), /malformed/);
  assert.throws(() => issueCert(sk, { ...base, notBefore: 5, notAfter: 1 }), /ends before/);
  assert.throws(() => issueCert(sk, { ...base, publicKey: 'AAAA' }), /32 bytes/);
  const bad = cert.slice();
  bad[bad.length - 1] ^= 1;
  assert.throws(() => openCert(bad, roots), /bad signature/);
});

test('revocation lists are signed by a root and carry a number and serials', () => {
  const root = keygen(), roots = [loadKey(root.publicKey)], sk = b64url(root.jwk.d);
  assert.deepEqual(send(issueCrl(sk, { number: 3, serials: [7, 42] }), { roots }).crl, { number: 3, serials: [7, 42] });
  assert.deepEqual(openContainer(issueCrl(sk, { number: 1 }), { roots }).crl, { number: 1, serials: [] });
  assert.match(send(issueCrl(b64url(keygen().jwk.d), { number: 9 }), { roots }).error, /bad signature/);
  assert.throws(() => issueCrl(sk, { number: 1, serials: ['x'] }), /malformed/);
});
