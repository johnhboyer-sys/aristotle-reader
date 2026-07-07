/**
 * Shared node-shape helpers for fast-xml-parser's `preserveOrder` output.
 *
 * In `preserveOrder` mode, an element node is `{ [tagName]: XmlNode[], ':@'?:
 * attrs }` and a text run is `{ '#text': string }`. This module has no
 * knowledge of TEI semantics — spine.ts and chapters.ts each own their own
 * document-shaped walks over these generic nodes, mirroring how the lxml
 * originals (stage1_greek.py / stage1_chapters.py) each walk `etree`
 * independently.
 */

export type XmlAttrs = Record<string, string>;

export type XmlNode = { '#text': string } | ({ [tag: string]: XmlNode[] } & { ':@'?: XmlAttrs });

export function isTextNode(node: XmlNode): node is { '#text': string } {
  return Object.prototype.hasOwnProperty.call(node, '#text');
}

/** The element's tag name, or null for a text node. */
export function tagName(node: XmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text') return key;
  }
  return null;
}

export function attrs(node: XmlNode): XmlAttrs {
  return (node as { ':@'?: XmlAttrs })[':@'] ?? {};
}

/** The element's own child node list (empty for a text node or an element
 * with no children, e.g. a self-closing `<pb/>`). */
export function children(node: XmlNode): XmlNode[] {
  if (isTextNode(node)) return [];
  const tag = tagName(node);
  if (tag === null) return [];
  return (node as Record<string, XmlNode[]>)[tag] ?? [];
}

/** Text run content of a text node, or '' for an element node. */
export function textOf(node: XmlNode): string {
  return isTextNode(node) ? node['#text'] : '';
}

/** Recursively find every element node with the given tag name, anywhere
 * under `nodes`, in document order (lxml's `tree.iter("{*}tag")` /
 * `el.iter("{*}tag")`). */
export function findAll(nodes: XmlNode[], tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (list: XmlNode[]) => {
    for (const n of list) {
      if (isTextNode(n)) continue;
      if (tagName(n) === tag) out.push(n);
      walk(children(n));
    }
  };
  walk(nodes);
  return out;
}
