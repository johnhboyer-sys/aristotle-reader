// Whether a tauri-plugin-fs failure means "that path does not exist".
//
// The plugin's own `exists` cannot answer this: it is Rust's Path::exists
// (tauri-plugin-fs 2.5.1, src/commands.rs:1216), which is false whenever the
// path could not be checked, so a permission or I/O error on a parent folder
// reads as "absent", and a caller then writes over the file it failed to read.
// Run the operation instead and ask this of its error.
//
// Every plugin message ends in Rust's io::Error text, "<description> (os error
// <code>)". Code 2 is not-found on macOS and Windows; 3 is Windows'
// ERROR_PATH_NOT_FOUND (a missing parent folder) and, on Unix, ESRCH, which no
// file operation returns. Pinned by __tests__/fsNotFound.test.ts.
export function isNotFound(err: unknown): boolean {
  return /\(os error [23]\)$/.test(String(err));
}

/**
 * Whether a writeTextFile with `createNew: true` was refused because the file
 * is already there: EEXIST (17), or Windows' ERROR_FILE_EXISTS (80) or, from
 * some shares, ERROR_ALREADY_EXISTS (183). The refusal is
 * OpenOptions::create_new's, made in the same system call that would have
 * created the file, so nothing can slip in between a check and the write.
 */
export function isAlreadyExists(err: unknown): boolean {
  return /\(os error (17|80|183)\)$/.test(String(err));
}

/**
 * Whether a writeTextFile failed after it had opened, and so created, the
 * file: its bytes failed (commands.rs:1160), leaving a short file behind.
 */
export function isWriteAfterCreate(err: unknown): boolean {
  return String(err).includes('failed to write bytes to file at path:');
}
