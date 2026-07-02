<script lang="ts">
  // "Import chapter…" dialog (build spec Phase 2, workbench-design/
  // d3-scrivener-import.md §6 + d3a §1). Two file-selection paths converge on
  // the same ParsedImportFile → ImportPlan → preview table:
  //   - a single canonical workbench-format file (frontmatter + [GREEK]/
  //     [ENGLISH]);
  //   - a real Scrivener export PAIR (two .md files; the ≥90%-Greek one is
  //     auto-identified as the Greek side — the user never labels them) plus
  //     a small work/book/chapter form (d3a §1).
  // Every failure mode is the backend's own plain sentence, shown verbatim.
  // The preview table lets the user fix ⚠ rows before confirming; the Import
  // button stays disabled with a one-line reason while anything blocks it.
  import { isTauri } from '../lib/runtime';
  import type { WorkManifest } from '../lib/works/manifest';
  import { getWork, listWorks } from '../lib/works/manifest';
  import {
    parseImportFile,
    parseScrivenerPair,
    classifyImportFile,
    UNKNOWN_FORMAT_MESSAGE,
    type ImportParseResult,
  } from '../lib/import/parseImportFile';
  import type { ScrivenerForm } from '../lib/import/scrivenerMd';
  import {
    buildImportPlan,
    buildChapterFile,
    chapterFileExists,
    type ImportPlan,
    type ImportPlanResult,
  } from '../lib/import/plan';
  import { serializeChapterFile } from '../lib/chapterfile/parse';
  import { libraryStorage, chapterFileName } from '../lib/library/storage';
  import {
    buildPreviewState,
    editRowText,
    mergeIntoPrevious,
    pushToNext,
    assignOrphan,
    discardOrphan,
    unresolveOrphan,
    isOrphanUnresolved,
    importGate,
    flaggedFraction,
    applyPreviewToPlan,
    REVIEW_BANNER_THRESHOLD,
    REVIEW_BANNER_MESSAGE,
    ROW_STATE_LABELS,
    ROW_STATE_NOTES,
    type PreviewState,
  } from '../lib/import/previewModel';
  import type { RowState } from '../lib/import/plan';

  let {
    works,
    defaultWorkId,
    onClose,
    onImported,
  }: {
    /** Works this app version knows about (App passes the full list). */
    works: WorkManifest[];
    /** The work whose rail button launched the dialog, if any (§1 default). */
    defaultWorkId?: string;
    onClose: () => void;
    /** Called with the (workId, book, chapter) just written, so the host can
     * refresh the rail and open the chapter in the editor. */
    onImported: (workId: string, book: number, chapter: number) => void;
  } = $props();

  type Phase =
    | 'select' // choosing file(s) / filling the scrivener form
    | 'reading' // parsing + building the plan
    | 'preview' // the row table
    | 'duplicate' // §7 (c) — Replace/Cancel gate before writing
    | 'writing'
    | 'done';

  let phase = $state<Phase>('select');
  let errorMessage = $state<string | null>(null);

  // ── file selection state ──────────────────────────────────────────────
  type PickedKind = 'none' | 'canonical' | 'scrivener-pair';
  let pickedKind = $state<PickedKind>('none');
  let canonicalPath = $state<string | null>(null);
  let canonicalRaw = $state<string | null>(null);
  let greekPath = $state<string | null>(null);
  let englishPath = $state<string | null>(null);
  let greekRaw = $state<string | null>(null);
  let englishRaw = $state<string | null>(null);

  // Scrivener form fields (d3a §1). Defaults: the launching work, blank
  // book/chapter (the user must supply them — stage-0 exports always carry
  // book+chapter, plan.ts requires them for the scrivener path).
  let formWork = $state<string>(defaultWorkId ?? works[0]?.id ?? '');
  let formBook = $state<string>('');
  let formChapter = $state<string>('');
  let formBekkerStart = $state<string>('');

  const GREEK_SCRIPT_RE = /[Ͱ-Ͽἀ-῿]/;
  const GREEK_TOKEN_RE = /^[Ͱ-Ͽἀ-῿]+$/;

  /** Fraction of word-ish tokens that are Greek-script — used to tell the two
   * halves of a Scrivener pair apart WITHOUT asking the user to label them
   * (d3a §1: "the ≥90%-Greek-tokens one is the Greek side"). */
  function greekTokenFraction(text: string): number {
    const tokens = text.split(/\s+/).filter((t) => t.replace(/[^\p{L}]/gu, '').length > 0);
    if (tokens.length === 0) return 0;
    let greek = 0;
    for (const t of tokens) {
      const letters = t.replace(/[^\p{L}]/gu, '');
      if (letters.length > 0 && GREEK_TOKEN_RE.test(letters)) greek++;
      else if (GREEK_SCRIPT_RE.test(t)) greek++;
    }
    return greek / tokens.length;
  }

  async function pickCanonicalFile() {
    if (!isTauri()) return;
    errorMessage = null;
    const dialog = await import('@tauri-apps/plugin-dialog');
    const path = await dialog.open({
      multiple: false,
      title: 'Choose a chapter file to import',
      filters: [{ name: 'Text', extensions: ['md', 'txt'] }],
    });
    if (typeof path !== 'string') return; // cancelled
    const fs = await import('@tauri-apps/plugin-fs');
    const raw = await fs.readTextFile(path);
    const format = classifyImportFile(raw);
    if (format === 'unknown') {
      errorMessage = UNKNOWN_FORMAT_MESSAGE;
      return;
    }
    if (format === 'scrivener-md') {
      // A single scrivener-md file was chosen where a pair is expected — stage
      // 0 always ships two files (d3a §1 DEFAULT). Guide the user, don't guess.
      errorMessage =
        'This looks like one half of a Scrivener export — choose both the Greek and English files together.';
      return;
    }
    pickedKind = 'canonical';
    canonicalPath = path;
    canonicalRaw = raw;
    await runCanonical(raw);
  }

  async function pickScrivenerPair() {
    if (!isTauri()) return;
    errorMessage = null;
    const dialog = await import('@tauri-apps/plugin-dialog');
    const paths = await dialog.open({
      multiple: true,
      title: 'Choose the Greek and English Scrivener export files',
      filters: [{ name: 'Text', extensions: ['md', 'txt'] }],
    });
    if (!paths) return; // cancelled
    const list = Array.isArray(paths) ? paths : [paths];
    if (list.length !== 2) {
      errorMessage = 'Choose exactly two files — the Greek export and the English export.';
      return;
    }
    const fs = await import('@tauri-apps/plugin-fs');
    const [rawA, rawB] = await Promise.all(list.map((p) => fs.readTextFile(p)));
    void loadScrivenerPair(list[0], rawA, list[1], rawB);
  }

  function loadScrivenerPair(pathA: string, rawA: string, pathB: string, rawB: string) {
    // Auto-identify the Greek side (d3a §1) — never ask the user to label them.
    const fracA = greekTokenFraction(rawA);
    const fracB = greekTokenFraction(rawB);
    const aIsGreek = fracA >= fracB;
    greekPath = aIsGreek ? pathA : pathB;
    englishPath = aIsGreek ? pathB : pathA;
    greekRaw = aIsGreek ? rawA : rawB;
    englishRaw = aIsGreek ? rawB : rawA;
    pickedKind = 'scrivener-pair';
    errorMessage = null;
  }

  // ── dev-only browser harness (build brief item 7) ──────────────────────
  const devHarness = !isTauri() && import.meta.env.DEV;

  async function loadDevSample() {
    errorMessage = null;
    try {
      const [gRes, eRes] = await Promise.all([
        fetch('/dev-corpus-samples/Meta%207.17%20Greek.md'),
        fetch('/dev-corpus-samples/Meta%207.17%20(English).md'),
      ]);
      if (!gRes.ok || !eRes.ok) {
        errorMessage = 'The sample Scrivener pair is not available in this dev build.';
        return;
      }
      const [g, e] = await Promise.all([gRes.text(), eRes.text()]);
      formWork = 'metaphysics';
      formBook = '7';
      formChapter = '17';
      loadScrivenerPair('Meta 7.17 Greek.md', g, 'Meta 7.17 (English).md', e);
    } catch (err) {
      console.error('[import] dev sample load failed', err);
      errorMessage = 'The sample Scrivener pair could not be loaded.';
    }
  }

  // ── running the parse + plan pipeline ──────────────────────────────────

  let plan = $state<ImportPlan | null>(null);
  let preview = $state<PreviewState | null>(null);

  async function runCanonical(raw: string) {
    phase = 'reading';
    errorMessage = null;
    const parsed = parseImportFile(raw);
    await finishParse(parsed);
  }

  async function submitScrivenerForm() {
    if (!greekRaw || !englishRaw) return;
    const work = formWork.trim();
    const book = Number(formBook);
    const chapter = Number(formChapter);
    if (!work) {
      errorMessage = "Choose which work this chapter belongs to.";
      return;
    }
    if (!Number.isInteger(book) || book < 1) {
      errorMessage = 'Enter a whole-number book.';
      return;
    }
    if (!Number.isInteger(chapter) || chapter < 1) {
      errorMessage = 'Enter a whole-number chapter.';
      return;
    }
    phase = 'reading';
    errorMessage = null;
    const form: ScrivenerForm = { work, book, chapter };
    const bekkerStart = formBekkerStart.trim();
    if (bekkerStart) form.bekkerStart = bekkerStart;
    const parsed = parseScrivenerPair(greekRaw, englishRaw, form);
    await finishParse(parsed);
  }

  async function finishParse(parsed: ImportParseResult) {
    if (!parsed.ok) {
      console.warn('[import] parse failed:', parsed.kind, parsed.detail);
      errorMessage = parsed.message;
      phase = 'select';
      return;
    }
    let work: WorkManifest;
    try {
      work = getWork(parsed.value.frontmatter.work);
    } catch {
      errorMessage = `"${parsed.value.frontmatter.work}" isn't a work this app knows about.`;
      phase = 'select';
      return;
    }
    const result: ImportPlanResult = await buildImportPlan(parsed.value, work);
    if (!result.ok) {
      console.warn('[import] plan failed:', result.kind, result.detail);
      errorMessage = result.message;
      phase = 'select';
      return;
    }
    plan = result;
    preview = buildPreviewState(result);
    phase = 'preview';
  }

  // ── preview interactions ────────────────────────────────────────────────

  function onRowEdit(index: number, text: string) {
    if (!preview) return;
    preview = editRowText(preview, index, text);
  }
  function onMergeUp(index: number) {
    if (!preview) return;
    preview = mergeIntoPrevious(preview, index);
  }
  function onPushDown(index: number) {
    if (!preview) return;
    preview = pushToNext(preview, index);
  }
  function onAssignOrphan(importIndex: number, address: string) {
    if (!preview || !address) return;
    preview = assignOrphan(preview, importIndex, address);
  }
  function onDiscardOrphan(importIndex: number) {
    if (!preview) return;
    preview = discardOrphan(preview, importIndex);
  }
  function onUnresolveOrphan(importIndex: number) {
    if (!preview) return;
    preview = unresolveOrphan(preview, importIndex);
  }

  const gate = $derived(plan && preview ? importGate(plan, preview) : { enabled: false, reason: null });
  const bannerVisible = $derived(preview ? flaggedFraction(preview) > REVIEW_BANNER_THRESHOLD : false);

  function rowNote(state: RowState): string | null {
    if (state === 'matched') return null;
    return ROW_STATE_NOTES[state as Exclude<RowState, 'matched'>];
  }

  // ── confirm / write ──────────────────────────────────────────────────

  async function confirmImport() {
    if (!plan || !preview) return;
    const exists = await chapterFileExists(plan.work.id, plan.book, plan.chapter);
    if (exists) {
      phase = 'duplicate';
      return;
    }
    await writeChapter();
  }

  async function writeChapter() {
    if (!plan || !preview) return;
    phase = 'writing';
    try {
      const resolved = applyPreviewToPlan(plan, preview);
      const chapterFile = buildChapterFile(resolved);
      const content = serializeChapterFile(chapterFile);
      await libraryStorage().write(plan.work.id, chapterFileName(plan.book, plan.chapter), content);
      const label = plan.work.books[plan.book - 1]?.label ?? String(plan.book);
      const rowCount = chapterFile.greekLines.length;
      const fnCount = chapterFile.footnotes.length;
      successMessage =
        fnCount > 0
          ? `Imported ${label}.${plan.chapter} — ${rowCount} rows, ${fnCount} footnotes.`
          : `Imported ${label}.${plan.chapter} — ${rowCount} rows.`;
      phase = 'done';
      onImported(plan.work.id, plan.book, plan.chapter);
    } catch (err) {
      console.error('[import] write failed', err);
      errorMessage = "This chapter couldn't be saved.";
      phase = 'preview';
    }
  }

  let successMessage = $state<string>('');

  function cancelDuplicate() {
    phase = 'preview';
  }

  function reset() {
    phase = 'select';
    errorMessage = null;
    pickedKind = 'none';
    canonicalPath = null;
    canonicalRaw = null;
    greekPath = null;
    englishPath = null;
    greekRaw = null;
    englishRaw = null;
    plan = null;
    preview = null;
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Import chapter">
    <header class="dialog-head">
      <h2>Import chapter</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="dialog-body" class:wide={phase === 'preview'}>
      {#if phase === 'select'}
        {#if errorMessage}
          <p class="line error">{errorMessage}</p>
        {/if}

        {#if pickedKind === 'none'}
          <p class="line">Choose a file to import:</p>
          <div class="pick-buttons">
            <button class="pick-btn" onclick={pickCanonicalFile} disabled={!isTauri()}>
              Choose a chapter file…
            </button>
            <button class="pick-btn" onclick={pickScrivenerPair} disabled={!isTauri()}>
              Choose a Scrivener export pair…
            </button>
          </div>
          {#if devHarness}
            <button class="pick-btn dev-btn" onclick={loadDevSample}>Load sample pair (dev)</button>
          {/if}
          {#if !isTauri() && !devHarness}
            <p class="line note">Importing is only available in the desktop app.</p>
          {/if}
        {:else if pickedKind === 'scrivener-pair'}
          <p class="line">
            Greek: <strong>{greekPath ?? 'sample'}</strong><br />
            English: <strong>{englishPath ?? 'sample'}</strong>
          </p>
          <div class="form-grid">
            <label class="field">
              <span>Work</span>
              <select bind:value={formWork}>
                {#each works as w (w.id)}
                  <option value={w.id}>{w.title}</option>
                {/each}
              </select>
            </label>
            <label class="field">
              <span>Book</span>
              <input type="text" inputmode="numeric" bind:value={formBook} placeholder="7" />
            </label>
            <label class="field">
              <span>Chapter</span>
              <input type="text" inputmode="numeric" bind:value={formChapter} placeholder="17" />
            </label>
            <label class="field">
              <span>Bekker start (optional)</span>
              <input type="text" bind:value={formBekkerStart} placeholder="1041a6" />
            </label>
          </div>
          <div class="form-actions">
            <button class="secondary-btn" onclick={reset}>Back</button>
            <button class="primary-btn" onclick={submitScrivenerForm}>Continue</button>
          </div>
        {/if}
      {:else if phase === 'reading'}
        <p class="line">Reading and matching the text…</p>
      {:else if phase === 'preview' && plan && preview}
        <div class="preview-shell">
          {#if plan.discrepancy}
            <p class="notice">{plan.discrepancy}</p>
          {/if}
          {#each plan.notices as notice}
            <p class="notice">{notice}</p>
          {/each}
          {#if bannerVisible}
            <p class="notice notice-strong">{REVIEW_BANNER_MESSAGE}</p>
          {/if}
          {#if errorMessage}
            <p class="line error">{errorMessage}</p>
          {/if}

          <div class="table-wrap">
            <table class="preview-table">
              <thead>
                <tr>
                  <th class="col-addr">Bekker</th>
                  <th class="col-grc">Greek (spine)</th>
                  <th class="col-eng">English</th>
                  <th class="col-state">State</th>
                  <th class="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {#each preview.rows as row (row.index)}
                  <tr class:flagged={row.flagged} class:quiet={!row.flagged}>
                    <td class="col-addr">{row.address}</td>
                    <td class="col-grc">
                      {row.spineGreek}
                      {#if row.userGreek}
                        <details class="grc-diff">
                          <summary>your Greek</summary>
                          <div class="grc-diff-body">{row.userGreek}</div>
                        </details>
                      {/if}
                    </td>
                    <td class="col-eng">
                      <textarea
                        class="eng-cell"
                        value={row.english}
                        oninput={(e) => onRowEdit(row.index, (e.currentTarget as HTMLTextAreaElement).value)}
                        rows="2"
                      ></textarea>
                      <div class="row-actions">
                        <button
                          class="mini-btn"
                          title="Merge into previous row"
                          disabled={row.index === 0}
                          onclick={() => onMergeUp(row.index)}
                        >▲</button>
                        <button
                          class="mini-btn"
                          title="Push to next row"
                          disabled={row.index === preview.rows.length - 1}
                          onclick={() => onPushDown(row.index)}
                        >▼</button>
                      </div>
                    </td>
                    <td class="col-state">
                      <span
                        class="badge"
                        class:badge-ok={row.state === 'matched'}
                        class:badge-warn={row.state !== 'matched'}
                        title={rowNote(row.state) ?? undefined}
                      >
                        {ROW_STATE_LABELS[row.state]}
                      </span>
                      {#if rowNote(row.state)}
                        <p class="row-note">{rowNote(row.state)}</p>
                      {/if}
                    </td>
                    <td class="col-actions"></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          {#if preview.orphans.length > 0}
            <div class="orphans">
              <h3>Unplaced lines</h3>
              <p class="line">These imported lines didn't match any Greek line in the standard text.</p>
              <ul class="orphan-list">
                {#each preview.orphans as orphan (orphan.importIndex)}
                  <li class="orphan-row" class:resolved={!isOrphanUnresolved(orphan)}>
                    <div class="orphan-text">
                      <span class="orphan-greek">{orphan.greek}</span>
                      <span class="orphan-english">{orphan.english}</span>
                    </div>
                    {#if isOrphanUnresolved(orphan)}
                      <div class="orphan-actions">
                        <select
                          class="orphan-assign"
                          onchange={(e) => onAssignOrphan(orphan.importIndex, (e.currentTarget as HTMLSelectElement).value)}
                        >
                          <option value="">assign to row…</option>
                          {#each preview.rows as row (row.index)}
                            <option value={row.address}>{row.address}</option>
                          {/each}
                        </select>
                        <button class="mini-btn" onclick={() => onDiscardOrphan(orphan.importIndex)}>discard</button>
                      </div>
                    {:else}
                      <div class="orphan-actions">
                        <span class="orphan-resolved-note">
                          {orphan.discarded ? 'discarded' : `assigned to ${orphan.assignedTo}`}
                        </span>
                        <button class="mini-btn" onclick={() => onUnresolveOrphan(orphan.importIndex)}>undo</button>
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {:else if phase === 'duplicate' && plan}
        <p class="line">
          You already have a saved {plan.work.books[plan.book - 1]?.label ?? plan.book} Chapter {plan.chapter} —
          importing will replace it; the current version will be lost.
        </p>
        <div class="form-actions">
          <button class="secondary-btn" onclick={cancelDuplicate}>Cancel</button>
          <button class="primary-btn" onclick={writeChapter}>Replace</button>
        </div>
      {:else if phase === 'writing'}
        <p class="line">Saving…</p>
      {:else if phase === 'done'}
        <p class="line">{successMessage}</p>
        <div class="form-actions">
          <button class="primary-btn" onclick={onClose}>Done</button>
        </div>
      {/if}
    </div>

    {#if phase === 'preview'}
      <footer class="dialog-foot">
        {#if gate.reason}
          <span class="gate-reason">{gate.reason}</span>
        {/if}
        <span class="spacer"></span>
        <button class="secondary-btn" onclick={reset}>Back</button>
        <button class="primary-btn" disabled={!gate.enabled} onclick={confirmImport}>Import…</button>
      </footer>
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 40;
  }

  .dialog {
    width: 380px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    display: flex;
    flex-direction: column;
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--popup-shadow);
  }
  .dialog:has(.dialog-body.wide) {
    width: min(920px, calc(100vw - 2 * var(--space-4)));
  }

  .dialog-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .dialog-head h2 {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text);
    background: var(--ui-hover);
  }

  .dialog-body {
    padding: var(--space-4);
    overflow-y: auto;
    min-height: 0;
  }
  .dialog-body.wide {
    flex: 1;
  }

  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-mid);
  }
  .line + .line {
    margin-top: var(--space-2);
  }
  .line.error {
    color: var(--error);
  }
  .line.note {
    margin-top: var(--space-3);
    font-style: italic;
    color: var(--text-light);
  }

  .pick-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .pick-btn {
    font-family: var(--font-english);
    font-size: 0.95rem;
    text-align: left;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .pick-btn:hover:not(:disabled) {
    border-color: var(--accent-light);
    background: color-mix(in srgb, var(--accent) 5%, var(--input-bg));
  }
  .pick-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .dev-btn {
    margin-top: var(--space-2);
    font-style: italic;
    color: var(--text-mid);
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
  }
  .field select,
  .field input {
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .primary-btn {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--on-accent);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .primary-btn:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .primary-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .secondary-btn {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--text-mid);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .secondary-btn:hover {
    color: var(--text);
    background: var(--ui-hover);
  }

  /* ── preview table ──────────────────────────────────────────────── */
  .preview-shell {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .notice {
    font-family: var(--font-english);
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--text-mid);
    background: var(--ui-hover);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
  }
  .notice-strong {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    font-weight: 500;
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: 0.82rem;
  }
  .preview-table thead th {
    text-align: left;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-light);
    padding: var(--space-2) var(--space-2);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--col-bg);
  }
  /* Quiet rows render calm — no wash, minimal visual weight; only .flagged
     rows below get a background tint. */
  .preview-table tbody tr {
    border-bottom: 1px solid var(--border);
  }
  .preview-table tbody tr.flagged {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .preview-table td {
    padding: var(--space-2);
    vertical-align: top;
  }
  .col-addr {
    font-variant-numeric: tabular-nums;
    color: var(--text-mid);
    white-space: nowrap;
    width: 5.5rem;
  }
  .col-grc {
    font-family: var(--font-greek);
    font-size: 0.95rem;
    color: var(--text);
    width: 28%;
  }
  .col-eng {
    width: 42%;
  }
  .col-state {
    width: 14rem;
  }
  .col-actions {
    width: 0;
  }

  .eng-cell {
    width: 100%;
    resize: vertical;
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.4;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.3rem 0.45rem;
  }
  tr.quiet .eng-cell {
    border-color: transparent;
    background: transparent;
  }
  tr.quiet .eng-cell:hover,
  tr.quiet .eng-cell:focus {
    border-color: var(--border);
    background: var(--input-bg);
  }

  .row-actions {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }
  .mini-btn {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-mid);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
  }
  .mini-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--ui-hover);
  }
  .mini-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .badge {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.12rem 0.5rem;
  }
  .badge-ok {
    color: var(--text-light);
  }
  .badge-warn {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .row-note {
    margin-top: var(--space-1);
    font-family: var(--font-english);
    font-size: 0.76rem;
    font-style: italic;
    line-height: 1.35;
    color: var(--text-mid);
  }

  .grc-diff {
    margin-top: var(--space-1);
    font-size: 0.75rem;
  }
  .grc-diff summary {
    cursor: pointer;
    color: var(--accent);
  }
  .grc-diff-body {
    margin-top: var(--space-1);
    color: var(--text-mid);
  }

  /* ── orphans ────────────────────────────────────────────────────── */
  .orphans h3 {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-mid);
    margin-bottom: var(--space-1);
  }
  .orphan-list {
    list-style: none;
    margin-top: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .orphan-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .orphan-row.resolved {
    background: transparent;
    opacity: 0.75;
  }
  .orphan-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.85rem;
    min-width: 0;
  }
  .orphan-greek {
    font-family: var(--font-greek);
    color: var(--text-mid);
  }
  .orphan-english {
    font-family: var(--font-english);
    color: var(--text);
  }
  .orphan-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .orphan-assign {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.2rem 0.4rem;
  }
  .orphan-resolved-note {
    font-family: var(--font-ui);
    font-size: 0.76rem;
    color: var(--text-light);
    font-style: italic;
  }

  /* ── footer ─────────────────────────────────────────────────────── */
  .dialog-foot {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
  }
  .gate-reason {
    font-family: var(--font-english);
    font-size: 0.8rem;
    font-style: italic;
    color: var(--text-mid);
  }
  .spacer {
    flex: 1;
  }
</style>
