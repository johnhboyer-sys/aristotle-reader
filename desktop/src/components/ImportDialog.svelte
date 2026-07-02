<script lang="ts">
  // The import flow, end to end: metadata form → tag scan + alignment →
  // completion summary. One modal, one screen per step, no scrolling forms.
  //
  // The completion summary is a first-class moment, not a log line — it is
  // where "estimates are always labelled" becomes visible to a first-time
  // importer: tagged anchors, alignment-placed anchors, and interpolated
  // (estimate) lines are reported separately and honestly.
  import { WORKS } from '../../../app/src/lib/works';
  import { runImport, ImportCollision, type ImportSummary } from '../lib/imports';
  import { dehyphenate, listReviewItems, resolveReviews, type ReviewItem } from '../lib/dehyphenate';

  export let file: { name: string; text: string } | null = null;
  export let presetWork: string | null = null;   // pre-filled when launched from a work
  export let onClose: (imported: ImportSummary | null) => void;

  type Step = 'pick' | 'form' | 'review' | 'running' | 'collision' | 'done' | 'error';
  let step: Step = file ? 'form' : 'pick';

  // form state
  let work = presetWork ?? 'EN';
  let translator = '';
  let personalCopy: 'yes' | 'no' | null = null;
  let advLicense: 'public-domain' | 'cc-by' | 'cc-by-sa' | 'not-sure' = 'not-sure';
  let yearStr = '';

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

  $: license = personalCopy === 'yes' || advLicense === 'not-sure'
    ? 'user-supplied' as const
    : advLicense as 'public-domain' | 'cc-by' | 'cc-by-sa';
  $: formReady = !!file && translator.trim().length > 0 && personalCopy !== null;

  async function pickFile() {
    if ('__TAURI_INTERNALS__' in window) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Translation files', extensions: ['md', 'txt'] }],
      });
      if (typeof path === 'string') {
        file = { name: path.split('/').pop() ?? path, text: await readTextFile(path) };
        step = 'form';
      }
    } else {
      browserInput?.click();
    }
  }
  let browserInput: HTMLInputElement | undefined;
  async function onBrowserFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    file = { name: f.name, text: await f.text() };
    step = 'form';
  }

  // Form submit → dehyphenation pass first; alignment only once the text is
  // settled (auto-decisions applied, review sites resolved by the user).
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
    await start();
  }

  function chooseReview(form: string) {
    reviewChoices.set(reviewItems[reviewPos].index, form);
    if (reviewPos + 1 < reviewItems.length) {
      reviewPos += 1;
    } else {
      dehyphenatedText = resolveReviews(dehyphenatedText!, reviewChoices);
      start();
    }
  }

  async function start(replace = false, idOverride?: string) {
    if (!file) return;
    step = 'running';
    progress = 'Starting…';
    try {
      summary = await runImport({
        raw: dehyphenatedText ?? file.text,
        work,
        translator: translator.trim(),
        license,
        ...(yearStr && !Number.isNaN(Number(yearStr)) ? { year: Number(yearStr) } : {}),
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
    <div class="imp-actions">
      <button class="imp-primary" on:click={pickFile}>Choose a file…</button>
      <button class="imp-quiet" on:click={() => onClose(null)}>Cancel</button>
    </div>
    <input type="file" accept=".md,.txt,text/plain,text/markdown" bind:this={browserInput}
      on:change={onBrowserFile} style="display:none" />
    <p class="imp-note">…or drop a file anywhere on the library.</p>

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
  .imp-field { display: block; margin: 0 0 0.8rem; font-size: 0.85rem; }
  .imp-field > span { display: block; font-weight: 600; margin-bottom: 0.25rem; }
  .imp-field input[type="text"], .imp-field select {
    width: 100%; box-sizing: border-box; font: inherit; color: var(--text);
    background: var(--page-bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.45rem 0.6rem;
  }
  .imp-field input:focus, .imp-field select:focus { outline: none; border-color: var(--accent); }
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
</style>
