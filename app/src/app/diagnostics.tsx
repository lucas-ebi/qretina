// Diagnostics: checks the protocol against the spec's vectors on this phone, and times packing and
// receiving. Useful when a transfer fails, and to compare phones.
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, Card, Label, kb, useColors } from '../components/ui.tsx';
import { useBusy } from '../lib/busy.tsx';
import { checks, speed, type Check } from '../lib/selftest.ts';

export default function Diagnostics() {
  const c = useColors(), busy = useBusy();
  const [results, setResults] = useState<Check[] | null>(null);
  const [timings, setTimings] = useState<string[]>([]);

  const time = async (size: number) => {
    const s = await busy(`Timing ${kb(size)}…`, () => speed(size));
    setTimings(t => [...t, `${kb(size)}: ${s.n} blocks of ${s.block} B; pack ${(s.pack / 1000).toFixed(1)} s, receive ${(s.receive / 1000).toFixed(1)} s${s.ok ? '' : ' (FAILED)'}`]);
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Button kind="primary" title="Check the protocol" onPress={async () => setResults(await busy('Checking…', () => checks()))} />
      {results && (
        <Card>
          {results.map(r => <Label key={r.name} size={14}>{r.ok ? '✓' : '✗'} {r.name}{r.detail ? `: ${r.detail}` : ''}</Label>)}
        </Card>
      )}
      <Label dim size={14}>Timing receives every code in order, as a perfect camera would, so it shows how fast this phone decodes.</Label>
      <Button title="Time 1 MB" onPress={() => time(1 << 20)} />
      <Button title="Time 4 MB" onPress={() => time((1 << 22) - 1024)} />
      {timings.length > 0 && <Card>{timings.map((t, i) => <Label key={i} size={14}>{t}</Label>)}</Card>}
    </ScrollView>
  );
}
