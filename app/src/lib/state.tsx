// App state shared by the screens, persisted through store.ts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MAX_LEN, streamId } from '@qretina/protocol/fountain.js';
import { packFile } from '@qretina/protocol/containers.js';
import { appKeys, bundledCrl, rootKeys } from './config.ts';
import { Inbox, describe, type Keys, type Meta } from './inbox.ts';
import { outgoing } from './outgoing.ts';
import { engine } from './engine.ts';
import * as store from './store.ts';
import { withCrl, type Trust } from './trust.ts';

type State = {
  items: Meta[];
  trust: Trust;
  keyring: store.GroupKey[];
  tx: store.TxPrefs;
  inbox: Inbox;
  keys: () => Keys;
  add: (meta: Meta, container: Uint8Array) => void;
  addFile: (name: string, mime: string, bytes: Uint8Array) => string;
  remove: (id: string) => void;
  open: (id: string) => ReturnType<typeof describe>;
  setTrust: (t: Trust) => void;
  setKeyring: (k: store.GroupKey[]) => Promise<void>;
  setTx: (p: store.TxPrefs) => void;
};

const Ctx = createContext<State | null>(null);

export function useApp() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useApp outside AppProvider');
  return s;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Meta[]>(store.loadIndex);
  const [trust, setTrustState] = useState<Trust>(() => (bundledCrl ? withCrl(store.loadTrust(), bundledCrl) : store.loadTrust()));
  const [keyring, setKeyringState] = useState<store.GroupKey[]>([]);
  const [tx, setTxState] = useState<store.TxPrefs>(store.loadTx);

  // The inbox outlives renders, so it reads keys and trust through refs.
  const ref = useRef({ trust, keyring });
  ref.current = { trust, keyring };
  const keys = useCallback((): Keys => ({ roots: rootKeys, keys: [...appKeys, ...ref.current.keyring.map(k => k.key)] }), []);
  const inbox = useMemo(() => new Inbox(keys, () => ref.current.trust, engine.receiver()), [keys]);

  useEffect(() => { store.loadKeyring().then(setKeyringState); }, []);

  const saveItems = (next: Meta[]) => { store.saveIndex(next); return next; };

  const add = useCallback((meta: Meta, container: Uint8Array) => {
    store.saveContainer(meta.id, container);
    setItems(prev => saveItems([meta, ...prev.filter(m => m.id !== meta.id)]));
  }, []);

  // Packs a file for broadcasting, adds it to the library, and returns its id. Throws when it is too
  // large to send.
  const addFile = useCallback((name: string, mime: string, bytes: Uint8Array) => {
    const container = outgoing(packFile(name, mime, bytes), appKeys);
    if (container.length > MAX_LEN) throw new Error(`${name} is ${(bytes.length / 1048576).toFixed(1)} MB; up to 4 MB (after compression) can be sent.`);
    const { meta } = describe(streamId(container), container, keys(), ref.current.trust);
    add(meta, container);
    return meta.id;
  }, [add, keys]);

  const remove = useCallback((id: string) => {
    store.deleteContainer(id);
    setItems(prev => saveItems(prev.filter(m => m.id !== id)));
  }, []);

  const open = useCallback((id: string) => describe(id, store.loadContainer(id), keys(), ref.current.trust), [keys]);

  const setTrust = useCallback((t: Trust) => { store.saveTrust(t); setTrustState(t); }, []);
  const setTx = useCallback((p: store.TxPrefs) => { store.saveTx(p); setTxState(p); }, []);

  // A new group key may unlock items received earlier; they are described again.
  const setKeyring = useCallback(async (k: store.GroupKey[]) => {
    await store.saveKeyring(k);
    setKeyringState(k);
    ref.current.keyring = k;
    setItems(prev => saveItems(prev.map(m => {
      if (m.kind !== 'locked') return m;
      try {
        const { meta } = describe(m.id, store.loadContainer(m.id), keys(), ref.current.trust, m.received);
        return meta;
      } catch {
        return m;
      }
    })));
  }, [keys]);

  const value = { items, trust, keyring, tx, inbox, keys, add, addFile, remove, open, setTrust, setKeyring, setTx };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
