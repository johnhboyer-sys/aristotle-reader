// Speaker-turn rendering model for Stephanus dialogues (Plato). The pipeline
// emits, per Greek segment, a `speakers` array of turn events — {line, offset,
// label} — where `offset` is the char position in that line's rejoined text at
// which the interlocutor's speech begins, and `label` is the siglum ("ΕΥΘ.",
// "ΣΩ.") or the dialectic dash ("—"). Crucially, the label text itself is NOT
// present in the line text: it is rendered as a separate inline lead-in span so
// the clickable Greek tokens keep their exact char offsets (the word popup and
// every offset walker must see an unshifted token stream).
//
// This module owns the position math: given a line's verbatim text, its tokens,
// and the events that belong to that line, it produces an ordered list of
// render parts — plain text gaps, clickable tokens, and speaker lead-ins spliced
// in at each turn boundary — WITHOUT mutating the line text. It generalizes the
// reader's old `lineParts` (a text→tokens splitter): with no events it returns
// exactly the same token/gap sequence, so non-stephanus works are byte-identical.

import type { Token, GreekLine, Segment, TurnFlow, EnglishTurn } from './data';

// A single speaker-turn event, as emitted in a segment's `speakers` array.
export interface SpeakerEvent {
  line: number;    // the Greek line `n` the turn begins on
  offset: number;  // char offset in that line's text where the speech begins
  label: string;   // the interlocutor siglum ("ΕΥΘ.") or the dialectic dash "—"
}

// One render part for a Greek line: a verbatim text gap (sigla / punctuation),
// a clickable token, or a speaker lead-in label inserted at a turn boundary.
export type LineRenderPart =
  | { kind: 'text'; text: string }
  | { kind: 'token'; text: string; tok: Token }
  | { kind: 'speaker'; label: string; dash: boolean };

// The dialectic dash ("—", used e.g. in Parmenides for unattributed turns)
// renders as a plain em-dash lead-in, not a small-caps siglum.
const DASH = '—';

// Editorial sigla the OCT prints INSIDE a word: angle brackets for a supplement
// (Letters 362a "ἔπει<τα>") and square brackets for a deletion
// (Philebus 52d "[προς]θῶμεν"). The token text is the bare word, so it does
// not occur verbatim in the line and a plain indexOf misses it.
const SIGLUM = /[<>[\]]/;
const OPENER = /[<[]/;
const CLOSER = /[>\]]/;

// Locate `t` in `text` at or after `from`, tolerating sigla printed inside the
// word, and return its VERBATIM span (sigla included) so the rendered line
// stays byte-identical to the source. Null when the word really isn't there.
//
// The match must be the LEFTMOST one at or after `from`, across both forms.
// Tokens are consumed in document order behind a moving pointer, so binding one
// to a later occurrence strands every token in between — they then fail to
// locate and are dropped. A bare `indexOf` sees only unbracketed occurrences, so
// on a line carrying both ("ἂ<>ν δὲ ἂν") it skips the bracketed first one and
// binds to the last word, losing the two between. So: take the plain hit as an
// upper BOUND and scan only the text before it for an earlier bracketed form —
// which also keeps the scan cheap, since the bound is usually a few chars away.
function locateToken(text: string, t: string, from: number): { start: number; end: number } | null {
  const plain = text.indexOf(t, from);
  const limit = plain < 0 ? text.length : plain;
  for (let s = from; s < limit; s += 1) {
    if (text[s] !== t[0]) continue;
    let i = s;
    let k = 0;
    let open = 0; // brackets opened inside the word, still to be closed
    while (i < text.length && k < t.length) {
      if (text[i] === t[k]) { i += 1; k += 1; }
      else if (SIGLUM.test(text[i])) { open += OPENER.test(text[i]) ? 1 : -1; i += 1; }
      else break;
    }
    if (k !== t.length) continue;
    // A bracket still OPEN at the end of the word closes just past it
    // ("ἔπει<τα>"): pull the closer in, or it would render as a gap detached
    // from its word. One that already closed mid-word ("ἀ<μφι>γνοεῖν") leaves
    // nothing owing, so a following closer belongs to the phrase, not the word.
    while (open > 0 && i < text.length && CLOSER.test(text[i])) { open -= 1; i += 1; }
    return { start: s, end: i };
  }
  // Nothing bracketed earlier: the plain hit, if any, is the leftmost match.
  return plain < 0 ? null : { start: plain, end: plain + t.length };
}

