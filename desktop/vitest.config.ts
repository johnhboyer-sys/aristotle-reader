import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

// Tests import shared frontend files from ../app/src (e.g. glossary ?raw
// fixtures in imports.test.ts), so open the repo root exactly as
// vite.config.ts does for the dev server.
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    restoreMocks: true,
  },
});
