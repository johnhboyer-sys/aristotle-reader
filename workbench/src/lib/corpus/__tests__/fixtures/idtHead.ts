/**
 * The first 132 bytes of a real TLG0086.IDT: the author record for Aristotle
 * and the first work record ("Analytica priora et posteriora", tiers "Bekker
 * page" and "line"), ending part-way into the block-index record that follows.
 *
 * Index data — an author's name and the titles of their works — not text. It
 * is here so the .IDT parser has coverage on a machine with no disc; the
 * whole-file checks live in idtWorksLive.test.ts, which needs one.
 */

export const TLG0086_IDT_HEAD_B64 =
  'ASuXAADvgLCwuLb/EAAvJjFBcmlzdG90ZWxlcyAmZXQgJjFDb3JwdXMgQXJpc3RvdGVsaWN1bSYg' +
  'UGhpbC4CAYUAAO+BsLCx/xABHkFuYWx5dGljYSBwcmlvcmEgZXQgcG9zdGVyaW9yYREBC0Jla2tl' +
  'ciBwYWdlEQAEbGluZQMAAAiZ';
