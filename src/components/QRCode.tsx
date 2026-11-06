import createQr from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/** QR code rendered as a single SVG path (error correction M). */
export function QRCode({
  value,
  size = 220,
  fg = colors.ink,
  bg = colors.surface,
}: {
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
}) {
  const { d, count } = useMemo(() => {
    const qr = createQr(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { d: path, count: n };
  }, [value]);

  const quiet = 2;
  const vb = count + quiet * 2;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${vb} ${vb}`}
      accessibilityLabel={`QR code for ${value}`}
    >
      <Rect x={-quiet} y={-quiet} width={vb} height={vb} fill={bg} />
      <Path d={d} fill={fg} />
    </Svg>
  );
}
