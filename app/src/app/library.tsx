// Library: everything received or chosen for broadcasting, newest first.
import { router } from 'expo-router';
import { FlatList, Pressable } from 'react-native';
import { Card, Label, Screen, kb } from '../components/ui.tsx';
import type { Meta } from '../lib/inbox.ts';
import { useApp } from '../lib/state.tsx';

const KIND: Record<Meta['kind'], string> = { file: 'File', code: 'Program', cert: 'Certificate', crl: 'Revocation list', locked: 'Locked' };

export default function Library() {
  const { items } = useApp();
  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={m => m.id}
        contentContainerStyle={{ gap: 8 }}
        ListEmptyComponent={<Label dim>Nothing yet. Items you receive or broadcast appear here.</Label>}
        renderItem={({ item: m }) => (
          <Pressable onPress={() => router.push(`/item/${m.id}`)} accessibilityRole="button">
            <Card>
              <Label bold>{m.name}</Label>
              <Label dim size={14}>
                {KIND[m.kind]}{m.private ? ' · private' : ''} · {kb(m.size)} · {new Date(m.received).toLocaleString()}
              </Label>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
