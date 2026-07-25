"""
Per-reader canonicalization for the three-reader comparison (Opus, History
Genie/CHURRO, LlamaParse).

Raw reads are immutable; everything here works on copies and produces a
CANONICAL stream used only for diffing:

  - reader-specific markup stripped (LaTeX math, <sup>, **bold**, italics
    underscores, Unicode superscript a/b);
  - page-boundary junk dropped (running heads, printer signatures, section
    letters, page numbers, --- separators);
  - citation spacing collapsed (367 b2 / 1456 <sup>a</sup>12 -> 367b2 / 1456a12);
  - NFC; ALL whitespace removed (readers disagree wildly on spacing).

Ligatures (ϗ, ȣ) are LEFT RAW in the canonical stream; the comparator applies
a fold (ϗ->και, ȣ->ου, accent-strip) only when judging a disagreement region,
so raw-vs-expanded never registers as a real disagreement but accent errors
elsewhere still do.
"""

from __future__ import annotations
import re
import unicodedata

# --- LaTeX Greek-letter names (History Genie emits $\mu\beta$ etc.) ---------
_GREEK = {
    'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
    'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
    'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'omicron': 'ο',
    'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
    'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
}
_GREEK.update({k.capitalize(): v.upper() for k, v in _GREEK.items()})

_SUPERS = {'ᵃ': 'a', 'ᵇ': 'b', 'ᵅ': 'a', 'ª': 'a', 'º': 'o',
           'ͣ': 'a', 'ͨ': 'b',   # Genie's combining-letter renderings of raised a/b
           '¹': '1', '²': '2', '³': '3'}


def _latex_to_plain(text: str) -> str:
    """Convert Genie's $...$ math runs to plain characters."""
    def _one(m: re.Match) -> str:
        inner = m.group(1)
        inner = re.sub(r'\^\\text\{([^}]*)\}', r'\1', inner)
        inner = re.sub(r'\^\{([^}]*)\}', r'\1', inner)
        inner = inner.replace('^', '')
        inner = re.sub(
            r'\\([A-Za-z]+)',
            lambda g: _GREEK.get(g.group(1), g.group(1)), inner)
        return inner.replace('{', '').replace('}', '').replace(' ', '')
    return re.sub(r'\$([^$]*)\$', _one, text)


def _strip_common_markup(text: str) -> str:
    text = re.sub(r'</?sup>', '', text)
    text = text.replace('**', '')
    for k, v in _SUPERS.items():
        text = text.replace(k, v)
    return text


# --- junk-line predicates ---------------------------------------------------
_RE_SIGNATURE = re.compile(r'^[A-Z]{1,2}\s?\d?\s?\*?$')      # A, A 2, B 2*, C
_RE_PAGENUM = re.compile(r'^\d{1,3}$')
_RE_SEPARATOR = re.compile(r'^-{3,}$')
# running head: 1-2 Greek words, or two joined by an em-dash; no digits
_RE_HEAD = re.compile(r'^[^\d]{1,60}$')


def _is_junk_line(line: str, prev_entries: bool = True) -> bool:
    s = line.strip()
    if not s:
        return True
    if _RE_SEPARATOR.match(s) or _RE_PAGENUM.match(s) or _RE_SIGNATURE.match(s):
        return True
    # running head like "ἀγορανομία — ἀγών" or a stray column-top lemma
    if '—' in s and len(s) < 60 and not any(c.isdigit() for c in s):
        words = [w for w in re.split(r'[—\s]+', s) if w]
        if len(words) <= 3:
            return True
    return False


def clean_genie(paragraphs: list[str]) -> str:
    """History Genie docx paragraphs -> cleaned text (one paragraph per line).

    Some pages come back as a line-by-line TABLE across the two columns
    ("left text | right text" per printed line). Runs of such rows are
    de-interleaved: all left cells in order, then all right cells.
    """
    out: list[str] = []
    lefts: list[str] = []
    rights: list[str] = []

    def _flush():
        out.extend(x for x in lefts if x)
        out.extend(x for x in rights if x)
        lefts.clear()
        rights.clear()

    for p in paragraphs:
        p = _latex_to_plain(p)
        p = _strip_common_markup(p)
        # italic-expansion underscores inside words: κ_αὶ_ -> καὶ
        p = re.sub(r'(?<=\S)_|_(?=\S)', '', p)
        if '|' in p:
            cells = [c.strip() for c in p.split('|')]
            # leaked gutter line-number at cell start: a bare multiple of 5
            # with no period ("5 Ἀγάθων...") — not a chapter ref ("15. 1248...")
            cells = [re.sub(r'^(\d{1,2})\s+(?=[^\d])',
                            lambda m: '' if int(m.group(1)) % 5 == 0 else m.group(0),
                            c) for c in cells]
            lefts.append(cells[0])
            rights.append(' '.join(c for c in cells[1:] if c))
            continue
        _flush()
        if _is_junk_line(p):
            continue
        out.append(p.strip())
    _flush()
    return '\n'.join(out)


