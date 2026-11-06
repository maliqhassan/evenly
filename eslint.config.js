// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'design_handoff_evenly/*', 'supabase/functions/*', 'firebase/*', '.expo/*'],
  },
  {
    // Native/optional modules are required lazily on purpose so the JS bundle
    // still boots in Expo Go and demo mode.
    files: [
      'src/lib/auth/**',
      'src/lib/monitoring.ts',
      'src/lib/push.ts',
      'src/lib/offline.ts',
      'src/api/index.ts',
      '**/__tests__/**',
    ],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
