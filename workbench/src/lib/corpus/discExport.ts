/**
 * Diogenes' exporter over a user's TLG or PHI disc: the types the importer
 * shares, and where an export lands.
 *
 * WHY DIOGENES AT ALL, when the packs made lookup standalone: reading a
 * TLG/PHI disc means decoding a 1985 binary format with its own citation
 * escapes, and Diogenes has done that correctly for twenty years. Users with
 * the discs already have it. Users without the discs never touch this path —
 * they import from Perseus, which needs nothing installed.
 *
 * Rust finds perl and Diogenes, builds the command and runs it
 * (`diogenes_export` in src-tauri/src/commands.rs); the window never names a
 * program or an argument (workbench-design/sandboxing-plan.md).
 */

export type Corpus = 'tlg' | 'phi';

/**
 * How to treat line breaks, which materially changes the imported text:
 *
 *  - 'auto'  — let Diogenes decide. It carries a per-work heuristic AND a
 *              hand-curated exception list (is_work_verse in xml-export.pl),
 *              which is a better judgment than ours and matches what the user
 *              sees when they read the same text in Diogenes itself.
 *  - 'lines' — force verse: every printed line becomes a row and keeps its
 *              number. Right where the edition's line breaks are canonical,
 *              as Bekker's are for Aristotle.
 *  - 'prose' — force prose: line breaks dropped and hyphenation rejoined, so
 *              rows are sections rather than lines.
 */
export type LineMode = 'auto' | 'lines' | 'prose';

/**
 * Where the exported XML for one work lands. Diogenes names files
 * <corpus><author><work>.xml, e.g. tlg0059030.xml — verified against real
 * output.
 */
export function exportedWorkPath(exportDir: string, corpus: Corpus, authorNumber: string, workNumber: string): string {
  return `${trimSlash(exportDir)}/Diogenes-Resources/xml/${corpus}/${corpus}${authorNumber}${workNumber}.xml`;
}

function trimSlash(path: string): string {
  return path.replace(/[\\/]+$/, '');
}
