// Small shared pieces of interface.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View, type ViewStyle } from 'react-native';

export function useColors() {
  const dark = useColorScheme() === 'dark';
  return dark
    ? { bg: '#0b0d0c', fg: '#e8ece9', dim: '#8a948e', card: '#161a18', accent: '#3ddc84', danger: '#ff6b6b' }
    : { bg: '#f6f7f6', fg: '#101312', dim: '#5d6661', card: '#ffffff', accent: '#0a7d3b', danger: '#c62828' };
}

export function Screen({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[{ flex: 1, backgroundColor: c.bg, padding: 16, gap: 12 }, style]}>{children}</View>;
}

export function Label({ children, dim, size = 16, bold }: { children: ReactNode; dim?: boolean; size?: number; bold?: boolean }) {
  const c = useColors();
  return <Text style={{ color: dim ? c.dim : c.fg, fontSize: size, fontWeight: bold ? '600' : '400' }}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'plain', disabled }: { title: string; onPress: () => void; kind?: 'plain' | 'primary' | 'danger'; disabled?: boolean }) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : c.card, fg = kind === 'primary' ? '#fff' : kind === 'danger' ? c.danger : c.fg;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card }]}>{children}</View>;
}

export const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const styles = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  card: { padding: 12, borderRadius: 12, gap: 4 },
});
