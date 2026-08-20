<script lang="ts">
  import { tick } from 'svelte';
  import type { Quotation } from '../lib/data';

  export let quotation: Quotation;

  // Marginal siglum, edition-style (John's ruling, 2026-08-20): the author's
  // conventional abbreviation in the gutter, never a symbol — the text already
  // prints its own quotation marks. Unmapped authors fall back to the full
  // name; curation controls which authors ship.
  const SIGLA: Record<string, string> = {
    Empedocles: 'Emp.',
    Parmenides: 'Parm.',
    Heraclitus: 'Heracl.',
    Xenophanes: 'Xenoph.',
    Homer: 'Hom.',
    Hesiod: 'Hes.',
    Plato: 'Pl.',
    Pindar: 'Pind.',
    Aeschylus: 'Aesch.',
    Sophocles: 'Soph.',
    Euripides: 'Eur.',
  };
  $: siglum = SIGLA[quotation.author] ?? quotation.author;

  let open = false;
  let dialogEl: HTMLDivElement;
  let btnEl: HTMLButtonElement;
  let pos = { left: '8px', top: '8px' };

  // Keep the popup inside the viewport (anchored below the glyph), same clamp
  // FootnotePopup uses.
  function clampedPos(x: number, y: number) {
    const W = 360, H = 200, vw = window.innerWidth, vh = window.innerHeight;
    return {
      left: Math.max(8, Math.min(x, vw - W - 16)) + 'px',
      top:  Math.min(y + 8, vh - H - 16) + 'px',
    };
  }

  async function openPopup() {
    const r = btnEl.getBoundingClientRect();
    pos = clampedPos(r.left, r.bottom);
    open = true;
    await tick();
    dialogEl?.focus();
  }

  function close() {
    open = false;
    btnEl?.focus({ preventScroll: true });
  }

  function onToggle() {
    if (open) close();
    else openPopup();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) close();
  }

  // Click outside the glyph or popup dismisses it. Capture phase so a
  // stopPropagation on another control (footnote marker, print menu) still
  // closes — same contract as the word panel.
  function onOutsideClick(e: MouseEvent) {
    if (!open) return;
    const t = e.target as HTMLElement | null;
    if (!t || t.closest('.quotation-popup') || t.closest('.quotation-marker')) return;
    close();
  }

  function focusableEls(): HTMLElement[] {
    return dialogEl
      ? Array.from(dialogEl.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      : [];
  }

  function onDialogKey(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !open) return;
    const els = focusableEls();
    if (els.length === 0) {
      e.preventDefault();
      dialogEl?.focus();
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
</script>

<svelte:window on:keydown={onKey} on:click|capture={onOutsideClick} />

<button
  bind:this={btnEl}
  type="button"
  class="quotation-marker"
  aria-label="Quotation: {quotation.cite}"
  aria-haspopup="dialog"
  aria-expanded={open}
  on:click|stopPropagation={onToggle}
>{siglum}</button>

{#if open}
  <div
    class="popup quotation-popup"
    bind:this={dialogEl}
    style="left:{pos.left};top:{pos.top}"
    role="dialog"
    aria-label="Quotation"
    aria-modal="true"
    tabindex="-1"
    on:keydown={onDialogKey}
  >
    <div class="popup-header">
      <span class="footnote-num">Quotation</span>
      <button class="popup-close" on:click={close} aria-label="Close">✕</button>
    </div>
    <div class="popup-body">
      <a class="quotation-cite" href={quotation.url} target="_blank" rel="noopener">{quotation.cite}</a>
    </div>
  </div>
{/if}
