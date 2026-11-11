import { defineConfig } from 'vitest/config';
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': new URL('../../', import.meta.url).pathname } },
  test: { environment: 'node', include: ['experiments/discount-code-admin/**/*.test.ts'], restoreMocks: true },
});
