"""Stage 1d: third English translation (Martin Ostwald, Bobbs-Merrill 1962) for
the Nicomachean Ethics, ingested from a Markdown transcription.

Unlike the MIT-archive Ross (plain prose with no Bekker milestones, aligned onto
the spine via the gloss aligner), the Ostwald Markdown carries the Bekker
apparatus *inline*: each column begins with a bare page label (``1094a``) and
every fifth Bekker line is marked with a bare line number (``5 10 15 …``). We
parse those markers into a synthetic alignment map — one ``certain`` anchor per
marker — and hand it to the shared ``build_chunks`` machinery, so Ostwald gets a
genuine per-line Bekker gutter (Rackham-grade), not an interpolated estimate.

The translation's 505 footnotes are kept: their references stay inline in the
chunk text as ``[^N]`` tokens (the reader turns them into clickable superscripts)
and their definitions are emitted as a ``{N: html}`` map for the popup.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .config import BUILD_DIR, SOURCES_DIR
from .stage1_common import join_paragraph_parts, write_json
from .stage1_ross import build_chunks

# Book / chapter / marker grammar of the Ostwald Markdown.
_BOOK = re.compile(r"^#\s+BOOK\s+([IVXLC]+)\s*$")
# Chapter heading, e.g. `## 7. *(e) Theoretical wisdom*[^260]`. The number is
# sometimes wrapped by a stray emphasis asterisk (`## *7. …`), so the leading
# `*` is optional; the rest of the line is Ostwald's own chapter title.
_CHAPTER = re.compile(r"^##\s+\*?(\d+)\.\s*(.*?)\s*$")
_FOOTNOTE_DEF = re.compile(r"^\[\^(\d+)\]:\s*(.*)$")
# A footnote reference, e.g. `[^260]`, and the trailing one a chapter title may
# carry (six of Ostwald's notes introduce a chapter and hang off its heading).
_FN_REF = re.compile(r"\[\^(\d+)\]")
# Any reference, including the `<book>.<number>` labels renumbering writes.
_FN_REF_ANY = re.compile(r"\[\^[\w.]+\]")
_TITLE_NOTE = re.compile(r"(\[\^\d+\])\s*$")
# A figure in a footnote: `![alt text](figure-id)`, resolved against the
# source's figures.json (see _render_footnote).
_FIGURE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
# A bare Bekker page label, e.g. 1094a … 1181b (range-checked below).
_PAGE = re.compile(r"^1\d{3}[ab]$")
# A bare Bekker line number: line 1 is implied by the page label, the rest are
# every fifth line. Pages run to ~38 lines, so 5…40 covers the cadence. The
# number is sometimes OCR'd inside the sentence it interrupts, carrying that
# sentence's punctuation along with it ("to our standards 20; but this is") —
# 37 of them across the work. Such a token is still the marginal number, and
# the punctuation belongs to the word before it, so both are recovered rather
# than left to print as a stray digit in the reading text.
_LINE = re.compile(r"^(5|10|15|20|25|30|35|40)([.,;:!?)\]]*)$")
# Markdown emphasis *like this* (single asterisks, not ** bold), for footnotes.
_EMPH = re.compile(r"\*(?!\s)([^*]+?)\*")
# Blockquote markers. Ostwald sets quoted verse (and two long prose quotations,
# one of them doubly marked `> >`) as Markdown blockquotes; where the
# transcription ran several verse lines together the markers ended up mid-line,
# so they are stripped wherever they stand as their own token, not just at line
# start. The translation itself never uses ASCII `>` — Ostwald's editorial
# insertions are ⟨angle brackets⟩ — so this can't eat prose.
_QUOTE_MARK = re.compile(r"(?:(?<=\s)|^)>+(?=\s|$)")

_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

_PAGE_LO, _PAGE_HI = 1094, 1181


def _roman_int(s: str) -> int:
    total = prev = 0
    for ch in reversed(s):
        v = _ROMAN[ch]
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


def _strip_markup(line: str) -> str:
    """Drop the transcription's Markdown furniture: blockquote markers and the
    `&nbsp;` that holds the printed indent of a runover verse line. The reader
    flows a quotation inline with the prose around it, so neither carries any
    meaning downstream — left in, both showed as literal text. Whitespace is
    collapsed so a stripped marker leaves no gap for the tokenizer or for a
    footnote definition (which is kept whole, not tokenized)."""
    out = _QUOTE_MARK.sub(" ", line).replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", out).strip()


def _load_figures(src_dir: Path) -> dict[str, str]:
    """`{figure-id: html}` for the diagrams Ostwald prints inside his notes.
    Vendored beside the Markdown as figures.json, the same convention the
    Isagoge's Owen uses. Absent file = no figures; a note that then references
    one raises in _render_footnote rather than shipping a broken placeholder."""
    path = src_dir / "figures.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _chapter_title(rest: str) -> str:
    """Ostwald's own chapter title from a heading's tail: `*(e) Theoretical
    wisdom*[^260]` → `(e) Theoretical wisdom[^260]`. The whole title is set in
    emphasis, which is furniture (the reader styles the line), but a trailing
    footnote reference is not — for six of Ostwald's notes, the one that
    introduces a chapter, the heading is the only place it is ever cited."""
    m = _TITLE_NOTE.search(rest)
    note, body = (m.group(1), rest[:m.start()]) if m else ("", rest)
    return body.strip().strip("*").strip() + note


def _render_footnote(text: str, figures: dict[str, str] | None = None) -> str:
    """A footnote definition as safe HTML: escaped, with *emphasis* preserved.

    A `![alt](figure-id)` placeholder is replaced by the vetted markup keyed
    under that id in the source's figures.json — Ostwald prints two diagrams
    inside notes, and the placeholder was showing as literal Markdown. The
    escape happens first and the figure is spliced in after, so the only markup
    that survives is ours."""
    figs = figures or {}
    holes: list[str] = []

    def _stash(m: re.Match) -> str:
        fig = figs.get(m.group(2))
        if fig is None:
            raise KeyError(f"footnote figure {m.group(2)!r} has no entry in figures.json")
        holes.append(fig)
        return f"\x00{len(holes) - 1}\x00"

    text = _FIGURE.sub(_stash, text)
    esc = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    out = _EMPH.sub(r"<em>\1</em>", esc).strip()
    return re.sub(r"\x00(\d+)\x00", lambda m: holes[int(m.group(1))], out)


def renumber_by_book(prose, titles, footnotes) -> dict[int, str]:
    """Ostwald restarts his footnote numbering at every book; the transcription
    numbers them straight through, 1–505, so no number on the page matched a
    number in the printed edition. Relabel every reference and definition as
    ``<book>.<printed number>``: the reader takes a scoped label's identity
    whole and shows only the trailing component, so the popup opens on the
    right note and the superscript reads as the book does.

    Returns ``{continuous: label}``. Raises if a definition is never cited —
    the mapping is derived from citation order, so a note nobody references
    cannot be placed, and silently dropping it would lose the note."""
    seen: dict[int, str] = {}
    counts: dict[int, int] = {}
    for book, chapter in sorted(prose):
        for text in (titles.get((book, chapter), ""), prose[(book, chapter)]):
            for m in _FN_REF.finditer(text):
                n = int(m.group(1))
                if n in seen:
                    continue
                counts[book] = counts.get(book, 0) + 1
                seen[n] = f"{book}.{counts[book]}"
    missing = sorted(set(footnotes) - set(seen))
    if missing:
        raise ValueError(f"ostwald: {len(missing)} footnote(s) defined but never cited, "
                         f"so they cannot be numbered by book: {missing}")

    def relabel(text: str) -> str:
        return _FN_REF.sub(lambda m: f"[^{seen[int(m.group(1))]}]", text)

    for key in list(prose):
        prose[key] = relabel(prose[key])
    for key in list(titles):
        titles[key] = relabel(titles[key])
    for n in list(footnotes):
        footnotes[seen[n]] = footnotes.pop(n)
    return seen


def parse_ostwald(md_path: Path):
    """Parse the Ostwald Markdown into:

    - ``prose``: ``{(book, chapter): text}`` with the inline Bekker markers
      stripped but the ``[^N]`` footnote references left in place;
    - ``align_map``: ``{"book:chapter": {"anchors": [...]}}`` in the shape
      ``build_chunks`` expects, one ``certain`` anchor per inline marker;
    - ``footnotes``: ``{N: html}`` for every footnote definition;
    - ``titles``: ``{(book, chapter): title}`` — Ostwald's own chapter titles,
      shown above his column, carrying any footnote reference the heading bore.
    """
    lines = md_path.read_text(encoding="utf-8").splitlines()
    figures = _load_figures(md_path.parent)

    prose: dict[tuple[int, int], str] = {}
    align: dict[str, dict] = {}
    footnotes: dict[int, str] = {}
    titles: dict[tuple[int, int], str] = {}

    book = chapter = None
    # Per-chapter accumulator (joined with single spaces, so anchor char offsets
    # computed here match the final " ".join(parts) string exactly).
    parts: list[str] = []
    length = 0
    page: str | None = None
    pending: list[str] = []          # marker citations awaiting the next word
    anchors: list[dict] = []
    counts = {"pages": 0, "line_marks": 0, "skipped_nums": 0}

    def _join_parts(ps: list) -> str:
        """Join word tokens and None paragraph-break sentinels into prose with
        `\n` at each paragraph boundary. Both `\n` and ` ` are 1 char, so the
        anchor char offsets computed during parsing remain valid."""
        return join_paragraph_parts(ps)

    def flush_chapter():
        nonlocal parts, length, anchors, pending
        if book is not None and chapter is not None and parts:
            # Any markers trailing the last word anchor at end-of-text.
            for cit in pending:
                anchors.append({"citation": cit, "offset": length,
                                "confidence": "certain"})
            prose[(book, chapter)] = _join_parts(parts)
            if anchors:
                align[f"{book}:{chapter}"] = {"anchors": anchors}
        parts, length, anchors, pending = [], 0, [], []

    in_footnotes = False
    for raw in lines:
        line = _strip_markup(raw)
        # The trailing footnote section opens with a `## Footnotes` header and
        # then one `[^N]: …` definition per line. Stop accumulating body text.
        if line == "## Footnotes" or _FOOTNOTE_DEF.match(line):
            in_footnotes = True
        if in_footnotes:
            m = _FOOTNOTE_DEF.match(line)
            if m:
                footnotes[int(m.group(1))] = _render_footnote(m.group(2), figures)
            continue

        mb = _BOOK.match(line)
        if mb:
            flush_chapter()
            book, chapter = _roman_int(mb.group(1)), None
            continue
        mc = _CHAPTER.match(line)
        if mc:
            flush_chapter()
            # `page` is NOT reset: a chapter usually starts mid-column, so its
            # opening line markers still belong to the page carried over from the
            # end of the previous chapter (until the next inline page label).
            chapter = int(mc.group(1))
            title = _chapter_title(mc.group(2))
            if title:
                titles[(book, chapter)] = title
            continue
        if chapter is None:
            continue
        if not line:
            # Blank line = paragraph boundary. Append a None sentinel; the
            # joining step converts it to a \n in the final text. Both \n and
            # the usual space separator are 1 char, so anchor offsets stay valid.
            if parts and parts[-1] is not None:
                parts.append(None)
            continue

        for tok in line.split():
            if _PAGE.match(tok) and _PAGE_LO <= int(tok[:-1]) <= _PAGE_HI:
                page = tok
                pending.append(f"{page}1")
                counts["pages"] += 1
                continue
            ml = _LINE.match(tok)
            if ml:
                if page is not None:
                    pending.append(f"{page}{ml.group(1)}")
                    counts["line_marks"] += 1
                else:
                    counts["skipped_nums"] += 1
                # Punctuation the number was OCR'd in front of belongs to the
                # word before it ("standards 20;" → "standards;"), so give it
                # back rather than dropping it with the marker.
                if ml.group(2) and parts and isinstance(parts[-1], str):
                    parts[-1] += ml.group(2)
                    length += len(ml.group(2))
                continue
            # Content word: its start offset resolves any pending markers.
            start = length + 1 if parts else 0
            for cit in pending:
                anchors.append({"citation": cit, "offset": start,
                                "confidence": "certain"})
            pending = []
            length = start + len(tok)
            parts.append(tok)
    flush_chapter()
    counts["titles"] = len(titles)

    return prose, align, footnotes, counts, titles


def _bekker_key(cit: str):
    m = re.match(r"(\d+)([ab])(\d+)", cit)
    return (int(m[1]), m[2], int(m[3])) if m else (0, "", 0)


def _without_refs(text: str) -> tuple[str, list[int]]:
    """The prose with its footnote references removed, plus a map from each
    index of that stripped text back to the original. Correction phrases are
    quoted from the prose and 33 of them span a footnote marker, so matching on
    the marked text pins them to whatever the label happened to be — which
    renumbering by book then changed under them. Matching on the stripped text
    makes a phrase depend on the words alone."""
    out: list[str] = []
    back: list[int] = []
    i = 0
    for m in _FN_REF_ANY.finditer(text):
        out.append(text[i:m.start()])
        back.extend(range(i, m.start()))
        i = m.end()
    out.append(text[i:])
    back.extend(range(i, len(text)))
    return "".join(out), back


def apply_corrections(prose, align, corrections) -> int:
    """Relocate Bekker markers from their raw OCR position (which sits ~1 clause
    late — the marginal number is OCR'd after the line it labels) to the semantic
    Greek-line start, found by direct reading (see tools/feasibility/). Each entry
    is a verbatim phrase resolved with str.find at build time, so it survives
    re-parsing. A phrase is applied only if found and order-preserving; otherwise
    that marker keeps its original position. Returns the number relocated."""
    n = 0
    for key, rec in align.items():
        b, c = (int(x) for x in key.split(":"))
        text = prose.get((b, c), "")
        bare, back = _without_refs(text)
        cmap = corrections.get(key) or {}
        last = -1
        for a in sorted(rec["anchors"], key=lambda a: _bekker_key(a["citation"])):
            ph = cmap.get(a["citation"])
            if ph:
                hit = bare.find(_FN_REF_ANY.sub("", ph))
                idx = back[hit] if 0 <= hit < len(back) else -1
                if idx >= 0 and idx > last:
                    a["offset"] = idx
                    n += 1
            last = max(last, a["offset"])
        rec["anchors"].sort(key=lambda a: a["offset"])
    return n


def run(manifest, spine: dict, english: dict) -> Path:
    cfg = (manifest.data.get("english") or {}).get("third") or {}
    src = SOURCES_DIR / cfg.get("dir", "ostwald") / cfg.get("file", "ostwald-ethics.md")
    prose, align, footnotes, counts, titles = parse_ostwald(src)
    renumber_by_book(prose, titles, footnotes)

    corr_path = SOURCES_DIR / cfg.get("dir", "ostwald") / "bekker_corrections.json"
    if corr_path.exists():
        n = apply_corrections(prose, align, json.loads(corr_path.read_text(encoding="utf-8")))
        print(f"  ostwald: applied {n} Bekker-marker corrections from {corr_path.name}")

    chunks = build_chunks(spine, english.get("chapters", []), prose, align)

    # Ostwald's chapter titles, keyed for the reader by the translation that
    # owns them: they are his editorial headings, so they belong over his
    # column, not over the Greek or another translator's.
    by_book: dict[str, dict[str, str]] = {}
    for (b, c), title in sorted(titles.items()):
        by_book.setdefault(str(b), {})[str(c)] = title

    out_dir = BUILD_DIR / "stage1"
    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "third_chunks.json", chunks)
    write_json(out_dir / "third_footnotes.json", footnotes)
    write_json(out_dir / "third_titles.json", {cfg.get("id", "third"): by_book})

    print(f"  ostwald: chapters={len(prose)} anchors={sum(len(v['anchors']) for v in align.values())} "
          f"footnotes={len(footnotes)} titles={counts['titles']} pages={counts['pages']} "
          f"line_marks={counts['line_marks']} skipped_nums={counts['skipped_nums']}")
    return out_dir / "third_chunks.json"
