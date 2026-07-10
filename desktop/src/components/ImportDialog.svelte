<script lang="ts">
  // The import flow, end to end: metadata form → tag scan + alignment →
  // completion summary. One modal, one screen per step, no scrolling forms.
  //
  // The completion summary is a first-class moment, not a log line — it is
  // where "estimates are always labelled" becomes visible to a first-time
  // importer: tagged anchors, alignment-placed anchors, and interpolated
  // (estimate) lines are reported separately and honestly.
  import { onMount, onDestroy } from 'svelte';
  import { WORKS } from '../../../app/src/lib/works';
  import { runImport, ImportCollision, type ImportSummary } from '../lib/imports';
  import { parseTranslationFile, composeCitation, emphasisScanInput, splitFrontmatter } from '../lib/translation-file';
  import { dehyphenate, listReviewItems, resolveReviews, type ReviewItem } from '../lib/dehyphenate';
  import { scanEmphasis, listEmphasisReviewItems, type EmphasisReviewItem } from '../lib/emphasis';
  import { convertLayoutExtraction, isLayoutExtraction, type ConvertOptions, type ConvertReport } from '../lib/pdf-import';
  import { isTauri } from '../lib/runtime';
  import type { UnlistenFn } from '@tauri-apps/api/event';

  export let file: { name: string; text: string } | null = null;
  export let presetWork: string | null = null;   // pre-filled when launched from a work
  export let onClose: (imported: ImportSummary | null) => void;

  type Step =
    | 'pick' | 'form' | 'review' | 'emph-review' | 'running' | 'collision' | 'done' | 'error'
    // Phase 4B: the PDF-conversion pre-stage's own outcomes, ahead of the form.
    | 'convert-refused' | 'convert-choice';
  let step: Step = 'pick';

  // form state
  let work = presetWork ?? 'EN';
  let translator = '';
  let personalCopy: 'yes' | 'no' | null = null;
  let advLicense: 'public-domain' | 'cc-by' | 'cc-by-sa' | 'not-sure' = 'not-sure';
  let yearStr = '';
  let sourceStr = '';
  let citationStr = '';
  // Once the person edits the Citation field by hand, stop silently
  // overwriting it as translator/year/source change underneath them.
  let citationTouched = false;

  let progress = '';
  let errorMsg = '';
  let summary: ImportSummary | null = null;
  let collision: ImportCollision | null = null;

  // Dehyphenation review queue: sites the dictionary couldn't safely decide.
  let reviewItems: ReviewItem[] = [];
  let reviewChoices = new Map<number, string>();
  let reviewPos = 0;
  let autoJoined = 0;
  let dehyphenatedText: string | null = null;

  // Emphasis review queue: markdown emphasis spans the classifier couldn't
  // confidently place — same shape as the dehyphenation queue above, one
  // decision at a time with a sensible pattern-based default. Runs AFTER
  // dehyphenation resolves (so a rejoined word never straddles a marker in a
  // confusing way) and before the final import call. The dialog only
  // COLLECTS the user's per-item choices here — it never strips markers out
  // of the text itself; parseTranslationFile (inside runImport) re-runs the
  // same pure scanEmphasis classification on this exact text and replays
  // these choices verbatim (see translation-file.ts's parseTranslationFile
  // doc comment). That's what lets a CONFIDENT span's range survive the trip
  // to runImport — if the dialog pre-stripped markers, a second scanEmphasis
  // pass over already-clean text would have nothing left to recognise as
  // emphasis, silently losing every confident range before storage.
  let emphReviewItems: (EmphasisReviewItem & { context: string; before: string; hit: string; after: string })[] = [];
  let emphReviewChoices = new Map<number, 'keep' | 'remove'>();
  let emphReviewPos = 0;
  let emphConfidentCount = 0;

  $: license = personalCopy === 'yes' || advLicense === 'not-sure'
    ? 'user-supplied' as const
    : advLicense as 'public-domain' | 'cc-by' | 'cc-by-sa';
  $: formReady = !!file && translator.trim().length > 0 && personalCopy !== null;

  // Frontmatter the file may already carry (a re-import of a previously
  // exported/tagged file, or one hand-authored by an advanced user) — read
  // once per file to pre-fill translator/year/source/citation. The metadata
  // form still drives the actual import request; this only seeds defaults.
  $: fileMeta = file ? parseTranslationFile(file.text).meta : {};
  $: if (file) {
    if (fileMeta.translator && !translator) translator = fileMeta.translator;
    if (fileMeta.year && !yearStr) yearStr = String(fileMeta.year);
    if (fileMeta.source && !sourceStr) sourceStr = fileMeta.source;
    if (fileMeta.citation && !citationTouched) { citationStr = fileMeta.citation; citationTouched = true; }
  }
  // Keep the Citation field assembled live from translator/year/source until
  // the user edits it directly, or the file's own frontmatter already supplied
  // one (handled above). This is what makes "Citation" pre-filled-but-editable
  // rather than a second freeform field the user has to fill in from scratch.
  $: if (!citationTouched) citationStr = composeCitation({ translator, year: Number(yearStr) || undefined, source: sourceStr });

  // ── PDF layout-extraction pre-stage ─────────────────────────────────────────
  // Detection rule lives in pdf-import/index.ts (isLayoutExtraction) so it's
  // unit-testable without a DOM; those files route through
  // convertLayoutExtraction BEFORE the metadata form step, every other file
  // takes the pre-existing path unchanged.
  // Held for the Done step's honesty report (task 1); null for a non-PDF
  // import, which hides that whole report section.
  let convertReport: ConvertReport | null = null;
  // 'b.c' -> title, threaded into runImport (task 2) so this import's chapter
  // titles are shown at chapter openings inside its own column (not merged
  // into the reader's shared chapter headings — that's work-level chrome).
  let convertTitles: Record<string, string> = {};
  // The pristine upload — kept ONLY when the converter ran, and passed to
  // runImport as `original` so the `.original` safety-net file holds the
  // actual pdftotext output rather than the tagged working text. null for a
  // non-PDF import, where the uploaded text and the parse input are (as
  // before) the same thing.
  let originalRawText: string | null = null;
  // NOTICK citations peeled from a layout file's frontmatter header (seating
  // pass §2) — threaded to runImport so the aligner skips those estimate ticks.
  let importNoTicks: string[] | undefined;
  let refusalMsg = '';
  let collapsedPages: number[] = [];
  // The exact upload that triggered a needsChoice — kept so "Import with
  // page-level anchors only" can re-run conversion on the SAME bytes.
  let pendingConvert: { name: string; text: string } | null = null;

  function acceptText(name: string, text: string, opts: ConvertOptions = {}) {
    // Peel a frontmatter header first: a layout FINAL carries a `noTicks` line
    // the frozen converter would fold into body text. Read it here, convert the
    // body only. A non-layout import keeps its raw text (frontmatter intact) so
    // form pre-fill (fileMeta) and runImport's own parser still see it.
    const { meta: header, body } = splitFrontmatter(text);
    importNoTicks = header.noTicks;
    if (!isLayoutExtraction(body)) {
      file = { name, text };
      originalRawText = null;
      convertReport = null;
      convertTitles = {};
      step = 'form';
      return;
    }
    const result = convertLayoutExtraction(body, opts);
    if (result.ok) {
      convertReport = result.report;
      convertTitles = result.titles;
      originalRawText = body;
      file = { name, text: result.tagged };
      step = 'form';
    } else if ('refused' in result) {
      refusalMsg =
        "No printed Bekker line numbers found in this file. The importer reads the "
        + "Bekker numbers printed in an edition's margins; this extraction has none "
        + "— either the edition doesn't print them, or the extraction lost the page "
        + "layout. Re-extract the PDF with pdftotext -layout, or import a pre-tagged file "
        + "instead.";
      step = 'convert-refused';
    } else {
      collapsedPages = result.collapsedPages;
      pendingConvert = { name, text };
      step = 'convert-choice';
    }
  }

  // "Import with page-level anchors only" (the convert-choice step) — re-run
  // the SAME upload with the collapsed-page fallback opted in (§3.6).
  function retryPageLevelOnly() {
    if (!pendingConvert) return;
    acceptText(pendingConvert.name, pendingConvert.text, { pageLevelOnly: true });
  }

  // A file the caller already supplied (App.svelte's own drag-drop handling
  // hands a {name, text} straight to this component's `file` prop, bypassing
  // the pick/drop functions below) goes through the same conversion
  // pre-stage as every other accept path.
  if (file) acceptText(file.name, file.text);

  async function pickFile() {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Translation files', extensions: ['md', 'txt'] }],
      });
      if (typeof path === 'string') {
        acceptText(path.split('/').pop() ?? path, await readTextFile(path));
      }
    } else {
      browserInput?.click();
    }
  }
  let browserInput: HTMLInputElement | undefined;
  async function onBrowserFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    acceptText(f.name, await f.text());
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────
  // Packaged Tauri v2 webviews intercept OS file drags before they ever reach
  // the DOM: no HTML5 `drop` event fires, only `tauri://drag-drop` (exposed via
  // getCurrentWebview().onDragDropEvent). The HTML5 handlers below stay as a
  // harmless fallback for the plain-browser dev harness, guarded so both paths
  // can't double-fire in the packaged app.
  let dropHover = false;
  let dropError = '';
  const ACCEPTED = /\.(txt|md)$/i;

  function acceptName(name: string): boolean {
    return ACCEPTED.test(name);
  }

  async function acceptPath(path: string) {
    dropError = '';
    const name = path.split(/[/\\]/).pop() ?? path;
    if (!acceptName(name)) {
      dropError = 'Please drop one .txt or .md file.';
      return;
    }
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    acceptText(name, await readTextFile(path));
  }

  async function acceptBrowserFile(f: File) {
    dropError = '';
    if (!acceptName(f.name)) {
      dropError = 'Please drop one .txt or .md file.';
      return;
    }
    acceptText(f.name, await f.text());
  }

  let unlistenDragDrop: UnlistenFn | null = null;
  onMount(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      const unlisten = await getCurrentWebview().onDragDropEvent(event => {
        if (step !== 'pick') return; // only while the drop zone is showing
        switch (event.payload.type) {
          case 'enter':
          case 'over':
            dropHover = true;
            break;
          case 'leave':
            dropHover = false;
            break;
          case 'drop': {
            dropHover = false;
            const [firstPath] = event.payload.paths;
            if (firstPath) void acceptPath(firstPath);
            break;
          }
        }
      });
      if (cancelled) unlisten();
      else unlistenDragDrop = unlisten;
    })();
    return () => { cancelled = true; };
  });
  onDestroy(() => {
    if (unlistenDragDrop) unlistenDragDrop();
  });

  // HTML5 fallback (plain-browser dev harness only — see comment above).
  function onZoneDragOver(e: DragEvent) {
    if (isTauri()) return;
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      dropHover = true;
    }
  }
  function onZoneDragLeave() {
    if (isTauri()) return;
    dropHover = false;
  }
  async function onZoneDrop(e: DragEvent) {
    if (isTauri()) return;
    e.preventDefault();
    dropHover = false;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    await acceptBrowserFile(f);
  }

  // Form submit → dehyphenation pass first, then emphasis classification;
  // alignment only once the text is fully settled (auto-decisions applied,
  // every review site resolved by the user).
  async function prepare() {
    if (!file) return;
    step = 'running';
    progress = 'Checking for OCR line-break hyphens…';
    try {
      const d = await dehyphenate(file.text);
      autoJoined = d.decisions.filter(x => x.action === 'joined').length;
      dehyphenatedText = d.text;
      if (d.reviewCount > 0) {
        reviewItems = listReviewItems(d.text);
        reviewChoices = new Map();
        reviewPos = 0;
        step = 'review';
        return;
      }
    } catch {
      // Dictionary unavailable: proceed on the raw text rather than block the
      // import — line-end hyphens then stay exactly as the source had them.
      dehyphenatedText = file.text;
    }
    runEmphasisScan();
  }

  function chooseReview(form: string) {
    reviewChoices.set(reviewItems[reviewPos].index, form);
    if (reviewPos + 1 < reviewItems.length) {
      reviewPos += 1;
    } else {
      dehyphenatedText = resolveReviews(dehyphenatedText!, reviewChoices);
      runEmphasisScan();
    }
  }

  // Classify markdown emphasis in the dehyphenated text — a discovery pass
  // ONLY: markers are never stripped here. runImport's own parseTranslationFile
  // call re-runs this exact classification later (over the identical text —
  // see emphasisScanInput) and is what actually strips markers into stored
  // EmphasisRanges; this pass exists purely to find review-worthy sites and
  // let the user weigh in before the import proceeds, exactly like the
  // hyphenation step above.
  function runEmphasisScan() {
    const source = dehyphenatedText ?? file!.text;
    const r = scanEmphasis(emphasisScanInput(source));
    emphConfidentCount = r.ranges.length;
    if (r.reviewItems.length > 0) {
      emphReviewItems = listEmphasisReviewItems(r.text, r.reviewItems);
      emphReviewChoices = new Map();
      emphReviewPos = 0;
      step = 'emph-review';
      return;
    }
    start();
  }

  function chooseEmphReview(choice: 'keep' | 'remove') {
    emphReviewChoices.set(emphReviewItems[emphReviewPos].index, choice);
    if (emphReviewPos + 1 < emphReviewItems.length) {
      emphReviewPos += 1;
    } else {
      start();
    }
  }

  // One decision applied to every marker not yet answered — a rough scan can
  // throw dozens of stray markers at the queue (75 on Apostle's APo), and
  // stepping through them one at a time serves nobody. Choices already made
  // on earlier items are preserved.
  function chooseEmphReviewAll(choice: 'keep' | 'remove') {
    for (let i = emphReviewPos; i < emphReviewItems.length; i += 1) {
      emphReviewChoices.set(emphReviewItems[i].index, choice);
    }
    start();
  }

  async function start(replace = false, idOverride?: string) {
    if (!file) return;
    step = 'running';
    progress = 'Starting…';
    try {
      summary = await runImport({
        raw: dehyphenatedText ?? file.text,
        // The PDF converter's pristine upload — .original gets the actual
        // pdftotext extraction instead of the tagged working text. Omitted
        // (falls back to `raw`) for a non-PDF import, unchanged from before.
        ...(originalRawText !== null ? { original: originalRawText } : {}),
        ...(Object.keys(convertTitles).length ? { titles: convertTitles } : {}),
        ...(importNoTicks?.length ? { noTicks: importNoTicks } : {}),
        emphasisChoices: emphReviewChoices.size ? emphReviewChoices : undefined,
        work,
        translator: translator.trim(),
        license,
        ...(yearStr && !Number.isNaN(Number(yearStr)) ? { year: Number(yearStr) } : {}),
        ...(sourceStr.trim() ? { source: sourceStr.trim() } : {}),
        ...(citationStr.trim() ? { citation: citationStr.trim() } : {}),
        replace,
        ...(idOverride ? { idOverride } : {}),
      }, msg => { progress = msg; });
      step = 'done';
    } catch (e) {
      if (e instanceof ImportCollision) {
        collision = e;
        step = 'collision';
      } else {
        errorMsg = e instanceof Error ? e.message : String(e);
        step = 'error';
      }
    }
  }

  function finish() {
    if (summary) {
      // Drop the reader straight into the new translation, not back at a
      // library view needing a second click.
      try { localStorage.setItem(`reader-trans-${summary.meta.work}`, summary.meta.id); } catch { /* fine */ }
      try {
        localStorage.setItem('desktop-loc', JSON.stringify({ work: summary.meta.work, book: 1 }));
      } catch { /* fine */ }
    }
    onClose(summary);
  }
