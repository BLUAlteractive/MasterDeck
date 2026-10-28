import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      'packages/database/src/generated/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/next-env.d.ts',
      '**/ios/**',
      '**/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: [
      'packages/{game-core,game-poker,game-spades,card-domain}/src/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'react',
                'react-native',
                'next',
                'next/*',
                '@nestjs/*',
                '@prisma/*',
                'pg',
                'ioredis',
                'redis',
                'bullmq',
                '**/services/**',
                '**/apps/**',
                '@deckforge/api',
                '@deckforge/jobs',
                '@deckforge/database',
                '@deckforge/database/*',
                '**/database/**',
                '@deckforge/ui',
              ],
              message:
                'Domain packages must remain pure and independent of UI, IO and persistence.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'WebSocket'],
    },
  },
  prettier,
);
