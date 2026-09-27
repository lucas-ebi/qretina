// Broadcast: shows an item as an endless stream of QR codes, after an optional countdown of the app
// link. The item comes from the library (?id=...), or is picked here and added to the library.
import * as Brightness from 'expo-brightness';
import { getRandomValues } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { blockFor, type Encoder } from '@qretina/protocol/fountain.js';
import { engine } from '../lib/engine.ts';
import { QrCode } from '../components/QrCode.tsx';
import { Button, Card, Label, kb, useColors } from '../components/ui.tsx';
import { useBusy } from '../lib/busy.tsx';
import { LINK, appKeys } from '../lib/config.ts';
import { outgoing } from '../lib/outgoing.ts';
import { useApp } from '../lib/state.tsx';
import { loadContainer, type TxPrefs } from '../lib/store.ts';

const DENSITY = [300, 700, 1200, 2000], FPS = [5, 10, 15, 20, 30], INTRO = [0, 3, 5];

export default function Broadcast() {
  const app = useApp(), c = useColors();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | undefined>(params.id);
  const [group, setGroup] = useState<number>(-1); // index in the keyring, or -1 for public
  const [live, setLive] = useState<Encoder | null>(null);
  const busy = useBusy();
  useEffect(() => { if (params.id) { setId(params.id); setLive(null); } }, [params.id]);

  const meta = app.items.find(m => m.id === id);

  async function add(name: string, mime: string, read: () => Promise<Uint8Array>) {
    try {
      const bytes = await read();
      setId(await busy(`Preparing ${name} (${kb(bytes.length)})…`, () => app.addFile(name, mime, bytes)));
    } catch (e) {
      Alert.alert('Cannot send this file', (e as Error).message);
    }
  }

  async function start() {
    if (!meta) return;
    const enc = await busy(`Preparing ${kb(meta.size)}…`, () => {
      const container = outgoing(loadContainer(meta.id), appKeys, app.keyring[group]?.key);
      return engine.encoder(container, blockFor(container.length, app.tx.density));
    });
    setLive(enc);
  }

  async function pickFile() {
    const r = await File.pickFileAsync();
    if (r.canceled) return;
    const f = r.result;
    await add(f.name, f.type || 'application/octet-stream', () => f.bytes());
  }

  async function pickPhoto() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
    if (r.canceled) return;
    const a = r.assets[0];
    await add(a.fileName ?? 'photo.jpg', a.mimeType ?? 'image/jpeg', () => new File(a.uri).bytes());
  }

  if (live) return <Live enc={live} prefs={app.tx} onStop={() => setLive(null)} />;

  const set = (p: Partial<TxPrefs>) => app.setTx({ ...app.tx, ...p });
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Label dim size={14}>Item</Label>
        <Label bold>{meta ? `${meta.name} · ${kb(meta.size)}` : 'Nothing chosen'}</Label>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="Choose a file" onPress={pickFile} /></View>
        <View style={{ flex: 1 }}><Button title="Choose a photo" onPress={pickPhoto} /></View>
      </View>
      <Choice label="Audience" value={group} options={[-1, ...app.keyring.map((_, i) => i)]}
        show={i => (i < 0 ? 'Anyone with QRetina' : `Private: ${app.keyring[i].label}`)} onChange={setGroup} />
      <Choice label="Bytes per code" value={app.tx.density} options={DENSITY} show={String} onChange={density => set({ density })} />
      <Choice label="Codes per second" value={app.tx.fps} options={FPS} show={String} onChange={fps => set({ fps })} />
      <Choice label="Codes on screen" value={app.tx.codes} options={[1, 2] as const} show={String} onChange={codes => set({ codes })} />
      <Choice label="Countdown" value={app.tx.intro} options={INTRO} show={s => (s ? `${s} s` : 'None')} onChange={intro => set({ intro })} />
      <Label dim size={14}>
        700 bytes at 15 codes per second suits one phone filming another. Larger codes, or two at once, need a bigger or closer screen.
      </Label>
      <Button kind="primary" title="Start broadcasting" disabled={!meta || meta.kind === 'locked' && group >= 0} onPress={start} />
    </ScrollView>
  );
}

function Choice<T extends number>({ label, value, options, show, onChange }: { label: string; value: T; options: readonly T[]; show: (v: T) => string; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Label dim size={14}>{label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => (
          <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ selected: o === value }}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: o === value ? c.accent : c.card }}>
            <Text style={{ color: o === value ? c.onAccent : c.fg, fontSize: 15 }}>{show(o)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Live({ enc, prefs, onStop }: { enc: Encoder; prefs: TxPrefs; onStop: () => void }) {
  useKeepAwake();
  const { width, height } = useWindowDimensions();
  const [tick, setTick] = useState(0);
  const [start] = useState(() => getRandomValues(new Uint32Array(1))[0] >>> 1);

  useEffect(() => { // full brightness while broadcasting, restored afterwards
    let before: number | undefined;
    Brightness.getBrightnessAsync().then(b => { before = b; return Brightness.setBrightnessAsync(1); }).catch(() => {});
    return () => { if (before !== undefined) Brightness.setBrightnessAsync(before).catch(() => {}); };
  }, []);

  const introTicks = prefs.intro * prefs.fps;
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000 / prefs.fps);
    return () => clearInterval(t);
  }, [prefs.fps]);

  const cycle = introTicks + Math.max(prefs.fps * 6, Math.ceil((enc.n * 1.5) / prefs.codes)); // countdown again every so often
  const phase = tick % cycle, counting = phase < introTicks;
  const side = Math.min(width - 16, (height - 140) / prefs.codes);
  const shown = Math.floor(tick / cycle) * (cycle - introTicks) + (phase - introTicks); // data ticks so far
  const seed = (i: number) => (start + shown * prefs.codes + i) >>> 0;

  return (
    <Pressable onPress={onStop} style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {counting ? (
        <View>
          <QrCode text={LINK} size={side} ecc="H" />
          <View style={{ position: 'absolute', alignSelf: 'center', top: side / 2 - side * 0.09, width: side * 0.18, height: side * 0.18,
            borderRadius: side, backgroundColor: '#fff', borderWidth: 3, borderColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: side * 0.1, fontWeight: '700', color: '#000' }}>{prefs.intro - Math.floor(phase / prefs.fps)}</Text>
          </View>
        </View>
      ) : (
        Array.from({ length: prefs.codes }, (_, i) => <QrCode key={i} text={enc.frame(seed(i))} size={side} />)
      )}
      <Text style={{ color: '#333', fontSize: 14 }}>
        {counting ? 'Scan with the camera app to open QRetina' : `${prefs.fps * prefs.codes} codes/s · ${kb(prefs.fps * prefs.codes * enc.b)}/s · ${enc.n} blocks`} · tap to stop
      </Text>
    </Pressable>
  );
}