// Build the render parts for a Greek line. `text` is the line's verbatim text
// (with OCT sigla and punctuation); `tokens` are its clickable words; `events`
// are the speaker turns that begin on this line (already filtered to it).
//
// The token/gap split is identical to the reader's historical `lineParts`: each
// token is located in `text` from a moving pointer, and the verbatim spans
// between tokens become plain-text parts. Speaker lead-ins are then spliced in
// at their char offsets — at a token boundary they sit immediately before the
// token; inside a verbatim gap the gap is split around them. The line text is
// never altered, so token char-offsets never move.
export function lineRenderParts(
  text: string,
  tokens: readonly Token[],
  events: readonly SpeakerEvent[] = [],
): LineRenderPart[] {
  // Atoms: the token/gap sequence, each tagged with its [start, end) char span.
  type Atom = { part: LineRenderPart; start: number; end: number };
  const atoms: Atom[] = [];
  let ptr = 0;
  for (const tok of tokens) {
    const at = locateToken(text, tok.t, ptr);
    // Shouldn't happen. Emit nothing: the verbatim text still prints the word
    // in a later gap, so a phantom atom here would print it TWICE. The word
    // just loses its click target.
    if (!at) continue;
    const { start: i, end } = at;
    if (i > ptr) atoms.push({ part: { kind: 'text', text: text.slice(ptr, i) }, start: ptr, end: i });
    // `text` is the verbatim slice (sigla and all); `tok` carries the bare word
    // for the popup, search-hit test and aria-label.
    atoms.push({ part: { kind: 'token', text: text.slice(i, end), tok }, start: i, end });
    ptr = end;
  }
  if (ptr < text.length) atoms.push({ part: { kind: 'text', text: text.slice(ptr) }, start: ptr, end: text.length });

  if (events.length === 0) return atoms.map((a) => a.part);

  const evs = [...events].sort((a, b) => a.offset - b.offset);
  const out: LineRenderPart[] = [];
  let ei = 0;
  const pushSpeaker = (e: SpeakerEvent) =>
    out.push({ kind: 'speaker', label: e.label, dash: e.label === DASH });

  for (const a of atoms) {
    // Any events landing at or before this atom's start lead it in.
    while (ei < evs.length && evs[ei].offset <= a.start) { pushSpeaker(evs[ei]); ei += 1; }
    // An event falling strictly inside a verbatim gap splits the gap around it;
    // tokens are never split (an interior offset attaches before the next atom).
    if (a.part.kind === 'text' && ei < evs.length && evs[ei].offset < a.end) {
      let cur = a.start;
      while (ei < evs.length && evs[ei].offset < a.end) {
        const off = evs[ei].offset;
        if (off > cur) out.push({ kind: 'text', text: text.slice(cur, off) });
        pushSpeaker(evs[ei]);
        ei += 1;
        cur = off;
      }
      if (cur < a.end) out.push({ kind: 'text', text: text.slice(cur, a.end) });
    } else {
      out.push(a.part);
    }
  }
  // Trailing events (offset at/after the line end) close out the line.
  while (ei < evs.length) { pushSpeaker(evs[ei]); ei += 1; }
  return out;
}

// ── Turn-flow row model (Stephanus dialogues) ────────────────────────────────
// John's Tier-0 requirement: each speaker's statement is the aligned ROW — the
// first Greek line of a turn sits level with the first English line of its
// translation, for the WHOLE BOOK (the pipeline pairs turns globally, so
// Stephanus section boundaries never break a row). Sections dissolve into the
// continuous flow; each section's first Greek line carries a gutter TICK (the
// column token, e.g. "2b") which is also the `col-{token}` citation anchor.
// `buildFlowRows` is a pure function of (segments, turnFlow) so it can be
// unit-tested independently of the reader.

// One Greek line (or a slice of one) inside a flow row. `col` + `n` identify
// the line (`L{col}-{n}` DOM id); `cont` marks a partial tail of a line opened
// in an earlier row (no repeated id — the reader emits `-c`); `tick` carries
// the section token when this line opens a Stephanus section (the reader
// floats it in the gutter and anchors `col-{tick}` on it).
export interface FlowLine {
  col: string;
  n: number;
  cont: boolean;
  tick: string | null;
  parts: LineRenderPart[];
}

