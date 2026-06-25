"""
Abbreviation expansion for Bonitz Index Aristotelicus text.

Identifies Bonitz work-reference abbreviations (e.g. Μδ22., πλδ7.) and
Latin scholarly abbreviations (opp, cf, ie, sim, dist, act, pass, etc.)
within text segments, and tags them with Latin/English expansions.

WORK_TABLE maps the Greek abbreviation prefix to (latin_title, english_title).
The book/section letter following the prefix is preserved as a suffix on the expansion.

LATIN_TABLE maps Latin scholarly abbreviations to English glosses.
"""

from __future__ import annotations
import re

# ---------------------------------------------------------------------------
# Work-title abbreviation table
# Greek prefix → (Latin title, English title)
# Ordered longest-first so matching prefers the most specific prefix.
# ---------------------------------------------------------------------------
WORK_TABLE: list[tuple[str, str, str]] = [
    # Zoological works (Ζ- prefix)
    ('Ζι',  'Historia Animalium',         'History of Animals'),
    ('Ζμ',  'De Partibus Animalium',       'Parts of Animals'),
    ('Ζγ',  'De Generatione Animalium',    'Generation of Animals'),
    ('Ζκ',  'De Motu Animalium',           'Movement of Animals'),
    # Two-letter works
    ('ηε',  'Ethica Eudemia',             'Eudemian Ethics'),
    ('φτ',  'De Plantis',                 'On Plants'),
    ('αν',  'De Respiratione',            'On Breathing'),
    ('πο',  'Poetica',                    'Poetics'),
    ('πλ',  'Problemata',                 'Problems'),
    ('πκ',  'Problemata',                 'Problems'),
    # Capital single-letter works
    ('Μ',   'Metaphysica',                'Metaphysics'),
    ('Ο',   'De Caelo',                   'On the Heavens'),
    ('Α',   'Analytica',                  'Analytics'),
    ('Η',   'Ethica Nicomachea',          'Nicomachean Ethics'),
    ('Ρ',   'Rhetorica',                  'Rhetoric'),
    ('Π',   'Politica',                   'Politics'),
    # Lowercase single-letter works (longer prefixes must come first above)
    ('ρ',   'Rhetorica ad Alexandrum',    'Rhetoric to Alexander'),
    ('μ',   'Meteorologica',              'Meteorologica'),
    ('φ',   'Physiognomonica',            'Physiognomics'),
    ('κ',   'De Mundo',                   'On the World'),
    ('ο',   'Oeconomica',                 'Economics'),
    ('θ',   'Mirabilia',                  'On Marvellous Things Heard'),
    ('π',   'Problemata',                 'Problems'),
    ('ξ',   'De Xenophane Zenone Gorgia', 'On Xenophanes, Zeno and Gorgias'),
    # Latin/other
    ('f',   'Fragmenta',                  'Fragments'),
]

# Build longest-first ordered list for prefix matching
_WORK_PREFIXES = sorted(WORK_TABLE, key=lambda t: -len(t[0]))

# Greek letters used in abbreviations (no diacritics/combining marks)
_GREEK_CHARS = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω'

# Pattern: sequence of plain Greek chars (or f) followed by digits, then either
# a period OR a word boundary (space / punctuation / end-of-string).
# Using a lookahead so the terminating character stays in the text stream.
_WREF_RE = re.compile(
    r'(?<!\w)([' + _GREEK_CHARS + r'f]+)(\d+)(?=[\.\s,;]|$)'
)

