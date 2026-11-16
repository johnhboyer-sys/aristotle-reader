<script lang="ts">
  // The reader Help control opens its modal on request.
  import { onMount, onDestroy, tick } from 'svelte';

  let showHelp = false;
  let helpModal: HTMLDivElement;
  let helpTrigger: HTMLElement | null = null;

  async function openHelp(e?: Event) {
    helpTrigger = e?.currentTarget instanceof HTMLElement
      ? e.currentTarget
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    showHelp = true;
    await tick();
    helpModal?.focus();
  }
  function closeHelp() {
    showHelp = false;
    helpTrigger?.focus();
    helpTrigger = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!showHelp) return;
    if (e.key === 'Escape') {
      // Spent: the word panel under Help stays open.
      e.preventDefault();
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
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('open-help', openHelp);
    }
  });
</script>

<!-- Opened by the reader's own Help controls (Aa, Contents) via `open-help`. -->
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
          <span class="feat-desc">The address bar updates to the Bekker line as you scroll — copy it to link straight to that line. Use <strong>Go to a Bekker line</strong> in Contents to jump to a citation like <span class="feat-grk">1097a15</span>.</span>
        </li>
        <li>
          <span class="feat-name">Views &amp; translations</span>
          <span class="feat-desc">Switch <strong>Greek</strong> / <strong>Both</strong> / <strong>English</strong> with the view buttons, and choose which translation fills the English column — and a second one <strong>beside it</strong> — from the translation menu. On a phone the view and translation live in the <strong>Aa</strong> menu, with the Greek font, text size, line spacing and print.</span>
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
