#!/usr/bin/env node
// Writes test/vectors/streams.txt: streams produced by the reference implementation, for other
// implementations (native/core) to reproduce frame by frame and to decode. Deterministic, so the
// file can be checked for being current (test/native.test.mjs). One record per line:
//   case <name> <block>        a new stream
//   container <hex>            its container
//   frame <seed> <text>        a frame the encoder must produce exactly
//   feed <text>                a frame for the decoder, in order (with losses and repeats)
//   mask <seed> <n> <bits>     a mask
//   sha256 <hex in> <hex out>  a digest
//   reject <text>              a frame that must be rejected
import { writeFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { PROTOCOL, encoder, hex, mask, mulberry32 } from '../protocol/fountain.js';

export function vectors() {
  const out = [], rng = mulberry32(2024);
  const bytes = n => Uint8Array.from({ length: n }, () => rng() & 255);
  const text = n => new TextEncoder().encode('ResQR carries files across the gap. '.repeat(Math.ceil(n / 36)).slice(0, n));

  for (const [seed, n] of [[12345, 64], [1, 1], [7, 33], [4294967295, 100]]) out.push(`mask ${seed} ${n} ${mask(seed, n).join('')}`);
  for (const n of [0, 3, 55, 64, 1000]) { const b = bytes(n); out.push(`sha256 ${hex(b) || '-'} ${hex(sha256(b))}`); }

  const cases = [['tiny', bytes(2), 1], ['odd', bytes(1001), 100], ['text', text(5000), 700], ['wide', bytes(20000), 2900], ['many', bytes(24000), 300]];
  for (const [name, container, block] of cases) {
    const e = encoder(container, block);
    out.push(`case ${name} ${block}`, `container ${hex(container)}`);
    for (const s of [0, 1, 2, 3, 4294967295]) out.push(`frame ${s} ${e.frame(s)}`);
    // A reception: a random start, a third lost, some repeats, until well past n.
    let s = rng();
    for (let i = 0; i < e.n * 2 + 10; i++, s = (s + 1) >>> 0) {
      if (rng() % 3 === 0) continue;
      out.push(`feed ${e.frame(s)}`);
      if (rng() % 10 === 0) out.push(`feed ${e.frame(s)}`);
    }
  }

  const ok = `${PROTOCOL}/0123456789ABCDEF`;
  for (const r of [`${ok}/0/100/1/AA`, `${ok}/4097/100000/1/AA`, `${ok}/4/100/1/AA`, `${ok}/4/99999999/1/AA`, `${ok}/4/100/4294967296/AA`,
    `${ok}/10/9/1/AA`, `${ok}/1/100000/1/AA`, `${PROTOCOL}/short/4/100/1/AA`, 'garbage', 'HTTPS://RESQR.APP/SCAN', `RQR000000/0123456789ABCDEF/1/4/1/000000`,
    `${ok}/1/2/1/:::`, `${ok}/1/2/1/GGW`]) out.push(`reject ${r}`);
  return out.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  writeFileSync(new URL('../test/vectors/streams.txt', import.meta.url), vectors());
  console.error('wrote test/vectors/streams.txt');
}
