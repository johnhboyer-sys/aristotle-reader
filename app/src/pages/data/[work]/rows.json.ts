// The row table of every book of a work (shared/lib/row-table): what the
// results page needs to count its rows and pages without the books, made
// here from the built books by the page's own functions. Served beside the
// work's other data, at data/<work>/rows.json.
import type { APIRoute, GetStaticPaths } from 'astro';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicDir } from 'astro:config/server';
import { WORKS, searchableTranslations } from '@shared/lib/works';
import { encodeRowBook, type RowTable } from '@shared/lib/row-table';

const dataDir = (work: string) => fileURLToPath(new URL(`data/${work}/`, publicDir));

export const getStaticPaths = (() => WORKS
  .filter(w => existsSync(dataDir(w.id)))
  .map(w => ({ params: { work: w.id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const work = WORKS.find(w => w.id === params.work)!;
  const dir = dataDir(work.id);
  const table: RowTable = { v: 1, books: {} };
  for (const file of readdirSync(dir).filter(f => /^book-\d+\.json$/.test(f)).sort()) {
    const book = JSON.parse(readFileSync(`${dir}${file}`, 'utf-8'));
    table.books[String(Number(file.slice(5, -5)))] = encodeRowBook(book, searchableTranslations(work));
  }
  return new Response(JSON.stringify(table), { headers: { 'Content-Type': 'application/json' } });
};
