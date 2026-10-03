import { describe, expect, it } from 'vitest';
import { isAlreadyExists, isNotFound, isWriteAfterCreate } from '../fsNotFound';

// Message shapes copied from tauri-plugin-fs 2.5.1's src/commands.rs, each
// ending in Rust's io::Error text, "<description> (os error <code>)":
// readTextFile fails at File::open (line 659) for a missing file, readDir at
// line 489, stat at line 955. Tauri rejects invoke() with the string itself.
// These strings are copies, so they cannot notice a plugin upgrade; the pin
// below can, and makes whoever upgrades re-check them.
const open = (e: string) => `failed to open file at path: /lib/w/b01c01.md with error: ${e}`;
const dir = (e: string) => `failed to read directory at path: /lib/w with error: ${e}`;
const meta = (e: string) => `failed to get metadata of path: /lib/w/b01c01.md with error: ${e}`;
const text = (e: string) => `failed to read file as text at path: /lib/w/b01c01.md with error: ${e}`;

describe('the plugin these message shapes were copied from', () => {
  it('is still tauri-plugin-fs 2.5.1', async () => {
    // Node's fs, loaded the way addWorkDialogEmptyState.test.ts does.
    const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
      readFileSync(path: string, encoding: 'utf-8'): string;
    };
    const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
      fileURLToPath(url: URL): string;
    };
    const lock = fs.readFileSync(nodeUrl.fileURLToPath(new URL('../../../src-tauri/Cargo.lock', import.meta.url)), 'utf-8');
    const version = /name = "tauri-plugin-fs"\nversion = "([^"]+)"/.exec(lock)?.[1];
    // On an upgrade: check the new commands.rs still ends each error with the
    // io::Error text, update the shapes above and in fsNotFound.ts, then this pin.
    expect(version).toBe('2.5.1');
  });
});

describe('isNotFound', () => {
  it('is true for the OS not-found error, from each command', () => {
    for (const wrap of [open, dir, meta]) {
      expect(isNotFound(wrap('No such file or directory (os error 2)'))).toBe(true);
    }
    expect(isNotFound(new Error(open('No such file or directory (os error 2)')))).toBe(true);
  });

  it('is true for Windows ERROR_PATH_NOT_FOUND (a missing parent folder)', () => {
    expect(isNotFound(dir('The system cannot find the path specified. (os error 3)'))).toBe(true);
  });

  it('is false for every other failure', () => {
    expect(isNotFound(open('Permission denied (os error 13)'))).toBe(false);
    expect(isNotFound(open('Operation not permitted (os error 1)'))).toBe(false);
    expect(isNotFound(text('Input/output error (os error 5)'))).toBe(false);
    expect(isNotFound(dir('Not a directory (os error 20)'))).toBe(false);
    expect(isNotFound(text('Resource deadlock avoided (os error 11)'))).toBe(false);
    expect(isNotFound('forbidden path: /lib/w/b01c01.md')).toBe(false);
    expect(isNotFound(text('stream did not contain valid UTF-8'))).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });

  it('reads only the trailing code, not a code-like path', () => {
    expect(isNotFound(open('Permission denied (os error 13)').replace('/lib/w', '/lib/(os error 2)'))).toBe(false);
  });
});

describe('isAlreadyExists (writeTextFile with createNew)', () => {
  // create_new fails at OpenOptions::open, "failed to open file at path"
  // (commands.rs:1434), with EEXIST, or ERROR_FILE_EXISTS on Windows.
  it('is true for the OS already-exists error', () => {
    expect(isAlreadyExists(open('File exists (os error 17)'))).toBe(true);
    expect(isAlreadyExists(open('The file exists. (os error 80)'))).toBe(true);
    // Some Windows shares answer ERROR_ALREADY_EXISTS instead.
    expect(isAlreadyExists(open('Cannot create a file when that file already exists. (os error 183)'))).toBe(true);
  });

  it('is false for every other failure, not-found included', () => {
    expect(isAlreadyExists(open('No such file or directory (os error 2)'))).toBe(false);
    expect(isAlreadyExists(open('Permission denied (os error 13)'))).toBe(false);
    expect(isAlreadyExists(open('No space left on device (os error 28)'))).toBe(false);
    expect(isAlreadyExists('forbidden path: /new/w/b01c01.md')).toBe(false);
    expect(isNotFound(open('File exists (os error 17)'))).toBe(false);
  });
});

describe('isWriteAfterCreate (the file was created, then its bytes failed)', () => {
  // write_file_inner opens (creating the file), then write_all fails with
  // "failed to write bytes to file at path" (commands.rs:1160).
  it('is true only for a failure after the open', () => {
    expect(
      isWriteAfterCreate('failed to write bytes to file at path: /new/w/b01c01.md with error: No space left on device (os error 28)'),
    ).toBe(true);
    expect(isWriteAfterCreate(open('File exists (os error 17)'))).toBe(false);
    expect(isWriteAfterCreate(open('Permission denied (os error 13)'))).toBe(false);
    expect(isWriteAfterCreate('forbidden path: /new/w/b01c01.md')).toBe(false);
  });
});
