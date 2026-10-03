// The empty library's start screen (B10) and the Import dialog's first tab.
// Components are rendered with svelte/server (no DOM here); App's wiring is
// checked by reading its source, as railBooksWiring.test.ts does.
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import StartScreen from '../StartScreen.svelte';
import SourceImportDialog from '../SourceImportDialog.svelte';

let startSource = '';
let appSource = '';

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  const read = (rel: string) =>
    fs.readFileSync(nodeUrl.fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
  startSource = read('../StartScreen.svelte');
  appSource = read('../../App.svelte');
});

const noop = () => {};

/** Visible text of each <button>, in order. */
function buttonLabels(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  );
}

describe('the start screen', () => {
  const all = () =>
    render(StartScreen, {
      props: { onNewDocument: noop, onImportSource: noop, onImportDisc: noop },
    }).body;

  it('renders its three actions as labelled buttons, in order', () => {
    const html = all();
    expect(html).toContain('Start a translation');
    expect(html).toContain('Your library is empty. Choose how to begin.');
    expect(buttonLabels(html)).toEqual([
      'New document',
      'Import a text',
      'Add a work from local TLG or PHI files',
    ]);
  });

  it('ties each button to its one-line description', () => {
    const html = all();
    for (const [id, text] of [
      ['start-new-desc', 'Paste text, or open a .txt file.'],
      ['start-import-desc', 'From Perseus · FREED or a TEI file. Needs nothing else installed.'],
      ['start-disc-desc', 'Needs Diogenes installed.'],
    ]) {
      expect(html).toContain(`aria-describedby="${id}"`);
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*>${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
    }
  });

  it('shows only the actions the host can run', () => {
    const html = render(StartScreen, { props: { onNewDocument: noop } }).body;
    expect(buttonLabels(html)).toEqual(['New document']);
  });

  it('uses no type smaller than 1rem', () => {
    const sizes = [...startSource.matchAll(/font-size:\s*([\d.]+)(rem|px|em)/g)];
    expect(sizes.length).toBeGreaterThan(0);
    for (const [, n, unit] of sizes) {
      const rem = unit === 'px' ? Number(n) / 16 : Number(n);
      expect(rem, `font-size ${n}${unit}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Import a text', () => {
  /** The tab labels in order, and which one is selected. */
  function tabs(html: string) {
    const found = [...html.matchAll(/<button role="tab" aria-selected="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)];
    return {
      order: found.map((m) => m[2].trim()),
      selected: found.filter((m) => m[1] === 'true').map((m) => m[2].trim()),
    };
  }
  const props = { existingIds: [], onClose: noop, onCreated: noop };

  it('opens on Perseus · FREED, listed first', () => {
    const t = tabs(render(SourceImportDialog, { props }).body);
    expect(t.order[0]).toBe('Perseus · FREED');
    expect(t.order).toHaveLength(3);
    expect(t.selected).toEqual(['Perseus · FREED']);
  });

  it('reads the saved disc only once the disc tab is shown', async () => {
    // Read at open, the disc kept Import busy ("Working…") on the Perseus tab.
    const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
      readFileSync(path: string, encoding: 'utf-8'): string;
    };
    const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
      fileURLToPath(url: URL): string;
    };
    const src = fs.readFileSync(
      nodeUrl.fileURLToPath(new URL('../SourceImportDialog.svelte', import.meta.url)),
      'utf-8',
    );
    expect(src).toMatch(/\$effect\(\(\) => \{\s*if \(route !== 'disc' \|\| discChecked\) return;\s*discChecked = true;/);
  });

  it('opens on the disc tab when asked', () => {
    const t = tabs(render(SourceImportDialog, { props: { ...props, initialRoute: 'disc' } }).body);
    expect(t.selected).toEqual(['TLG or PHI disc']);
  });
});

describe('App wiring', () => {
  it('lists built-in works only through shownBuiltInWorks', () => {
    expect(appSource).toContain('works = [...builtIns, ...free];');
    expect(appSource).not.toContain('$state<WorkManifest[]>(listWorks())');
    expect(appSource).not.toContain('[...listWorks(), ...free]');
  });

  it('an added work appears once Add work sets it up', () => {
    expect(appSource).toMatch(/async function handleOnboarded[\s\S]*?await reloadWorks\(\);[\s\S]*?\n  }/);
  });

  it('Add work still offers every built-in work not yet on this Mac', () => {
    expect(appSource).toContain('works={listWorks().filter((w) => !corpora[w.id])}');
  });

  it('a new document never takes a hidden built-in work\'s id', () => {
    // A document titled "Metaphysics" would otherwise slug to `metaphysics`,
    // share the built-in work's folder, and list that work twice.
    expect(appSource).toContain('const takenIds = $derived([...listWorks(), ...works].map((w) => w.id));');
    expect(appSource.match(/existingIds=\{takenIds\}/g)).toHaveLength(2);
    expect(appSource).not.toContain('existingIds={works.map');
  });

  it('a slow built-in check never overwrites a newer document list', () => {
    // The documents' registry is read last, as before built-in works were
    // filtered, so two overlapping reloads can't put back a stale list.
    const body = appSource.slice(appSource.indexOf('async function reloadWorks'));
    const fn = body.slice(0, body.indexOf('\n  }\n'));
    expect(fn.indexOf('await shownBuiltInWorks()')).toBeGreaterThan(-1);
    expect(fn.indexOf('await shownBuiltInWorks()')).toBeLessThan(fn.indexOf('await listFreeWorks()'));
    expect(fn).toContain('works = [...builtIns, ...free];');
  });

  it('moving the library copies every built-in work, shown or not', () => {
    expect(appSource).toContain(
      '<SettingsDialog works={[...listWorks(), ...works.filter(isDocumentWork)]}',
    );
  });

  it('a work Add work sets up opens when nothing else is open', () => {
    const body = appSource.slice(appSource.indexOf('async function handleOnboarded'));
    const fn = body.slice(0, body.indexOf('\n  }\n'));
    expect(fn).toMatch(/if \(!selection &&[\s\S]*select\(workId, book\.n, chapters\[0\]\)/);
  });

  it('a registry that could not be read is not called an empty library', () => {
    expect(appSource).toContain('{:else if works.length === 0 && registryNotice === null}');
  });

  it('shows the start screen when no works are listed', () => {
    expect(appSource).toMatch(/\{:else if works\.length === 0 && registryNotice === null\}\s*<div class="empty-state-wrap">\s*<StartScreen/);
  });

  it('the third button opens Import a text on the disc tab; the others on Perseus · FREED', () => {
    expect(appSource).toContain("onImportDisc={isTauri() ? () => openSourceImport('disc') : undefined}");
    expect(appSource).toContain("onImportSource={isTauri() ? () => openSourceImport('link') : undefined}");
    expect(appSource).toContain('initialRoute={sourceImportRoute}');
    expect(appSource).not.toContain('sourceImportOpen = true)');
  });
});
