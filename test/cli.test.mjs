import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PROTOCOL } from '../protocol/fountain.js';
import { b64url, keyFromPassphrase, keyId, loadKey, toB64url } from '../protocol/containers.js';
import { LINK, makeFrames } from '../tools/qretina.mjs';
import { parseGif, readQr } from './helpers/gif.mjs';
import { receive } from './helpers/stream.mjs';

const run = promisify(execFile);
const cli = new URL('../tools/qretina.mjs', import.meta.url).pathname;
const snake = new URL('../examples/snake.html', import.meta.url).pathname;
const node = (args, env = {}, cwd) => run(process.execPath, [cli, ...args], { env: { ...process.env, ...env }, cwd });
const tmp = () => mkdtemp(join(tmpdir(), 'qretina-cli-'));
const makeFramesOf = bytes => makeFrames(new Uint8Array(bytes)).frames;

test('keygen - prints the private key to stdout, the public key to stderr, and writes no file', async () => {
  const cwd = await tmp();
  const { stdout, stderr } = await node(['keygen', '-'], {}, cwd);
  const jwk = JSON.parse(stdout);
  assert.ok(jwk.d && jwk.x, 'private JWK on stdout');
  assert.ok(stderr.includes(jwk.x), 'public key on stderr');
  assert.ok(!stderr.includes(jwk.d), 'private key never on stderr');
  assert.deepEqual(await readdir(cwd), []);
});

test('sign uses QRETINA_SIGNING_KEY (as in CI), and the frames decode under the public key', async () => {
  const { stdout: key } = await node(['keygen', '-']);
  const { stdout, stderr: log } = await node(['sign', snake, '--id', 'snake', '--version', '7'], { QRETINA_SIGNING_KEY: key });
  assert.ok(!log.includes(JSON.parse(key).d), 'log never contains the private key');
  const r = receive(stdout.trim().split('\n'), { roots: [loadKey(JSON.parse(key).x)] });
  assert.deepEqual([r?.code?.id, r?.code?.version, r?.code?.type], ['snake', 7, 'html'], JSON.stringify(r));
});

test('sign with no key anywhere fails instead of signing with something else', async () => {
  await assert.rejects(node(['sign', snake, '--id', 'snake'], { QRETINA_SIGNING_KEY: '' }, await tmp()), /ENOENT|signing-key/);
});

test('file packs any file, guessing its type from the name', async () => {
  const dir = await tmp(), path = join(dir, 'notes.txt');
  await writeFile(path, 'water point at the school\n'.repeat(50));
  const { stdout } = await node(['file', path]);
  const r = receive(stdout.trim().split('\n'));
  assert.deepEqual([r?.file?.name, r?.file?.mime], ['notes.txt', 'text/plain']);
  assert.equal(new TextDecoder().decode(r.file.bytes), 'water point at the school\n'.repeat(50));
});

test('--gif writes a looping GIF that opens with a countdown to the app link', async () => {
  const dir = await tmp();
  const { stderr } = await node(['file', snake, '--gif', join(dir, 's.gif'), '--scale', '5']);
  assert.match(stderr, /3 s countdown/);
  const gif = parseGif(new Uint8Array(await readFile(join(dir, 's.gif'))));
  assert.ok(gif.loops && gif.frames.length > 3);
  assert.deepEqual(gif.frames.slice(0, 3).map(f => f.delay), [100, 100, 100]);
  assert.equal(readQr(gif.frames[0].pixels, gif.width, gif.height), LINK);
  assert.ok(readQr(gif.frames[3].pixels, gif.width, gif.height).startsWith(PROTOCOL + '/'));
  assert.deepEqual(await readdir(dir), ['s.gif']);
});

test('--intro 0 leaves the countdown out, and --link changes it', async () => {
  const dir = await tmp();
  await node(['file', snake, '--gif', join(dir, 'a.gif'), '--intro', '0']);
  let gif = parseGif(new Uint8Array(await readFile(join(dir, 'a.gif'))));
  assert.ok(readQr(gif.frames[0].pixels, gif.width, gif.height).startsWith(PROTOCOL + '/'));
  await node(['file', snake, '--gif', join(dir, 'b.gif'), '--intro', '2', '--link', 'qretina://scan']);
  gif = parseGif(new Uint8Array(await readFile(join(dir, 'b.gif'))));
  assert.equal(readQr(gif.frames[1].pixels, gif.width, gif.height), 'qretina://scan');
});

