import { NitroModules } from 'react-native-nitro-modules'
import type { Transfer } from './specs/Transfer.nitro'

export type { Assembled, Pushed, PushStatus, Transfer, TransferEncoder, TransferReceiver } from './specs/Transfer.nitro'

// The native transfer layer, or null where it is not built in (such as Node, in tests).
export function loadTransfer(): Transfer | null {
  try {
    return NitroModules.createHybridObject<Transfer>('Transfer')
  } catch {
    return null
  }
}