// One row of the turn flow: a paired turn (Greek beside English), a one-sided
// residual (greek/english empty on the other side), or the leading
// continuation row before the first turn.
export interface FlowRow {
  lead: boolean;
  paired: boolean;
  // The printed English lead-in ("Soc."); null for an unattributed dash turn
  // (rendered as an em-dash) and for Greek-only residuals (the Greek cell
  // shows its own siglum inline).
  display: string | null;
  speaker: string | null;
  greek: FlowLine[];
  english: string | null;
  // Continuation paragraphs merged into this row's English cell: an unpaired
  // English residual whose speaker matches this row (or is unattributed) is
  // the SAME speech split by Perseus where the OCT has one turn — it flows
  // under this row as a sub-paragraph (print convention: no repeated label)
  // instead of rendering as a one-sided row beside blank Greek. A residual
  // whose speaker DIFFERS still gets its own one-sided row (never
  // mis-attribute). Each continuation keeps its own `ep` paragraph breaks
  // (Timaeus/Phaedo long residual speeches carry them — B2), and its own `es`
  // section starts (offsets are relative to that continuation's own text).
  englishCont: { text: string; ep?: number[] | null; es?: { o: number; c: string }[] | null }[];
  // Section tokens whose ticks fall inside this row's Greek — the reader
  // renders row-level gutter markers from these in English-only view (where
  // the Greek cells, and so the exact tick lines, are hidden). Kept as the
  // FALLBACK for turns with no `es` (pre-`es` built JSON): without offsets the
  // reader can only show the row's opening section, not one tick per section.
  ticks: string[];
  // ── Flow-extension passthrough, carried verbatim from the FlowTurn (see
  // data.ts FlowTurn for semantics; `T[] | null` because the pipeline emits
  // explicit nulls, undefined on old JSON / synthetic rows). `ep` are the
  // paragraph-break offsets inside this row's English (para flows and long
  // dialogue speeches); `et` embeds english.turns as intra-row speech blocks
  // (para flows); `sub` stacks one-sided English speeches folded under this
  // row (B4 residual rows — usually `english` is null); `es` are the Stephanus
  // section starts inside this row's English, one per gutter citation tick.
  ep?: number[] | null;
  es?: { o: number; c: string }[] | null;
  et?: { o: number; s: string | null; d: string | null }[] | null;
  sub?: { s: string | null; d: string | null; e: string; ep?: number[] | null; es?: { o: number; c: string }[] | null }[] | null;
  // Alternate-translation slices for this row, keyed by translation id (carried
  // verbatim from the FlowTurn; see data.ts). The reader's turn-by-turn compare
  // renders `alt[id].e` in the second column beside this row's primary English.
  alt?: Record<string, { e: string | null; ep?: number[] | null; es?: { o: number; c: string }[] | null }> | null;
}

// The whole book's Greek lines in document order, each carrying its column and
// (for the first line of each section) its tick token.
interface BookLine {
  col: string;
  tick: string | null;
  line: GreekLine;
  events: SpeakerEvent[];
}

function bookLines(segments: readonly Segment[]): BookLine[] {
  const out: BookLine[] = [];
  for (const seg of segments) {
    seg.greek.forEach((line, i) => {
      out.push({
        col: seg.column,
        tick: i === 0 ? seg.column : null,
        line,
        events: (seg.speakers ?? []).filter((s) => s.line === line.n),
      });
    });
  }
  return out;
}

// The Greek render-lines covering [from, to) over the book's line list, where a
// bound is a line index + char offset. Tokens whose start falls in the slice
// stay clickable (ORIGINAL Token objects — lineRenderParts locates each by its
// surface text, never by `o`, so popup identity and Beta Code keys survive);
// speaker events in the slice are spliced in as lead-ins. A line opened at
// offset 0 keeps its id and its section tick; a partial tail is `cont`.
function sliceBook(
  lines: readonly BookLine[],
  from: { i: number; o: number },
  to: { i: number; o: number },
): FlowLine[] {
  const out: FlowLine[] = [];
  for (let i = from.i; i <= to.i && i < lines.length; i += 1) {
    const B = lines[i];
    const s = i === from.i ? from.o : 0;
    const e = i === to.i ? to.o : B.line.text.length;
    if (s >= e) continue; // empty slice (a boundary on a line edge)
    const text = B.line.text.slice(s, e);
    const tokens: Token[] = B.line.tokens.filter((t) => t.o >= s && t.o < e);
    const evs = B.events
      .filter((ev) => ev.offset >= s && ev.offset < e)
      .map((ev) => ({ ...ev, offset: ev.offset - s }));
    out.push({
      col: B.col,
      n: B.line.n,
      cont: s > 0,
      tick: s === 0 ? B.tick : null,
      parts: lineRenderParts(text, tokens, evs),
    });
  }
  return out;
}

