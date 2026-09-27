import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL } from '../protocol/fountain.js';
import { loadKey } from '../protocol/containers.js';
import { encodeGif, renderFrames, renderIntro } from '../protocol/gif.js';
import { LINK, keygen, makeFrames, sign } from '../tools/resqr.mjs';
import { parseGif, readQr } from './helpers/gif.mjs';
import { dec, enc, receive } from './helpers/stream.mjs';

const URL_ = LINK;
const F = `${PROTOCOL}/0123456789ABCDEF/9/999`;
const source = '<!doctype html>' + Array.from({ length: 300 }, (_, i) => `<p>${i * 7919 % 1000}</p>`).join('\n');

test('GIF structure: size, palette, looping and per-frame delays', () => {
  const img = renderFrames([`${F}/1/HELLO`, `${F}/2/WORLD`], { scale: 4 });
  const intro = renderIntro(URL_, [3, 2, 1], img.width);
  const gif = parseGif(encodeGif({ ...img, frames: [...intro, ...img.frames] }, { delay: 17, delays: [100, 100, 100] }));
  assert.deepEqual([gif.width, gif.height, gif.loops], [img.width, img.height, true]);
  assert.deepEqual(gif.palette, [[255, 255, 255], [0, 0, 0]]);
  assert.deepEqual(gif.frames.map(f => f.delay), [100, 100, 100, 17, 17]);
});

test('the GIF encoder is lossless: decoding every frame gives back the exact pixels', () => {
  const texts = [`${F}/1/HELLO`, `${F}/2/` + 'ABC 123 $%*+-./:'.repeat(6)];
  const img = renderFrames(texts, { scale: 5 });
  const intro = renderIntro(URL_, [5, 0], img.width);
  const all = [...intro, ...img.frames];
  const gif = parseGif(encodeGif({ ...img, frames: all }));
  gif.frames.forEach((f, i) => assert.deepEqual(f.pixels, all[i], `frame ${i}`));
});

test('all frames share one size even when their texts differ in length', () => {
  const img = renderFrames([`${F}/1/A`, `${F}/2/` + 'B'.repeat(200)], { scale: 3 });
  assert.equal(img.frames.length, 2);
  assert.ok(img.frames.every(f => f.length === img.width * img.height));
});

test('every countdown digit still scans as the link', () => {
  const side = 552;
  const frames = renderIntro(URL_, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], side);
  frames.forEach((px, digit) => assert.equal(readQr(px, side, side), URL_, `digit ${digit}`));
});

test('a signed stream survives the trip through the GIF: frames scan, verify and open', () => {
  const { jwk, publicKey } = keygen();
  const container = sign(jwk, { type: 'html', id: 'demo', payload: enc(source), version: 5 });
  const { frames } = makeFrames(container, { block: 200, count: 60 });
  const img = renderFrames(frames, { scale: 5 });
  const intro = renderIntro(URL_, [3, 2, 1], img.width);
  const gif = parseGif(encodeGif({ ...img, frames: [...intro, ...img.frames] }));

  const scanned = gif.frames.map(f => readQr(f.pixels, gif.width, gif.height));
  assert.deepEqual(scanned.slice(0, 3), [URL_, URL_, URL_]);
  assert.deepEqual(scanned.slice(3), frames, 'data frames scan back to exactly what the encoder produced');

  // The link frames are ignored, and a third of the rest is lost.
  const r = receive(scanned.filter((_, i) => i % 3 !== 1), { roots: [loadKey(publicKey)] });
  assert.ok(r?.code, JSON.stringify(r));
  assert.deepEqual([r.code.id, r.code.version, dec(r.code.payload)], ['demo', 5, source]);
});
