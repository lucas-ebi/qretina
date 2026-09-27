export const PROTOCOL: string;
export const MAX_N: number, MAX_LEN: number, MAX_B: number;

export function mulberry32(seed: number): () => number;
export function maskWords(seed: number, n: number): Uint32Array;
export function mask(seed: number, n: number): Uint8Array;
export function b45encode(bytes: Uint8Array): string;
export function b45decode(s: string): Uint8Array;
export function hex(bytes: Uint8Array): string;
export function streamId(container: Uint8Array): string;

export type Frame = { id: string; n: number; len: number; seed: number; data: Uint8Array };
export function parseFrame(raw: string): Frame | null;
export function frame(id: string, n: number, len: number, seed: number, data: Uint8Array): string;

export type Encoder = { id: string; n: number; b: number; len: number; frame(seed: number): string };
export function encoder(container: Uint8Array, block?: number): Encoder;
export function blockFor(len: number, preferred?: number): number;

export class Decoder {
  constructor(n: number, len: number);
  n: number;
  len: number;
  rank: number;
  add(seed: number, data: Uint8Array): boolean;
  solve(): Uint8Array;
}

export type Progress = { id: string; n: number; len: number; rank: number };
export type Pushed = Progress & { container?: Uint8Array; error?: string; ready?: true };

export class Receiver {
  constructor(options?: { maxStreams?: number; deferSolve?: boolean });
  hold(id: string, ms: number): void;
  push(raw: string): Pushed | null;
  finish(id: string): Pushed | null;
}