def clean_llamaparse(text: str) -> str:
    out = []
    for line in text.splitlines():
        s = _strip_common_markup(line)
        if re.match(r'^=+ PAGE \d+ =+$', s.strip()):
            continue
        if _is_junk_line(s):
            continue
        out.append(s.strip())
    return '\n'.join(out)


def clean_opus(text: str) -> str:
    out = []
    for line in text.splitlines():
        s = _strip_common_markup(line)
        if _is_junk_line(s):
            continue
        out.append(s.strip())
    return '\n'.join(out)


# --- canonical stream -------------------------------------------------------

# Homoglyphs: readers cannot distinguish Latin P from Greek Ρ etc. — the
# print is identical — so fold Latin to the Greek lookalike (capitals, plus
# lowercase o/z which readers mix inside work sigla). Apostrophe-like marks
# and dash variants are unified for the same reason.
_HOMOGLYPHS = str.maketrans('ABEZHIKMNOPTYXoz', 'ΑΒΕΖΗΙΚΜΝΟΡΤΥΧοζ')
_APOSTROPHES = str.maketrans({c: "'" for c in '’‘ʼ᾽᾿´΄`'})
_DASHES = str.maketrans({c: '—' for c in '–−―'})
# LlamaParse writes cursive theta; fold to upright form
_THETA = str.maketrans('ϑ', 'θ')
# apostrophe + bare capital vowel = smooth breathing rendered as a mark
_RE_APOS_CAP = re.compile("'([ΑΕΗΙΟΥΩ])")
_SMOOTH = {'Α': 'Ἀ', 'Ε': 'Ἐ', 'Η': 'Ἠ', 'Ι': 'Ἰ', 'Ο': 'Ὀ', 'Υ': 'Υ', 'Ω': 'Ὠ'}


_CHAR_FOLDS = {}
for tbl in (_HOMOGLYPHS, _APOSTROPHES, _DASHES, _THETA):
    _CHAR_FOLDS.update({chr(k): v if isinstance(v, str) else chr(v)
                        for k, v in tbl.items()})
# same printed circumflex, two encodings: combining tilde (U+0303) vs
# perispomeni (U+0342) — readers split on these over ȣ (no precomposed form)
_CHAR_FOLDS['̃'] = '͂'


def canonical(cleaned: str) -> tuple[str, list[int]]:
    """
    Whitespace-free NFC stream for diffing.

    Returns (stream, offsets) where offsets[i] is the index of stream[i] in
    NFC(cleaned) — the reference text reconcile.py edits. Every fold is
    applied char-by-char so the offsets survive the length-changing ones
    (hyphen rejoin, apostrophe-breathing merge).
    """
    base = unicodedata.normalize('NFC', cleaned)
    # numeric-range dashes: readers disagree hyphen vs em-dash inside Bekker
    # ranges (195a32-b3); normalize dash between citation chars to '-'
    # (1:1 char replacement, so offsets stay valid)
    base = re.sub(r'(?<=[0-9ab])[—–](?=[0-9ab])', '-', base)
    chars, offs = [], []
    skip = False
    for i, ch in enumerate(base):
        if skip:
            skip = False
            continue
        if ch.isspace():
            continue
        # rejoin end-of-line hyphenation (Opus keeps printed line breaks;
        # the other readers reflow entries and drop the hyphen)
        if ch == '-' and i + 1 < len(base) and base[i + 1] == '\n':
            continue
        ch = _CHAR_FOLDS.get(ch, ch)
        # apostrophe + bare capital vowel = smooth breathing as a mark
        if ch == "'" and i + 1 < len(base):
            nxt = _CHAR_FOLDS.get(base[i + 1], base[i + 1])
            if nxt in _SMOOTH:
                chars.append(_SMOOTH[nxt])
                offs.append(i)
                skip = True
                continue
        chars.append(ch)
        offs.append(i)
    return ''.join(chars), offs


# --- fold used by the comparator on disagreement regions --------------------

def fold(s: str) -> str:
    """Ligature-expand and accent-strip; used only to test soft equality."""
    s = re.sub(r'ϗ[̀-ͯ]*', 'και', unicodedata.normalize('NFD', s))
    s = re.sub(r'ȣ[̀-ͯ]*', 'ου', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    # final-sigma and case folds so ς/σ and Α/α don't count as disagreement
    return unicodedata.normalize('NFC', s).replace('ς', 'σ').lower()
