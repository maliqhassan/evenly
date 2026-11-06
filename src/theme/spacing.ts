export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 14,
  '3xl': 16,
  '4xl': 18,
  '5xl': 20,
  '6xl': 22,
  '7xl': 24,
  '8xl': 28,
  '9xl': 32,
  /** Screen horizontal padding */
  screen: 20,
  /** Auth screens horizontal padding */
  screenAuth: 24,
} as const;

export const radii = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  input: 14,
  tile: 14,
  card: 18,
  cardLg: 20,
  cardXl: 22,
  hero: 30,
  heroInner: 22,
  photo: 32,
  pill: 999,
  button: 28,
} as const;

export const sizes = {
  hitTarget: 44,
  button: 56,
  buttonMd: 40,
  buttonSm: 34,
  input: 52,
  iconButton: 44,
  tabBarHeight: 64,
  tabBarInset: 24,
  tabBarBottom: 26,
  tabBarFab: 48,
  /** Space reserved at the bottom of tab screens so content clears the floating bar. */
  tabBarClearance: 26 + 64 + 24,
} as const;

export const shadows = {
  tabBar: {
    shadowColor: 'rgb(30,45,35)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  fab: {
    shadowColor: 'rgb(30,45,35)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  float: {
    shadowColor: 'rgb(0,0,0)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 6,
  },
} as const;

export const motion = {
  pressedOpacity: 0.7,
  pressedScale: 0.98,
  duration: 220,
} as const;