test('--gif options are validated before anything is written', async () => {
  const dir = await tmp();
  const gif = extra => node(['file', snake, '--gif', join(dir, 'x.gif'), ...extra]);
  await assert.rejects(gif(['--link', 'not a url']), /--link must be a URL/);
  for (const bad of ['x', '10', '-1', '2.5', '']) await assert.rejects(gif(['--intro', bad]), /--intro must be/, `intro ${JSON.stringify(bad)}`);
  assert.deepEqual(await readdir(dir), []);
});

test('publisher flow: a root certifies a publisher, whose programs open until revoked', async () => {
  const dir = await tmp(), rootKey = join(dir, 'root.json'), pubKey = join(dir, 'pub.json'), cert = join(dir, 'pub.cert');
  await node(['keygen', rootKey]);
  const { stderr } = await node(['keygen', pubKey]);
  const pub = stderr.trim().split(/\s+/).pop();
  await node(['cert', '--pub', pub, '--name', 'Relief Org', '--ns', 'org.relief.', '--days', '30', '--serial', '5', '--key', rootKey, '--out', cert]);
  const roots = [loadKey(JSON.parse(await readFile(rootKey, 'utf8')).x)];

  const { stdout } = await node(['sign', snake, '--id', 'org.relief.snake', '--cert', cert, '--key', pubKey]);
  const r = receive(stdout.trim().split('\n'), { roots });
  assert.deepEqual([r?.code?.id, r?.code?.publisher?.name], ['org.relief.snake', 'Relief Org'], JSON.stringify(r?.error));

  const { crl } = receive((await node(['crl', '--number', '1', '--revoke', '5', '--key', rootKey])).stdout.trim().split('\n'), { roots });
  assert.deepEqual(crl, { number: 1, serials: [5] });
  assert.match(receive(stdout.trim().split('\n'), { roots, revoked: crl.serials }).error, /revoked/);
  await assert.rejects(node(['sign', snake, '--id', 'org.other.snake', '--cert', cert, '--key', pubKey, '--out', join(dir, 'x.bin')]).then(async () => {
    throw new Error(receive(makeFramesOf(await readFile(join(dir, 'x.bin'))), { roots }).error);
  }), /may not publish/);
});

test('with QRETINA_APP_KEY, output is sealed; --private adds a group layer only key holders open', async () => {
  const dir = await tmp(), group = join(dir, 'g.qretinakey'), app = crypto.getRandomValues(new Uint8Array(32));
  await node(['key', '--label', 'Shelter 4', '--out', group]);
  const env = { QRETINA_APP_KEY: toB64url(app) }, groupKey = b64url(JSON.parse(await readFile(group, 'utf8')).key);
  const notes = join(dir, 'n.txt');
  await writeFile(notes, 'roll call at 8');
  const plain = (await node(['file', notes], env)).stdout.trim().split('\n');
  assert.equal(receive(plain, { keys: [app] }).file.name, 'n.txt');
  assert.ok(receive(plain, {}).locked, 'without the app key, only a key id');
  const priv = (await node(['file', notes, '--private', group], env)).stdout.trim().split('\n');
  assert.equal(receive(priv, { keys: [app, groupKey] }).file.name, 'n.txt');
  assert.equal(receive(priv, { keys: [app] }).locked, keyId(groupKey));
  const { stderr } = await node(['file', notes]);
  assert.match(stderr, /not sealed with the app key/);
});

test('key --passphrase gives the same key on every machine', async () => {
  const dir = await tmp();
  for (const f of ['a', 'b']) await node(['key', '--passphrase', 'river bend', '--out', join(dir, f)]);
  const [a, b] = await Promise.all(['a', 'b'].map(async f => JSON.parse(await readFile(join(dir, f), 'utf8')).key));
  assert.equal(a, b);
  assert.equal(a, toB64url(keyFromPassphrase('river bend')));
});
