// Receive: the camera feeds every QR code it sees to the inbox. Streams in progress are listed with
// their progress and rate; each completed item goes to the library.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import type { Progress } from '@qretina/protocol/fountain.js';
import { Button, Card, Label, Screen, kb, useColors } from '../components/ui.tsx';
import { useApp } from '../lib/state.tsx';
import { approve, isApproved } from '../lib/trust.ts';

type Stream = Progress & { started: number; updated: number };

export default function Receive() {
  const app = useApp(), c = useColors(), focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [streams, setStreams] = useState<Record<string, Stream>>({});
  const [last, setLast] = useState<string | null>(null);
  const seen = useRef(0);

  const onCode = useCallback(({ data }: { data: string }) => {
    seen.current++;
    const e = app.inbox.push(data);
    if (!e) return;
    const now = Date.now();
    if (e.kind === 'progress') {
      setStreams(s => ({ ...s, [e.progress.id]: { ...e.progress, started: s[e.progress.id]?.started ?? now, updated: now } }));
      return;
    }
    setStreams(({ [e.kind === 'item' ? e.meta.id : e.id]: _, ...rest }) => rest);
    if (e.kind === 'error') return setLast(`Refused: ${e.error}`);
    app.add(e.meta, e.container);
    setLast(`Received ${e.meta.name}${e.meta.private ? ' (private)' : ''}`);
    if (e.opened.crl) app.setTrust({ ...app.trust, crl: e.opened.crl.number > app.trust.crl.number ? e.opened.crl : app.trust.crl });
    const code = e.opened.code;
    if (code?.type === 'html' && app.trust.runPrograms) {
      const run = () => { app.setTrust(approve(app.trust, code)); router.push(`/run/${e.meta.id}`); };
      if (isApproved(app.trust, code)) run();
      else Alert.alert(`Run ${code.id}?`, `Version ${code.version}, signed by ${code.publisher?.name ?? 'QRetina'} (key ${code.signer}). It runs offline, isolated from your data.`,
        [{ text: 'Not now', style: 'cancel' }, { text: 'Run', onPress: run }]);
    }
  }, [app]);

  if (!permission) return <Screen />;
  if (!permission.granted) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Label>QRetina receives by filming QR codes on another screen. It needs the camera for that, and nothing else.</Label>
        <Button kind="primary" title="Allow camera" onPress={requestPermission} />
      </Screen>
    );
  }

  const active = Object.values(streams).filter(s => Date.now() - s.updated < 30_000);
  return (
    <Screen style={{ padding: 0, gap: 0 }}>
      <View style={{ flex: 1 }}>
        {focused && (
          <CameraView style={{ flex: 1 }} facing="back" autofocus="on"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onCode} />
        )}
      </View>
      <View style={{ padding: 16, gap: 8, backgroundColor: c.bg }}>
        {active.length === 0 && <Label dim>Point the camera at a QRetina broadcast. Frames can be missed; any enough of them will do.</Label>}
        {active.map(s => {
          const secs = Math.max(0.5, (s.updated - s.started) / 1000);
          return (
            <Card key={s.id}>
              <Label bold>{kb(s.len)} · {Math.floor((100 * s.rank) / s.n)}%</Label>
              <Label dim size={14}>{s.rank} of {s.n} blocks · {kb(Math.round((s.len * s.rank) / s.n / secs))}/s</Label>
            </Card>
          );
        })}
        {last && <Label dim size={14}>{last}</Label>}
      </View>
    </Screen>
  );
}
