export const CODE: 1, FILE: 2, FILE_STORED: 3, CERT: 4, CRL: 5, SEALED: 6;
export const TYPES: ['html', 'json'];
export const DOMAIN: Uint8Array, CERT_DOMAIN: Uint8Array, CRL_DOMAIN: Uint8Array;

export function concat(...parts: ArrayLike<number>[]): Uint8Array;
export function deflate(bytes: Uint8Array): Uint8Array;
export function inflate(bytes: Uint8Array): Uint8Array;
export function b64url(s: string): Uint8Array;
export function toB64url(bytes: Uint8Array): string;

export type Key = { fp: string; key: Uint8Array };
export function loadKey(b64: string): Key;

export type Cert = Key & { serial: number; notBefore: number; notAfter: number; namespace: string; name: string; root: string };
export type Crl = { number: number; serials: number[] };
export type Code = { type: 'html' | 'json'; id: string; version: number; payload: Uint8Array; signer: string; publisher?: Cert };
export type FileItem = { mime: string; name: string; bytes: Uint8Array };

export function issueCert(rootSecret: Uint8Array, o: { publicKey: string | Uint8Array; name: string; namespace: string; notBefore: number; notAfter: number; serial?: number }): Uint8Array;
export function openCert(container: Uint8Array, roots: Key[]): Cert;
export function issueCrl(rootSecret: Uint8Array, o: { number: number; serials?: number[] }): Uint8Array;
export function openCrl(container: Uint8Array, roots: Key[]): Crl;

export type Trust = { roots?: Key[]; revoked?: Iterable<number>; now?: number };
export function signCode(secretKey: Uint8Array, o: { type: string; id: string; payload: Uint8Array; version?: number; cert?: Uint8Array }): Uint8Array;
export function openCode(container: Uint8Array, trust?: Trust): Code;

export function packFile(name: string, mime: string, bytes: Uint8Array): Uint8Array;
export function openFile(container: Uint8Array): FileItem;

export function keyId(key: Uint8Array): string;
export function keyFromPassphrase(passphrase: string): Uint8Array;
export function seal(key: Uint8Array, inner: Uint8Array): Uint8Array;
export function unseal(container: Uint8Array, keys: Uint8Array[]): Uint8Array | null;

export type Opened = { code?: Code; file?: FileItem; cert?: Cert; crl?: Crl; locked?: string; sealed?: string[] };
export function openContainer(container: Uint8Array, options?: Trust & { keys?: Uint8Array[]; accept?: (code: Code) => void }): Opened;
