// Settings: running programs, trusted keys, revocation list, and the group keys for private items.
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Alert, ScrollView, Switch, TextInput, View } from 'react-native';
import { b64url, keyFromPassphrase, keyId } from '@resqr/protocol/containers.js';
import { Button, Card, Label, useColors } from '../components/ui.tsx';
import { appKeys, rootKeys } from '../lib/config.ts';
import { useApp } from '../lib/state.tsx';
import { resetApprovals } from '../lib/trust.ts';

export default function Settings() {
  const app = useApp(), c = useColors();
  const [label, setLabel] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const input = { color: c.fg, backgroundColor: c.card, borderRadius: 8, padding: 10, fontSize: 16 };

  async function addKey(key: Uint8Array, name: string) {
    if (app.keyring.some(k => keyId(k.key) === keyId(key))) return Alert.alert('This key is already in the keyring.');
    await app.setKeyring([...app.keyring, { label: name || `Key ${keyId(key).slice(0, 4)}`, key }]);
  }

  async function fromPassphrase() {
    if (passphrase.length < 12) return Alert.alert('Use a longer passphrase', 'At least 12 characters; several words are best. A recording of a broadcast lets anyone try guesses offline.');
    setBusy(true);
    setTimeout(async () => { // lets the button show that work is under way; scrypt takes a few seconds
      try { await addKey(keyFromPassphrase(passphrase), label); setPassphrase(''); setLabel(''); } finally { setBusy(false); }
    }, 50);
  }

  async function fromFile() {
    const r = await File.pickFileAsync();
    if (r.canceled) return;
    try {
      const k = JSON.parse(await r.result.text()) as { label?: string; key: string }, key = b64url(k.key);
      if (key.length !== 32) throw new Error('not a ResQR key file');
      await addKey(key, label || k.label || '');
    } catch (e) {
      Alert.alert('Could not read the key file', (e as Error).message);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label bold>Run signed programs</Label>
          <Switch value={app.trust.runPrograms} onValueChange={runPrograms => app.setTrust({ ...app.trust, runPrograms })} />
        </View>
        <Label dim size={14}>Programs run only when signed by ResQR or a publisher it certified, in a sandbox without network or access to your data.</Label>
      </Card>

      <Card>
        <Label bold>Group keys</Label>
        <Label dim size={14}>A private broadcast opens only on phones that hold its key. Add keys here beforehand; items received earlier open as soon as their key is added.</Label>
        {app.keyring.map((k, i) => (
          <View key={keyId(k.key)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>{k.label} <Label dim size={13}>{keyId(k.key)}</Label></Label>
            <Button kind="danger" title="Remove" onPress={() => app.setKeyring(app.keyring.filter((_, j) => j !== i))} />
          </View>
        ))}
        <TextInput placeholder="Name (optional)" placeholderTextColor={c.dim} value={label} onChangeText={setLabel} style={input} />
        <TextInput placeholder="Passphrase" placeholderTextColor={c.dim} value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" style={input} />
        <Button title={busy ? 'Deriving key…' : 'Add from passphrase'} disabled={busy || !passphrase} onPress={fromPassphrase} />
        <Button title="Add from key file" onPress={fromFile} />
      </Card>

      <Card>
        <Label bold>Trust</Label>
        <Label dim size={14}>Root keys: {rootKeys.map(k => k.fp).join(', ') || 'none (development build)'}</Label>
        <Label dim size={14}>App keys: {appKeys.length || 'none (development build: broadcasts are not sealed)'}</Label>
        <Label dim size={14}>Revocation list: {app.trust.crl.number ? `number ${app.trust.crl.number}, ${app.trust.crl.serials.length} revoked` : 'none received'}</Label>
        <Label dim size={14}>Approved programs: {app.trust.approved.length}</Label>
        <Button title="Forget approvals and versions" onPress={() => app.setTrust(resetApprovals(app.trust))} />
      </Card>
    </ScrollView>
  );
}
