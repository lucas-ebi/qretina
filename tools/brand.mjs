#!/usr/bin/env node
// Renders the QRetina brand assets from one definition of the mark (the fox eye, minimal: a winged
// upper lid hooding the iris, and catchlights shaped as a QR finder pattern). Run after changing the mark:
//   node tools/brand.mjs
// Writes brand/*.svg (the sources), the app's icons, splash images and mark (app/src/lib/mark.ts),
// and the site's and docs' logos and favicons.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

export const COLORS = {
  iris: '#24557A',   // steel blue
  liner: '#14212B',  // near-black
  pupil: '#081620',
  paper: '#F4F7F9',  // light ground
  night: '#0A1E2C',  // dark ground
  mist: '#EEF3F6',   // liner on dark grounds
};

// The mark in its own coordinates; VIEW frames it tightly.
const VIEW = { x: 10, y: 6, w: 216, h: 84 };

const finder = (x, y, s, fill) => {
  const w = s / 7;
  return `<rect x="${x + w / 2}" y="${y + w / 2}" width="${s - w}" height="${s - w}" fill="none" stroke="${fill}" stroke-width="${w}"/>` +
    `<rect x="${x + 2 * w}" y="${y + 2 * w}" width="${3 * w}" height="${3 * w}" fill="${fill}"/>`;
};

// The mark's elements; `id` keeps gradient and clip ids unique when several marks share a document.
export function markBody({ liner = COLORS.liner, iris = COLORS.iris, id = 'q' } = {}) {
  // Everything below the upper lid: the iris shows under it, with no lower lid.
  const opening = 'M16 68 C 56 36, 142 30, 196 44 L 240 44 L 240 130 L 0 130 L 0 68 Z';
  return `<defs>` +
    `<radialGradient id="${id}-iris" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="${iris}" stop-opacity="0.78"/><stop offset="1" stop-color="${iris}"/></radialGradient>` +
    `<clipPath id="${id}-open"><path d="${opening}"/></clipPath></defs>` +
    `<g transform="rotate(-4 115 58)">` +
    `<g clip-path="url(#${id}-open)">` +
    `<circle cx="106" cy="56" r="27" fill="url(#${id}-iris)"/>` +
    `<circle cx="106" cy="56" r="10.5" fill="${COLORS.pupil}"/>` +
    `<g transform="translate(110 42.5) rotate(-6)">${finder(0, 0, 9, '#FFFFFF')}</g>` +
    `<rect x="96.5" y="62" width="3.2" height="3.2" fill="#FFFFFF" opacity="0.75"/>` +
    `</g>` +
    `<path d="M16 68 C 52 30, 140 20, 192 34 L 222 20 L 198 43 L 196 44 C 142 30, 56 36, 16 68 Z" fill="${liner}"/>` +
    `</g>`;
}

export const markSvg = opts =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" width="${VIEW.w * 4}" height="${VIEW.h * 4}">` +
  `<title>QRetina</title>${markBody(opts)}</svg>\n`;

// A square canvas of `size` with the mark `width` wide in its centre, on `ground` (none: transparent).
function square(size, width, { ground, ...opts } = {}) {
  const k = width / VIEW.w, x = (size - width) / 2 - VIEW.x * k, y = (size - VIEW.h * k) / 2 - VIEW.y * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    (ground ? `<rect width="${size}" height="${size}" fill="${ground}"/>` : '') +
    `<g transform="translate(${x} ${y}) scale(${k})">${markBody(opts)}</g></svg>\n`;
}

const png = svg => new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const out = (path, data) => { mkdirSync(new URL('.', new URL(`../${path}`, import.meta.url)), { recursive: true }); writeFileSync(new URL(`../${path}`, import.meta.url), data); console.error(path); };
  const dark = { liner: COLORS.mist };

  out('brand/mark.svg', markSvg());
  out('brand/mark-dark.svg', markSvg(dark));

  // App icon: iOS masks the corners itself; the mark fills most of the width.
  out('app/assets/icon.png', png(square(1024, 820, { ground: COLORS.paper })));
  // Android adaptive icon: the launcher crops to a circle or squircle of 66% of the canvas.
  out('app/assets/adaptive-icon.png', png(square(1024, 600)));
  out('app/assets/splash.png', png(square(1024, 900)));
  out('app/assets/splash-dark.png', png(square(1024, 900, dark)));

  out('app/src/lib/mark.ts', '// Written by tools/brand.mjs from the mark\'s definition there.\n' +
    `export const MARK = ${JSON.stringify(markSvg())};\nexport const MARK_DARK = ${JSON.stringify(markSvg(dark))};\n`);

  out('site/mark.svg', markSvg());
  out('site/mark-dark.svg', markSvg(dark));
  out('site/icon.png', png(square(512, 410, { ground: COLORS.paper })));
  out('site/favicon.svg', square(64, 60));
  out('docs/assets/logo.svg', square(64, 60, dark));
  out('docs/assets/favicon.svg', square(64, 60));
}
