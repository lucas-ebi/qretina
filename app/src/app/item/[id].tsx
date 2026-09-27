// One library item: what it is, a preview for images, and what can be done with it.
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Image, ScrollView } from 'react-native';
import { AudioPreview, VideoPreview } from '../../components/Media.tsx';
import { Button, Card, Label, kb, useColors } from '../../components/ui.tsx';
import { useApp } from '../../lib/state.tsx';
import { exportFile } from '../../lib/store.ts';
import { approve } from '../../lib/trust.ts';

const IMAGE = /^image\/(png|jpeg|gif|webp)$/; // never SVG, which can hold scripts

export default function Item() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp(), c = useColors();
  const meta = app.items.find(m => m.id === id);
  const view = useMemo(() => {
    try { return meta ? app.open(meta.id) : null; } catch (e) { return { error: (e as Error).message }; }
  }, [meta, app]);

  if (!meta || !view) return <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }}><Label dim>Not in the library.</Label></ScrollView>;
  const opened = 'opened' in view ? view.opened : undefined, file = opened?.file, code = opened?.code;
  const shared = file && exportFile(meta.id, file.name, file.bytes);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Label bold>{meta.name}</Label>
        <Label dim size={14}>{kb(meta.size)} received {new Date(meta.received).toLocaleString()}</Label>
        {file && <Label dim size={14}>{file.mime} · {kb(file.bytes.length)}</Label>}
        {code && <Label dim size={14}>{code.type} program, version {code.version}, signed by {code.publisher?.name ?? 'QRetina'} (key {code.signer})</Label>}
        {meta.private && <Label dim size={14}>Private: sealed with a group key.</Label>}
        {meta.kind === 'locked' && <Label dim size={14}>Sealed with a group key you do not hold (id {meta.keyId}). You can still pass it on; it opens once the key is added in Settings.</Label>}
        {'error' in view && <Label size={14}>Cannot be opened now: {view.error}</Label>}
      </Card>
      {file && shared && IMAGE.test(file.mime) && (
        <Image source={{ uri: shared.uri }} style={{ width: '100%', aspectRatio: 1 }} resizeMode="contain" />
      )}
      {file && shared && file.mime.startsWith('video/') && <VideoPreview uri={shared.uri} />}
      {file && shared && file.mime.startsWith('audio/') && <AudioPreview uri={shared.uri} />}
      {code?.type === 'json' && <Card><Label size={13}>{new TextDecoder().decode(code.payload).slice(0, 4000)}</Label></Card>}
      {code?.type === 'html' && app.trust.runPrograms && (
        <Button kind="primary" title="Run" onPress={() => { app.setTrust(approve(app.trust, code)); router.push(`/run/${meta.id}`); }} />
      )}
      {shared && <Button title="Share or save" onPress={() => Sharing.shareAsync(shared.uri, { mimeType: file.mime })} />}
      <Button title="Broadcast" onPress={() => router.push({ pathname: '/broadcast', params: { id: meta.id } })} />
      <Button kind="danger" title="Delete" onPress={() => Alert.alert('Delete this item?', meta.name, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { app.remove(meta.id); router.back(); } },
      ])} />
    </ScrollView>
  );
}
