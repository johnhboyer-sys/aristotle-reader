// "β Beta Code": the live toggle on the search page, on the Greek and Both
// tabs. Off, the box keeps what was typed. It converts the Greek box only;
// the English tab hides it and the English box is never rewritten.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Search from '../components/Search.svelte';

const toggle = (page: { container: HTMLElement }) =>
  page.container.querySelector('button.tog') as HTMLButtonElement | null;
const greekBox = (page: { container: HTMLElement }) =>
  page.container.querySelector('#grk-input') as HTMLInputElement;
const englishBox = (page: { container: HTMLElement }) =>
  page.container.querySelector('#eng-input') as HTMLInputElement;

async function type(el: HTMLInputElement, value: string, caret = value.length) {
  el.value = value;
  el.setSelectionRange(caret, caret);
  await fireEvent.input(el);
}

describe('β Beta Code toggle', () => {
  it('starts off, and off it leaves Beta Code as typed', async () => {
    const page = render(Search);
    expect(toggle(page)?.getAttribute('aria-pressed')).toBe('false');
    await type(greekBox(page), 'lo/gos');
    expect(greekBox(page).value).toBe('lo/gos');
  });

  it('turned on, converts what is in the box; typing then turns Greek', async () => {
    const page = render(Search);
    await type(greekBox(page), 'lo/gos');
    await fireEvent.click(toggle(page)!);
    expect(toggle(page)?.getAttribute('aria-pressed')).toBe('true');
    expect(greekBox(page).value).toBe('λόγος');
    expect(document.activeElement).toBe(greekBox(page));
    await type(greekBox(page), 'λόγος a)reth/');
    expect(greekBox(page).value).toBe('λόγος ἀρετή');
    await fireEvent.click(toggle(page)!);
    await type(greekBox(page), 'λόγος ἀρετή kai');
    expect(greekBox(page).value).toBe('λόγος ἀρετή kai');
  });

  it('keeps the caret where it was when an earlier word changes', async () => {
    const page = render(Search);
    await fireEvent.click(toggle(page)!);
    // A mark typed after the first word's ο, the caret right after it.
    await type(greekBox(page), 'λο/γος καί', 3);
    expect(greekBox(page).value).toBe('λόγος καί');
    expect(greekBox(page).selectionStart).toBe(2);
  });

  // s then a mark typed before it gives ς + U+0301, which has no
  // precomposed form; the caret must not land between them.
  it('never leaves the caret between a letter and its mark', async () => {
    const page = render(Search);
    await fireEvent.click(toggle(page)!);
    await type(greekBox(page), '/');
    await type(greekBox(page), 's/', 1);
    expect(greekBox(page).value).toBe('ς\u0301');
    expect(greekBox(page).selectionStart).toBe(2);
  });

  it('waits for an IME or phone keyboard to commit, then converts', async () => {
    const page = render(Search);
    await fireEvent.click(toggle(page)!);
    const el = greekBox(page);
    el.value = 'lo/gos';
    el.setSelectionRange(6, 6);
    await fireEvent(el, new InputEvent('input', { bubbles: true, isComposing: true }));
    expect(el.value).toBe('lo/gos');
    await fireEvent(el, new CompositionEvent('compositionend', { bubbles: true, data: 'lo/gos' }));
    expect(el.value).toBe('λόγος');
    expect(el.selectionStart).toBe(5);
  });

  it('leaves an undo as it restores', async () => {
    const page = render(Search);
    await fireEvent.click(toggle(page)!);
    const el = greekBox(page);
    el.value = 'λο/';
    await fireEvent(el, new InputEvent('input', { bubbles: true, inputType: 'historyUndo' }));
    expect(el.value).toBe('λο/');
  });

  it('is absent on the English tab; on Both it converts the Greek box, never the English one', async () => {
    const page = render(Search);
    await fireEvent.click(toggle(page)!);
    expect(toggle(page)?.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(toggle(page)).toBeNull();
    expect(screen.queryByRole('button', { name: 'β Beta Code' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Both' }));
    expect(toggle(page)?.getAttribute('aria-pressed')).toBe('true');
    await type(greekBox(page), 'lo/gos');
    expect(greekBox(page).value).toBe('λόγος');
    await type(englishBox(page), 'lo/gos');
    expect(englishBox(page).value).toBe('lo/gos');
  });
});
