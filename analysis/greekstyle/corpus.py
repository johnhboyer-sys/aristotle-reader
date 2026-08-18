"""Load the Greek TEI sources into structured token streams.

The 41 Greek files come from two very different TEI families and do NOT agree
on how the text is anchored:

  * Perseus `grc2` (EN, EE, Metaphysics, Politics, Rhetoric, Poetics,
    Oeconomica, VV) carries real Bekker column milestones.
  * First1KGreek `grc1` (everything else) mostly carries only `<pb>` -- the
    *volume page* of Bekker's 1837 Oxford reprint, which is not a citation --
    plus book/chapter `<div>`s. A few (Physics, De caelo) additionally mark
    Bekker columns as `<note type="marginal">184a</note>`.

So the stable, universally available unit is the div hierarchy (book/part/
chapter), and Bekker columns are an overlay where the file supplies them. Every
token carries both, and studies slice on whichever is available.

Normalisation folds what editors disagree about (elision, sigma shape,
orthographic doublets) and keeps what the manuscripts transmit (the particles).
See `features.EDITION_SENSITIVE` -- the folding is measured, not assumed.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCES = REPO_ROOT / "sources"

# --- normalisation ---------------------------------------------------------

# Five different characters are used to mark elision across these files;
# U+1FBF (psili) alone accounts for 6,430 of them.
APOSTROPHES = "\u02bc\u2019\u0027\u1fbd\u1fbf\u1ffd"

# Elided forms restored to full spelling. Elision is overwhelmingly an EDITORIAL
# convention (Bekker elides where Ross prints in full), so leaving `δʼ` and `δέ`
# as separate types would make the editor the loudest voice in the matrix.
ELISION = {
    "δ": "δέ", "τ": "τε", "γ": "γε", "ἀλλ": "ἀλλά", "οὐδ": "οὐδέ",
    "μηδ": "μηδέ", "ἐπ": "ἐπί", "ἐφ": "ἐπί", "ἀπ": "ἀπό", "ἀφ": "ἀπό",
    "ὑπ": "ὑπό", "ὑφ": "ὑπό", "κατ": "κατά", "καθ": "κατά",
    "μετ": "μετά", "μεθ": "μετά", "παρ": "παρά", "περ": "περί",
    "δι": "διά", "ἀν": "ἀνά", "ἀντ": "ἀντί", "ἀνθ": "ἀντί",
    "ἄρ": "ἄρα", "οὔτ": "οὔτε", "μήτ": "μήτε", "εἴτ": "εἴτε",
    "ἔτ": "ἔτι", "ἅμ": "ἅμα", "τοῦτ": "τοῦτο", "ταῦτ": "ταῦτα",
    "πάντ": "πάντα", "πολλ": "πολλά", "ὥστ": "ὥστε", "εἶτ": "εἶτα",
    "ἔπειτ": "ἔπειτα", "μ": "με", "σ": "σε", "ποτ": "ποτε",
    "τότ": "τότε", "μάλισθ": "μάλιστα", "οὐθ": "οὔτε", "μηθ": "μήτε",
}

# Orthographic doublets that editors normalise silently and inconsistently.
ORTHO = [
    (re.compile(r"^γιγν"), "γιν"),   # γίγνομαι / γίνομαι
    (re.compile(r"^ξυν"), "συν"),     # Attic ξυν- / koine συν-
]

def strip_accents(s: str) -> str:
    """Fold every diacritic, including the spacing breathing/koronis marks."""
    d = unicodedata.normalize("NFD", s)
    d = "".join(
        c for c in d
        if not unicodedata.combining(c) and c not in APOSTROPHES
    )
    return unicodedata.normalize("NFC", d)


def is_elided(tok: str) -> bool:
    t = unicodedata.normalize("NFC", tok)
    return bool(t) and t[-1] in APOSTROPHES


def normalise(tok: str) -> str:
    """One surface token -> its comparison key (lowercase, de-elided, bare)."""
    t = unicodedata.normalize("NFC", tok).lower()
    # Some First1K files carry superscript variant markers (δε¹, καί²) glued to
    # the word; they are apparatus, not spelling.
    t = "".join(
        c for c in t
        if unicodedata.category(c).startswith(("L", "M")) or c in APOSTROPHES
    )
    elided = bool(t) and t[-1] in APOSTROPHES
    if elided:
        t = t[:-1]
    t = t.replace("ς", "σ")
    if elided:
        bare = strip_accents(t)
        for k, v in ELISION.items():
            if strip_accents(k) == bare:
                t = v
                break
    for pat, rep in ORTHO:
        t = pat.sub(rep, t)
    return strip_accents(t).replace("ς", "σ")


# --- tokenisation ----------------------------------------------------------

# Letters only: the Greek block also holds ano teleia (U+0387) and the
# question mark (U+037E), which must not be glued onto a token.
TOKEN_RE = re.compile(f"[^\\W\\d_]+[{APOSTROPHES}]?", re.UNICODE)
HAS_GREEK = re.compile(r"[\u0370-\u03ff\u1f00-\u1fff]")
MARGINAL_COL = re.compile(r'<note type="marginal">\s*(\d+\s*[ab])\s*</note>')
# Editorial voice, not text: apparatus, notes, running heads.
DROP_BLOCKS = re.compile(r"<(note|bibl|head|speaker|figure|app|del|orig)\b[^>]*>.*?</\1>", re.S)
SELF_CLOSING_DROP = re.compile(r"<(gap|lb|pb|cb|space)\b[^>]*/?>")
DIV_OPEN = re.compile(r'<div\b[^>]*subtype="([^"]+)"[^>]*\bn="([^"]*)"')
DIV_OPEN_ALT = re.compile(r'<div\b[^>]*\bn="([^"]*)"[^>]*subtype="([^"]+)"')


@dataclass
class Token:
    norm: str
    column: str | None = None            # Bekker column where the file gives one
    ctx: tuple = ()                      # (("book","1"),("chapter","3"), ...)
    elided: bool = False                 # printed with an elision mark
    surface: str = ""                    # pre-normalisation form

    def get(self, subtype: str) -> str | None:
        for k, v in self.ctx:
            if k == subtype:
                return v
        return None


def _clean(xml: str) -> str:
    i, j = xml.find("<body"), xml.rfind("</body>")
    body = xml[i:j] if i != -1 and j != -1 else xml
    # Marginal Bekker columns live inside <note>, which we are about to delete,
    # so promote them to a milestone-like marker first.
    body = MARGINAL_COL.sub(lambda m: f'<milestone unit="page" n="{re.sub(chr(92)+"s+", "", m.group(1))}"/>', body)
    prev = None
    while prev != body:
        prev = body
        body = DROP_BLOCKS.sub(" ", body)
    return SELF_CLOSING_DROP.sub(" ", body)


def load_tokens(path: Path) -> list[Token]:
    """Parse one TEI file into a flat token stream with div + Bekker context."""
    body = _clean(path.read_text(encoding="utf-8"))
    out: list[Token] = []
    col: str | None = None
    stack: list[tuple[str, str]] = []
    depth_of: list[int] = []       # div-nesting depth at which each ctx entry was pushed
    depth = 0
    pos = 0

    for m in re.finditer(r"<[^>]*>", body):
        chunk = body[pos:m.start()]
        if chunk.strip():
            ctx = tuple(stack)
            for t in TOKEN_RE.findall(chunk):
                if not HAS_GREEK.search(t):
                    continue
                n = normalise(t)
                if n:
                    out.append(Token(n, col, ctx, is_elided(t), t))
        tag = m.group(0)
        pos = m.end()

        if tag.startswith("<milestone"):
            um = re.search(r'unit="([^"]+)"', tag)
            nm = re.search(r'\bn="([^"]+)"', tag)
            if nm and um and um.group(1) in ("page", "section"):
                v = nm.group(1).strip()
                # Bekker columns ALWAYS carry an a/b side. Requiring it rejects the
                # bare section numbers some files put in the same milestone slot.
                v = re.sub(r"\s+", "", v)
                if re.match(r"^\d+[ab]$", v) and (
                    col is None or column_key(v) >= column_key(col)
                ):
                    # A printed text runs forward, so a column that jumps
                    # backwards is a stray marginal note, not a citation.
                    col = v
        elif tag.startswith("<div"):
            if not tag.endswith("/>"):
                depth += 1
                d = DIV_OPEN.search(tag) or None
                if d:
                    sub, n = d.group(1), d.group(2)
                else:
                    a = DIV_OPEN_ALT.search(tag)
                    sub, n = (a.group(2), a.group(1)) if a else (None, None)
                if sub:
                    stack.append((sub, n))
                    depth_of.append(depth)
        elif tag.startswith("</div"):
            while depth_of and depth_of[-1] >= depth:
                depth_of.pop()
                stack.pop()
            depth -= 1

    for t in TOKEN_RE.findall(body[pos:]):
        if not HAS_GREEK.search(t):
            continue
        n = normalise(t)
        if n:
            out.append(Token(n, col, tuple(stack), is_elided(t), t))
    return out


# --- Bekker helpers --------------------------------------------------------

def column_key(col: str | None) -> tuple[int, int] | None:
    """'1094b' -> (1094, 1), so columns sort and compare numerically."""
    if not col:
        return None
    m = re.match(r"^(\d+)([ab])?$", col.strip())
    if not m:
        return None
    return int(m.group(1)), (1 if m.group(2) == "b" else 0)


def in_range(col: str | None, lo: str, hi: str) -> bool:
    k, a, b = column_key(col), column_key(lo), column_key(hi)
    return bool(k and a and b and a <= k <= b)
