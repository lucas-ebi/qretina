// The QRetina mark, drawn from the same SVG as the icons (tools/brand.mjs).
import { Canvas, ImageSVG, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { MARK, MARK_DARK } from '../lib/mark.ts';

export function Mark({ width }: { width: number }) {
  const dark = useColorScheme() === 'dark';
  const svg = useMemo(() => Skia.SVG.MakeFromString(dark ? MARK_DARK : MARK), [dark]);
  const height = (width * 84) / 216;
  return (
    <Canvas style={{ width, height }} accessibilityLabel="QRetina">
      {svg && <ImageSVG svg={svg} x={0} y={0} width={width} height={height} />}
    </Canvas>
  );
}
