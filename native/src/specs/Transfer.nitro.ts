// The native transfer layer (core/qretina.hpp) as seen from JavaScript. `npm run codegen` turns
// this into the C++ interfaces that cpp/ implements.
import type { HybridObject } from 'react-native-nitro-modules'

type Native = { ios: 'c++'; android: 'c++' }

export type PushStatus = 'ignored' | 'progress' | 'ready' | 'corrupt'

// What one scanned string did: 'ready' means the stream is complete; call finish() to reassemble it.
export interface Pushed {
  status: PushStatus
  id: string
  n: number
  len: number
  rank: number
}

export interface Assembled {
  id: string
  container?: ArrayBuffer
  error?: string
}

export interface TransferReceiver extends HybridObject<Native> {
  push(frame: string, now: number): Pushed
  // Reassembles a stream reported ready, on a background thread.
  finish(id: string): Promise<Assembled>
  hold(id: string, until: number): void
}

export interface TransferEncoder extends HybridObject<Native> {
  readonly id: string
  readonly n: number
  readonly b: number
  readonly len: number
  frame(seed: number): string
}

export interface Transfer extends HybridObject<Native> {
  readonly protocol: string
  createReceiver(maxStreams: number): TransferReceiver
  createEncoder(container: ArrayBuffer, block: number): TransferEncoder
}
