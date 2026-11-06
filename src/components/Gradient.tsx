import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Pattern, Path } from 'react-native-svg';

/**
 * Gradient backgrounds drawn with react-native-svg so they render
 * identically on iOS and Android. Place inside a container with
 * `overflow: 'hidden'` and a border radius.
 */
export function RadialFill({
  colors: stops,
  offsets,
  cx = '50%',
  cy = '0%',
  rx = '120%',
  ry = '90%',
}: {
  colors: readonly string[];
  offsets?: readonly number[];
  cx?: string;
  cy?: string;
  rx?: string;
  ry?: string;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} rx={rx} ry={ry} fx={cx} fy={cy} gradientUnits="objectBoundingBox">
          {stops.map((c, i) => (
            <Stop key={i} offset={offsets?.[i] ?? i / Math.max(1, stops.length - 1)} stopColor={c} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function LinearFill({ colors: stops, offsets }: { colors: readonly string[]; offsets?: readonly number[] }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map((c, i) => (
            <Stop key={i} offset={offsets?.[i] ?? i / Math.max(1, stops.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Diagonal stripes — the design's image placeholder pattern. */
export function StripeFill({ a, b, band = 12 }: { a: string; b: string; band?: number }) {
  const id = useId().replace(/:/g, '');
  const s = band * 2;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s} height={s} patternTransform="rotate(45)">
          <Rect width={s} height={s} fill={b} />
          <Path d={`M0 0H${band}V${s}H0Z`} fill={a} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
