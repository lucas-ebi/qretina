#!/usr/bin/env node
// ResQR command line: keys, signing, and frames or looping GIFs for broadcasting from a computer.
//
//   node tools/resqr.mjs keygen [signing-key.json | -]
//   node tools/resqr.mjs sign <file> --id <name> [--type html|json] [--version N] [--key signing-key.json] [output]
//   node tools/resqr.mjs file <file> [--name N] [--mime M] [output]
//
//   output: [--block 700] [--frames N]
//           [--gif out.gif [--scale 8] [--fps 10] [--ecc L] [--intro 3] [--link HTTPS://RESQR.APP/SCAN]]
//
// `keygen -` prints the private key to stdout (to pipe into `gh secret set`) and the public key to
// stderr. `sign` reads the private key from --key, else RESQR_SIGNING_KEY (used by CI), else
// ./signing-key.json. Without --gif, frames are printed one per line. A GIF loops forever; each loop
// starts with --intro seconds (0 to 9) of countdown QR codes of --link, which open the app.
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { b64url, packFile, signCode, toB64url } from '../protocol/containers.js';
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
  if (opt.intro !== undefined && !/^[0-9]$/.test(opt.intro)) throw new Error('--intro must be a whole number of seconds from 0 to 9');
  if (opt.link !== undefined && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(opt.link)) throw new Error('--link must be a URL');
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
    const fromEnv = !opt.key && process.env.RESQR_SIGNING_KEY;
    const jwk = JSON.parse(fromEnv || await readFile(opt.key ?? 'signing-key.json', 'utf8'));
    const type = opt.type ?? pos[0].split('.').pop();
    const version = opt.version === undefined ? undefined : +opt.version;
    await output(sign(jwk, { type, id: opt.id, payload: await readFile(pos[0]), version }), opt);
  } else if (cmd === 'file' && pos[0]) {
    const name = opt.name ?? basename(pos[0]);
    await output(packFile(name, opt.mime ?? mimeOf(name), await readFile(pos[0])), opt);
  } else {
    console.error('usage: resqr.mjs keygen [file | -]\n' +
      '       resqr.mjs sign <file> --id <name> [--type html|json] [--version N] [--key f] [output]\n' +
      '       resqr.mjs file <file> [--name N] [--mime M] [output]\n' +
      'output: [--block B] [--frames N] [--gif out.gif [--scale S] [--fps F] [--ecc L|M|Q|H] [--intro 0-9] [--link URL]]');
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error('error: ' + e.message); process.exit(1); });
}
