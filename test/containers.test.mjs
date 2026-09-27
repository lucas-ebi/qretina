import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { CODE, DOMAIN, b64url, concat, deflate, loadKey, openCode, openContainer, openFile, packFile, signCode, toB64url } from '../protocol/containers.js';
import { keygen, sign } from '../tools/resqr.mjs';
import { dec, enc, send } from './helpers/stream.mjs';

const html = '<!doctype html><title>demo</title>' + '<p>hello</p>'.repeat(200);

function setup(type = 'html', payload = enc(html), version = 1) {
  const { jwk, publicKey } = keygen();
  return { jwk, publicKey, keys: [loadKey(publicKey)], container: sign(jwk, { type, id: 'demo', payload, version }) };
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
  const body = deflate(enc('html x 1\n<p>'));
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, concat(DOMAIN, body)));
  assert.equal(openCode(concat([CODE], sig, body), [loadKey(publicKey)]).id, 'x');
});

test('signed code survives the stream and opens with type, id, version and signer', () => {
  const { keys, publicKey, container } = setup();
  const r = send(container, { keys });
  assert.deepEqual([r.code.type, r.code.id, r.code.version, r.code.signer], ['html', 'demo', 1, publicKey.slice(0, 8)]);
  assert.equal(dec(r.code.payload), html);
  assert.ok(container.length < html.length / 4, 'compressed');
});

test('tampered code and untrusted signers are rejected', () => {
  const { keys, container } = setup();
  const bad = container.slice();
  bad[bad.length - 5] ^= 1;
  assert.match(send(bad, { keys }).error, /bad signature/);
  assert.match(send(container, { keys: [loadKey(keygen().publicKey)] }).error, /bad signature/);
  assert.match(send(container, { keys: [] }).error, /no trusted key/);
});

test('signatures are domain-separated: a signature over the bare body is rejected', () => {
  const { jwk, keys, container } = setup();
  const body = container.subarray(65), sk = b64url(jwk.d);
  assert.throws(() => openCode(concat([CODE], ed25519.sign(body, sk), body), keys), /bad signature/);
  assert.equal(openCode(concat([CODE], ed25519.sign(concat(DOMAIN, body), sk), body), keys).id, 'demo');
});

test('only html and json can be signed or opened; ids and versions are validated', () => {
  const { jwk, publicKey } = keygen();
  assert.throws(() => sign(jwk, { type: 'mjs', id: 'x', payload: enc('1') }), /type/);
  for (const id of ['', 'a b', 'x'.repeat(65), 'é']) assert.throws(() => sign(jwk, { type: 'json', id, payload: enc('1') }), /id/);
  for (const version of [-1, 1.5, NaN, 1e16]) assert.throws(() => sign(jwk, { type: 'json', id: 'x', payload: enc('1'), version }), /version/);
  // A validly signed body with a type this receiver does not run is refused after verification.
  const body = deflate(enc('mjs x 1\nexport {}')), sk = b64url(jwk.d);
  assert.throws(() => openCode(concat([CODE], ed25519.sign(concat(DOMAIN, body), sk), body), [loadKey(publicKey)]), /malformed/);
});

test('the version defaults to the current Unix time', () => {
  const { jwk, publicKey } = keygen(), before = Math.floor(Date.now() / 1000);
  const { version } = openCode(sign(jwk, { type: 'json', id: 'x', payload: enc('1') }), [loadKey(publicKey)]);
  assert.ok(version >= before && version <= before + 5);
});

test('the accept hook can refuse older versions (replay protection)', () => {
  const { jwk, publicKey } = keygen(), keys = [loadKey(publicKey)], newest = 10;
  const accept = c => { if (c.version < newest) throw new Error('older version'); };
  const at = version => signCode(b64url(jwk.d), { type: 'json', id: 'app', payload: enc(`{"v":${version}}`), version });
  assert.equal(send(at(9), { keys, accept }).error, 'older version');
  for (const v of [10, 11]) assert.ok(send(at(v), { keys, accept }).code, `v${v}`);
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
  assert.throws(() => openCode(packFile('a.html', 'text/html', text), []), /not a code container/);
});

test('unknown container types are refused', () => {
  assert.throws(() => openContainer(Uint8Array.of(9, 1, 2)), /unknown container type/);
});
