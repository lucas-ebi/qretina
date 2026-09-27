// What the receiver remembers about signed code: the newest version of each id, which id and
// signer pairs the user approved, and the newest revocation list. Plain data, persisted as JSON.

export type Crl = { number: number; serials: number[] };

export type Trust = {
  versions: Record<string, number>;
  approved: string[]; // "<id> <signer fingerprint>"
  crl: Crl;
  runPrograms: boolean;
};

export const emptyTrust = (): Trust => ({ versions: {}, approved: [], crl: { number: 0, serials: [] }, runPrograms: true });

type Code = { id: string; version: number; signer: string };

const pair = (c: Code) => `${c.id} ${c.signer}`;

// Refuses a version older than the newest accepted for the same id (replay and rollback).
export function checkVersion(t: Trust, c: Code) {
  if (c.version < (t.versions[c.id] ?? 0)) throw new Error(`older version of ${c.id} (${c.version} < ${t.versions[c.id]})`);
}

export const isApproved = (t: Trust, c: Code) => t.approved.includes(pair(c));

// Records that the user ran this program: approves the pair and raises the newest version.
export const approve = (t: Trust, c: Code): Trust => ({
  ...t,
  approved: isApproved(t, c) ? t.approved : [...t.approved, pair(c)],
  versions: { ...t.versions, [c.id]: Math.max(c.version, t.versions[c.id] ?? 0) },
});

// Keeps whichever revocation list has the higher number.
export const withCrl = (t: Trust, crl: Crl): Trust => (crl.number > t.crl.number ? { ...t, crl } : t);

export const resetApprovals = (t: Trust): Trust => ({ ...t, approved: [], versions: {} });
