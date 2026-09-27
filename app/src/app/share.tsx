// A file shared to QRetina from another app. A group key file is offered for the keyring; any other
// file is added to the library, ready to broadcast.
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { b64url, keyId } from '@qretina/protocol/containers.js';
import { Button, Card, Label, kb, useColors } from '../components/ui.tsx';
import { useBusy } from '../lib/busy.tsx';
import { useApp } from '../lib/state.tsx';

type Incoming = { uri: string; name: string; mime: string; size: number | null };

// A key file is small JSON holding a 32-byte key: { "label": "...", "key": "<base64url>" }.
async function asKeyFile(f: Incoming) {
  if (!/\.qretinakey$/i.test(f.name) && !(f.mime === 'application/json' && (f.size ?? 0) < 1000)) return null;
  try {
    const k = JSON.parse(await new File(f.uri).text()) as { label?: string; key?: string }, key = b64url(k.key ?? '');
    return key.length === 32 ? { label: k.label ?? '', key } : null;
  } catch {
    return null;
  }
}

export default function Share() {
  const app = useApp(), c = useColors(), busy = useBusy();
  const { resolvedSharedPayloads, clearSharedPayloads, isResolving } = useIncomingShare();
  const p = resolvedSharedPayloads.find(x => x.contentUri);
  const file: Incoming | null = p?.contentUri ? { uri: p.contentUri, name: p.originalName ?? 'file', mime: p.contentMimeType ?? 'application/octet-stream', size: p.contentSize } : null;
  const [key, setKey] = useState<{ label: string; key: Uint8Array } | null>(null);
  useEffect(() => { if (file) asKeyFile(file).then(setKey); }, [file?.uri]);

  const done = (path: '/settings' | '/broadcast', params?: { id: string }) => {
    clearSharedPayloads();
    router.replace(params ? { pathname: path, params } : path);
  };

  if (isResolving) return <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }}><Label dim>Reading the shared file…</Label></ScrollView>;
  if (!file) return <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }}><Label dim>Nothing was shared.</Label></ScrollView>;

  async function addKey() {
    if (!key) return;
    if (app.keyring.some(k => keyId(k.key) === keyId(key.key))) Alert.alert('This key is already in the keyring.');
    else await app.setKeyring([...app.keyring, { label: key.label || `Key ${keyId(key.key).slice(0, 4)}`, key: key.key }]);
    done('/settings');
  }

  async function broadcast() {
    if (!file) return;
    try {
      const bytes = await new File(file.uri).bytes();
      const id = await busy(`Preparing ${file.name} (${kb(bytes.length)})…`, () => app.addFile(file.name, file.mime, bytes));
      done('/broadcast', { id });
    } catch (e) {
      Alert.alert('Cannot send this file', (e as Error).message);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Label bold>{file.name}</Label>
        <Label dim size={14}>{file.mime}{file.size ? ` · ${kb(file.size)}` : ''}</Label>
        {key && <Label size={14}>This is a group key{key.label ? ` ("${key.label}")` : ''}, id {keyId(key.key)}. Adding it lets this phone open private items sealed with it.</Label>}
      </Card>
      {key && <Button kind="primary" title="Add to group keys" onPress={addKey} />}
      <Button kind={key ? 'plain' : 'primary'} title="Broadcast this file" onPress={broadcast} />
      <Button title="Cancel" onPress={() => { clearSharedPayloads(); router.replace('/'); }} />
    </ScrollView>
  );
}
