#!/usr/bin/env node
// ResQR command line: keys, signing, and frames or looping GIFs for broadcasting from a computer.
//
//   node tools/resqr.mjs keygen [signing-key.json | -]
//   node tools/resqr.mjs sign <file> --id <name> [--type html|json] [--version N] [--cert pub.cert] [key] [output]
//   node tools/resqr.mjs file <file> [--name N] [--mime M] [output]
//   node tools/resqr.mjs cert --pub <public key> --name <publisher> --ns <id prefix> [--days 365] [--serial N] [key] --out pub.cert
//   node tools/resqr.mjs crl --number N [--revoke serial,serial...] [key] [output]
//   node tools/resqr.mjs key [--passphrase P] [--label L] --out group.resqrkey
//
//   key:    [--key signing-key.json]
//   output: [--private group.resqrkey] [--out container.bin] [--block 700] [--frames N]
//           [--gif out.gif [--scale 8] [--fps 10] [--ecc L] [--intro 3] [--link HTTPS://RESQR.APP/SCAN]]
//
// `keygen -` prints the private key to stdout (to pipe into `gh secret set`) and the public key to
// stderr. Signing commands read the private key from --key, else RESQR_SIGNING_KEY (used by CI),
// else ./signing-key.json. `cert` and `crl` need a root key (one listed in TRUSTED_KEYS); `sign`
// takes a root key, or a publisher key with --cert. --out writes the container itself; otherwise
// frames are printed one per line, or with --gif written as a GIF that loops forever, each loop
// starting with --intro seconds (0 to 9) of countdown QR codes of --link, which open the app.
//
// Output is sealed with the app key from RESQR_APP_KEY (base64url, 32 bytes), as the app seals
// everything it sends; --private first seals it with a group key made by `key`, which receivers
// must already hold.
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { b64url, issueCert, issueCrl, keyFromPassphrase, keyId, packFile, seal, signCode, toB64url } from '../protocol/containers.js';
import { blockFor, encoder } from '../protocol/fountain.js';
import { encodeGif, renderFrames, renderIntro } from '../protocol/gif.js';

// Upper case keeps the link in the QR alphanumeric mode, which makes the countdown codes smaller.
export const LINK = 'HTTPS://RESQR.APP/SCAN';