export function buildFlowRows(
  segments: readonly Segment[],
  flow: TurnFlow,
): FlowRow[] {
  const lines = bookLines(segments);
  if (!lines.length || !flow.turns.length) return [];
  // Line index of each (column, n) ref. Line numbers restart per section, so
  // the key needs both.
  const idx = new Map<string, number>();
  lines.forEach((b, i) => idx.set(`${b.col} ${b.line.n}`, i));
  // Bound of each Greek-bearing turn; null for English-only residuals and for
  // an unresolvable ref (which then contributes no Greek slice).
  const bounds: ({ i: number; o: number } | null)[] = flow.turns.map((t) => {
    if (!t.g) return null;
    const i = idx.get(`${t.g.c} ${t.g.n}`);
    return i === undefined ? null : { i, o: t.g.o };
  });
  const end = { i: lines.length - 1, o: lines[lines.length - 1].line.text.length };
  // For each Greek-bearing turn, its slice runs to the NEXT Greek-bearing
  // turn's start (residual English turns in between don't cut the Greek).
  const nextG: ({ i: number; o: number } | null)[] = new Array(flow.turns.length).fill(null);
  let nxt: { i: number; o: number } = end;
  for (let ti = flow.turns.length - 1; ti >= 0; ti -= 1) {
    nextG[ti] = nxt;
    if (bounds[ti]) nxt = bounds[ti]!;
  }
  const ticksOf = (greek: FlowLine[]) =>
    greek.filter((l) => l.tick !== null).map((l) => l.tick!);

  const rows: FlowRow[] = [];
  // Leading row: Greek before the first Greek turn + English before the first
  // English turn (both are tails of speech begun before this book/section span).
  const firstG = bounds.find((b) => b !== null) ?? end;
  const leadGreek = sliceBook(lines, { i: 0, o: 0 }, firstG);
  if (leadGreek.length || flow.leadE) {
    rows.push({
      lead: true, paired: false, display: null, speaker: null,
      greek: leadGreek, english: flow.leadE, englishCont: [],
      ticks: ticksOf(leadGreek),
    });
  }
  flow.turns.forEach((t, ti) => {
    const greek = bounds[ti] ? sliceBook(lines, bounds[ti]!, nextG[ti]!) : [];
    // An unpaired English residual continuing the PREVIOUS row's speaker (or
    // unattributed) merges into that row's English cell as a sub-paragraph —
    // Perseus split one OCT turn into several <said>. A different speaker
    // keeps its own one-sided row. A residual CARRYING sub-speeches (pipeline
    // B4's column-grouped rows, e.g. Lysis's opening narration) never merges:
    // englishCont can't hold the stacked speeches, so folding the text into
    // the previous row would silently drop them.
    const prev = rows[rows.length - 1];
    if (!t.p && greek.length === 0 && t.e && prev && !t.sub?.length
        && (t.s === null || t.s === prev.speaker)) {
      // Preserve the residual's paragraph breaks: as a continuation they ride
      // the englishCont entry; as the row's main English they become row.ep.
      if (prev.english) prev.englishCont.push({ text: t.e, ep: t.ep, es: t.es });
      else { prev.english = t.e; prev.ep = t.ep; prev.es = t.es; }
      return;
    }
    // A GREEK-BEARING residual whose English is entirely folded sub-speeches by
    // the SAME speaker as the previous row is that speaker continuing across a
    // Stephanus SECTION boundary: Perseus/OCT open the section mid-speech (Meno
    // 70c starts at εἰδότας), but the translation's paragraph break comes a
    // clause later — so rendering the residual as its own row pushes that Greek
    // down beside the NEXT sentence's English. Merge it into the previous row so
    // the Greek flows beside the English it translates, with the section tick
    // inline; each sub becomes a continuation paragraph (no repeated label). Only
    // for dialogue flows, and only when every folded speech is the previous
    // speaker REPEATING THE SAME PRINTED LABEL (or unlabeled) — a redundant
    // "Soc." over an unbroken speech. A folded speech that carries a different
    // printed display (a section rubric like "The Speech of Pausanias" in a
    // narrated frame, whose canonical speaker is the narrator) is a real
    // heading, not a redundant label, so it keeps its own row; likewise a
    // differing/unattributed speaker (never mis-attribute) and a mixed stack.
    if (flow.kind !== 'para' && !t.p && greek.length > 0 && !t.e
        && prev && prev.speaker != null
        && t.sub?.length
        && t.sub.every((s) => s.s === prev.speaker && (s.d == null || s.d === prev.display))) {
      prev.greek.push(...greek);
      prev.ticks.push(...ticksOf(greek));
      for (const s of t.sub) prev.englishCont.push({ text: s.e, ep: s.ep, es: s.es });
      return;
    }
    rows.push({
      lead: false,
      paired: t.p,
      display: t.d,
      speaker: t.s,
      greek,
      english: t.e,
      englishCont: [],
      ticks: ticksOf(greek),
      // Paragraph-flow passthrough (undefined for dialogue turns).
      ep: t.ep,
      es: t.es,
      et: t.et,
      sub: t.sub,
      // Alternate-translation slices (undefined until the turn aligner runs).
      alt: t.alt,
    });
  });
  return rows;
}

