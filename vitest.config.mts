import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
const mobileRequire = createRequire(
  new URL('./apps/mobile/package.json', import.meta.url),
);
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react-native$/,
        replacement: mobileRequire.resolve('react-native-web'),
      },
    ],
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'services/**/*.test.ts',
      'scripts/**/*.test.ts',
      'apps/mobile/**/*.test.ts',
      'apps/mobile/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 10000,
  },
});
