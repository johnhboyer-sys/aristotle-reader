<script lang="ts">
  // "Manage levels…" dialog (D8 heading tools) — edit the OPEN document work's
  // organization profile: an ordered list of named tiers, each tagged Book /
  // Chapter / heading. Book/Chapter tiers become navigable divisions; heading
  // tiers are in-page headings. Persisted onto the free-work record and reused
  // on later imports. A work with no custom profile seeds from DEFAULT_PROFILE.
  import type { NavRole, WorkLevel } from '../lib/works/profile';
  import { DEFAULT_PROFILE, MAX_LEVELS, sanitizeLevels, reclampDepths } from '../lib/works/profile';
  import { updateFreeWorkLevels } from '../lib/works/freeWorks';

  let {
    workId,
    initialLevels,
    onClose,
    onSaved,
  }: {
    workId: string;
    /** The work's current profile levels (DEFAULT_PROFILE's when none saved). */
    initialLevels: WorkLevel[];
    onClose: () => void;
    /** Called after a successful save so App can reload the work's profile. */
    onSaved: () => void;
  } = $props();

  const seed = initialLevels.length > 0 ? initialLevels : DEFAULT_PROFILE.levels;
  // reclampDepths fills any missing/legacy depth via the "one deeper" migration
  // and enforces the no-gap invariant up front.
  let levels = $state<WorkLevel[]>(
    reclampDepths(seed.map((l) => ({ name: l.name, navRole: l.navRole, depth: l.depth }))),
  );
  let errorMessage = $state<string | null>(null);
  let writing = $state(false);

  const NAV_OPTIONS: { value: NavRole; label: string }[] = [
    { value: 'book', label: 'Book' },
    { value: 'chapter', label: 'Chapter' },
    { value: 'heading', label: 'Heading' },
  ];

  const saveBlocked = $derived(
    writing
      ? 'Saving…'
      : levels.length === 0
        ? 'Add at least one level.'
        : levels.some((l) => l.name.trim().length === 0)
          ? 'Give every level a name.'
          : null,
  );

  /** Max legal depth for the level at index i (no-gap invariant). */
  function maxDepthAt(i: number): number {
    return i === 0 ? 0 : levels[i - 1].depth + 1;
  }

  function addLevel() {
    if (levels.length >= MAX_LEVELS) return;
    // A new tier defaults to a SIBLING of the last (same depth) — the common
    // case (another same-level heading); indent it after if you want a sub-level.
    const depth = levels.length > 0 ? levels[levels.length - 1].depth : 0;
    levels = reclampDepths([...levels, { name: '', navRole: 'heading', depth }]);
  }
  function removeLevel(i: number) {
    if (levels.length <= 1) return;
    levels = reclampDepths(levels.filter((_, j) => j !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= levels.length) return;
    const next = [...levels];
    [next[i], next[j]] = [next[j], next[i]];
    levels = reclampDepths(next);
  }
  function indent(i: number) {
    if (levels[i].depth >= maxDepthAt(i)) return;
    const next = levels.map((l, j) => (j === i ? { ...l, depth: l.depth + 1 } : l));
    levels = reclampDepths(next);
  }
  function outdent(i: number) {
    if (levels[i].depth <= 0) return;
    const next = levels.map((l, j) => (j === i ? { ...l, depth: l.depth - 1 } : l));
    levels = reclampDepths(next);
  }

  async function save() {
    if (saveBlocked) return;
    writing = true;
    errorMessage = null;
    try {
      // sanitizeLevels trims + drops empties defensively; the UI already guards.
      await updateFreeWorkLevels(workId, sanitizeLevels(levels) ?? levels);
      onSaved();
      onClose();
    } catch (err) {
      console.error('ProfileDialog save', err);
      errorMessage = "The levels couldn't be saved.";
      writing = false;
    }
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Manage levels">
    <header class="dialog-head">
      <h2>Manage levels</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="dialog-body">
      {#if errorMessage}
        <p class="line error">{errorMessage}</p>
      {/if}
      <p class="line intro">
        Name this work's structural tiers, top to bottom. <strong>Book</strong> and
        <strong>Chapter</strong> tiers become navigable divisions; <strong>Heading</strong>
        tiers are in-page headings. These are reused when you import more chapters.
      </p>
      <p class="line hint">
        Use <span class="kbd">▶</span> to make a tier a <strong>sub-level</strong> and
        <span class="kbd">◀</span> to raise it. <strong>Same indent = same level</strong>
        (siblings) — e.g. Objection, Sed contra, Respondeo and Reply all sit level with each other.
      </p>

      <ol class="levels">
        {#each levels as level, i (i)}
          <li class="level-row" style="--depth: {level.depth}">
            <!-- Prominent stepped indent: one guide rail per depth, a corner on the last. -->
            {#if level.depth > 0}
              <span class="indent" aria-hidden="true">
                {#each Array.from({ length: level.depth }) as _, d (d)}
                  <span class="guide" class:corner={d === level.depth - 1}></span>
                {/each}
              </span>
            {/if}
            <span class="rank">{i + 1}</span>
            <input
              class="name"
              type="text"
              bind:value={level.name}
              placeholder="e.g. Part, Question, Article…"
              aria-label="Level {i + 1} name"
            />
            <select class="nav" bind:value={level.navRole} aria-label="Level {i + 1} type">
              {#each NAV_OPTIONS as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
            <div class="row-actions">
              <button class="icon" onclick={() => outdent(i)} disabled={level.depth <= 0} aria-label="Outdent (raise level)" title="Outdent — raise a level">◀</button>
              <button class="icon" onclick={() => indent(i)} disabled={level.depth >= maxDepthAt(i)} aria-label="Indent (make sub-level)" title="Indent — make a sub-level">▶</button>
              <span class="sep" aria-hidden="true"></span>
              <button class="icon" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
              <button class="icon" onclick={() => move(i, 1)} disabled={i === levels.length - 1} aria-label="Move down" title="Move down">↓</button>
              <button class="icon" onclick={() => removeLevel(i)} disabled={levels.length <= 1} aria-label="Remove level" title="Remove">✕</button>
            </div>
          </li>
        {/each}
      </ol>

      <button class="secondary-btn add" onclick={addLevel} disabled={levels.length >= MAX_LEVELS}>
        + Add level
      </button>

      <div class="form-actions">
        <button class="secondary-btn" onclick={onClose}>Cancel</button>
        <button class="primary-btn" disabled={saveBlocked !== null} title={saveBlocked ?? undefined} onclick={save}>
          {writing ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
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
    width: 520px;
    max-width: calc(100vw - 2 * var(--space-4));
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--popup-shadow);
  }
  .dialog-head {
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
    max-height: calc(100vh - 2 * var(--space-4) - 3rem);
    overflow-y: auto;
  }
  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-mid);
  }
  .error {
    color: var(--error);
    margin-bottom: var(--space-3);
  }
  .intro {
    font-size: 0.82rem;
    margin-bottom: var(--space-3);
  }
  .levels {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .hint {
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--text-light);
    margin-bottom: var(--space-3);
  }
  .kbd {
    display: inline-block;
    min-width: 1.1rem;
    text-align: center;
    padding: 0 0.2rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text-mid);
    font-size: 0.72rem;
    line-height: 1.3;
  }
  .level-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 1.9rem;
  }
  /* Prominent stepped indent: one 1.6rem guide rail per depth level, the last
     drawn as a └ corner connecting into the row, so equal-vs-sub reads at a
     glance and jumps the moment indent/outdent fires. */
  .indent {
    display: inline-flex;
    flex: 0 0 auto;
    align-self: stretch;
  }
  .guide {
    position: relative;
    width: 1.6rem;
    flex: 0 0 1.6rem;
    align-self: stretch;
    border-left: 2px solid var(--border);
  }
  .guide.corner {
    border-left-color: var(--accent);
  }
  .guide.corner::after {
    content: '';
    position: absolute;
    left: -2px;
    top: 0;
    height: 50%;
    width: 0.7rem;
    border-left: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    border-bottom-left-radius: 4px;
  }
  .sep {
    width: 1px;
    align-self: center;
    height: 1.1rem;
    background: var(--border);
    margin: 0 2px;
  }
  .rank {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--text-light);
    width: 1.2rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .name {
    flex: 1 1 auto;
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
  }
  .nav {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.3rem 0.4rem;
  }
  .row-actions {
    display: inline-flex;
    gap: 2px;
  }
  .icon {
    width: 1.7rem;
    height: 1.7rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--input-bg);
    color: var(--text-mid);
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
  }
  .icon:hover:not(:disabled) {
    color: var(--text);
    background: var(--ui-hover);
  }
  .icon:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .add {
    margin-top: var(--space-3);
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
  .secondary-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--ui-hover);
  }
  .secondary-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
