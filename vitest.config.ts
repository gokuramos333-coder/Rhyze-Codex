import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next preserves JSX for its compiler; the isolated Vite test runner must transform it.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    restoreMocks: true,
    clearMocks: true,
  },
});
