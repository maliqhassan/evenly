/**
 * Evenly colour tokens (design handoff → "Design Tokens / Colours").
 * Palette: https://coolors.co/1b211d-26302a-1e7a4c-badfc6-f4f5f3-c2362f
 *
 * Screens must use these tokens, never raw hex values. `dark` is prepared so
 * a dark theme can be switched on without touching screens.
 */
const light = {
  ink: '#1B211D',
  forest: '#26302A',
  forestCard: '#3B4A3F',
  positive: '#1E7A4C',
  positiveSoft: '#E3F1E7',
  mint: '#BADFC6',
  negative: '#C2362F',
  negativeSoft: '#FBECEA',
  negativeTrack: '#F2CFCB',
  warning: '#B7791F',
  warningSoft: '#FFF3DC',

  bg: '#F4F5F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2EF',
  surfaceMuted2: '#E8EBE7',
  divider: '#F0F2EF',
  dividerStrong: '#EEF0EC',
  border: '#E1E4E0',
  borderStrong: '#DDE1DC',
  dashed: '#C3CBC4',
  dashedPositive: '#9FB8A6',

  text: '#1B211D',
  textMuted: '#5E665F',
  textSubtle: '#6B736D',
  textFaint: '#8A918B',
  chevron: '#B8C0B9',
  disabled: '#C9CEC9',
  onDark: '#F4F5F3',
  onDarkStrong: '#FFFFFF',
  onDarkMuted: '#AFC2B4',
  onDarkSoft: '#E6ECE7',
  onDarkPositive: '#9FD6B2',
  onDarkTranslucent: 'rgba(255,255,255,0.12)',
  onDarkHairline: 'rgba(255,255,255,0.14)',
  onDarkBorder: 'rgba(255,255,255,0.25)',
  onDarkField: 'rgba(255,255,255,0.10)',
  hairlineOnMint: 'rgba(38,48,42,0.12)',

  tabBar: 'rgba(255,255,255,0.92)',
  frosted: 'rgba(255,255,255,0.82)',
  scrim: 'rgba(27,33,29,0.45)',
  viewerBackdrop: 'rgba(0,0,0,0.92)',
  positiveRing: 'rgba(30,122,76,0.10)',
  hairline: 'rgba(0,0,0,0.05)',
  shadow: 'rgba(30,45,35,1)',

  // Diverging balance bars (screen 18)
  barNegative: '#E8A9A3',
  barPositive: '#8CC5A0',

  // Gradients
  mintGradient: ['#F4FBF6', '#CDE8D5', '#BADFC6'] as const,
  mintGradientSoft: ['#F4FBF6', '#BADFC6'] as const,
  successGlow: ['#E1F1E6', '#F4F5F3'] as const,
  welcomeGradient: ['#F4F5F3', '#FFFFFF', '#EEF5F0', '#FFFFFF'] as const,
  photoStripe: ['#DCE3DC', '#E4EAE3'] as const,
  avatarStripe: ['#DCE3DC', '#E6ECE5'] as const,

  // Reports
  chartBarMuted: 'rgba(186,223,198,0.35)',
  chartBarActive: '#BADFC6',
  categoryScale: ['#26302A', '#4F7A5C', '#7EA88A', '#A9C9B2', '#CFE3D5'] as const,

  // Initial avatars, chosen deterministically from the user id
  avatarFills: ['#D9C7B8', '#C8D5C0', '#E6CFC9', '#C9D3E0', '#E3DCC4', '#D7C9E0', '#CFDCD6'] as const,
  avatarDeleted: '#E2E5E1',
};

export type ColorTokens = typeof light;

const dark: ColorTokens = {
  ...light,
  ink: '#EEF2EF',
  bg: '#121613',
  surface: '#1B211D',
  surfaceMuted: '#232A25',
  surfaceMuted2: '#2A322C',
  divider: '#262D28',
  dividerStrong: '#2C342E',
  border: '#323A34',
  borderStrong: '#3A433C',
  text: '#EEF2EF',
  textMuted: '#AAB3AC',
  textSubtle: '#9AA39C',
  textFaint: '#7D867F',
  positiveSoft: '#1D3326',
  negativeSoft: '#3A2120',
  warningSoft: '#3A2F1A',
  tabBar: 'rgba(27,33,29,0.92)',
};

export const palettes = { light, dark };
export const colors = light;
