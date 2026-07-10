import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Resolve Svelte's browser (client) build so component mount() works under
  // happy-dom; without this Svelte 5 resolves its server build and throws
  // "mount(...) is not available on the server".
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.{test,spec}.ts'],
    restoreMocks: true,
  },
});
