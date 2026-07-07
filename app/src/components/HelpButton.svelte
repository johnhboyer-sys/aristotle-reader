<script lang="ts">
  // A small "?" button for the reader header that opens a Help modal explaining
  // the reader's features, plus a one-time tip (first reader visit only) that
  // surfaces the otherwise-invisible click-a-word-to-parse feature.
  //
  // The button renders inline in the header; the modal and tip are position:fixed
  // overlays, so where this component sits in the DOM doesn't affect layout.
  import { onMount, onDestroy, tick } from 'svelte';

  const SEEN_KEY = 'ar-help-seen';

  let showHelp = false;
  let showTip = false;
  let helpModal: HTMLDivElement;
  let helpTrigger: HTMLElement | null = null;

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
  }

  async function openHelp(e?: Event) {
    helpTrigger = e?.currentTarget instanceof HTMLElement
      ? e.currentTarget
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    showHelp = true;
    showTip = false;
    markSeen();
    await tick();
    helpModal?.focus();
  }
  function closeHelp() {
    showHelp = false;
    helpTrigger?.focus();
    helpTrigger = null;
  }

  function dismissTip() {
    showTip = false;
    markSeen();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!showHelp) return;
    if (e.key === 'Escape') {
      closeHelp();
      return;
    }
    if (e.key !== 'Tab') return;
    const els = helpModal
      ? Array.from(helpModal.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      : [];
    if (els.length === 0) {
      e.preventDefault();
      helpModal?.focus();
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
    // The Contents sidebar (mobile) opens this same modal via a custom event,
    // since its own "?" trigger is hidden on mobile.
    window.addEventListener('open-help', openHelp);
    let seen = false;
    try { seen = !!localStorage.getItem(SEEN_KEY); } catch {}
    if (!seen) showTip = true;
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('open-help', openHelp);
    }
  });
</script>

<button
  type="button"
  class="help-trigger"
  on:click={openHelp}
  aria-haspopup="dialog"
  aria-label="How to use this reader"
  title="How to use this reader"
>?</button>

