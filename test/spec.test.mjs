import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_B, MAX_LEN, MAX_N, PROTOCOL, Receiver, b45encode, encoder, hex, mask, streamId } from '../protocol/fountain.js';
import { CODE, DOMAIN, FILE, FILE_STORED, TYPES } from '../protocol/containers.js';
import { canonical, protocolId, spec } from './helpers/spec.mjs';
import { enc } from './helpers/stream.mjs';

const { parameters: p, vectors: v } = spec;
const unhex = s => Uint8Array.from(s.match(/../g), x => parseInt(x, 16));

test('PROTOCOL is derived from the spec parameters', () => {
  assert.equal(protocolId(), PROTOCOL, 'spec/resqr.yaml parameters changed: set PROTOCOL to the new identifier');
});

test('the identifier covers every parameter but nothing else', () => {
  const changed = structuredClone(p);
  changed.frame.limits['max-n']++;
  assert.notEqual(protocolId(changed), PROTOCOL);
  assert.equal(canonical({ b: 1, a: [2, 'x'] }), '{"a":[2,"x"],"b":1}');
});

test('the code implements the limits, tags, types and signature domain of the spec', () => {
  assert.deepEqual([MAX_N, MAX_LEN, MAX_B], [p.frame.limits['max-n'], p.frame.limits['max-len'], p.frame.limits['max-block']]);
  const tags = Object.fromEntries(p.containers.tags.map(t => [t.name, t]));
  assert.deepEqual([tags.code.tag, tags.file.tag, tags['file-stored'].tag], [CODE, FILE, FILE_STORED]);
  assert.deepEqual(tags.code.type, TYPES);
  assert.deepEqual(DOMAIN, enc(tags.code.domain));
});

test('vectors: mask and base45', () => {
  assert.equal(mask(v.mask.seed, v.mask.n).join(''), v.mask.bits);
  for (const { text, base45 } of v.base45) assert.equal(b45encode(enc(text)), base45);
});

test('vectors: a whole stream, frame by frame', () => {
  const container = unhex(v.stream.container), e = encoder(container, v.stream.block);
  assert.equal(streamId(container), v.stream['stream-id']);
  v.stream.frames.forEach((f, i) => assert.equal(e.frame(i + 1), f));
  const rx = new Receiver();
  let r;
  for (let s = 1; !(r = rx.push(e.frame(s)))?.container; s++);
  assert.equal(hex(r.container), v.stream.container);
});
