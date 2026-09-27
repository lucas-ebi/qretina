import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Decoder, MAX_N, PROTOCOL, Receiver, b45decode, b45encode, blockFor, encoder, mask, parseFrame } from '../protocol/fountain.js';
import { packFile } from '../protocol/containers.js';
import { makeFrames } from '../tools/qretina.mjs';
import { enc, receive, shuffle } from './helpers/stream.mjs';

const noise = n => new Uint8Array(randomBytes(n));

test('base45 round-trips every length and rejects bad input', () => {
  assert.equal(b45encode(enc('ietf!')), 'QED8WEX0');
  for (let len = 0; len < 12; len++) {
    const x = noise(len);
    assert.deepEqual(b45decode(b45encode(x)), x);
  }
  assert.throws(() => b45decode('GGW')); // 65536 > max
  assert.throws(() => b45decode('a'));   // not in the alphabet
});

test('round trip with shuffling and 30% loss', () => {
  const bytes = noise(9000), container = packFile('x.bin', 'application/octet-stream', bytes);
  const { frames, n } = makeFrames(container, { block: 200, count: 150 });
  const r = receive(shuffle(frames.filter(() => Math.random() > 0.3)));
  assert.ok(r?.file, `did not complete (${n} blocks)`);
  assert.deepEqual(r.file.bytes, bytes);
});

test('frames use only the QR alphanumeric set', () => {
  const { frames } = makeFrames(noise(3000));
  assert.ok(frames.every(f => /^[0-9A-Z $%*+\-./:]+$/.test(f)));
});

test('hostile frames are rejected quickly and never hang', () => {
  const ok = `${PROTOCOL}/0123456789ABCDEF`;
  const cases = [
    `${ok}/0/100/1/AA`, `${ok}/4097/100000/1/AA`, `${ok}/4/100/1/AA` /* wrong data length */,
    `${ok}/4/99999999/1/AA`, `${ok}/4/100/4294967296/AA`, `${ok}/10/9/1/AA` /* n > len */,
    `${ok}/1/100000/1/AA` /* block > MAX_B */, `${PROTOCOL}/short/4/100/1/AA`, 'garbage', '{"i":"x"}',
    `QRT000000/0123456789ABCDEF/1/4/1/${'0'.repeat(6)}` /* another protocol revision */,
    'HTTPS://QRETINA.APP/SCAN' /* the countdown link */,
  ];
  const t = performance.now();
  for (const c of cases) assert.equal(parseFrame(c), null, c);
  assert.ok(performance.now() - t < 200);
});

test('mismatched parameters for a known stream are ignored, not merged', () => {
  const { frames } = makeFrames(noise(3000));
  const rx = new Receiver();
  assert.ok(rx.push(frames[0]));
  const [, id, n, len, seed, data] = frames[1].split('/');
  assert.equal(rx.push(`${PROTOCOL}/${id}/${+n + 1}/${len}/${seed}/${data}`), null);
});

test('a completed stream is delivered exactly once', () => {
  const { frames } = makeFrames(noise(3000), { count: 60 });
  const rx = new Receiver(), results = frames.map(f => rx.push(f));
  assert.equal(results.filter(r => r?.container).length, 1);
  assert.equal(rx.push(frames[0]), null);
});

test('a corrupt reconstruction is reported, and the stream can be retried later', () => {
  const e = encoder(noise(1000), 100), rx = new Receiver();
  const forged = s => { const [p, , n, len, seed, data] = e.frame(s).split('/'); return [p, '0123456789ABCDEF', n, len, seed, data].join('/'); };
  let r;
  for (let s = 1; !(r = rx.push(forged(s)))?.error; s++);
  assert.equal(r.error, 'corrupt stream');
  assert.equal(rx.push(forged(1000)), null, 'held for a while');
});

test('hold() makes a stream ignored for a while', () => {
  const { frames } = makeFrames(noise(3000));
  const rx = new Receiver(), { id } = rx.push(frames[0]);
  rx.hold(id, 60_000);
  assert.equal(rx.push(frames[1]), null);
});

test('decoding overhead is close to n symbols', () => {
  for (const n of [8, 40, 150]) {
    const blocks = Array.from({ length: n }, () => noise(16));
    let total = 0;
    const trials = 40;
    for (let t = 0; t < trials; t++) {
      const d = new Decoder(n, n * 16), base = Math.random() * 1e9 | 0;
      let used = 0;
      for (let seed = base; !d.add(seed, (() => {
        const m = mask(seed, n), s = new Uint8Array(16);
        m.forEach((bit, j) => { if (bit) blocks[j].forEach((v, i) => { s[i] ^= v; }); });
        return s;
      })()); seed++) used++;
      used++;
      assert.deepEqual(d.solve(), Uint8Array.from(blocks.flatMap(b => [...b])));
      total += used - n;
    }
    const mean = total / trials;
    console.log(`  n=${n}: mean extra symbols = ${mean.toFixed(2)}`);
    assert.ok(mean < 4, `mean overhead ${mean}`);
  }
});

test('any n + a few frames from an arbitrary start seed decode', () => {
  const container = noise(20000), e = encoder(container, 700), start = Math.random() * 1e9 | 0, rx = new Receiver();
  let r;
  for (let s = start; !(r = rx.push(e.frame(s)))?.container; s += 3);
  assert.deepEqual(r.container, container);
});

test('streams interleave in one receiver without interfering', () => {
  const [x, y] = [noise(5000), noise(7000)];
  const [a, b] = [makeFrames(x, { block: 300, count: 80 }).frames, makeFrames(y, { block: 300, count: 80 }).frames];
  const rx = new Receiver(), got = [];
  for (let i = 0; i < 80; i++) for (const f of [a[i], b[i]]) { const r = rx.push(f); if (r?.container) got.push(r.container); }
  assert.deepEqual(got.sort((p, q) => p.length - q.length), [x, y]);
});

test('blockFor keeps large containers within MAX_N blocks', () => {
  assert.equal(blockFor(1000), 700);
  const len = 4_000_000, b = blockFor(len);
  assert.ok(Math.ceil(len / b) <= MAX_N && b > 700);
});

test('a 4 MiB container in about 3,500 blocks decodes in bounded time', () => {
  const container = noise(1 << 22), e = encoder(container, 1200), d = new Decoder(e.n, e.len);
  assert.ok(e.n > 3400, `n = ${e.n}`);
  const t = performance.now();
  for (let s = 1; !d.add(s, parseFrame(e.frame(s)).data); s++);
  const out = d.solve(), ms = performance.now() - t;
  console.log(`  n=${e.n}: encode + decode ${(ms / 1000).toFixed(1)} s`);
  assert.deepEqual(out, container);
  assert.ok(ms < 120_000);
});

test('with deferSolve, a completed stream is reported ready and reassembled by finish()', () => {
  const container = noise(5000), e = encoder(container, 300), rx = new Receiver({ deferSolve: true });
  let r;
  for (let s = 1; !(r = rx.push(e.frame(s)))?.ready; s++) assert.equal(r?.container, undefined);
  assert.equal(rx.push(e.frame(999)), null, 'no more frames taken once ready');
  assert.deepEqual(rx.finish(r.id).container, container);
  assert.equal(rx.finish(r.id), null, 'finished once');
});
