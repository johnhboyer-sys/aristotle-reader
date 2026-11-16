"""A work's Greek as one running text, for the search page's running-text mode.

Stage 6 writes search/running.json:

  {"v": 1, "token_count": N, "text": "..."}

`text` is every stage3 token of the work in document order, each as its Beta
Code letters (lowercase, the search indexes' letters) with its diacritics
kept after each letter in one fixed order, and between two tokens the
punctuation the page prints there, including before the first token and after
the last. The two never share a character:

  token  a-z  '  ( ) / \\ = | +     (letters, elision, Beta Code marks)
  gap    space , . ; : " -          (: is the raised dot, " every quote mark)

so the n-th run of token characters IS global token n: the offset map back to
segment, line and token is offsets.json, which counts the same tokens in the
same order. Editorial sigla ([ ] < > † *) and parentheses (which Beta Code
spends on breathings) are not text and are left out. The client strips the
marks for an accent-blind search and turns each gap into one space for a
search that ignores punctuation (shared/lib/running-text.ts mirrors
token_spans below).
"""

from __future__ import annotations

import re
import unicodedata

from .beta import _APOSTROPHES, _BASE, _MARKS
from .stage3_tokenize import _clean, _not_a_word

TOKEN_CHARS = frozenset("abcdefghijklmnopqrstuvwxyz'()/\\=|+")
GAP_CHARS = frozenset(' ,.;:"-')

# The order a letter's marks are written in, whatever order they arrived in:
# breathing, diaeresis, accent, iota subscript (ἔ e)/, ΐ i+/, ᾗ h(=|).
_MARK_RANK = {")": 0, "(": 0, "+": 1, "/": 2, "\\": 2, "=": 2, "|": 3}

_GAP_MAP = {
    ",": ",", ".": ".", ";": ";", ";": ";",
    "·": ":", "·": ":", ":": ":",
    '"': '"', "“": '"', "”": '"', "‘": '"', "’": '"',
    "«": '"', "»": '"', "'": '"', "᾽": '"', "ʼ": '"',
    "—": "-", "–": "-", "-": "-",
}

_RUN = re.compile(r"[^\s—]+")  # stage3's word runs


def token_beta(surface: str) -> str:
    """A token's Beta Code with its marks, each letter's marks in _MARK_RANK
    order. Grave stays grave: this is the text as printed, not a lookup key."""
    units: list[list[str]] = []
    for ch in unicodedata.normalize("NFD", surface):
        if ch in _APOSTROPHES:
            units.append(["'"])
            continue
        low = ch.lower()
        if low in _BASE:
            units.append([_BASE[low]])
        elif "a" <= low <= "z":  # a Beta Code letter is its own fold, as in greekFold
            units.append([low])
        elif ch in _MARKS and units and units[-1][0] != "'":
            if _MARKS[ch]:
                units[-1].append(_MARKS[ch])
        # The client has no token characters for Aristotle's _SIGNS (keraia,
        # stigma, lacuna dots). Omit them inside the same token; never turn a
        # lacuna dot into a gap, which would split one stage3 token into two.
    out = "".join(u[0] + "".join(sorted(u[1:], key=_MARK_RANK.__getitem__)) for u in units)
    if not any(c.isalpha() for c in out):
        raise ValueError(f"running text: token {surface!r} has no Greek letter")
    return out


def gap_text(raw: str) -> str:
    """The punctuation between two words as the running text keeps it: every
    space run one space, sigla and parentheses gone."""
    kept = "".join(" " if ch.isspace() else _GAP_MAP.get(ch, "") for ch in raw)
    return re.sub(r" {2,}", " ", kept)


def _letterish(ch: str) -> bool:
    return unicodedata.category(ch)[0] in "LM" and ch not in _APOSTROPHES


def line_pieces(text: str) -> list[tuple[str, str]]:
    """A printed line as ('gap', raw) and ('tok', surface) pieces, the tokens
    exactly as stage3 cut them (its own _clean, on its own runs)."""
    out: list[tuple[str, str]] = []
    pos = 0
    for m in _RUN.finditer(text):
        out.append(("gap", text[pos:m.start()]))
        pos = m.end()
        raw = m.group(0)
        token, had_sigla = _clean(raw)
        if not token or _not_a_word(token, had_sigla):
            out.append(("gap", raw))
            continue
        letters = [i for i, ch in enumerate(raw) if _letterish(ch)]
        if not letters:
            # Keep the stage3 token so token_beta raises with its work/ref.
            out.append(("tok", token))
            continue
        first, last = letters[0], letters[-1] + 1
        if token[0] in _APOSTROPHES:
            # A leading elision belongs to the token too, not a quote gap.
            first = min(first, min(i for i, ch in enumerate(raw) if ch in _APOSTROPHES))
        if token[-1] in _APOSTROPHES:
            # Aristotle keeps even a quote after punctuation in the token.
            # Consume it here too, rather than emitting the same mark twice.
            last = max(last, max(i for i, ch in enumerate(raw) if ch in _APOSTROPHES) + 1)
        # Sigla inside the word (ἀ<μφι>γνοεῖν) are dropped with the word's own
        # span; what stands before and after it is punctuation.
        out += [("gap", raw[:first]), ("tok", token), ("gap", raw[last:])]
    out.append(("gap", text[pos:]))
    return out


