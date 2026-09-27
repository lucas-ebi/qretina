// Long work (packing, sealing or opening megabytes) runs on the JavaScript thread and blocks it for
// a while. run() first shows a native activity indicator, which keeps turning while JavaScript is
// busy, so the app looks busy rather than frozen.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

type Run = <T>(label: string, work: () => T | Promise<T>) => Promise<T>;
const Ctx = createContext<Run>(async (_, work) => work());

export const useBusy = () => useContext(Ctx);

// Resolves once the frame showing the indicator has been drawn.
const drawn = () => new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)));

export function BusyProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const run = useCallback<Run>(async (text, work) => {
    setLabel(text);
    await drawn();
    try { return await work(); } finally { setLabel(null); }
  }, []);
  return (
    <Ctx.Provider value={run}>
      {children}
      <Modal transparent visible={label !== null} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontSize: 16 }}>{label}</Text>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}
