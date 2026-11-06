import type { TextStyle } from 'react-native';

/**
 * DM Sans only. React Native cannot synthesise weights for custom fonts, so
 * each weight maps to its own loaded family.
 */
export const fontFamily = {
  light: 'DMSans_300Light',
  lightItalic: 'DMSans_300Light_Italic',
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
} as const;

/** Convert an em letter-spacing (design) into points for a given size. */
const em = (size: number, value: number) => Math.round(size * value * 100) / 100;

const t = (size: number, family: string, extra: TextStyle = {}): TextStyle => ({
  fontSize: size,
  fontFamily: family,
  ...extra,
});

export const typography = {
  display: t(56, fontFamily.semibold, { letterSpacing: em(56, -0.04), fontVariant: ['tabular-nums'] }),
  displaySm: t(52, fontFamily.semibold, { letterSpacing: em(52, -0.04), fontVariant: ['tabular-nums'] }),
  hero: t(38, fontFamily.semibold, { letterSpacing: em(38, -0.03), fontVariant: ['tabular-nums'] }),
  heroSm: t(36, fontFamily.semibold, { letterSpacing: em(36, -0.03), fontVariant: ['tabular-nums'] }),
  headline: t(34, fontFamily.semibold, { letterSpacing: em(34, -0.03), lineHeight: 37 }),
  headlineItalic: t(34, fontFamily.lightItalic, { letterSpacing: em(34, -0.02), lineHeight: 39 }),
  h1: t(30, fontFamily.semibold, { letterSpacing: em(30, -0.03) }),
  h2: t(28, fontFamily.semibold, { letterSpacing: em(28, -0.03) }),
  h3: t(24, fontFamily.semibold, { letterSpacing: em(24, -0.02) }),
  nav: t(17, fontFamily.semibold),
  section: t(16, fontFamily.semibold),
  bodyLg: t(15, fontFamily.regular, { lineHeight: 22 }),
  bodyLgMedium: t(15, fontFamily.medium),
  bodyLgStrong: t(15, fontFamily.semibold),
  body: t(14, fontFamily.regular, { lineHeight: 20 }),
  bodyMedium: t(14, fontFamily.medium),
  bodyStrong: t(14, fontFamily.semibold),
  secondary: t(13, fontFamily.regular, { lineHeight: 19 }),
  secondaryMedium: t(13, fontFamily.medium),
  secondaryStrong: t(13, fontFamily.semibold),
  caption: t(12, fontFamily.regular, { lineHeight: 17 }),
  captionMedium: t(12, fontFamily.medium),
  captionStrong: t(12, fontFamily.semibold),
  overline: t(12, fontFamily.regular, { letterSpacing: em(12, 0.06), textTransform: 'uppercase' }),
  overlineSm: t(11, fontFamily.regular, { letterSpacing: em(11, 0.06), textTransform: 'uppercase' }),
  micro: t(11, fontFamily.regular),
  microStrong: t(11, fontFamily.semibold),
  pill: t(10, fontFamily.semibold, { letterSpacing: em(10, 0.04), textTransform: 'uppercase' }),
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
