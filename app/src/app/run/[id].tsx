// Runs a signed HTML program from the library in the sandbox. Opening it again checks the signature,
// certificate, revocation list and version with the current state.
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Label, Screen } from '../../components/ui.tsx';
import { Sandbox } from '../../components/Sandbox.tsx';
import { useApp } from '../../lib/state.tsx';

export default function Run() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const result = useMemo(() => {
    try {
      const code = app.open(id).opened.code;
      if (code?.type !== 'html') throw new Error('not a program');
      if (!app.trust.runPrograms) throw new Error('running programs is turned off in Settings');
      return { html: new TextDecoder().decode(code.payload) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [id, app]);
  if ('error' in result) return <Screen><Label>Cannot run: {result.error}</Label></Screen>;
  return <Sandbox html={result.html} />;
}
