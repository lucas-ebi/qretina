// One QR code, drawn as a single Skia path so it can change 15 to 30 times a second.
// Always black on white, with the 4-module quiet zone the QR standard asks for.
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import qrcode from '@qretina/protocol/vendor/qrcode.mjs';
import { useMemo } from 'react';

const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;
const QUIET = 4;

export function QrCode({ text, size, ecc = 'L' }: { text: string; size: number; ecc?: 'L' | 'M' | 'Q' | 'H' }) {
  const { path, modules } = useMemo(() => {
    const q = qrcode(0, ecc);
    q.addData(text, ALPHANUMERIC.test(text) ? 'Alphanumeric' : 'Byte');
    q.make();
    const n = q.getModuleCount(), p = Skia.Path.Make();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p.addRect(Skia.XYWHRect(c, r, 1, 1));
    return { path: p, modules: n };
  }, [text, ecc]);
  const k = size / (modules + 2 * QUIET);
  return (
    <Canvas style={{ width: size, height: size, backgroundColor: '#fff' }}>
      <Group transform={[{ translateX: QUIET * k }, { translateY: QUIET * k }, { scale: k }]}>
        <Path path={path} color="#000" />
      </Group>
    </Canvas>
  );
}