// Redundant-label suppression, per flow row (aligned with the rows array). A
// lead-in / folded-sub label is hidden when it REPEATS the current speaker's
// SAME printed display — the pipeline re-emits "Soc." when one unbroken speech
// is split across a section boundary (Meno 70b→c). It is KEPT when the display
// differs (a section rubric like "The Speech of Pausanias", whose canonical
// speaker is the narrator, is a heading, not a redundant label). An em-dash
// turn (no display) is a genuine break that resets the floor, so a same-speaker
// turn after it keeps its label. Pure, so the reader can drive rendering from
// it and it stays unit-testable. The floor advances in render order: each row's
// lead-in (shown only when it has English) then its folded sub-speeches.
export interface RowLabelMeta { hideLead: boolean; hideSub: boolean[]; }

export function labelSuppression(rows: readonly FlowRow[]): RowLabelMeta[] {
  let floor: string | null = null;      // canonical speaker holding the floor
  let floorDisp: string | null = null;  // and their printed display
  return rows.map((row) => {
    let hideLead = false;
    if (!row.lead && row.english) {
      if (row.display) {
        hideLead = row.speaker != null && row.speaker === floor && row.display === floorDisp;
        floor = row.speaker;
        floorDisp = row.display;
      } else {
        floor = row.speaker; // em-dash turn: a real break
        floorDisp = null;
      }
    }
    const hideSub = (row.sub ?? []).map((s) => {
      let hide = false;
      if (s.d) {
        hide = s.s != null && s.s === floor && s.d === floorDisp;
        floor = s.s;
        floorDisp = s.d;
      } else {
        floor = s.s;
        floorDisp = null;
      }
      return hide;
    });
    return { hideLead, hideSub };
  });
}

// ── English turn blocks (narrated fallback) ─────────────────────────────────
// A narrated work's chunk that carries English <said> turns with no Greek
// events (Republic, Apology…) gets no turn flow, but its speeches still owe
// the reader per-turn structure: print editions set each speech as its own
// paragraph with its lead-in. This helper
// slices the chunk prose at the turn offsets into a stack of blocks — never an
// inline splice, so a label can never end up glued to the tail of the previous
// sentence ("…as I have.SOCRATES. Our…").

// One block of a fallback English stack. `lead` marks the unlabeled leading
// block (text before the first turn — the tail of a speech begun in an earlier
// section); `display` is the printed lead-in, null for an unattributed turn
// (rendered as an em-dash, mirroring the Greek dash).
export interface EnglishTurnBlock {
  lead: boolean;
  display: string | null;
  text: string;
}

export function buildEnglishTurnBlocks(
  text: string,
  turns: readonly EnglishTurn[],
): EnglishTurnBlock[] {
  if (!turns.length) return [{ lead: true, display: null, text }];
  const blocks: EnglishTurnBlock[] = [];
  const lead = text.slice(0, turns[0].offset).trim();
  if (lead) blocks.push({ lead: true, display: null, text: lead });
  for (let i = 0; i < turns.length; i += 1) {
    const end = i + 1 < turns.length ? turns[i + 1].offset : text.length;
    const t = text.slice(turns[i].offset, end).trim();
    // An empty UNLABELED slice (two adjacent boundaries with nothing between,
    // e.g. a reported turn whose text the walker filed elsewhere) would render
    // as a bare em-dash paragraph — drop it. A labeled turn keeps its block
    // even when empty, so the attribution itself is never lost.
    if (!t && turns[i].display == null) continue;
    blocks.push({ lead: false, display: turns[i].display, text: t });
  }
  return blocks;
}
