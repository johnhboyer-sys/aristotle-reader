// Footnote view concerns (design doc D1 §"Footnotes").
//
// The fnRef mark + footnoteMarker node live in the schema; INSERTION and the
// footnote-table bookkeeping (register id, unanchor on marker deletion) are
// ChapterEditor/controller work, because they touch the model. This plugin
// owns the view-only pieces:
//
//   - node decorations that inject each marker's computed display number
//     (data-fn-display attribute, rendered via CSS content:attr(...)) — the
//     number is NEVER stored in the doc;
//   - the "active footnote" highlight: an inline DecorationSet over the
//     fnRef range for the active id (the future footnotes panel drives this;
//     until then, clicking a marker toggles it so the mechanism is visible);
//   - click-on-marker → ctx.setActiveFootnote(id).
//
// Decorations are view state, not doc state: not serialized, not in undo.

import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { rowSchema } from '../schema';

export const footnoteKey = new PluginKey<DecorationSet>('footnote');

/** Dispatch this meta (any truthy value) to force decoration recompute. */
export const FN_REFRESH = 'fnRefresh';

export interface FootnoteContext {
  /** Chapter-local id → computed display number (work-wide continuous). */
  displayNumber(id: string): number | undefined;
  activeFootnoteId(): string | null;
  setActiveFootnote(id: string | null): void;
  /**
   * While the footnotes panel is open, EVERY anchored phrase gets the subtle
   * always-on highlight (the active one keeps its stronger treatment).
   * Optional so existing call sites/tests need no change.
   */
  showAllAnchors?(): boolean;
}

function buildDecorations(doc: PMNode, ctx: FootnoteContext): DecorationSet {
  const decos: Decoration[] = [];
  const active = ctx.activeFootnoteId();
  const showAll = ctx.showAllAnchors?.() ?? false;

  doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteMarker') {
      const id = String(node.attrs.id);
      const n = ctx.displayNumber(id);
      const attrs: Record<string, string> = { 'data-fn-display': n === undefined ? '?' : String(n) };
      if (active !== null && id === active) attrs.class = 'fn-marker-active';
      decos.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    } else if (node.isText && (active !== null || showAll)) {
      const mark = node.marks.find((m) => m.type === rowSchema.marks.fnRef);
      if (mark) {
        const id = String(mark.attrs.id);
        if (active !== null && id === active) {
          decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'fn-active' }));
        } else if (showAll) {
          decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'fn-anchor' }));
        }
      }
    }
    return true;
  });
  return DecorationSet.create(doc, decos);
}

export function footnotePlugin(ctx: FootnoteContext): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: footnoteKey,
    state: {
      init: (_config, state: EditorState) => buildDecorations(state.doc, ctx),
      apply(tr, value, _old, newState) {
        if (tr.docChanged || tr.getMeta(FN_REFRESH)) {
          return buildDecorations(newState.doc, ctx);
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        return footnoteKey.getState(state);
      },
      handleClickOn(view, _pos, node) {
        if (node.type.name !== 'footnoteMarker') return false;
        const id = String(node.attrs.id);
        // Temporary panel stand-in: click toggles the active highlight.
        ctx.setActiveFootnote(ctx.activeFootnoteId() === id ? null : id);
        view.dispatch(view.state.tr.setMeta(FN_REFRESH, true));
        return true;
      },
    },
  });
}