{#if showTip}
  <div class="reader-tip" role="status">
    <span class="tip-text">💡 Click on any Greek word to parse it and see its definition(s)!</span>
    <span class="tip-actions">
      <button type="button" class="tip-more" on:click={openHelp}>More tips →</button>
      <button type="button" class="tip-got" on:click={dismissTip}>Got it</button>
    </span>
  </div>
{/if}

{#if showHelp}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="help-backdrop" on:click={closeHelp}>
    <div
      class="help-modal"
      bind:this={helpModal}
      role="dialog"
      aria-modal="true"
      aria-label="How to use this reader"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={onKeydown}
    >
      <div class="help-head">
        <h2>Getting the most out of the reader</h2>
        <button type="button" class="help-close" on:click={closeHelp} aria-label="Close">×</button>
      </div>

      <p class="help-intro">
        A parallel-text reader with morphology, dictionary, and Bekker citation. A few
        things that aren't obvious:
      </p>

      <ul class="help-feature">
        <li>
          <span class="feat-name">Look up any word</span>
          <span class="feat-desc">Click a Greek word for its lemma, gloss, grammatical parse, and full LSJ dictionary entry.</span>
        </li>
        <li>
          <span class="feat-name">Cite &amp; share a line</span>
          <span class="feat-desc">The address bar updates to the Bekker line as you scroll — copy it to link straight to that line. Use <strong>Go to Bekker line</strong> in the header to jump to a citation like <span class="feat-grk">1097a15</span>.</span>
        </li>
        <li>
          <span class="feat-name">Views &amp; translations</span>
          <span class="feat-desc">Switch <strong>Greek</strong> / <strong>Both</strong> / <strong>English</strong> with the view buttons, and choose which translation fills the English column — or show <strong>Compare both</strong> side by side — from the picker beside them. On a phone the view, translation, and print controls all live in the <strong>⚙ Settings</strong> menu (along with text size and line spacing). You can also pick a view or translation from the home page.</span>
        </li>
        <li>
          <span class="feat-name">Contents</span>
          <span class="feat-desc">The <strong>☰ Contents</strong> drawer lists every book and chapter.</span>
        </li>
        <li>
          <span class="feat-name">Search</span>
          <span class="feat-desc">Open <strong>Search</strong> to find words across the corpus — in Greek (Greek letters or Beta Code) or English.</span>
        </li>
        <li>
          <span class="feat-name">Night mode</span>
          <span class="feat-desc">The <strong>☾</strong> button toggles a warm dark theme.</span>
        </li>
      </ul>
    </div>
  </div>
{/if}

<style>
  /* Trigger button — mirrors .theme-toggle so it sits naturally beside it. */
  .help-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--col-bg);
    color: var(--text-mid);
  }
  .help-trigger:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  /* The mobile header (title + Contents/Menu) is already tight; the "?" is
     desktop-only. Mobile discovery is carried by the first-visit tip below. */
  @media (max-width: 680px) {
    .help-trigger { display: none; }
  }

  /* First-visit tip — a small dismissible toast at the bottom of the viewport. */
  .reader-tip {
    position: fixed;
    left: 50%;
    bottom: 1.25rem;
    transform: translateX(-50%);
    /* Rise gently into view rather than snapping in. One-shot entrance ⇒
       keyframe; the X-centring is preserved by animating from a lower Y. */
    animation: tip-in 0.24s cubic-bezier(0.2, 0, 0, 1);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
    max-width: min(34rem, calc(100vw - 2rem));
    padding: 0.7rem 1rem;
    background: var(--popup-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--popup-shadow);
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--text);
  }
  .tip-text { line-height: 1.4; }
  .tip-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .tip-more {
    background: none;
    border: none;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    padding: 0.2rem 0.2rem;
  }
  .tip-more:hover { text-decoration: underline; }
  .tip-got {
    font: inherit;
    cursor: pointer;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--accent);
    color: var(--on-accent);
  }
  .tip-got:hover { filter: brightness(1.08); }

  /* Modal — adapted from the "How to type Greek" modal in Search.svelte so the
     two help surfaces look identical (those styles are component-scoped there). */
  .help-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 2rem 1rem;
    overflow-y: auto;
    z-index: 50;
    animation: backdrop-in 0.18s ease-out;
  }
  .help-modal {
    background: var(--popup-bg);
    border-radius: 8px;
    max-width: 540px;
    width: 100%;
    padding: 1.25rem 1.5rem 1.75rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    font-family: var(--font-ui);
    color: var(--text);
    /* Soft rise + fade as it opens (one-shot ⇒ keyframe). */
    animation: modal-in 0.2s cubic-bezier(0.2, 0, 0, 1);
  }
  @keyframes tip-in {
    from { opacity: 0; transform: translate(-50%, 12px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes backdrop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes modal-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .reader-tip, .help-backdrop, .help-modal { animation: none; }
  }
  .help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .help-head h2 {
    font-size: 1.1rem;
    margin: 0;
    color: var(--text);
  }
  .help-close {
    background: none;
    border: none;
    font-size: 1.6rem;
    line-height: 1;
    color: var(--text-light);
    cursor: pointer;
    padding: 0 0.25rem;
  }
  .help-close:hover { color: var(--text); }
  .help-intro {
    font-size: 0.85rem;
    color: var(--text-mid);
    line-height: 1.5;
    margin: 0 0 0.9rem;
    text-wrap: pretty;
  }

  .help-feature {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .help-feature li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .feat-name {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
  }
  .feat-desc {
    font-size: 0.85rem;
    color: var(--text-mid);
    line-height: 1.5;
    text-wrap: pretty;
  }
  .feat-desc strong { color: var(--text); font-weight: 600; }
  .feat-grk { font-family: var(--font-english); color: var(--text); }
</style>
