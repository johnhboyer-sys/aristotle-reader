// pdf-import/gutter.ts
// Types for gutter-tic (Bekker/Stephanus-style running page/line marker)
// detection. Algorithm arrives later this phase (Phase 1) — this file
// currently only defines the shapes and a stub entry point.

import type { Page } from './pages';

export interface Tic {
  page: number;
  lineIdx: number;
  raw: string;
  column: string | null;
  line: number | null;
  side: 'recto' | 'verso';
  anchorLineIdx: number;
  anchorCol: number;
  flags: string[];
}

export interface DocContext {
  column: string | null;
  lastLine: number;
}

export interface PageScan {
  tics: Tic[];
  collapsed: boolean;
  headerLineIdx: number | null;
  bottomFurnitureStartIdx: number | null;
  flags: string[];
}

export function scanPage(page: Page, ctx: DocContext): PageScan {
  throw new Error('pdf-import/gutter: not implemented (Phase 1)');
}
