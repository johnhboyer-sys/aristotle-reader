// Restricted row schema (design doc D1 §"Restricted schema").
//
// One editor row = one Bekker line. The document node ITSELF is the single
// textblock (content: 'inline*') — there are no paragraphs and no hard-break
// node anywhere in the schema, so a newline inside a row is unrepresentable
// by construction.
//
// Marks (canonical serialization order, outermost → innermost — see
// serialize.ts): fnRef, greek, bold, italic, underline. The extensions are
// registered in that order so ProseMirror's mark-rank order in every mark set
// equals the canonical order and serialization is deterministic.
//
// The `footnoteMarker` node renders an EMPTY <sup>; the displayed number is
// injected by plugins/footnote.ts as a node decoration (`data-fn-display`
// attribute, shown via CSS `content: attr(...)`). The chapter-local id is the
// only thing stored in the document — display numbers are computed, never
// persisted (build spec §3/§7).

import { Extension, Mark, Node, getSchema } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

/** Row-document JSON as stored in the ChapterModel. */
export type PMDocJSON = JSONContent;

const RowDoc = Node.create({
  name: 'doc',
  topNode: true,
  content: 'inline*',
});

const Text = Node.create({
  name: 'text',
  group: 'inline',
});

const FnRef = Mark.create({
  name: 'fnRef',
  // Typing at the anchor's edge must not extend the footnoted phrase.
  inclusive: false,
  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-fn-ref') ?? '',
        renderHTML: (attrs) => ({ 'data-fn-ref': attrs.id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-fn-ref]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'fn-ref' }, 0];
  },
});

const Greek = Mark.create({
  name: 'greek',
  parseHTML() {
    return [{ tag: 'span[lang="grc"]' }];
  },
  renderHTML() {
    // Greek font comes from CSS (--font-greek) via the .grc class + lang attr.
    return ['span', { lang: 'grc', class: 'grc' }, 0];
  },
});

const Bold = Mark.create({
  name: 'bold',
  parseHTML() {
    return [{ tag: 'strong' }, { tag: 'b' }];
  },
  renderHTML() {
    return ['strong', 0];
  },
});

const Italic = Mark.create({
  name: 'italic',
  parseHTML() {
    return [{ tag: 'em' }, { tag: 'i' }];
  },
  renderHTML() {
    return ['em', 0];
  },
});

const Underline = Mark.create({
  name: 'underline',
  parseHTML() {
    return [{ tag: 'u' }];
  },
  renderHTML() {
    return ['u', 0];
  },
});

const FootnoteMarker = Node.create({
  name: 'footnoteMarker',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  // Markers never carry marks: `{^id:phrase}` serialization closes at the
  // marker, and a marked marker would have no representation.
  marks: '',
  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-fn-id') ?? '',
        renderHTML: (attrs) => ({ 'data-fn-id': attrs.id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'sup[data-fn-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    // Empty element; the display number is a decoration (see module header).
    return ['sup', { ...HTMLAttributes, class: 'fn-marker' }];
  },
});

/** Canonical extension set for a row editor. Order defines mark rank. */
export const rowExtensions: (Node | Mark | Extension)[] = [
  RowDoc,
  Text,
  FnRef,
  Greek,
  Bold,
  Italic,
  Underline,
  FootnoteMarker,
];

/** The compiled ProseMirror schema shared by every row EditorView. */
export const rowSchema = getSchema(rowExtensions);

/** Canonical mark order for serialization (outermost → innermost). */
export const MARK_ORDER = ['fnRef', 'greek', 'bold', 'italic', 'underline'] as const;

export function emptyRowDocJSON(): PMDocJSON {
  return { type: 'doc' };
}

export function docFromJSON(json: PMDocJSON): PMNode {
  return rowSchema.nodeFromJSON(json);
}

/** All footnote ids present in a row doc (marker nodes), in document order. */
export function markerIdsIn(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'footnoteMarker') ids.push(String(node.attrs.id));
    return true;
  });
  return ids;
}
