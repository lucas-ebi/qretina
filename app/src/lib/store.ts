// Persistent state in the app's document directory: the library (each item's container as received,
// plus an index of descriptions), the trust state, and broadcast preferences. Group keys are kept
// apart, in the platform's secure storage.
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { b64url, toB64url } from '@resqr/protocol/containers.js';
import type { Meta } from './inbox.ts';
import { emptyTrust, type Trust } from './trust.ts';

const dir = new Directory(Paths.document, 'library');
const json = (name: string) => new File(Paths.document, name);

function read<T>(name: string, fallback: T): T {
  try {
    const f = json(name);
    return f.exists ? { ...fallback, ...JSON.parse(f.textSync()) } : fallback;
  } catch {
    return fallback;
  }
}

function write(name: string, value: unknown) {
  const f = json(name);
  if (!f.exists) f.create();
  f.write(JSON.stringify(value));
}

// ---- Library ------------------------------------------------------------------------

export const loadIndex = (): Meta[] => read<{ items: Meta[] }>('library.json', { items: [] }).items;
export const saveIndex = (items: Meta[]) => write('library.json', { items });

const containerFile = (id: string) => new File(dir, `${id}.bin`);

export function saveContainer(id: string, container: Uint8Array) {
  if (!dir.exists) dir.create({ intermediates: true });
  const f = containerFile(id);
  if (!f.exists) f.create();
  f.write(container);
}

export const loadContainer = (id: string): Uint8Array => containerFile(id).bytesSync();

export function deleteContainer(id: string) {
  const f = containerFile(id);
  if (f.exists) f.delete();
}

// Writes a received file where other apps can read it, for sharing or previewing.
export function exportFile(id: string, name: string, bytes: Uint8Array): File {
  const d = new Directory(Paths.cache, id);
  if (!d.exists) d.create({ intermediates: true });
  const f = new File(d, name.replace(/[/\\]/g, '_') || 'file');
  if (!f.exists) f.create();
  f.write(bytes);
  return f;
}

// ---- Trust and preferences ----------------------------------------------------------------

export const loadTrust = (): Trust => read('trust.json', emptyTrust());
export const saveTrust = (t: Trust) => write('trust.json', t);

export type TxPrefs = { density: number; fps: number; codes: 1 | 2; intro: number };
export const defaultTx: TxPrefs = { density: 700, fps: 15, codes: 1, intro: 3 };
export const loadTx = (): TxPrefs => read('broadcast.json', defaultTx);
export const saveTx = (p: TxPrefs) => write('broadcast.json', p);

// ---- Group keys ----------------------------------------------------------------------

export type GroupKey = { label: string; key: Uint8Array };

export async function loadKeyring(): Promise<GroupKey[]> {
  try {
    const raw = await SecureStore.getItemAsync('keyring');
    return raw ? (JSON.parse(raw) as { label: string; key: string }[]).map(k => ({ label: k.label, key: b64url(k.key) })) : [];
  } catch {
    return [];
  }
}

export const saveKeyring = (keys: GroupKey[]) =>
  SecureStore.setItemAsync('keyring', JSON.stringify(keys.map(k => ({ label: k.label, key: toB64url(k.key) }))));
