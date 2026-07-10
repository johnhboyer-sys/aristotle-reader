#!/usr/bin/env node
// CI guard for the @shared alias: every `@shared/...` specifier in app/ and
// desktop/ must resolve to a real file under shared/. The app job has no
// build or typecheck that would catch a broken/renamed shared path (the site
// build needs the machine-local corpus), so this closes that gap cheaply.
// Not a typecheck — cross-boundary type errors are caught by shared's own
// svelte-check and desktop's `npm run check`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EXTS = ['', '.ts', '.js', '.svelte', '/index.ts'];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(p);
    else if (/\.(ts|js|mjs|svelte|astro)$/.test(entry.name)) yield p;
  }
}

let checked = 0;
const broken = [];
for (const base of ['app/src', 'desktop/src']) {
  const dir = path.join(ROOT, base);
  if (!existsSync(dir)) continue;
  for (const file of sourceFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/['"]@shared\/([^'"]+)['"]/g)) {
      checked++;
      const target = path.join(ROOT, 'shared', m[1]);
      if (!EXTS.some((ext) => existsSync(target + ext))) {
        broken.push(`${path.relative(ROOT, file)} -> @shared/${m[1]}`);
      }
    }
  }
}

console.log(`@shared imports checked: ${checked}; broken: ${broken.length}`);
for (const b of broken) console.error(`  ${b}`);
if (checked === 0) {
  console.error('No @shared imports found at all — the scan itself is broken.');
  process.exit(2);
}
process.exit(broken.length ? 1 : 0);
