import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Resolve Svelte's browser (client) build so component mount() works under
  // happy-dom; without this Svelte 5 resolves its server build and throws
  // "mount(...) is not available on the server".
  resolve: {
    conditions: ['browser'],
    // Mirror astro.config.mjs so tests resolve the shared reader core the same
    // way the site build does (e.g. app/src/lib/html re-exports @shared/lib/html).
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    restoreMocks: true,
  },
});
