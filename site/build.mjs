#!/usr/bin/env node
// Assembles the qretina.app site in the given directory: the download page, and the association
// files that let https://qretina.app/SCAN open the installed app on iOS and Android. They need:
//   APPLE_TEAM_ID        the Apple developer team id (10 characters)
//   ANDROID_CERT_SHA256  SHA-256 fingerprints of the app signing certificates, comma-separated
// Without them the association files are left out, and the link always opens the download page.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: build.mjs <output directory>');
const here = new URL('.', import.meta.url).pathname, wk = join(out, '.well-known');
mkdirSync(wk, { recursive: true });
for (const f of ['index.html', 'icon.png']) copyFileSync(join(here, f), join(out, f));
writeFileSync(join(out, '.nojekyll'), ''); // GitHub Pages would otherwise skip .well-known
writeFileSync(join(out, 'CNAME'), 'qretina.app\n');

const team = process.env.APPLE_TEAM_ID, certs = (process.env.ANDROID_CERT_SHA256 ?? '').split(',').filter(Boolean);
if (team) {
  if (!/^[A-Z0-9]{10}$/.test(team)) throw new Error('APPLE_TEAM_ID must be 10 characters');
  const aasa = { applinks: { details: [{ appIDs: [`${team}.app.qretina`], components: [{ '/': '/SCAN' }, { '/': '/scan' }] }] } };
  writeFileSync(join(wk, 'apple-app-site-association'), JSON.stringify(aasa));
}
if (certs.length) {
  for (const c of certs) if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(c)) throw new Error(`not a SHA-256 fingerprint: ${c}`);
  const links = [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'app.qretina', sha256_cert_fingerprints: certs } }];
  writeFileSync(join(wk, 'assetlinks.json'), JSON.stringify(links));
}
console.error(`site in ${out}: ${team ? 'iOS' : 'no iOS'} and ${certs.length ? 'Android' : 'no Android'} association`);
