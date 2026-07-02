// Vite config for the desktop (Tauri) shell.
//
// The frontend deliberately reuses the website's Svelte components and libs
// from ../app/src — this project adds only the desktop chrome (library rail,
// top bar) and the runtime data layer. Two things make that reuse work here:
//
//  1. `server.fs.allow` opens the repo root so Vite may serve ../app/src files.
//  2. A tiny dev middleware serves /data/* from the pipeline's build/dist
//     directory AT RUNTIME (the website resolves this at Astro build time via a
//     public/data symlink; the desktop app must not bake the corpus into the
//     bundle). In the packaged app the same URLs are redirected to a Tauri
//     asset:// root instead — see src/lib/runtime.ts.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
// Corpus data directory for dev: override with ARISTOTLE_DATA_DIR, else the
// repo's pipeline output (build/dist may be a symlink to the main checkout).
const dataDir = process.env.ARISTOTLE_DATA_DIR ?? path.join(repoRoot, 'build', 'dist');

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serveCorpusData() {
  return {
    name: 'serve-corpus-data',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/data', (req, res, next) => {
        const url = (req.url ?? '/').split('?')[0];
        const rel = decodeURIComponent(url).replace(/^\/+/, '');
        const file = path.normalize(path.join(dataDir, rel));
        if (!file.startsWith(path.normalize(dataDir))) return next(); // no traversal
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), serveCorpusData()],
  // The owner's local builds carry the private (copyright-encumbered)
  // translations, like the site's `npm run dev`. A DISTRIBUTABLE build
  // (scripts/package-app.mjs) sets DESKTOP_PUBLIC=1, which flips this off —
  // fail-safe direction: private entries vanish from the registry unless the
  // build explicitly opts in (see works.ts SHOW_PRIVATE).
  define: {
    'import.meta.env.PUBLIC_SHOW_PRIVATE':
      JSON.stringify(process.env.DESKTOP_PUBLIC === '1' ? '0' : '1'),
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  // Reused files under ../app/src would make esbuild discover app/tsconfig.json,
  // which extends astro/tsconfigs/strict — not installed here. Pin the only
  // flags esbuild actually consumes instead of resolving tsconfigs from disk.
  esbuild: {
    tsconfigRaw: '{"compilerOptions":{"useDefineForClassFields":true,"verbatimModuleSyntax":true}}',
  },
  // Tauri's macOS webview is modern WebKit; ES2022 allows the top-level await
  // in main.ts (data layer init before mount).
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
  clearScreen: false,
});
