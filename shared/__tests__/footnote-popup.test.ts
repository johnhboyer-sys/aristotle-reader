import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FootnotePopup from '../components/FootnotePopup.svelte';

vi.mock('../lib/data', () => ({ fetchFootnotes: vi.fn(async () => ({ '1': 'A note', '2': 'Another note' })) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.querySelectorAll('.fn-marker, .test-word-panel').forEach(el => el.remove());
});

function marker(note: string, initialTop: number, activate = true) {
  const el = document.createElement('button');
  el.className = 'fn-marker';
  el.dataset.fn = note;
  el.dataset.fnTrans = 'test';
  document.body.append(el);
  if (activate) el.click();
  let top = initialTop;
  vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => ({
    left: 100, right: 115, top, bottom: top + 15, width: 15, height: 15,
    x: 100, y: top, toJSON() {},
  }));
  return { el, move: (value: number) => { top = value; } };
}

describe('FootnotePopup marker tracking', () => {
  it('follows nested scrolls, handles resize, closes offscreen, and removes listeners', async () => {
    const mark = marker('1', 300);
    const close = vi.fn();
    const { container, unmount } = render(FootnotePopup, { props: {
      n: '1', transId: 'test', anchor: { x: 100, y: 315 }, b: true, onClose: close,
    } });
    await tick();
    const popup = container.querySelector<HTMLElement>('.b-note')!;
    const firstTop = popup.style.top;
    mark.move(100);
    await fireEvent.scroll(mark.el);
    expect(popup.style.top).toBe('123px');
    expect(popup.style.top).not.toBe(firstTop);
    mark.move(200);
    await fireEvent(window, new Event('resize'));
    expect(popup.style.top).toBe('223px');
    mark.move(-15);
    await fireEvent.scroll(window);
    expect(close).toHaveBeenCalledTimes(1);
    unmount();
    await fireEvent.scroll(window);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('closes a hover note on page scroll without moving it or returning focus', async () => {
    vi.useFakeTimers();
    const mark = marker('1', 100, false);
    mark.el.focus();
    const close = vi.fn();
    const { getByRole, unmount } = render(FootnotePopup, { props: {
      n: '1', transId: 'test', anchor: { x: 100, y: 115 }, b: true, onClose: close,
    } });
    await vi.runAllTimersAsync();
    const dialog = getByRole('dialog');
    const top = dialog.style.top;
    const focus = vi.spyOn(mark.el, 'focus');
    mark.move(200);
    await fireEvent.scroll(window);
    expect(close).toHaveBeenCalledOnce();
    expect(dialog.style.top).toBe(top);
    unmount();
    expect(focus).not.toHaveBeenCalled();
  });

  it.each(['click', 'Enter', ' '])('promotes an existing hover note on %s', async activation => {
    const mark = marker('1', 100, false);
    const close = vi.fn();
    const { getByRole } = render(FootnotePopup, { props: {
      n: '1', transId: 'test', anchor: { x: 100, y: 115 }, b: true, onClose: close,
    } });
    await tick();
    if (activation === 'click') await fireEvent.click(mark.el);
    else await fireEvent.keyDown(mark.el, { key: activation });
    mark.move(200);
    await fireEvent.scroll(window);
    expect(close).not.toHaveBeenCalled();
    expect(getByRole('dialog').style.top).toBe('223px');
  });

  it('keeps a hover note open when its own body scrolls', async () => {
    marker('1', 100, false);
    const close = vi.fn();
    const { getByRole } = render(FootnotePopup, { props: {
      n: '1', transId: 'test', anchor: { x: 100, y: 115 }, b: true, onClose: close,
    } });
    await fireEvent.scroll(getByRole('dialog'));
    expect(close).not.toHaveBeenCalled();
  });

  it('rebinds to the closest matching marker when notes change in place', async () => {
    marker('1', 100);
    marker('2', 400);
    const next = marker('2', 200);
    const { container, rerender } = render(FootnotePopup, { props: {
      n: '1', transId: 'test', anchor: { x: 100, y: 115 }, b: true, onClose: vi.fn(),
    } });
    next.el.click();
    await rerender({ n: '2', anchor: { x: 100, y: 215 } });
    next.move(80);
    await fireEvent.scroll(window);
    expect(container.querySelector<HTMLElement>('.b-note')!.style.top).toBe('103px');
  });
});

describe.each([true, false])('FootnotePopup focus (B=%s)', b => {
  function openNote() {
    vi.useFakeTimers();
    const mark = marker('1', 100);
    mark.el.focus();
    const close = vi.fn();
    const result = render(FootnotePopup, { props: {
      n: '1', transId: 'test', anchor: { x: 100, y: 115 }, b, onClose: close,
    } });
    return { ...result, mark, close, dialog: result.getByRole('dialog') };
  }

  it.each(['scroll', 'resize'])('does not return focus after an offscreen %s close', async event => {
    const note = openNote();
    await vi.runAllTimersAsync();
    expect(document.activeElement).toBe(note.dialog);
    const panel = document.createElement('button');
    panel.className = 'test-word-panel';
    document.body.append(panel);
    panel.focus();
    note.mark.move(-20);
    await fireEvent(window, new Event(event));
    expect(note.close).toHaveBeenCalledOnce();
    note.unmount();
    expect(document.activeElement).toBe(panel);
  });

  it('does not return focus when a hover timeout or navigation removes the note', async () => {
    const note = openNote();
    await vi.runAllTimersAsync();
    const focus = vi.spyOn(note.mark.el, 'focus');
    note.unmount();
    expect(focus).not.toHaveBeenCalled();
  });

  it.each(['Escape', 'button', 'outside'])('returns focus for a user dismissal: %s', async method => {
    const note = openNote();
    await vi.runAllTimersAsync();
    if (method === 'Escape') await fireEvent.keyDown(window, { key: 'Escape' });
    else if (method === 'button') await fireEvent.click(note.getByRole('button', { name: 'Close' }));
    else await fireEvent.pointerDown(document.body); // Reader closes it in its window handler.
    if (method !== 'outside') expect(note.close).toHaveBeenCalledOnce();
    note.unmount();
    expect(document.activeElement).toBe(note.mark.el);
  });

  it('does not let the deferred initial focus take focus from a word panel', async () => {
    const note = openNote();
    const panel = document.createElement('button');
    panel.className = 'test-word-panel';
    document.body.append(panel);
    panel.focus();
    await vi.runAllTimersAsync();
    expect(document.activeElement).toBe(panel);
    note.unmount();
  });
});
