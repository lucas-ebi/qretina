import Tabs from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../lib/state.tsx';
import { useColors } from '../components/ui.tsx';

export default function Layout() {
  const c = useColors();
  return (
    <AppProvider>
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
      </Tabs>
    </AppProvider>
  );
}
