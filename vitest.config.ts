import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // La prueba de la app completa necesita DOM; el resto corre en Node,
    // que es donde de verdad se prueba el DSP del worklet.
    environment: 'node',
    environmentMatchGlobs: [['src/app.test.ts', 'jsdom']],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
