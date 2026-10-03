import { describe, expect, it } from 'vitest';
import { isNotFound } from '../fsNotFound';

// Message shapes from tauri-plugin-fs 2.5.1 (src/commands.rs: read_dir, line
// 489; read_text_file, 585; stat, 755), each ending in Rust's io::Error text,
// "<description> (os error <code>)". Tauri rejects invoke() with the string
// itself, not an Error. If a plugin upgrade changes this shape, these fail.
const dir = (e: string) => `failed to read directory at path: /lib/w with error: ${e}`;
const text = (e: string) => `failed to read file as text at path: /lib/w/b01c01.md with error: ${e}`;
const meta = (e: string) => `failed to get metadata of path: /lib/w/b01c01.md with error: ${e}`;

describe('isNotFound', () => {
  it('is true for the OS not-found error, from each command', () => {
    for (const wrap of [dir, text, meta]) {
      expect(isNotFound(wrap('No such file or directory (os error 2)'))).toBe(true);
    }
    expect(isNotFound(new Error(text('No such file or directory (os error 2)')))).toBe(true);
  });

  it('is true for Windows ERROR_PATH_NOT_FOUND (a missing parent folder)', () => {
    expect(isNotFound(dir('The system cannot find the path specified. (os error 3)'))).toBe(true);
  });

  it('is false for every other failure', () => {
    expect(isNotFound(text('Permission denied (os error 13)'))).toBe(false);
    expect(isNotFound(text('Operation not permitted (os error 1)'))).toBe(false);
    expect(isNotFound(text('Input/output error (os error 5)'))).toBe(false);
    expect(isNotFound(dir('Not a directory (os error 20)'))).toBe(false);
    expect(isNotFound(text('Resource deadlock avoided (os error 11)'))).toBe(false);
    expect(isNotFound('forbidden path: /lib/w/b01c01.md')).toBe(false);
    expect(isNotFound(text('stream did not contain valid UTF-8'))).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });

  it('reads only the trailing code, not a code-like path', () => {
    expect(isNotFound(text('Permission denied (os error 13)').replace('/lib/w', '/lib/(os error 2)'))).toBe(false);
  });
});
