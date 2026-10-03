// The app's name and version, from tauri.conf.json — the file Tauri's
// getName() and getVersion() read, and the Quit menu item's label too
// (src-tauri/src/lib.rs). Read at build time, so Settings › About shows the
// same name in the browser harness, and a rename there flows through.
import { productName, version } from '../../../src-tauri/tauri.conf.json';

export const APP_NAME: string = productName;
export const APP_VERSION: string = version;