# ---------------------------------------------------------------------------
# Latin scholarly abbreviation table
# ---------------------------------------------------------------------------
LATIN_TABLE: dict[str, str] = {
    # ── Longer phrases first (matched before their component words) ──
    'signa terminorum in prima syllogismorum figura':
                 'symbols for the terms in the first figure of syllogisms',
    'signa terminorum':  'symbols for the terms',
    'hoc loco':          'at this passage',
    'cum codd':          'with the manuscripts',
    'e cod':             'from the manuscript',
    'i e':               'that is',
    'v s h v':           'see below under the heading',
    # ── Single-word abbreviations ──
    'opp':       'opposite of',
    'cf':        'compare',
    'ie':        'that is',
    'sim':       'similarly',
    'dist':      'distinguish from',
    'act':       'active sense',
    'pass':      'passive sense',
    'scripsit':  'reads',
    'veluti':    'such as',
    'al':        'and elsewhere',
    'eius':      'its',
    'eorum':     'their',
    'figura':    'figure',
    'loco':      'passage',
    'codd':      'manuscripts',
    'cod':       'manuscript',
}

# Build a single alternation regex, longest-first
_LAT_SORTED = sorted(LATIN_TABLE.keys(), key=lambda k: -len(k))
_LAT_RE = re.compile(
    r'(?<![a-z])(' + '|'.join(re.escape(k) for k in _LAT_SORTED) + r')(?![a-z])'
)

# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

def _match_work_prefix(chars: str) -> tuple[str, str, str, str] | None:
    """
    Try to match a known work prefix in `chars`.
    Returns (prefix, book_suffix, latin, english) or None.
    `book_suffix` is everything after the matched prefix (book/section letters).
    """
    for prefix, latin, english in _WORK_PREFIXES:
        if chars.startswith(prefix):
            book = chars[len(prefix):]
            return (prefix, book, latin, english)
    return None


def tokenize_text(text: str) -> list[dict]:
    """
    Split a plain-text string into segments:
      {"kind": "text",       "content": "..."}
      {"kind": "wref",       "abbr": "Μδ", "book": "δ",
                             "latin": "Metaphysica", "english": "Metaphysics"}
      {"kind": "latin_abbr", "abbr": "opp", "english": "opposite of"}

    Segments preserve the full original string when concatenated.
    """
    segments: list[dict] = []

    # Two-pass: first mark wref positions, then mark latin abbrevs in residual text.
    # We build a list of (start, end, segment) and sort by start.

    spans: list[tuple[int, int, dict]] = []

    for m in _WREF_RE.finditer(text):
        chars = m.group(1)
        chap  = m.group(2)
        match = _match_work_prefix(chars)
        if match:
            prefix, book, latin, english = match
            abbr_str = chars  # full abbreviation+book as written, e.g. "Μδ"
            spans.append((m.start(), m.end(), {
                'kind':    'wref',
                'abbr':    abbr_str,
                'book':    book,
                'chap':    chap,
                'latin':   latin,
                'english': english,
                # The raw text that this span replaces (abbr + chap + ".")
                '_raw':    m.group(0),
            }))

    for m in _LAT_RE.finditer(text):
        abbr = m.group(1)
        # Skip if inside a wref span already
        inside = any(s <= m.start() < e for s, e, _ in spans)
        if not inside:
            spans.append((m.start(), m.end(), {
                'kind':    'latin_abbr',
                'abbr':    abbr,
                'english': LATIN_TABLE[abbr],
            }))

    spans.sort(key=lambda t: t[0])

    pos = 0
    for start, end, seg in spans:
        if start < pos:
            continue  # overlapping span — skip (shouldn't happen)
        if start > pos:
            segments.append({'kind': 'text', 'content': text[pos:start]})
        segments.append(seg)
        pos = end

    if pos < len(text):
        segments.append({'kind': 'text', 'content': text[pos:]})

    return segments


def tokenize_segments(segments: list[dict]) -> list[dict]:
    """
    Apply tokenize_text() to each 'text' segment in an existing segment list,
    expanding work refs and Latin abbreviations. Other segment kinds pass through.
    """
    result: list[dict] = []
    for seg in segments:
        if seg['kind'] == 'text':
            result.extend(tokenize_text(seg['content']))
        else:
            result.append(seg)
    return result
