/**
 * Perseus as an import source — the path that needs NOTHING installed.
 *
 * Two ways in, both ending at the same TEI:
 *
 *   - a file the user downloaded themselves, read straight off disk;
 *   - a CTS urn or a Scaife URL, fetched over the network.
 *
 * For the second, the fetch goes to the canonical GitHub repositories rather
 * than a CTS API endpoint. Those repositories ARE the published edition —
 * Scaife reads the same files — and one predictable URL per urn beats an API
 * whose passage endpoints return fragments that would have to be stitched
 * back together. A urn names the file directly:
 *
 *   urn:cts:greekLit:tlg0059.tlg030.perseus-grc2
 *   → canonical-greekLit/data/tlg0059/tlg030/tlg0059.tlg030.perseus-grc2.xml
 *
 * Nothing here parses TEI; that is corpus/teiRows.ts, shared with the disc
 * importer.
 */

import { parseTeiRows } from '../corpus/teiRows';
import { createSourceImport } from './createSourceImport';
import type { SourceImport } from './createSourceImport';

/** The two CTS namespaces Perseus publishes, and their repositories. */
const REPOSITORIES: Record<string, string> = {
  greekLit: 'PerseusDL/canonical-greekLit',
  latinLit: 'PerseusDL/canonical-latinLit',
};

const RAW_HOST = 'https://raw.githubusercontent.com';
const BRANCH = 'master';

export const NOT_A_URN_MESSAGE =
  'That doesn’t look like a Perseus text. Paste a Scaife address (scaife.perseus.org/reader/…) or a CTS urn (urn:cts:greekLit:…).';
export const FETCH_FAILED_MESSAGE = 'Couldn’t reach Perseus. Check the connection and try again.';
export const NOT_FOUND_MESSAGE = 'Perseus has no text at that address.';

/** A CTS urn broken into the parts that locate its file. */
export interface CtsUrn {
  /** "greekLit" or "latinLit". */
  namespace: string;
  /** Text group, e.g. "tlg0059". */
  group: string;
  /** Work, e.g. "tlg030". */
  work: string;
  /** Version, e.g. "perseus-grc2". Absent when the urn names only the work. */
  version?: string;
}

/**
 * Pull a CTS urn out of whatever the user pasted: a bare urn, a Scaife reader
 * or library URL, or a urn with a passage reference on the end
 * (`…perseus-grc2:327a`), which is what copying from Scaife gives you. The
 * passage is dropped — we import the whole work and the rows carry their own
 * addresses.
 */
export function parseCtsUrn(input: string): CtsUrn | null {
  const text = input.trim();
  if (text.length === 0) return null;

  const match = /urn:cts:([A-Za-z]+):([^:/\s]+)/.exec(text);
  if (!match) return null;

  const namespace = match[1];
  if (!(namespace in REPOSITORIES)) return null;

  // group.work.version — the passage reference, if any, was already excluded
  // by the pattern above (it sits after a further colon).
  const parts = match[2].split('.');
  if (parts.length < 2) return null;

  const [group, work, version] = parts;
  if (!group || !work) return null;
  return { namespace, group, work, ...(version ? { version } : {}) };
}

/**
 * The raw file URL for a urn. A urn with no version can't name a file — an
 * work has several editions and translations — so this returns null and the
 * caller asks for a more specific address.
 */
export function teiUrlFor(urn: CtsUrn): string | null {
  const repo = REPOSITORIES[urn.namespace];
  if (!repo || !urn.version) return null;
  const file = `${urn.group}.${urn.work}.${urn.version}.xml`;
  return `${RAW_HOST}/${repo}/${BRANCH}/data/${urn.group}/${urn.work}/${file}`;
}

/** Injected so tests never touch the network. */
export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Fetch the TEI for a pasted address. Throws one plain sentence per failure
 * mode: not a urn, no such text, network unreachable.
 */
export async function fetchPerseusTei(input: string, fetcher: Fetcher = globalThis.fetch.bind(globalThis)): Promise<string> {
  const urn = parseCtsUrn(input);
  if (urn === null) throw new Error(NOT_A_URN_MESSAGE);

  const url = teiUrlFor(urn);
  if (url === null) {
    throw new Error(
      'That address names a work but not which edition. Open it in Scaife, choose the edition you want, and copy that address.',
    );
  }

  let response: Awaited<ReturnType<Fetcher>>;
  try {
    response = await fetcher(url);
  } catch (err) {
    console.error('[perseus] fetch failed', url, err);
    throw new Error(FETCH_FAILED_MESSAGE);
  }

  if (response.status === 404) throw new Error(NOT_FOUND_MESSAGE);
  if (!response.ok) {
    console.error('[perseus] fetch returned', response.status, url);
    throw new Error(FETCH_FAILED_MESSAGE);
  }
  return response.text();
}

/** Language of a CTS namespace, for the work record. */
export function languageFor(urn: CtsUrn): string | undefined {
  if (urn.namespace === 'greekLit') return 'Greek';
  if (urn.namespace === 'latinLit') return 'Latin';
  return undefined;
}

export interface PerseusImportOptions {
  /** Overrides the title from the TEI header. */
  title?: string;
  language?: string;
  existingIds?: Iterable<string>;
}

/**
 * TEI text in, a work and chapter file out. Shared by both Perseus routes —
 * the file picker reads the text off disk, the URL box fetches it.
 */
export function importPerseusTei(xml: string, options: PerseusImportOptions = {}): SourceImport {
  const doc = parseTeiRows(xml);
  if (doc.rows.length === 0) {
    throw new Error('There’s no text in that file — it may be a table of contents rather than a work.');
  }
  return createSourceImport(
    {
      title: options.title ?? doc.title ?? 'Untitled',
      ...(doc.author ? { author: doc.author } : {}),
      ...(options.language ? { language: options.language } : {}),
      levelNames: doc.levelNames,
      rows: doc.rows,
    },
    options.existingIds ?? [],
  );
}