</script>

<div class="imp-backdrop" role="presentation" on:click={() => onClose(null)}></div>
<div class="imp" role="dialog" aria-label="Import a translation">
  {#if step === 'pick'}
    <h2>Import a translation</h2>
    <p class="imp-note">
      A plain-text or Markdown file. Chapter tags like <code>{'{1.7}'}</code> are required;
      Bekker tags like <code>{'{1094a}'}</code> and <code>{'{20}'}</code> are used when present —
      anything below the tagged detail is filled in by alignment and labelled as an estimate.
    </p>
    <div
      class="imp-drop"
      class:imp-drop-hover={dropHover}
      role="button"
      tabindex="0"
      aria-label="Drop a .txt or .md file here, or click to browse"
      on:click={pickFile}
      on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } }}
      on:dragover={onZoneDragOver}
      on:dragleave={onZoneDragLeave}
      on:drop={onZoneDrop}
    >
      <svg class="imp-drop-icon" viewBox="0 0 24 24" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <p class="imp-drop-text">
        {#if file}
          <b>{file.name}</b> selected — drop or click to choose a different file
        {:else}
          Drop a <b>.txt</b> or <b>.md</b> file here — or click to browse
        {/if}
      </p>
    </div>
    <input type="file" accept=".md,.txt,text/plain,text/markdown" bind:this={browserInput}
      on:change={onBrowserFile} style="display:none" />
    {#if dropError}<p class="imp-error">{dropError}</p>{/if}

    <div class="imp-actions">
      <button class="imp-quiet" on:click={() => onClose(null)}>Cancel</button>
    </div>

    <details class="imp-help">
      <summary>How do I format a file for import?</summary>
      <div class="imp-help-body">
        <p>Plain text or Markdown, with tags in braces placed immediately
        <em>before</em> the word they belong to (tag, one space, then the word).
        Use the numbers as printed in your source — never a computed count.</p>
        <dl>
          <dt><code>{'{1.7}'}</code></dt>
          <dd><b>Chapter</b> (book.chapter) — <b>required</b>, before the first word of
            each chapter. For single-book works use book 1: <code>{'{1.4}'}</code> = chapter 4.</dd>
          <dt><code>{'{1094a}'}</code></dt>
          <dd><b>Bekker column</b> — optional, before the first word of that column.</dd>
          <dt><code>{'{20}'}</code></dt>
          <dd><b>Bekker line</b> of the current column — optional, if your edition
            prints line numbers (usually every 5th).</dd>
        </dl>
        <p>Example:</p>
        <pre>{'{1.1}'} Every art and every inquiry, and similarly
every action and pursuit, is thought to aim at
some good… {'{1094b}'} But a certain difference is
found among ends…</pre>
        <p>Whatever detail your tags don't provide is filled in by alignment and
        <em>always labelled as an estimate</em> in the margin — chapter tags alone
        are enough for a working parallel text. OCR line-break hyphens
        (like <code>under-</code> at a line end) are detected and fixed with your
        review. You never write the metadata header yourself — this form does.</p>
      </div>
    </details>

  {:else if step === 'convert-refused'}
    <h2>Couldn't read this file</h2>
    <p class="imp-note">{refusalMsg}</p>
    <div class="imp-actions">
      <button class="imp-quiet" on:click={() => onClose(null)}>Close</button>
    </div>

  {:else if step === 'convert-choice'}
    <h2>Some pages lost their layout</h2>
    <p class="imp-note">
      {collapsedPages.length} page{collapsedPages.length === 1 ? '' : 's'} lost
      {collapsedPages.length === 1 ? 'its' : 'their'} print layout in extraction
      (pages {collapsedPages.join(', ')}). Re-extracting the PDF usually fixes this.
    </p>
    <div class="imp-actions">
      <button class="imp-quiet" on:click={() => onClose(null)}>Cancel (re-extract)</button>
      <button class="imp-primary" on:click={retryPageLevelOnly}>Import with page-level anchors only</button>
    </div>

  {:else if step === 'form'}
    <h2>Import “{file?.name}”</h2>
    <label class="imp-field">
      <span>Work</span>
      <select bind:value={work}>
        {#each WORKS as w (w.id)}
          <option value={w.id}>{w.title}</option>
        {/each}
      </select>
    </label>
    <label class="imp-field">
      <span>Translator</span>
      <input type="text" bind:value={translator} placeholder="e.g. Rackham" spellcheck="false" />
    </label>
    <label class="imp-field">
      <span>Year (optional)</span>
      <input type="text" bind:value={yearStr} placeholder="e.g. 1926" inputmode="numeric" />
    </label>
    <label class="imp-field">
      <span>Source (optional)</span>
      <input type="text" bind:value={sourceStr} placeholder="e.g. Oxford: Clarendon Press" spellcheck="false" />
    </label>
    <label class="imp-field">
      <span>Citation</span>
      <textarea class="imp-citation" rows="3" spellcheck="false"
        placeholder="Full citation for Copy Citation, e.g. Aristotle. Parts of Animals I–IV. Trans. James G. Lennox. Oxford: Clarendon Press, 2001."
        bind:value={citationStr}
        on:input={() => (citationTouched = true)}
      ></textarea>
    </label>
    <fieldset class="imp-field imp-radio">
      <legend>Is this a personal copy of a copyrighted translation?</legend>
      <label><input type="radio" bind:group={personalCopy} value="yes" /> Yes — keep it private to this computer</label>
      <label><input type="radio" bind:group={personalCopy} value="no" /> No</label>
    </fieldset>
    {#if personalCopy === 'no'}
      <label class="imp-field">
        <span>License</span>
        <select bind:value={advLicense}>
          <option value="public-domain">Public domain</option>
          <option value="cc-by">CC BY</option>
          <option value="cc-by-sa">CC BY-SA</option>
          <option value="not-sure">Not sure</option>
        </select>
      </label>
    {/if}
    <div class="imp-actions">
      <button class="imp-primary" disabled={!formReady} on:click={prepare}>Import</button>
      <button class="imp-quiet" on:click={() => onClose(null)}>Cancel</button>
    </div>

  {:else if step === 'review'}
    <h2>Hyphenation check</h2>
    <p class="imp-note">
      This text has printed line-break hyphens. {autoJoined}
      {autoJoined === 1 ? 'was' : 'were'} rejoined automatically; the
      dictionary could not safely decide {reviewItems.length} — choose the
      correct form for each.
    </p>
    {#if reviewItems[reviewPos]}
      {@const item = reviewItems[reviewPos]}
      <p class="imp-review-ctx">…{item.context}…</p>
      <div class="imp-actions">
        <button class="imp-primary" on:click={() => chooseReview(item.closed)}>{item.closed}</button>
        <button class="imp-primary" on:click={() => chooseReview(item.hyphenated)}>{item.hyphenated}</button>
      </div>
      <p class="imp-note">{reviewPos + 1} of {reviewItems.length}</p>
    {/if}
    <div class="imp-actions">
      <button class="imp-quiet" on:click={() => onClose(null)}>Cancel import</button>
    </div>

  {:else if step === 'emph-review'}
    <h2>Emphasis check</h2>
    <p class="imp-note">
      {#if emphConfidentCount > 0}
        {emphConfidentCount} span{emphConfidentCount === 1 ? '' : 's'} of markdown emphasis
        (<code>_like this_</code> or <code>**like this**</code>) {emphConfidentCount === 1 ? 'was' : 'were'}
        recognised automatically.
      {/if}
      {emphReviewItems.length} marker{emphReviewItems.length === 1 ? '' : 's'} couldn't be classified
      confidently — choose how to treat each one.
    </p>
    {#if emphReviewItems[emphReviewPos]}
      {@const item = emphReviewItems[emphReviewPos]}
      <p class="imp-review-ctx">…{item.before}<mark class="imp-emph-hit">{item.hit}</mark>{item.after}…</p>
      <p class="imp-note">
        {#if item.reason === 'stray-marker'}
          A lone <code>{item.raw}</code> with no matching partner.
        {:else if item.reason === 'mid-word'}
          A marker touching a word rather than a word boundary — likely not emphasis.
        {:else if item.reason === 'too-long'}
          A long span ({item.inner.split(/\s+/).filter(Boolean).length} words) — could be a deliberate
          emphasis run or an OCR artifact.
        {:else}
          An unbalanced or oddly-spaced marker.
        {/if}
      </p>
      <div class="imp-actions">
        <button class="imp-primary" on:click={() => chooseEmphReview('keep')}>
          Keep as {item.style === 'bold' ? 'bold' : 'italics'}
        </button>
        <button class="imp-primary" on:click={() => chooseEmphReview('remove')}>
          Remove markers, plain text
        </button>
      </div>
      <p class="imp-note">
        Default: {item.defaultKeep ? `keep as ${item.style === 'bold' ? 'bold' : 'italics'}` : 'remove markers'}.
        {emphReviewPos + 1} of {emphReviewItems.length}
      </p>
      {#if emphReviewItems.length - emphReviewPos > 1}
        <div class="imp-actions">
          <button class="imp-quiet" on:click={() => chooseEmphReviewAll('remove')}>
            Remove markers for all {emphReviewItems.length - emphReviewPos} remaining
          </button>
        </div>
      {/if}
    {/if}
    <div class="imp-actions">
      <button class="imp-quiet" on:click={() => onClose(null)}>Cancel import</button>
    </div>

  {:else if step === 'running'}
    <h2>Importing…</h2>
    <p class="imp-progress" aria-live="polite">{progress}</p>

  {:else if step === 'collision'}
    <h2>Already in your library</h2>
    <p class="imp-note">
      A translation with the id <b>{collision?.id}</b> already exists for this work.
    </p>
    <div class="imp-actions">
      <button class="imp-primary" on:click={() => start(true)}>Replace it</button>
      <button on:click={() => start(false, `${collision?.id}-2`)}>Keep both</button>
      <button class="imp-quiet" on:click={() => onClose(null)}>Cancel</button>
    </div>

  {:else if step === 'done'}
    <h2>Imported {summary?.meta.translator}</h2>
    {#if summary}
      <p class="imp-summary">
        {summary.chapters} chapters processed
        (tag level: {summary.density === 'exhaustive' ? 'every line tagged'
          : summary.density === 'five-line-or-column' ? 'five-line / column tags'
          : 'chapter tags only'}).
      </p>
      <ul class="imp-stats">
        {#if summary.tagged > 0}
          <li><b>{summary.tagged.toLocaleString()}</b> anchors from your tags</li>
        {/if}
        {#if summary.placed > 0}
          <li><b>{summary.placed.toLocaleString()}</b> anchors placed by alignment</li>
        {/if}
        <li><b>{summary.interpolated.toLocaleString()}</b> lines interpolated — marked as estimates in the gutter</li>
      </ul>
      {#if summary.warnings.length}
        <details class="imp-warn">
          <summary>{summary.warnings.length} tag warning{summary.warnings.length > 1 ? 's' : ''} to review</summary>
          <ul>
            {#each summary.warnings.slice(0, 20) as w}<li>{w}</li>{/each}
          </ul>
        </details>
      {/if}
      {#if summary.footnoteSummary}
        <p class="imp-summary">{summary.footnoteSummary}</p>
      {/if}
      {#if convertReport}
        <!-- Honesty report for a PDF-conversion import: everything the
             converter dropped, suppressed, or preserved verbatim, so the
             claim "labelled as an estimate" extends to what didn't make it
             into the file at all. -->
        {#if convertReport.droppedLines.length}
          <details class="imp-warn">
            <summary>
              {convertReport.droppedLines.length}
              dropped line{convertReport.droppedLines.length === 1 ? '' : 's'}
            </summary>
            <ul>
              {#each convertReport.droppedLines as l}<li>{l}</li>{/each}
            </ul>
          </details>
        {/if}
        {#if convertReport.ticsSuppressed.length}
          <details class="imp-warn">
            <summary>
              {convertReport.ticsSuppressed.reduce((n, s) => n + s.count, 0)}
              Bekker tick{convertReport.ticsSuppressed.reduce((n, s) => n + s.count, 0) === 1 ? '' : 's'} suppressed (not printed as anchors)
            </summary>
            <ul>
              {#each convertReport.ticsSuppressed as s}<li>{s.flag}: {s.count}</li>{/each}
            </ul>
          </details>
        {/if}
        {#if convertReport.displayBlocks.length}
          <p class="imp-note">
            {convertReport.displayBlocks.length}
            table/diagram-like block{convertReport.displayBlocks.length === 1 ? '' : 's'}
            preserved line-by-line — review in the reader.
          </p>
        {/if}
        {#if convertReport.seams.length}
          <p class="imp-error">
            This file appears to contain more than one work — slice per work before importing.
          </p>
        {/if}
      {/if}
    {/if}
    <div class="imp-actions">
      <button class="imp-primary" on:click={finish}>Open in the reader</button>
    </div>

  {:else}
    <h2>Import failed</h2>
    <p class="imp-error">{errorMsg}</p>
    <div class="imp-actions">
      <button class="imp-quiet" on:click={() => onClose(null)}>Close</button>
    </div>
  {/if}
</div>

<style>
  .imp-backdrop { position: fixed; inset: 0; z-index: 210; background: rgba(0, 0, 0, 0.35); }
  .imp {
    position: fixed; z-index: 211; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(92vw, 30rem); max-height: 85vh; overflow-y: auto;
    background: var(--col-bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 10px;
    padding: 1.3rem 1.5rem 1.4rem; font-family: var(--font-ui);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }
  h2 { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.9rem; }
  code { font-size: 0.85em; }
  .imp-note { font-size: 0.83rem; color: var(--text-mid); line-height: 1.5; margin: 0.6rem 0; }
  .imp-drop {
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    text-align: center; cursor: pointer; color: var(--text-mid);
    border: 1.5px dashed var(--border); border-radius: 10px;
    background: var(--page-bg); padding: 1.6rem 1.2rem; margin: 0.8rem 0 0.4rem;
    transition: border-color 0.12s ease, background-color 0.12s ease, color 0.12s ease;
  }
  .imp-drop:hover, .imp-drop:focus-visible {
    border-color: var(--accent); color: var(--text);
  }
  .imp-drop:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .imp-drop-hover {
    border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--page-bg));
    color: var(--text);
  }
  .imp-drop-icon { flex: none; }
  .imp-drop-text { font-size: 0.9rem; line-height: 1.5; margin: 0; }
  .imp-drop-text b { color: var(--text); }
  .imp-field { display: block; margin: 0 0 0.8rem; font-size: 0.85rem; }
  .imp-field > span { display: block; font-weight: 600; margin-bottom: 0.25rem; }
  .imp-field input[type="text"], .imp-field select, .imp-field textarea {
    width: 100%; box-sizing: border-box; font: inherit; color: var(--text);
    background: var(--page-bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.45rem 0.6rem;
  }
  .imp-field input:focus, .imp-field select:focus, .imp-field textarea:focus { outline: none; border-color: var(--accent); }
  .imp-citation { resize: vertical; line-height: 1.4; font-size: 0.85rem; }
  .imp-radio { border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.8rem; margin: 0 0 0.8rem; }
  .imp-radio legend { font-weight: 600; font-size: 0.85rem; padding: 0 0.3rem; }
  .imp-radio label { display: block; margin: 0.35rem 0; font-size: 0.85rem; }
  .imp-actions { display: flex; gap: 0.6rem; margin-top: 1rem; flex-wrap: wrap; }
  .imp-actions button {
    font: inherit; font-size: 0.85rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--border); border-radius: 6px;
    background: transparent; color: var(--text);
    padding: 0.45rem 0.9rem;
  }
  .imp-primary { background: var(--accent) !important; color: var(--on-accent) !important; border-color: var(--accent) !important; }
  .imp-primary:disabled { opacity: 0.5; cursor: default; }
  .imp-quiet { color: var(--text-mid) !important; }
  .imp-progress { font-size: 0.9rem; color: var(--text-mid); }
  .imp-summary { font-size: 0.9rem; margin: 0 0 0.6rem; }
  .imp-stats { font-size: 0.88rem; line-height: 1.7; margin: 0; padding-left: 1.2rem; }
  .imp-warn { margin-top: 0.8rem; font-size: 0.82rem; color: var(--text-mid); }
  .imp-warn ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
  .imp-error { font-size: 0.88rem; color: var(--error); line-height: 1.5; }
  .imp-help { margin-top: 1rem; font-size: 0.83rem; }
  .imp-help summary { cursor: pointer; font-weight: 600; color: var(--accent); }
  .imp-help-body { margin-top: 0.5rem; color: var(--text-mid); line-height: 1.55; }
  .imp-help-body dl { margin: 0.5rem 0; }
  .imp-help-body dt { float: left; clear: left; width: 4.5rem; font-weight: 600; }
  .imp-help-body dd { margin: 0 0 0.4rem 5rem; }
  .imp-help-body pre {
    background: var(--page-bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.5rem 0.7rem; font-size: 0.78rem; white-space: pre-wrap; line-height: 1.5;
  }
  .imp-help-body b { color: var(--text); }
  .imp-review-ctx {
    font-family: var(--font-english); font-size: 0.95rem; line-height: 1.6;
    background: var(--page-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.7rem 0.9rem; margin: 0.8rem 0;
  }
  .imp-emph-hit {
    background: var(--accent-soft, rgba(139, 90, 43, 0.18));
    color: inherit; font-weight: 600;
    border-radius: 3px; padding: 0 0.15em;
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
  }
</style>
