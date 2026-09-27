import '../lib/polyfills.ts';
import { router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import { useIncomingShare } from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BusyProvider } from '../lib/busy.tsx';
import { AppProvider } from '../lib/state.tsx';
import { engineError } from '../lib/engine.ts';
import { Label, Screen, useColors } from '../components/ui.tsx';

// Opens the share screen when another app shares a file to QRetina.
function IncomingShare() {
  const { sharedPayloads } = useIncomingShare();
  useEffect(() => { if (sharedPayloads.length) router.push('/share'); }, [sharedPayloads]);
  return null;
}

export default function Layout() {
  const c = useColors();
  if (engineError) return <Screen style={{ justifyContent: 'center' }}><Label>{engineError}</Label></Screen>;
  return (
    <AppProvider>
      <BusyProvider>
      <IncomingShare />
      <StatusBar style="auto" />
      <Tabs screenOptions={{
        headerStyle: { backgroundColor: c.card }, headerTintColor: c.fg,
        tabBarStyle: { backgroundColor: c.card }, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.dim,
        tabBarIconStyle: { display: 'none' }, tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
      }}>
        <Tabs.Screen name="index" options={{ title: 'Receive' }} />
        <Tabs.Screen name="broadcast" options={{ title: 'Broadcast' }} />
        <Tabs.Screen name="library" options={{ title: 'Library' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        <Tabs.Screen name="item/[id]" options={{ href: null, title: 'Item' }} />
        <Tabs.Screen name="run/[id]" options={{ href: null, title: 'Program', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="share" options={{ href: null, title: 'Shared file' }} />
        <Tabs.Screen name="diagnostics" options={{ href: null, title: 'Diagnostics' }} />
      </Tabs>
      </BusyProvider>
    </AppProvider>
  );
}
