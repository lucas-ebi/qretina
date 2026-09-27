import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Receiver, encoder } from '@qretina/protocol/fountain.js';
import { b64url, issueCert, keyId, loadKey, packFile, seal, signCode, toB64url } from '@qretina/protocol/containers.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import type { Engine } from '../src/lib/engine.ts';
import { Inbox, type Event } from '../src/lib/inbox.ts';
import { outgoing } from '../src/lib/outgoing.ts';
import { approve, emptyTrust, isApproved, withCrl, type Trust } from '../src/lib/trust.ts';

// The reference implementation in the native engine's place: the app has no other, but Node cannot load it.
const js: Engine = {
  encoder,
  receiver() {
    const rx = new Receiver({ deferSolve: true });
    return { push: raw => rx.push(raw), finish: async id => rx.finish(id) ?? { error: 'not ready' }, hold: (id, ms) => rx.hold(id, ms) };
  },
};

const enc = (s: string) => new TextEncoder().encode(s);
const rand = () => crypto.getRandomValues(new Uint8Array(32));

// Everything a phone's camera would see for one container, until an item or error comes out.
async function scan(inbox: Inbox, container: Uint8Array, start = 1): Promise<Event> {
  const e = encoder(container, 200);
  for (let s = start; s < start + e.n * 3; s++) {
    const r = inbox.push(e.frame(s));
    if (r?.kind === 'ready') return inbox.finish(r.progress.id);
    if (r && r.kind !== 'progress') return r;
  }
  throw new Error('no item');
}

function world() {
  const root = ed25519.keygen(), app = rand();
  let trust: Trust = emptyTrust();
  const keys = { roots: [loadKey(toB64url(root.publicKey))], keys: [app] as Uint8Array[] };
  const inbox = new Inbox(() => keys, () => trust, js.receiver());
  return { root, app, keys, inbox, get trust() { return trust; }, set trust(t: Trust) { trust = t; } };
}

test('a file sealed with the app key arrives as a file; the countdown link is ignored', async () => {
  const w = world();
  assert.equal(w.inbox.push('HTTPS://QRETINA.APP/SCAN'), null);
  const r = await scan(w.inbox, outgoing(packFile('map.png', 'image/png', rand()), [w.app]));
  assert.equal(r.kind, 'item');
  if (r.kind !== 'item') return;
  assert.deepEqual([r.meta.kind, r.meta.name, r.meta.mime, r.meta.private], ['file', 'map.png', 'image/png', false]);
});

test('a group-sealed item is private for key holders and locked for others', async () => {
  const w = world(), group = rand(), c = outgoing(packFile('n.txt', 'text/plain', enc('x')), [w.app], group);
  let r = await scan(w.inbox, c);
  assert.ok(r.kind === 'item' && r.meta.kind === 'locked' && r.meta.keyId === keyId(group));
  w.keys.keys.push(group);
  r = await scan(new Inbox(() => w.keys, () => w.trust, js.receiver()), c);
  assert.ok(r.kind === 'item' && r.meta.kind === 'file' && r.meta.private);
});

test('outgoing re-sends received sealed items unchanged, so relays add up', () => {
  const w = world(), c = outgoing(packFile('a', 'text/plain', enc('a')), [w.app]);
  assert.deepEqual(outgoing(c, [w.app]), c);
  const rotated = rand();
  const resent = outgoing(c, [rotated, w.app]);
  assert.notDeepEqual(resent, c, 'resealed under the current app key after a rotation');
  const group = rand(), priv = outgoing(c, [w.app], group);
  assert.deepEqual(outgoing(priv, [w.app], group), priv, 'no second group layer');
  const locked = outgoing(seal(group, packFile('b', 'text/plain', enc('b'))), [w.app]);
  assert.deepEqual(outgoing(locked, [w.app]), locked, 'a locked item is relayed as received');
});

test('signed code: older versions are refused once a newer one was approved', async () => {
  const w = world(), sk = w.root.secretKey;
  const at = (version: number) => outgoing(signCode(sk, { type: 'html', id: 'map', payload: enc('<p>'), version }), [w.app]);
  const r = await scan(w.inbox, at(5));
  assert.ok(r.kind === 'item' && r.meta.kind === 'code' && r.opened.code);
  if (r.kind !== 'item' || !r.opened.code) return;
  assert.ok(!isApproved(w.trust, r.opened.code));
  w.trust = approve(w.trust, r.opened.code);
  assert.ok(isApproved(w.trust, r.opened.code));
  const old = await scan(w.inbox, at(4));
  assert.ok(old.kind === 'error' && /older version/.test(old.error));
});

test('revocation lists raise only, and revoked publishers are refused', async () => {
  const w = world(), pub = ed25519.keygen(), now = Math.floor(Date.now() / 1000);
  const cert = issueCert(w.root.secretKey, { publicKey: pub.publicKey, name: 'Relief', namespace: 'relief.', notBefore: now - 10, notAfter: now + 1e6, serial: 9 });
  const code = outgoing(signCode(pub.secretKey, { type: 'html', id: 'relief.map', payload: enc('<p>'), cert }), [w.app]);
  const ok = await scan(w.inbox, code);
  assert.ok(ok.kind === 'item' && ok.meta.code?.publisher === 'Relief');
  w.trust = withCrl(w.trust, { number: 2, serials: [9] });
  assert.equal(withCrl(w.trust, { number: 1, serials: [] }).crl.number, 2);
  const bad = await scan(new Inbox(() => w.keys, () => w.trust, js.receiver()), code);
  assert.ok(bad.kind === 'error' && /revoked/.test(bad.error));
});

test('b64url keys from the build configuration load', () => {
  const k = rand();
  assert.deepEqual(b64url(toB64url(k)), k);
});

test('the device self-test passes on the reference platform', async () => {
  const { checks, speed } = await import('../src/lib/selftest.ts');
  for (const c of await checks(js)) assert.ok(c.ok, `${c.name}: ${c.detail}`);
  const s = await speed(100_000, js);
  assert.ok(s.ok && s.n > 100, JSON.stringify(s));
});
