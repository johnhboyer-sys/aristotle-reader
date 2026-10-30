// Export the work registry (shared/lib/works.ts) as registry.json for prep.py:
// the works, the home-page divisions, further reading and resources, as the
// public build sees them (PUBLIC_SHOW_PRIVATE off). Uses app/'s esbuild, so run
// `npm ci --prefix app` first.
//   node docs/mockups/2026-10-29-directions/export-registry.mjs
import { build } from '../../../app/node_modules/esbuild/lib/main.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'data', 'works.mjs');
await build({
  entryPoints: [join(here, '../../../shared/lib/works.ts')],
  bundle: true,
  format: 'esm',
  outfile: out,
  define: { 'import.meta.env.PUBLIC_SHOW_PRIVATE': '"0"' },
  logLevel: 'warning',
});
const m = await import(pathToFileURL(out).href);
const registry = {
  works: m.WORKS.map((w) => ({
    id: w.id, title: w.title, greekTitle: w.greekTitle, abbr: w.abbr, author: w.author, books: w.books,
    bookLabels: w.bookLabels, greekEdition: w.greekEdition, greekSource: w.greekSource,
    translations: w.translations.map((t) => ({ id: t.id, name: t.name, short: t.short, slot: t.slot })),
    defaultTranslation: w.defaultTranslation || null, blurb: w.blurb, authenticity: w.authenticity || 'genuine',
    citation: w.citation || null, related: w.related || null, commentaries: w.commentaries || null, missingBooks: w.missingBooks || null,
  })),
  categories: m.CATEGORIES,
  further: Object.fromEntries(m.WORKS.map((w) => [w.id, m.furtherReading(w.id)])),
  resources: Object.fromEntries(m.WORKS.map((w) => [w.id, m.resourcesFor(w.id)])),
};
writeFileSync(join(here, 'data', 'registry.json'), JSON.stringify(registry, null, 1));
console.log(`registry.json: ${registry.works.length} works`);
