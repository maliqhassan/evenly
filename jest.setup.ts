// Global test setup.

// lucide-react-native ships ESM-only builds; icons are irrelevant to behaviour
// tests, so render every icon as nothing.
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_t, name) => (name === '__esModule' ? false : () => null) }),
);
