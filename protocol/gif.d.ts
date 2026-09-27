export type Image = { width: number; height: number; frames: Uint8Array[]; version?: number };
export function renderFrames(texts: string[], options?: { scale?: number; ecc?: 'L' | 'M' | 'Q' | 'H' }): Image & { version: number };
export function renderIntro(url: string, digits: number[], side: number, options?: { ecc?: 'L' | 'M' | 'Q' | 'H' }): Uint8Array[];
export function encodeGif(image: Image, options?: { delay?: number; delays?: number[] }): Uint8Array;
