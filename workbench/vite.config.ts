// Vite config for the Translation Workbench (Tauri) shell.
//
// Unlike the reader's desktop/ app, this project is self-contained — it does
// not reuse ../app/src components, so there is no repo-root fs.allow reach.
// The one middleware below serves the machine-generated dev corpus
// (workbench/.dev-corpus/, gitignored — TLG-derived, never committed) at
// /corpus/<workId>/*.json so the browser harness sees the same URL shape the
// Tauri build reads from $APPDATA/corpus/. Build it with:
//   node scripts/build-dev-corpus.mjs
// A missing file is a plain 404 — the app treats that as the normal
// "corpus absent" state.
//
// Also serves the lexicon drawer's data: /corpus/<workId>/analyses.json
// (per-work word analyses) and /corpus/lsj/<letter>.json (the LSJ dictionary,
// shared across every work — one copy, not per-work). Same "missing = 404 =
// normal absent state" contract.
//
// NOTE on the computed `import('node' + ':fs')`: this project deliberately
// has no @types/node (tsconfig types are ["vite/client", "svelte"] and the
// browser/Tauri app code must never import node builtins), so a static
// `import from 'node:fs'` fails `tsc --noEmit`. The computed specifier keeps
// the dev-only middleware working in Node while staying invisible to the
// type checker; the tiny NodeFs interface below types what we use.
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

interface NodeFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf-8'): string;
}

function devCorpus(): Plugin {
  // POSIX-only conversion (this is a macOS project): file:///a/b → /a/b.
  const corpusRoot = decodeURIComponent(new URL('.dev-corpus', import.meta.url).pathname);
  return {
    name: 'workbench-dev-corpus',
    async configureServer(server) {
      const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as NodeFs;
      server.middlewares.use('/corpus', (req, res, next) => {
        // req.url here is relative to the mount, e.g. "/metaphysics/spine.json"
        // or "/lsj/a.json" (the shared LSJ shards, not per-work).
        const url = (req as { url?: string }).url ?? '';
        const m =
          /^\/([A-Za-z0-9-]+)\/(spine|chapters|analyses)\.json$/.exec(url)
          ?? /^\/(lsj)\/([a-z_])\.json$/.exec(url);
        if (!m) return next();
        const r = res as {
          statusCode: number;
          setHeader(name: string, value: string): void;
          end(body?: string): void;
        };
        const file = `${corpusRoot}/${m[1]}/${m[2]}.json`;
        if (!fs.existsSync(file)) {
          r.statusCode = 404;
          r.end('not found');
          return;
        }
        r.setHeader('Content-Type', 'application/json');
        r.end(fs.readFileSync(file, 'utf-8'));
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), devCorpus()],
  server: {
    port: 1421,
    strictPort: true,
  },
  // Tauri's macOS webview is modern WebKit; ES2022 allows top-level await.
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
  clearScreen: false,
});
