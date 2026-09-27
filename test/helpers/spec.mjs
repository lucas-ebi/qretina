// Loads spec/qretina.yaml and derives the protocol identifier from its `parameters`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export const spec = parse(readFileSync(new URL('../../spec/qretina.yaml', import.meta.url), 'utf8'));

// RFC 8785 canonical JSON. The spec holds only objects, arrays, strings, booleans and integers, for
// which JSON.stringify already produces the canonical form once object keys are sorted by UTF-16
// code units, which is what the default sort does.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  if (typeof v === 'number' && !Number.isSafeInteger(v)) throw new Error(`non-integer number in the spec: ${v}`);
  return JSON.stringify(v);
}

export const protocolId = (parameters = spec.parameters) =>
  'QRT' + createHash('sha256').update(canonical(parameters)).digest('hex').slice(0, 6).toUpperCase();