const MIME = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html', json: 'application/json',
  pdf: 'application/pdf', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4',
};
export const mimeOf = name => MIME[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream';

// Keys are JWKs (OKP, Ed25519), the format WebCrypto exports.
export function keygen() {
  const { secretKey, publicKey } = ed25519.keygen();
  const x = toB64url(publicKey);
  return { jwk: { kty: 'OKP', crv: 'Ed25519', d: toB64url(secretKey), x }, publicKey: x };
}

export const sign = (jwk, opts) => signCode(b64url(jwk.d), opts);

// Key files hold a sealing key shared in advance: { "label": "...", "key": "<base64url>" }.
export function keyFile({ passphrase, label }) {
  const key = passphrase ? keyFromPassphrase(passphrase) : crypto.getRandomValues(new Uint8Array(32));
  return { label: label ?? `key ${keyId(key).slice(0, 4)}`, key: toB64url(key) };
}

async function readSealKey(file) {
  const key = b64url(JSON.parse(await readFile(file, 'utf8')).key);
  if (key.length !== 32) throw new Error(`${file}: a sealing key is 32 bytes`);
  return key;
}

function appKey() {
  if (!process.env.RESQR_APP_KEY) return null;
  const key = b64url(process.env.RESQR_APP_KEY);
  if (key.length !== 32) throw new Error('RESQR_APP_KEY must be 32 bytes, base64url');
  return key;
}

async function readKey(opt) {
  const fromEnv = !opt.key && process.env.RESQR_SIGNING_KEY;
  return JSON.parse(fromEnv || await readFile(opt.key ?? 'signing-key.json', 'utf8'));
}

// Symbols for seeds start .. start+count-1 (default: enough for a looping GIF). Any n + 2 or so
// distinct ones decode.
export function makeFrames(container, { block = 700, count, start = 1 } = {}) {
  const e = encoder(container, blockFor(container.length, block));
  count ??= Math.ceil(e.n * 1.5) + 8;
  return { ...e, frames: Array.from({ length: count }, (_, i) => e.frame(start + i)) };
}

// A looping GIF of the frames, each loop preceded by `intro` seconds of countdown to `link`.
export function makeGif(frames, { link = LINK, intro = 3, scale = 8, fps = 10, ecc = 'L' } = {}) {
  const img = renderFrames(frames, { scale, ecc });
  const lead = intro ? renderIntro(link, Array.from({ length: intro }, (_, i) => intro - i), img.width) : [];
  const gif = encodeGif({ ...img, frames: [...lead, ...img.frames] }, { delay: Math.round(100 / fps), delays: lead.map(() => 100) });
  return { gif, img };
}

async function output(container, opt) {
  const app = appKey();
  if (opt.private) container = seal(await readSealKey(opt.private), container);
  if (app) container = seal(app, container);
  else console.error('warning: not sealed with the app key (RESQR_APP_KEY is not set)');
  if (opt.intro !== undefined && !/^[0-9]$/.test(opt.intro)) throw new Error('--intro must be a whole number of seconds from 0 to 9');
  if (opt.link !== undefined && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(opt.link)) throw new Error('--link must be a URL');
  if (opt.out) {
    await writeFile(opt.out, container);
    return console.error(`${opt.out}: ${container.length} B`);
  }
  const { id, n, b, len, frames } = makeFrames(container, { block: +opt.block || undefined, count: +opt.frames || undefined });
  console.error(`stream ${id}: ${len} B, ${n} blocks x ${b} B, ${frames.length} frames`);
  if (!opt.gif) return console.log(frames.join('\n'));
  const intro = opt.intro === undefined ? 3 : +opt.intro, link = opt.link ?? LINK;
  const { gif, img } = makeGif(frames, { link, intro, scale: +opt.scale || 8, fps: +opt.fps || 10, ecc: opt.ecc ?? 'L' });
  await writeFile(opt.gif, gif);
  console.error(`${opt.gif}: ${img.width}x${img.height} px, QR version ${img.version}, ${frames.length} data frames` +
    (intro ? ` after a ${intro} s countdown to ${link}` : '') + `, ${(gif.length / 1024).toFixed(0)} KiB`);
}

async function main([cmd, ...argv]) {
  const opt = {}, pos = [];
  for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? opt[argv[i].slice(2)] = argv[++i] : pos.push(argv[i]);

  if (cmd === 'keygen') {
    const file = pos[0] ?? 'signing-key.json', { jwk, publicKey } = keygen();
    if (file === '-') {
      process.stdout.write(JSON.stringify(jwk));
    } else {
      await writeFile(file, JSON.stringify(jwk), { mode: 0o600 });
      console.error(`Private key written to ${file} (keep it secret; it is gitignored).`);
    }
    console.error(`Public key (add it to the TRUSTED_KEYS variable):\n  ${publicKey}`);
  } else if (cmd === 'sign' && pos[0] && opt.id) {
    const jwk = await readKey(opt), type = opt.type ?? pos[0].split('.').pop();
    const version = opt.version === undefined ? undefined : +opt.version;
    const cert = opt.cert ? new Uint8Array(await readFile(opt.cert)) : undefined;
    await output(sign(jwk, { type, id: opt.id, payload: await readFile(pos[0]), version, cert }), opt);
  } else if (cmd === 'cert' && opt.pub && opt.name && opt.ns && opt.out) {
    const days = opt.days === undefined ? 365 : +opt.days, now = Math.floor(Date.now() / 1000);
    if (!(days > 0 && days <= 3650)) throw new Error('--days must be from 1 to 3650');
    const serial = opt.serial === undefined ? undefined : +opt.serial;
    const cert = issueCert(b64url((await readKey(opt)).d), { publicKey: opt.pub, name: opt.name, namespace: opt.ns, notBefore: now, notAfter: now + Math.round(days * 86400), serial });
    await writeFile(opt.out, cert);
    console.error(`${opt.out}: ${opt.name} may publish ids beginning with ${opt.ns} for ${days} days`);
  } else if (cmd === 'key' && opt.out) {
    const k = keyFile({ passphrase: opt.passphrase, label: opt.label });
    await writeFile(opt.out, JSON.stringify(k), { mode: 0o600 });
    console.error(`${opt.out}: "${k.label}", key id ${keyId(b64url(k.key))}`);
  } else if (cmd === 'crl' && opt.number) {
    const serials = opt.revoke ? opt.revoke.split(',').map(Number) : [];
    await output(issueCrl(b64url((await readKey(opt)).d), { number: +opt.number, serials }), opt);
  } else if (cmd === 'file' && pos[0]) {
    const name = opt.name ?? basename(pos[0]);
    await output(packFile(name, opt.mime ?? mimeOf(name), await readFile(pos[0])), opt);
  } else {
    console.error('usage: resqr.mjs keygen [file | -]\n' +
      '       resqr.mjs sign <file> --id <name> [--type html|json] [--version N] [--cert pub.cert] [key] [output]\n' +
      '       resqr.mjs file <file> [--name N] [--mime M] [output]\n' +
      '       resqr.mjs cert --pub <public key> --name <publisher> --ns <id prefix> [--days 365] [--serial N] [key] --out pub.cert\n' +
      '       resqr.mjs crl --number N [--revoke serial,serial...] [key] [output]\n' +
      '       resqr.mjs key [--passphrase P] [--label L] --out group.resqrkey\n' +
      'key:    [--key signing-key.json]\n' +
      'output: [--private group.resqrkey] [--out file] [--block B] [--frames N] [--gif out.gif [--scale S] [--fps F] [--ecc L|M|Q|H] [--intro 0-9] [--link URL]]');
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error('error: ' + e.message); process.exit(1); });
}
