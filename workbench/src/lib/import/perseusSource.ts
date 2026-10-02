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

/**
 * The CTS namespaces Perseus publishes, and the repositories that hold them —
 * more than one for Greek. canonical-greekLit is the Perseus core; the bulk of
 * Aristotle is not in it. De Anima, the Physics, the Ethics and thirty-nine
 * more sit in OpenGreekAndLatin/First1KGreek, under the same urns and the same
 * directory layout. Both are tried in turn, so a user pasting a Scaife address
 * never has to know which project published the text.
 */
const REPOSITORIES: Record<string, string[]> = {
  greekLit: ['PerseusDL/canonical-greekLit', 'OpenGreekAndLatin/First1KGreek'],
  latinLit: ['PerseusDL/canonical-latinLit'],
};

/** Version ids beginning this way are First1KGreek's — try that repo first. */
const FIRST1K_MARKER = '1st1K';

const RAW_HOST = 'https://raw.githubusercontent.com';
const BRANCH = 'master';

/**
 * The CLLG FREED corpus (Inria): the TLG E disc run through Diogenes and
 * published as TEI, so a user with no disc gets the same texts. Same urns and
 * the same data/<group>/<work>/ layout as Perseus, under its own version ids
 * (`tlg0086.tlg025.cllg-grc1`), on GitLab rather than GitHub.
 *
 * Fetched through the GitLab API, not the /-/raw/ page: the API answers a
 * cross-site fetch and the page does not (checked 2026-10-02).
 */
const FREED_MARKER = 'cllg-';
const FREED_FILES = 'https://gitlab.inria.fr/api/v4/projects/almanach%2Fcllg%2Ffreed-corpus/repository/files';
const FREED_BRANCH = 'main';

/** A FREED file name inside a pasted GitLab address — FREED's pages show no urn. */
const FREED_FILE_RE = /(tlg\d{4})\.(tlg\d{3})\.(cllg-[A-Za-z]+\d+)\.xml/;

export const NOT_A_URN_MESSAGE =
  'That doesn’t look like a Perseus or FREED text. Paste a Scaife address (scaife.perseus.org/reader/…), the address of a FREED file, or a CTS urn (urn:cts:greekLit:…).';
export const FETCH_FAILED_MESSAGE = 'Couldn’t reach Perseus. Check the connection and try again.';
export const NOT_FOUND_MESSAGE = 'Perseus has no text at that address.';
export const FREED_FETCH_FAILED_MESSAGE = 'Couldn’t reach FREED. Check the connection and try again.';
export const FREED_NOT_FOUND_MESSAGE = 'FREED has no text at that address.';

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
  if (!match) {
    const file = FREED_FILE_RE.exec(text);
    return file ? { namespace: 'greekLit', group: file[1], work: file[2], version: file[3] } : null;
  }

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
 * Every raw file URL a urn could name, in the order worth trying. A urn with
 * no version can't name a file — a work has several editions and translations
 * — so this returns an empty list and the caller asks for a fuller address.
 */
export function teiUrlCandidates(urn: CtsUrn): string[] {
  const repos = REPOSITORIES[urn.namespace];
  if (!repos || !urn.version) return [];
  const file = `${urn.group}.${urn.work}.${urn.version}.xml`;
  if (isFreed(urn)) {
    const path = encodeURIComponent(`data/${urn.group}/${urn.work}/${file}`);
    return [`${FREED_FILES}/${path}/raw?ref=${FREED_BRANCH}`];
  }
  const ordered = urn.version.includes(FIRST1K_MARKER)
    ? [...repos].sort((a, b) => Number(b.includes('First1KGreek')) - Number(a.includes('First1KGreek')))
    : repos;
  return ordered.map((repo) => `${RAW_HOST}/${repo}/${BRANCH}/data/${urn.group}/${urn.work}/${file}`);
}

function isFreed(urn: CtsUrn): boolean {
  return urn.version?.startsWith(FREED_MARKER) ?? false;
}

/** The project a urn's text comes from, for the dialog to name. */
export function sourceNameFor(urn: CtsUrn): 'FREED' | 'Perseus' {
  return isFreed(urn) ? 'FREED' : 'Perseus';
}

/** The first URL worth trying, or null when the urn names no edition. */
export function teiUrlFor(urn: CtsUrn): string | null {
  return teiUrlCandidates(urn)[0] ?? null;
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

  const urls = teiUrlCandidates(urn);
  if (urls.length === 0) {
    throw new Error(
      'That address names a work but not which edition. Open it in Scaife, choose the edition you want, and copy that address.',
    );
  }

  // A 404 is not a failure while another repository is still untried — it just
  // means this text belongs to the other project. Any other error is fatal at
  // once: a network that is down for one host is down for both.
  let unreachable = false;
  for (const url of urls) {
    let response: Awaited<ReturnType<Fetcher>>;
    try {
      response = await fetcher(url);
    } catch (err) {
      console.error('[perseus] fetch failed', url, err);
      unreachable = true;
      continue;
    }
    if (response.status === 404) continue;
    if (!response.ok) {
      console.error('[perseus] fetch returned', response.status, url);
      unreachable = true;
      continue;
    }
    return response.text();
  }

  if (isFreed(urn)) throw new Error(unreachable ? FREED_FETCH_FAILED_MESSAGE : FREED_NOT_FOUND_MESSAGE);
  throw new Error(unreachable ? FETCH_FAILED_MESSAGE : NOT_FOUND_MESSAGE);
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