def build_running_text(segments: list[dict], spine: dict) -> str:
    """The work's running text from stage3's segments and the spine's lines.
    Raises if the spine's words do not cut into stage3's tokens one for one,
    since every token after a slip would then be cited and marked wrongly."""
    work = spine["work"]
    if [s["id"] for s in segments] != [s["id"] for s in spine["segments"]]:
        raise ValueError(f"running text: {work}: segment order differs from stage3 at global token 0")
    parts: list[str] = []
    gap = ""
    global_token = 0
    for seg, printed_seg in zip(segments, spine["segments"]):
        # Repeated (n, sub) occurs in secluded or transposed passages. Pair
        # by position as stage3 and stage7 do, never by a line-number map.
        if len(seg["lines"]) != len(printed_seg["lines"]):
            raise ValueError(
                f"running text: {work}: {seg['id']} line count differs from stage3 "
                f"at global token {global_token}"
            )
        for line, printed in zip(seg["lines"], printed_seg["lines"]):
            ref = f"{seg['id']} line {line['n']}{line.get('sub', '')}"
            if (line["n"], line.get("sub")) != (printed["n"], printed.get("sub")):
                raise ValueError(
                    f"running text: {work}: {ref} differs from spine line "
                    f"at global token {global_token}"
                )
            want = [tok["t"] for tok in line["tokens"]]
            pieces = line_pieces(printed["text"])
            got = [value for kind, value in pieces if kind == "tok"]
            if got != want:
                first = next(i for i in range(max(len(got), len(want)))
                             if (got[i] if i < len(got) else None)
                             != (want[i] if i < len(want) else None))
                raise ValueError(
                    f"running text: {work}: {ref} cuts into different tokens at "
                    f"global token {global_token + first}: "
                    f"spine {got[first:first+1]}, stage3 {want[first:first+1]}"
                )
            gap += " "
            for kind, value in pieces:
                if kind == "gap":
                    gap += value
                    continue
                mapped_gap = gap_text(gap)
                # Keep the printed work edges, without the line separator
                # added above or outer whitespace. Inner gaps still separate
                # tokens even when all their printed marks were sigla.
                if global_token:
                    parts.append(mapped_gap or " ")
                else:
                    parts.append(mapped_gap)
                try:
                    parts.append(token_beta(value))
                except ValueError as err:
                    raise ValueError(
                        f"running text: {work}: {ref} global token {global_token}: {err}"
                    ) from err
                global_token += 1
                gap = ""
    parts.append(gap_text(gap))
    return "".join(parts).strip(" ")


def token_spans(text: str) -> list[tuple[int, int]]:
    """Each token's [start, end) in the running text: its runs of token
    characters, in order. The n-th span is global token n."""
    spans: list[tuple[int, int]] = []
    start = -1
    for i, ch in enumerate(text):
        if ch in TOKEN_CHARS:
            if start < 0:
                start = i
        elif ch in GAP_CHARS:
            if start >= 0:
                spans.append((start, i))
                start = -1
        else:
            raise ValueError(f"running text: unexpected character {ch!r} at {i}")
    if start >= 0:
        spans.append((start, len(text)))
    return spans


def check_alignment(work: str, text: str, segments: list[dict], token_count: int) -> None:
    """Raise on the first token that disagrees with the offsets source.

    Counts alone cannot detect a shifted or swapped token. Compare every run
    too; report the zero-based global token the client would cite wrongly.
    """
    try:
        spans = token_spans(text)
    except ValueError as err:
        raise ValueError(f"running text: {work}: {err}") from err
    if token_count == 0 or not spans:
        raise ValueError(
            f"running text: {work}: cannot check alignment at global token 0: "
            f"{len(spans)} runs, offsets token_count {token_count}"
        )
    expected = [(seg["id"], line, tok)
                for seg in segments for line in seg["lines"] for tok in line["tokens"]]
    for i in range(max(len(spans), len(expected), token_count)):
        actual = text[slice(*spans[i])] if i < len(spans) else None
        source = token_beta(expected[i][2]["t"]) if i < len(expected) else None
        if actual != source or i >= token_count or i >= len(expected):
            where = (f"{expected[i][0]} line {expected[i][1]['n']}"
                     f"{expected[i][1].get('sub', '')} {expected[i][2]['t']!r}"
                     if i < len(expected) else "<end of stage3>")
            raise ValueError(
                f"running text: {work}: first divergence at global token {i} ({where}): "
                f"run {actual!r}, expected {source!r}; {len(spans)} runs, "
                f"{len(expected)} stage3 tokens, offsets token_count {token_count}"
            )
