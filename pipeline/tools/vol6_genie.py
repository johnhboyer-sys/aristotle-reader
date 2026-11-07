"""Oxford vol. VI (1913, Opuscula): our English against History Genie's read.

Each of the nine works' English rests on one archive.org OCR read. Genie's
whole-book read of the same volume (sources/genie-oxford/, untracked, never
committed) is a second, independent witness. This tool word-diffs the two;
every difference is then judged on the page image of archive.org
worksofaristotle0001unse_r3i1.

Run from pipeline/:
  uv run python tools/vol6_genie.py diff [--work Col]      # list the differences
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import html
import json
import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from aristotle_pipeline import stage1_archive  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GENIE_DEFAULT = Path("/Users/johnboyer/Developer/aristotle-reader/sources/genie-oxford/"
                     "Oxford Aristotle VI 1913 Opuscula.txt")

# Genie line where each work's body begins (its `## TITLE` or first text heading)
# and the line where the next work's front matter begins.
WORKS = ["Col", "Aud", "Phgn", "Plant", "Mirab", "Mech", "Lin", "Vent", "MXG"]
HEADINGS = {   # first heading of each work's front matter in Genie
    "Col": "# DE COLORIBUS", "Aud": "# DE AUDIBILIBUS", "Phgn": "# PHYSIOGNOMONICA",
    "Plant": "# DE PLANTIS", "Mirab": "# DE MIRABILIBUS AUSCULTATIONIBUS",
    "Mech": "# MECHANICA", "Lin": "# DE LINEIS INSECABILIBUS",
    "Vent": "# VENTORUM SITUS ET COGNOMINA", "MXG": "# DE MELISSO", "END": "# INDEX",
}

_MARK = r"(?:([¹²³⁴⁵⁶⁷⁸⁹⁰]+)|\$\^\{?\s*(\d+)\s*\}?\$|<sup>\s*(\d+)\s*</sup>|\^(\d+)\^?)"
_BEKKER_REF = r"\s*(?:\d{3}\s*(?:[ᵃᵇ]|\$\^\{?\\?(?:mathrm\{)?[ab]\}?\}?\$)|<sup>[ab]</sup>|\$\^[ab]\$)"
NOTE_MARK = re.compile(r"^\s*" + _MARK)
_SUPMAP = str.maketrans("¹²³⁴⁵⁶⁷⁸⁹⁰", "1234567890")


def is_note_line(raw: str, body_grams: set | None = None) -> bool:
    """A footnote line starts with its mark. A margin line number set as a
    raised figure ($^{10}$, ¹⁷) looks the same, so a marked line whose opening
    words stand in our text is body, not note. (Our text carries no notes.)"""
    raw = html.unescape(raw).replace("\xa0", " ")
    m = NOTE_MARK.match(raw)
    if not m:
        return False
    if re.match(_BEKKER_REF, raw[m.end():]):
        return True
    if body_grams is not None:
        words = [key(t) for t in tokens(_clean_line(raw[m.end():]))[:6]]
        if any(tuple(words[i:i + 3]) in body_grams for i in range(len(words) - 2)):
            return False
    return True


SUPER = "¹²³⁴⁵⁶⁷⁸⁹⁰"
SUB = "₀₁₂₃₄₅₆₇₈₉"


def ours(work: str) -> list[str]:
    cfg = yaml.safe_load((ROOT / "manifests" / f"{work}.yaml").read_text(encoding="utf-8"))
    prose = stage1_archive._load_prose(cfg["english"]["primary"])
    return [v for _, v in sorted(prose.items())]


def _genie_lines(genie: Path, work: str) -> list[str]:
    lines = genie.read_text(encoding="utf-8").splitlines()
    nxt = WORKS[WORKS.index(work) + 1] if work != WORKS[-1] else "END"
    start = next(i for i, l in enumerate(lines) if l.strip() == HEADINGS[work])
    end = next(i for i, l in enumerate(lines) if i > start and l.strip() == HEADINGS[nxt])
    return lines[start:end]


def _clean_line(s: str) -> str:
    s = html.unescape(s)
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)                  # ![FIG. 5.](fig5.png)
    s = re.sub(r"\$([^$]*)\$", lambda m: _math(m.group(1)), s)
    s = re.sub(r"<sup>\s*[0-9ab]*\s*</sup>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\[\d{1,2}\]", " ", s)                         # [5] margin line
    s = re.sub(r"\b\d{3}\s?[ᵃᵇª]", " ", s)                     # 791ᵃ, 973ª margin column
    s = re.sub(r"^\s*>\s*", "", s)                                 # > verse quoted as a block
    s = re.sub(r"(?<!\w)_([^_]+)_(?!\w)", r"\1", s)               # _quâ_ italics
    s = re.sub(rf"[{SUB}]+", " ", s)
    s = re.sub(rf"[{SUPER}]+", " ", s)
    s = re.sub(r"\*\*\s*[0-9IVXL]+\s*\*\*", " ", s)            # **2** chapter number
    s = re.sub(r"\b\d{3}\^?[ab]\b", " ", s)                  # 793^b left by _math
    s = re.sub(r"\^\d+\^?|\^\[ab\]", "", s)                    # ^1, ^10^ note marks
    s = re.sub(r"\\([.\[\]()*_-])", r"\1", s)                    # markdown escapes 2\.
    s = s.replace("*", "")
    s = s.replace("#", "")
    return s


GREEK_NAMES = {"Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π",
               "Sigma": "Σ", "Upsilon": "Υ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω"}


def _math(body: str) -> str:
    b = re.sub(r"\\(" + "|".join(GREEK_NAMES) + r")\b\s*", lambda m: GREEK_NAMES[m.group(1)], body)
    b = re.sub(r"\\(?:mathrm|text|cdot|quad|qquad)\b", " ", b).strip()
    if re.fullmatch(r"[\d\s_^{}a-z\\]*", b) and not re.search(r"[A-Z]", b):
        return " "                                              # $_{20}$, $^1$, $830^{\mathrm{a}}$
    return re.sub(r"[\\{}^_]|mathrm", "", b)


# Segments with no running head that the footnote-mark rule did not already
# drop, dropped as notes: each was read and is a footnote (continued from the
# page before, or one whose opening words also occur in our text) or front
# matter. Each is pinned by its opening words and a digest of the whole segment. A body
# page Genie gave no head would be dropped the same way, so verify fails on
# any such segment not listed here, and on a listed one it no longer sees.
NOTE_SEGMENTS = {
    "Plant": ["The argument is that there…#a982089cdf", "i. e. the earth is…#fb5c4a6765",
              "Casuram is due to a…#cbc625f064"],
    "Mirab": ["vi CONTENTS…#17013e5ca5"],
    "Mech": ["object the fore part has…#2abfbbd8a9", "852 19. i. e. if…#58bdc19cc0",
             "34. i. e. the force…#91099c3bc2"],
    "Lin": ["popular view, which regarded Earth,…#42bdd4d25b", "968 5 : cf. also…#50912c4f4d",
            "can only translate this by…#4112ad68d6", "posites of these. For the…#d4e851771d",
            "lines from a difference in…#0b3f76499c", "he proposes to read ,…#c5f9a18be1",
            "we must not regard division…#6df822489d"],
}
DROPPED: dict[str, list[str]] = {}


def genie(work: str, path: Path = GENIE_DEFAULT, body_grams: set | None = None) -> list[tuple[str, int]]:
    """[(text line, genie line number)] of the body, footnotes and heads dropped.

    Genie splits pages with `---` and often gives a page's footnotes a segment
    of their own. A note continued from the page before opens its segment
    without a mark; such a segment has no running head, so a segment that
    holds a note line and does not open with a head is notes throughout."""
    all_lines = path.read_text(encoding="utf-8").splitlines()
    lines = _genie_lines(path, work)
    base = all_lines.index(lines[0])
    segments, cur = [], []
    for k, raw in enumerate(lines):
        if raw.strip() in ("---", "***"):
            segments.append(cur)
            cur = []
        elif raw.strip():
            cur.append((raw, base + k + 1))
    segments.append(cur)
    out = []
    for seg in segments:
        if not seg:
            continue
        notes_at = next((i for i, (raw, _) in enumerate(seg) if is_note_line(raw, body_grams)), None)
        opens_with_head = not re.search(r"[a-z]", _clean_line(seg[0][0]))
        if not opens_with_head:
            if notes_at != 0:            # dropped on the head rule alone: must be pinned
                head = " ".join(_clean_line(seg[0][0]).split()[:5])
                body = " ".join(" ".join(r.split()) for r, _ in seg)
                DROPPED.setdefault(work, []).append(f"{head}…#{_digest(body)}")
            notes_at = 0
        for raw, ln in seg[:notes_at]:
            s = _clean_line(raw)
            if not re.search(r"[a-z]", s):                      # running head, signature
                continue
            out.append((s, ln))
    return out


QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "〈": "⟨", "〉": "⟩"})


SMALLCAP = str.maketrans(dict(zip("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ", "abcdefghijklmnoprstuvwyz")))
# A figure label's capital is the same glyph in Greek and Latin type (A/Α, B/Β);
# which code point either read chose says nothing about the print.
LOOKALIKE = str.maketrans(dict(zip("ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ", "ABEZHIKMNOPTYX")))


WORDS: set[str] = set()   # our text's lower-case words, set by diff()


def key(t: str) -> str:
    """Comparison form: a chapter's opening word is set in small capitals, which
    Genie gives as capitals. Case is ignored for an all-capital token only when
    it spells a word of three letters or more that our text uses in lower case,
    so a figure label (AB, BE, EHB) keeps its case and a label misread in case
    still shows."""
    u = t.translate(SMALLCAP).translate(LOOKALIKE)
    t = t.translate(LOOKALIKE)
    caps = u != t or (sum(c.isupper() for c in u) > 1 and u.upper() == u)
    word = _bare(u)
    return u.capitalize() if caps and len(word) >= 3 and word in WORDS else u


def norm(text: str) -> str:
    t = re.sub(r"‘\s+", "‘", text)                                # the print's thin space
    t = re.sub(r"\s+’", "’", t)                                   # inside curly quotes
    t = t.translate(QUOTES)
    t = re.sub(r"(^|\s)'\s+(?=\w)", r"\1'", t)                    # ' tearing' -> 'tearing'
    t = re.sub(r"(?<=[\w.,;:!?])\s+'(?=[\s.,;:!?)]|$)", "'", t)
    t = t.replace("--", "—")
    t = re.sub(r"\s+([,;:.!?)\]])", r"\1", t)
    t = re.sub(r"([(\[])\s+", r"\1", t)
    t = re.sub(r"\b([a-zA-Z])\.\s+([a-zA-Z])\.", r"\1.\2.", t)   # i. e. -> i.e.
    t = re.sub(r"\.\s+\.\s+\.", "...", t)
    t = re.sub(r"\s*—\s*", " — ", t)
    return t


def tokens(text: str) -> list[str]:
    return norm(text).split()


def genie_tokens(work: str, path: Path, vocab: set[str], body_grams: set) -> tuple[list[str], list[int]]:
    toks, where = [], []
    for s, ln in genie(work, path, body_grams):
        for k, t in enumerate(tokens(s)):
            if _margin_number(t, k == 0, work):
                continue
            m = re.fullmatch(r"(\S+-)(\d{1,2})", t)             # mois-5 ture
            if m and _margin_number(m.group(2), False, work):
                t = m.group(1)
            toks.append(t)
            where.append(ln)
    # rejoin words broken at a line or page end: "com-" "pletely"
    out, ow = [], []
    i = 0
    while i < len(toks):
        t = toks[i]
        if t.endswith("-") and not t.endswith("--") and len(t) > 1 and i + 1 < len(toks):
            joined = t[:-1] + toks[i + 1]
            halves = [_bare(t[:-1]), _bare(toks[i + 1])]
            keep = _bare(joined) not in vocab or all(h in vocab for h in halves)
            out.append(t + toks[i + 1] if keep else joined)
            ow.append(where[i])
            i += 2
            continue
        halves = _bare(t).split("-")
        if (re.search(r"\w-\w", t) and _bare(t) not in vocab and _bare(t.replace("-", "")) in vocab
                and not all(h in vocab for h in halves)):
            t = t.replace("-", "")          # appear-ance: a line-end hyphen kept inside a line;
                                            # not-being, whose halves are words, keeps its hyphen
        out.append(t)
        ow.append(where[i])
        i += 1
    return out, ow


# Joachim (Lin) and Forster's De Plantis number the margin by Bekker line where
# a sentence or note falls, not every fifth line.
ANY_LINE_NUMBER = {"Lin", "Plant"}


def _margin_number(t: str, line_start: bool = False, work: str = "") -> bool:
    """A margin figure Genie set into the text: a line number (5, 10 ... 40, or
    any up to 40 in ANY_LINE_NUMBER works), a Bekker page (791-980), or a
    chapter or section number opening a line. Any other bare numeral stays,
    and shows as a difference."""
    if not re.fullmatch(r"\d{1,3}", t):
        return False
    v = int(t)
    lines = 1 <= v <= 40 if work in ANY_LINE_NUMBER else (5 <= v <= 40 and v % 5 == 0)
    return line_start or lines or 791 <= v <= 980


def _bare(t: str) -> str:
    return re.sub(r"[^\w'-]", "", t).lower()


# Each work's first printed words (archive.org worksofaristotle0001unse_r3i1).
BODY_START = {
    "Col": "SIMPLE colours are the proper", "Aud": "ALL sounds, whether articulate or",
    "Phgn": "MENTAL character is not independent", "Plant": "LIFE is found in animals",
    "Mirab": "MEN say that in Paeonia,", "Mech": "Our wonder is excited, firstly,",
    "Lin": "ARE there indivisible lines? And,", "Vent": "Boreas (the North Wind). At",
    "MXG": "MELISSUS says that, if anything",
}
COVERAGE: dict[str, float] = {}
BODY_FOUND: dict[str, bool] = {}   # share of our words Genie's read partners, per work
MIN_COVERAGE = 0.97


def diff(work: str, path: Path = GENIE_DEFAULT, ctx: int = 6, text: str | None = None):
    ot = tokens(text if text is not None else "\n".join(ours(work)))
    WORDS.clear()
    WORDS.update(_bare(t) for t in ot if t.lower() == t)
    vocab = {_bare(t) for t in ot}
    ok = [key(t) for t in ot]
    grams = {tuple(ok[i:i + 3]) for i in range(len(ok) - 2)}
    gt, gw = genie_tokens(work, path, vocab, grams)
    # trim Genie's front matter (title page, preface, contents) at the print's
    # own first words, pinned here so a loss at our opening still shows
    head = [_bare(x) for x in BODY_START[work].split()]
    starts = [i for i in range(len(gt) - len(head)) if [_bare(x) for x in gt[i:i + len(head)]] == head]
    BODY_FOUND[work] = bool(starts)
    if starts:
        gt, gw = gt[starts[0]:], gw[starts[0]:]
    sm = difflib.SequenceMatcher(None, [key(x) for x in ot], [key(x) for x in gt], autojunk=False)
    COVERAGE[work] = sum(b.size for b in sm.get_matching_blocks()) / max(1, len(ot))
    res = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        res.append({
            "work": work, "op": op, "ours": " ".join(ot[i1:i2]), "genie": " ".join(gt[j1:j2]),
            "before": " ".join(ot[max(0, i1 - ctx):i1]), "after": " ".join(ot[i2:i2 + ctx]),
            "gline": gw[j1] if j1 < len(gw) else gw[-1], "i": i1,
        })
    return res


# ------------------------------------------------------------------ rulings

# Our errors, settled on the page image (archive.org worksofaristotle0001unse_r3i1;
# `leaf` is the hOCR page, whose image is page/n{leaf-1}.jpg). `old` is what
# our source carried, `new` what the print reads. `apply` writes them into
# sources/<dir>/book-NN.html; `check` (and the tests) fail if any `old` is back
# or any `new` is missing. Each `old` must occur exactly once when applied.
PRINT_READS: dict[str, list[tuple[str, str, str]]] = {
    "Aud": [
        ('when they are revelling', 'when they are revelling,', 'leaf 45'),
        ('breath in large quantities,', 'breath in large quantities.', 'leaf 46'),
    ],
    "Plant": [
        ('the father of plants?', 'the father of plants.', 'leaf 88'),
        ('made by dissimilar parts?', 'made by dissimilar parts', 'leaf 91'),
        ('wind). . . This', 'wind). . . . This', 'leaf 92'),
    ],
    "Mirab": [
        ('standing on the branches,', 'standing on the branches.', 'leaf 131'),
        ('approach and tease them,', 'approach and tease them.', 'leaf 141'),
        ('class in their stead,', 'class in their stead.', 'leaf 146'),
        ('had been inscribed ‘This', 'had been inscribed—‘This', 'leaf 157'),
        ('the tomb of Deiope’,', 'the tomb of Deïope’,', 'leaf 157'),
        ('the following lines: I Heracles', 'the following lines:— I Heracles', 'leaf 158'),
        ('some cases even more.', 'some cases even more.]', 'leaf 159'),
        ('On Mount Taygetus (i', 'On Mount Taÿgetus (i', 'leaf 164'),
    ],
    "Mech": [
        ('round the same point,', 'round the same point.', 'leaf 175'),
        ('to the circle ΑΒ,', 'to the circle ΑΒ.', 'leaf 175'),
        ('for the same reason,', 'for the same reason.', 'leaf 175'),
        ('what follows. Let BΓΔE', 'what follows. Let BΓEΔ', 'leaf 178'),
        ('side form the radii,', 'side form the radii.', 'leaf 179'),
        ('beam which is elevated,', 'beam which is elevated.', 'leaf 180'),
        ('which was originally AM,', 'which was originally ΔM,', 'leaf 180'),
        ('a balance, if A', 'a balance, if', 'leaf 180'),
        ('towards E is shorter,', 'towards E is shorter.', 'leaf 181'),
        ('when horizontal, and KAM', 'when horizontal, and KΛM', 'leaf 181'),
        ('and it displaces as', 'and it displaces', 'leaf 183'),
        ('the ship is greatest,', 'the ship is greatest.', 'leaf 183'),
        ('that vessels of great.', 'that vessels of great', 'leaf 183'),
        ('easy to check it.-', 'easy to check it.', 'leaf 184'),
        ('its position to A.', 'its position to Δ.', 'leaf 184'),
        ('little wind, and so?', 'little wind, and so', 'leaf 185'),
        ('a very small extent,', 'a very small extent.', 'leaf 186'),
        ("owing to its sides'", 'owing to its sides', 'leaf 186'),
        ('circumference, but moves —', 'circumference, but moves', 'leaf 187'),
        ('the fulcrum is ZA.', 'the fulcrum is ZΔ.', 'leaf 192'),
        ('is the lever ΒΓ,', 'is the lever ΒΓ.', 'leaf 192'),
        ('a light wooden instrument,', 'a light wooden instrument.', 'leaf 195'),
        ('sides by two "', 'sides by two', 'leaf 195'),
        ('at the points A', 'at the points Δ', 'leaf 195'),
        ('So ΕΓ and ZA', 'So ΕΓ and ZΔ', 'leaf 195'),
        ('the fulcrum, and AΔZ', 'the fulcrum, and ΔAZ', 'leaf 195'),
        ('similar to the Whole', 'similar to the whole', 'leaf 196'),
        ('thus one contributes to.', 'thus one contributes to', 'leaf 197'),
        ('movement of the Side', 'movement of the side', 'leaf 198'),
        ('the common centre, ZΓ', 'the common centre, ZI', 'leaf 199'),
        ('motion, equal to ZA.', 'motion, equal to ZΛ.', 'leaf 199'),
        ('perpendicular to ZA [at A] ;', 'perpendicular to ZΛ [at Λ] ;', 'leaf 199'),
        ('arc HB, and ZA', 'arc HB, and ZΛ', 'leaf 199'),
        ('will move along ZA;', 'will move along ZΛ;', 'leaf 199'),
        ('roll the large circle,’', 'roll the large circle,', 'leaf 199'),
        ('the latter to ZΓ', 'the latter to ZI', 'leaf 200'),
        ('distance equal to ZΓ,', 'distance equal to ZI,', 'leaf 200'),
        ('perpendicular to ZA and AH', 'perpendicular to ZΛ and AH', 'leaf 200'),
        ('piece of wood -or', 'piece of wood or', 'leaf 206'),
        ('be the head, A AB', 'be the head, AB', 'leaf 207'),
        ('acute angle with ΒΓ,', 'acute angle with ΒΓ.', 'leaf 207'),
    ],
    "Lin": [
        ('big’ not ‘little’ (or', 'big’ not ‘little’ ⟨or', 'leaf 215'),
        ('or ‘great’ not ‘small’).', 'or ‘great’ not ‘small’⟩.', 'leaf 215'),
        ('(by the preceding argument)', '⟨by the preceding argument⟩', 'leaf 219'),
        ('simple. But if (per impossibile)', 'simple. But if ⟨per impossibile⟩', 'leaf 220'),
        ('recognized kinds of (irrational)', 'recognized kinds of ⟨irrational⟩', 'leaf 220'),
        ('and the ratios, (in', 'and the ratios, ⟨in', 'leaf 222'),
        ('line may be divided),', 'line may be divided⟩,', 'leaf 222'),
        ('there are contained (indivisible)', 'there are contained ⟨indivisible⟩', 'leaf 222'),
        ('length are called (both)', 'length are called ⟨both⟩', 'leaf 225'),
        ('infinite and finite (from', 'infinite and finite ⟨from', 'leaf 225'),
        ('different points of view),', 'different points of view⟩,', 'leaf 225'),
        ('the same divisions (if', 'the same divisions ⟨if', 'leaf 225'),
        ('on the same principle).', 'on the same principle⟩.', 'leaf 225'),
        ('the mathematicians’ own ‘statements,', 'the mathematicians’ own statements,', 'leaf 227'),
        ('respects, and totally (unable)', 'respects, and totally ⟨unable⟩', 'leaf 227'),
        ('indivisible line. For (suppose', 'indivisible line. For ⟨suppose', 'leaf 232'),
        ('to be so: then,)', 'to be so: then,⟩', 'leaf 232'),
        ('the diagonal were (not', 'the diagonal were ⟨not', 'leaf 232'),
        ('not less than, but)', 'not less than, but⟩', 'leaf 232'),
        ('B) Then again (the', 'B) Then again ⟨the', 'leaf 233'),
        ('criticism of the doctrine) :', 'criticism of the doctrine⟩ :', 'leaf 233'),
        ('no indivisible line: (for', 'no indivisible line: ⟨for', 'leaf 233'),
        ('out of two Simples.)', 'out of two Simples.⟩', 'leaf 233'),
        ('(the following arguments must be c', '⟨the following arguments must be c', 'leaf 236'),
        ('considered against the doctrine) :—', 'considered against the doctrine⟩ :—', 'leaf 236'),
        ('(which they are trying to establish)', '⟨which they are trying to establish⟩', 'leaf 240'),
        ('way of thinking. (Let', 'way of thinking. ⟨Let', 'leaf 241'),
        ('consist of discrete elements.)', 'consist of discrete elements.⟩', 'leaf 241'),
        ('the Simples (when in contact) are (not ‘one’, but)', 'the Simples ⟨when in contact⟩ are ⟨not ‘one’, but⟩', 'leaf 243'),
        ('must be in contact.”', 'must be in contact.', 'leaf 244'),
        ('(with its predecessor or successor)', '⟨with its predecessor or successor⟩', 'leaf 247'),
        ('(too)', '⟨too⟩', 'leaf 252'),
    ],
    "Vent": [
        ('after the Scironian Cliffs,', 'after the Scironian cliffs,', 'leaf 258'),
    ],
    "MXG": [
        ('distinct problem—namely, Whether', 'distinct problem—namely, whether', 'leaf 264'),
        ('by the circular process.).', 'by the circular process.)', 'leaf 264'),
        ('may be for Notbeing', 'may be for Not-being', 'leaf 265'),
        ('ever move into Notbeing;', 'ever move into Not-being;', 'leaf 272'),
        ('of speech and thought.', 'of speech and thought . . .', 'leaf 274'),
        ('attribute unlimitedness to Notbeing', 'attribute unlimitedness to Not-being', 'leaf 274'),
        ('limited and have</p>\n<p>limits even', 'limited and have limits? even', 'leaf 275'),
        ('But even if Notbeing', 'But even if Not-being', 'leaf 278'),
        ('no longer be Notbeing.', 'no longer be Not-being.', 'leaf 279'),
        ('nor more, nothing is.', 'nor more, nothing is . . .', 'leaf 279'),
    ],
}

# Differences where the print reads as ours does (Genie misread, or set a
# footnote into the body), and differences the image cannot settle. Each
# entry is (work, our four words before it, ours, genie, reason) and must
# match exactly one difference
# in `verify`; an entry that matches none fails, so a stale allowance cannot
# hide a later change. A long `genie` is given as "opening words…#digest" (sha1 of all of it).
VERIFY_ALLOW: list[tuple[str, str, str, str, str]] = [
    ('Col', 'by the heat —', 'then', '-then', 'leaf 25: heat—then: the dash is ours; Genie reads -then'),
    ('Aud', 'space to be filled.', 'Furthermore,', 'Furthermore — more,', 'leaf 39: Further- at the page foot, more on the next: Furthermore'),
    ('Phgn', 'eyes under the upper', 'lids', 'lids,', 'leaf 73: lids⁹ ¹⁰, no comma'),
    ('Plant', 'properly requires moist food', '', 'i.e. life as found in the…#a75537c37e', 'leaf 86: Genie set footnote text into the body'),
    ('Plant', 'name, are found in', '⟨almost⟩', '\\', 'leaf 94: ⟨almost⟩ printed; Genie reads \\'),
    ('Plant', 'taken into consideration. A', 'plant', 'PLANT', 'leaf 96: small capitals at the opening (A PLANT); we give plain case'),
    ('Plant', 'many other differences. A', 'plant', 'PLANT', 'leaf 101: small capitals at the opening (A PLANT); we give plain case'),
    ('Plant', 'is fresh water. A', 'plant', 'PLANT', 'leaf 111: small capitals at the opening (A PLANT); we give plain case'),
    ('Plant', 'the tamarisk, for example.]', 'All', '} 9-All', 'leaf 113: a brace in the margin; Genie reads it into the text'),
    ('Plant', 'fruit will become bitter.', '', 'Here ends the book on Plants.', 'leaf 120: printed, but the closing line from the Latin is kept out of our text by design (build_plant_forster.py END)'),
    ('Mirab', 'please and boil it.', '', '^', 'leaf 134: no mark; Genie reads ^'),
    ('Mirab', 'that the stone called', "'marieus' does", "'marieus 'does", 'leaf 135: ‘marieus¹’ does: the quote closes after the note figure'),
    ('Mirab', 'administer this poison to', 'Cleonymus', 'Cleonymus.', 'leaf 141: Cleonymus, no stop (the 5 after it is the margin)'),
    ('Mirab', 'inhabitants, lest they should', '', 'thus — ὃ φασιν εἶναι δάκρυον…#ee6ad134c0', 'leaf 143: Genie set footnote text into the body (a note continued from leaf 142)'),
    ('Mech', 'the cause of it.', '', 'I', 'leaf 175: the 1 is the margin chapter number; Genie reads I'),
    ('Mech', 'and let the rectangle', 'ΔΨΡΓ', 'AΨPΓ', 'leaf 178: ΔΨΡΓ printed'),
    ('Mech', 'nothing to prevent the', '', 'fails. Why is this? The answer…#88623d0bb7', 'leaf 179: Genie set footnote text into the body (a note continued from the page before)'),
    ('Mech', 'by the smaller. Let', 'ΔZΓ', 'Δ Z Γ', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'A the common centre,', 'ZI', 'Z I', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'own motion, equal to', 'ZΛ.', 'Z Λ.', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'to HK [at K],', 'AΓ', 'A Γ', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'time becomes perpendicular to', 'ZΛ', 'Z Λ', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'the arc HB, and', 'ZΛ', 'Z Λ', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'ZΛ representing the arc', 'ZΓ.', 'Z Γ.', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'to K, the arc', 'ΖΓ', 'Z Γ', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'ΖΓ will move along', 'ZΛ;', 'Z Λ;', 'leaf 199: the label is set solid; Genie spaces its letters'),
    ('Mech', 'again becomes perpendicular to', 'ZΛ', 'ZA', 'leaf 200: ZΛ printed (Λ without a bar), as ZA in the line above is A'),
    ('Mech', 'ΒΓ is equal to', 'EH,', 'EΠ,', 'leaf 204: EH printed; Genie reads EΠ'),
    ('Mech', 'then, he is to', '', '25. i.e. when a line is…#3eaf642c6c', 'leaf 206: Genie set footnote text into the body'),
    ('Lin', 'every class of quanta?', '§', 'S', 'leaf 215: § printed; Genie reads S'),
    ('Lin', "is 'big' not 'little'", '⟨or', 'or', 'leaf 215: ⟨or printed; Genie drops the bracket'),
    ('Lin', "'little' ⟨or 'great' not", "'small'⟩.", "'small'.", 'leaf 215: ‘small’⟩. printed; Genie drops the bracket'),
    ('Lin', 'one another; and therefore', '⟨by', '(by', 'leaf 219: ⟨by printed; Genie reads ('),
    ('Lin', 'therefore ⟨by the preceding', 'argument⟩', 'argument)', 'leaf 219: argument⟩ printed; Genie reads )'),
    ('Lin', 'be rational or irrational.', '', 'consist ultimately of a finite number…#f3a16fe37a', 'leaf 220: Genie set footnote text into the body'),
    ('Lin', 'suitably applied); and nevertheless', '', "regards the text, I adopt Apelt's…#fb320b683d", 'leaf 221: Genie set footnote text into the body'),
    ('Lin', 'the composite magnitude there', 'are', 'arc', 'leaf 222: are printed; Genie reads arc'),
    ('Lin', 'are infinite in number.', '', 'however, omitted by Z.) Apelt defends…#3b4685e823', 'leaf 222: Genie set footnote text into the body'),
    ('Lin', 'is not infinite admits', '', 'The argument of the whole passage…#1779256ca8', 'leaf 223: Genie set footnote text into the body'),
    ('Lin', 'the arguments of Zeno.', '', "surate', and (ii) that all commensurate…#49bf58196d", 'leaf 227: Genie set footnote text into the body'),
    ('Lin', '— conclusions and assumptions', '', "fact, and therefore — since Zeno's…#05df2ac6b6", 'leaf 228: Genie set footnote text into the body'),
    ('Lin', 'on the indivisible line.', '', 'are all, quâ infinitesimal, equal: hence…#cd6ea5ae3d', 'leaf 230: Genie set footnote text into the body'),
    ('Lin', 'from one angle on', 'to', '', 'leaf 231: on to the diagonal printed; Genie drops to'),
    ('Lin', '(i.e. the original square', 'constructed', 'constructed) feet long. Let CABD be…#39d95c8ea6', 'leaf 231: Genie set footnote text into the body after constructed'),
    ('Lin', 'the indivisible line. For', '⟨suppose', 'suppose', 'leaf 232: ⟨suppose printed; Genie drops the bracket'),
    ('Lin', 'it to be so:', 'then,⟩', 'then,', 'leaf 232: then,⟩ printed; Genie drops the bracket'),
    ('Lin', 'of the diagonal were', '⟨not', 'not', 'leaf 232: ⟨not printed; Genie drops the bracket'),
    ('Lin', 'were ⟨not less than,', 'but⟩', 'but', 'leaf 232: but⟩ printed; Genie drops the bracket'),
    ('Lin', 'out of two Simples.⟩', '', 'In l. ἀφαιρεθέντος γάρ τοῦ ἴσου,…#bcb70950ef', 'leaf 233: Genie set footnote text into the body'),
    ('Lin', "'indivisible' line is divisible.", '', 'stand it. The writer assumes (ἅπασα…#2b8c80b472', 'leaf 216: Genie set footnote text into the body'),
    ('Lin', "of the 'indivisible' line.", '', 'it would not be possible to…#0639ecbd0c', 'leaf 235: Genie set footnote text into the body'),
    ('Lin', 'and since the opinions', '⟨which', '(which', 'leaf 240: ⟨which printed; Genie reads ('),
    ('Lin', 'they are trying to', 'establish⟩', 'establish)', 'leaf 240: establish⟩ printed; Genie reads )'),
    ('Lin', 'be no indivisible line.', '§', 'S', 'leaf 240: § printed; Genie reads S'),
    ('Lin', 'divided into unequal parts.', '', 'the planes bounded by those lines…#ee8496fc74', 'leaf 236: Genie set footnote text into the body'),
    ('Lin', 'consist of discrete elements.⟩', '', 'In l. τὰ ἄνισα is strange:…#dd6a8efea4', 'leaf 241: Genie set footnote text into the body'),
    ('Lin', 'a magnitude by composition.', '', 'Of these four alternatives σύνθεσις is…#769dc0585c', 'leaf 242: Genie set footnote text into the body'),
    ('Lin', 'But if the Simples', '⟨when', 'when', 'leaf 243: ⟨when printed; Genie drops the bracket'),
    ('Lin', 'the Simples ⟨when in', 'contact⟩', 'contact', 'leaf 243: contact⟩ printed; Genie drops the bracket'),
    ('Lin', '⟨when in contact⟩ are', '⟨not', 'not', 'leaf 243: ⟨not printed; Genie drops the bracket'),
    ('Lin', "contact⟩ are ⟨not 'one',", 'but⟩', 'but', 'leaf 243: but⟩ printed; Genie drops the bracket'),
    ('Lin', 'a time of Nows.', '', "in l. οὐδ᾿ ἂν ἄρ' αἱ…#57dc758fa0", 'leaf 243: Genie set footnote text into the body'),
    ('Lin', 'one another at K.', '', 'in contact with K whole-with-whole —…#174ff9eaea', 'leaf 245: Genie set footnote text into the body'),
    ('Lin', 'its being in contact', '⟨with', '(with', 'leaf 247: ⟨with printed; Genie reads ('),
    ('Lin', '⟨with its predecessor or', 'successor⟩,', 'successor),', 'leaf 247: successor⟩, printed; Genie reads )'),
    ('Lin', "be a 'series'. (h)", '†', '', 'leaf 247: † printed; Genie drops it'),
    ('Lin', 'στιγμὴ ἐπὶ στιγμῆς [ἐπιστήμη', 'Zᵃ], ἵν᾽ ᾖ [ᾖ PZᵃ]', 'Z], ᾗ [tilde ᾗ PZ]', 'leaf 247: Zᵃ and PZᵃ printed; Genie drops the raised a'),
    ('Lin', 'στιγμῇ, [γραμμὴ καὶ ἐπιστήμης', 'NWᵃ,', 'NW,', 'leaf 247: NWᵃ printed; Genie drops the raised a'),
    ('Lin', 'ἐπιστήμης NWᵃ, ἐπιστήμη καὶ', 'γραμμή Zᵃ],', 'γραμμὴ Z],', 'leaf 247: Zᵃ printed; Genie drops the raised a'),
    ('Lin', 'ἀδύνατον τὰ εἰρημένα εἶναι.', '†', '', 'leaf 247: † printed; Genie drops it'),
    ('Lin', 'determined by comparison with', '', 'to be required by the logic…#40840747af', 'leaf 251: Genie set footnote text into the body'),
    ('Lin', "plane will be 'joints'", '⟨too⟩:', '(too):', 'leaf 252: ⟨too⟩ printed; Genie reads ( )'),
    ('Vent', '', 'Boreas', 'BOREAS', 'leaf 255: small capitals at the opening; we give plain case'),
    ('Vent', 'Scylletium. At Dorylaeum in', '', 'Boreas N. N.N.E. Meses N.E. Caecias…#da9721bde6', 'leaf 257: the chart of the winds, a figure, not text'),
    ('MXG', 'in the way mentioned?', 'Gorgias', 'GORGIAS', 'leaf 276: small capitals at the opening; we give plain case'),
    ('Plant', 'take the form of straight lines.', 'In', 'IN', 'leaf 97: small capitals at the opening; we give plain case'),
    ('Plant', 'which were formerly hidden.', 'We', 'WE', 'leaf 103: small capitals at the opening; we give plain case'),
    ('Mirab', 'them, or gives them', 'something', 'some-thing', 'leaf 162: some- ends the line; Genie keeps the break'),
    ('Mech', 'of connexion. As,', 'therefore,', 'there-fore,', 'leaf 195: there- ends the line; Genie keeps the break'),
    ('MXG', 'limited, though not by', 'anything', 'any-thing', 'leaf 274: any- ends the line; Genie keeps the break'),
    ('Phgn', 'likeness, but only a resemblance.', 'Moreover,', 'More-over,', 'leaf 54: More- ends the line; Genie keeps the break'),
    ('Plant', 'in the sea than', 'elsewhere,', 'else-where,', 'leaf 106: else- ends the line; Genie keeps the break'),
    ('MXG', 'Being to Being by the', 'abovementioned', 'above-mentioned', 'leaf 266: unsettled: above- ends the line, so the print cannot say whether the word has a hyphen'),
    ('MXG', 'that if anything is, it cannot', '', '3', 'leaf 270: the margin chapter number 3'),
    ('MXG', 'were either by way', '', 'of', 'leaf 262: one of at the line break; Genie doubles it'),
    ('MXG', 'the inability of that', '', 'of Melissus, ἀκίνητον εἶναι τὸ ἕν,…#f526e5a0ad', 'leaf 269: Genie set footnote text into the body'),
    ('MXG', 'exist in itself, or', '', "ὄντων, τοῦ μὲν ὄντος, τοῦ δ'…#114aca39bf", 'leaf 272: Genie set footnote text into the body'),
]
UNSETTLED = "unsettled"         # a reason starting with this is listed in the report


def _source_files(work: str) -> list[Path]:
    cfg = yaml.safe_load((ROOT / "manifests" / f"{work}.yaml").read_text(encoding="utf-8"))
    d = ROOT / "sources" / cfg["english"]["primary"]["dir"]
    return sorted(d.glob("book-*.html"))


def _html_text(work: str) -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in _source_files(work))


def _mapper(old: str, new: str):
    """Character position in `old` -> the same place in `new`."""
    ops = difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes()

    def mapped(i: int, end: bool = False) -> int:
        for op, i1, i2, j1, j2 in ops:
            if end and op != "equal" and i1 < i <= i2:
                return j2                   # an end inside a change takes all of it
            if i1 <= i < i2 or (end and i == i2):
                return j1 + (i - i1 if op == "equal" else 0)
        return len(new)
    return mapped


def _manifest_path(work: str, key: str) -> Path | None:
    cfg = yaml.safe_load((ROOT / "manifests" / f"{work}.yaml").read_text(encoding="utf-8"))
    eng = cfg["english"]["primary"]
    rel = eng.get(key) if key != "paragraphs" else f"{eng['dir']}/paragraphs.yaml"
    p = ROOT / "sources" / rel if rel else None
    return p if p and p.exists() else None


def _shift_paragraphs(work: str, before: dict, after: dict) -> None:
    """paragraphs.yaml holds character offsets into each chapter's prose and the
    paragraph's opening words; carry both to the corrected prose."""
    path = _manifest_path(work, "paragraphs")
    if not path:
        return
    maps = {k: _mapper(before[k], after[k]) for k in before if before[k] != after[k]}
    out = []
    for line in path.read_text(encoding="utf-8").splitlines(keepends=True):
        m = re.match(r"(- \{book: (\d+), chapter: (\d+), offset: )(\d+)(, at: )(\"(?:[^\"\\\\]|\\\\.)*\")(\}.*)$", line, re.S)
        if not m or (int(m.group(2)), int(m.group(3))) not in maps:
            out.append(line)
            continue
        key = (int(m.group(2)), int(m.group(3)))
        off, at = int(m.group(4)), yaml.safe_load(m.group(6))
        if not before[key][off:].startswith(at):
            raise ValueError(f"{work} paragraphs: {at!r} not at {off} before the reads")
        mp = maps[key]
        new_off, end = mp(off), mp(off + len(at), end=True)
        new_at = after[key][new_off:end].strip()
        out.append(f"{m.group(1)}{new_off}{m.group(5)}{json.dumps(new_at, ensure_ascii=False)}{m.group(7)}")
    path.write_text("".join(out), encoding="utf-8")


def _carry_anchors(work: str, before: dict, after: dict) -> None:
    """anchors.yaml `at` phrases quote our prose (whitespace collapsed); one that
    quoted a corrected passage is rewritten to the same span of the new prose."""
    path = _manifest_path(work, "anchors")
    if not path:
        return
    flat = lambda t: " ".join(t.split())
    changed = {k: (flat(before[k]), flat(after[k])) for k in before if before[k] != after[k]}
    maps = {k: _mapper(o, n) for k, (o, n) in changed.items()}
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    for i, line in enumerate(lines):
        m = re.match(r'(\s*at: )(".*")\s*$', line)
        if not m:
            continue
        at = yaml.safe_load(m.group(2))
        for k, (o, n) in changed.items():
            if at in o and at not in n and o.count(at) == 1:
                a = o.index(at)
                span = n[maps[k](a):maps[k](a + len(at), end=True)].strip()
                if len(span.split()) < 4:
                    raise ValueError(f"{work} anchors: {at!r} maps to {span!r}; set it by hand")
                lines[i] = m.group(1) + json.dumps(span, ensure_ascii=False) + "\n"
                break
    path.write_text("".join(lines), encoding="utf-8")


def _prose(work: str) -> dict:
    cfg = yaml.safe_load((ROOT / "manifests" / f"{work}.yaml").read_text(encoding="utf-8"))
    return stage1_archive._load_prose(cfg["english"]["primary"])


def _spans(text: str, sub: str) -> list[int]:
    out, i = [], text.find(sub)
    while i >= 0:
        out.append(i)
        i = text.find(sub, i + 1)
    return out


def stray(text: str, old: str, new: str) -> list[int]:
    """Where `old` stands in `text` other than inside a copy of `new`. When the
    reading only adds to the defect (old inside new: a comma restored) the
    corrected copies hold it; when it removes (new inside old: a stray mark
    dropped) every copy of `old` is the defect."""
    inside = [(j, j + len(new)) for j in _spans(text, new)]
    return [i for i in _spans(text, old)
            if not any(a <= i and i + len(old) <= b for a, b in inside)]


def apply(works: list[str]) -> None:
    for work in works:
        reads = PRINT_READS.get(work, [])
        if not reads:
            continue
        before = _prose(work)
        files = {p: p.read_text(encoding="utf-8") for p in _source_files(work)}
        for old, new, why in reads:
            hits = [(p, i) for p, t in files.items() for i in stray(t, old, new)]
            if not hits and any(new in t for t in files.values()):
                continue                                        # already applied
            if len(hits) != 1:
                raise ValueError(f"{work} PRINT_READS {old!r} ({why}): found {len(hits)} times")
            p, i = hits[0]
            files[p] = files[p][:i] + new + files[p][i + len(old):]
        for p, t in files.items():
            p.write_text(t, encoding="utf-8")
        after = _prose(work)
        _shift_paragraphs(work, before, after)
        _carry_anchors(work, before, after)
        print(f"{work}: {len(reads)} print reads applied")


def check(works: list[str], texts: dict | None = None) -> list[str]:
    bad = []
    for work in works:
        text = (texts or {}).get(work) or _html_text(work)
        for old, new, why in PRINT_READS.get(work, []):
            if stray(text, old, new):
                bad.append(f"{work}: {old!r} is back ({why})")
            if new not in text:
                bad.append(f"{work}: {new!r} missing ({why})")
    return bad


def _digest(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def _allowed(d: dict, a: tuple) -> bool:
    work, before, o, g, _ = a
    if d["work"] != work or d["ours"] != o or not d["before"].endswith(before):
        return False
    if "…#" in g:                       # a long footnote: its opening words and a digest of all of it
        head, digest = g.split("…#")
        return d["genie"].startswith(head) and _digest(d["genie"]) == digest
    return d["genie"] == g


def verify(works: list[str], path: Path, texts: dict | None = None) -> list[str]:
    """Every difference from Genie's read must be allowed, by exactly one entry;
    every entry for these works must be used exactly once."""
    findings = []
    used = {i: 0 for i, a in enumerate(VERIFY_ALLOW) if a[0] in works}
    if not path.is_file():
        return [f"examined nothing: Genie's read is not at {path}"]
    for work in works:
        DROPPED.pop(work, None)
        found = diff(work, path, text=(texts or {}).get(work))
        pinned = NOTE_SEGMENTS.get(work, [])
        for head in DROPPED.get(work, []):
            if head not in pinned:
                findings.append(f"{work}: a segment with no running head was dropped unexamined: {head!r}")
        for p in pinned:
            if DROPPED.get(work, []).count(p) != 1:
                findings.append(f"{work}: pinned note segment {p!r} seen {DROPPED.get(work, []).count(p)} times")
        if not BODY_FOUND[work]:
            findings.append(f"{work}: the print's first words {BODY_START[work]!r} are not in Genie's read")
        if COVERAGE[work] < MIN_COVERAGE:
            findings.append(f"{work}: Genie's read partners only {COVERAGE[work]:.1%} of our words")
        for d in found:
            hit = [i for i in used if _allowed(d, VERIFY_ALLOW[i])]
            for i in hit:
                used[i] += 1
            if len(hit) != 1:
                findings.append(f"{work} line {d['gline']}: ours=[{d['ours']}] genie=[{d['genie'][:80]}] "
                                f"…{d['before']} ‖ {d['after']}… ({len(hit)} allowances)")
    for i, n in used.items():
        if n != 1:
            a = VERIFY_ALLOW[i]
            findings.append(f"allowance used {n} times: {a[0]} …{a[1]} ours=[{a[2]}] genie=[{a[3][:60]}]")
    return findings


# Defects of the kinds this pass found, planted in our text in memory; verify
# must flag each at its place (Genie lacks them). The last plants undo an
# allowed difference, so its allowance goes unused and must fail too.
PLANTS = [
    ("Col", "is consumed by the heat", "is consumed by the heap", "heap"),       # a misread word
    ("Aud", "in large quantities.", "in large quantities,", "quantities,"),     # stop to comma
    ("Phgn", "with a tender gaze", "with tender gaze", "tender"),               # a dropped word
    ("Mech", "the fulcrum is ZΔ.", "the fulcrum is ZA.", "ZA."),                # label Δ read as A
    ("Mech", "rectangle ΔΨΡΓ be", "rectangle AΨΡΓ be", "allowance used 0"),    # Genie's misread copied
    ("Mech", "equal to ZΛ.", "equal to ZA.", "ZA."),                           # label Λ read as A
    ("Mirab", "On Mount Taÿgetus", "On Mount Taygetns", "Taygetns"),           # letters misread
    ("MXG", "Hesiod says", "Hesiod says,", "says,"),                           # a stray comma
    ("MXG", "may be for Not-being", "may be for Notbeing", "Notbeing"),        # a lost hyphen
    ("Vent", "after the Scironian", "after the the Scironian", "the"),         # a doubled word
    ("Lin", "for counting is movement", "for counting is moment", "moment"),   # a misread word
    ("Lin", "But if ⟨per impossibile⟩", "But if (per impossibile)", "impossibile)"),  # bracket lost
    ("Lin", "unit in every class of quanta? § 1.", "unit in every class of quanta? S 1.", "allowance used 0"),
    ("Mech", "Let BΓEΔ be", "Let BΓΔE be", "BΓΔE"),                             # labels transposed
    # Codex review 1's holes, each closed: a label's case, an opening lost, a
    # word lost beside a long allowed footnote
    ("Mech", "Let AB be a lever,", "Let Ab be a lever,", "Ab"),
    ("Mech", "ΓΔ and BE in the large circle", "ΓΔ and Be in the large circle", "Be"),  # review 2
    ("Col", "SIMPLE colours are the proper colours of the elements, i.e. of fire,", "of fire,", "colours"),
    ("Plant", "moist food and dry food", "moist food dry food", "allowance used 0"),
]


def selftest(path: Path) -> list[str]:
    fails = []
    if not verify(["Vent"], path, {"Vent": "Nothing of the work at all."}):
        fails.append("verify passed a work it could not partner")
    for work, good, bad, mark in PLANTS:
        text = "\n".join(ours(work))
        flat = " ".join(text.split())
        if flat.count(good) != 1:
            fails.append(f"plant {work} {good!r}: found {flat.count(good)} times in our text")
            continue
        found = verify([work], path, {work: flat.replace(good, bad)})
        if not any(mark in f for f in found):
            fails.append(f"plant {work} {bad!r} not caught: {found[:2]}")
    # a print read undone must fail `check`
    work, (old, new, _) = "Mech", PRINT_READS["Mech"][0]
    undone = {work: _html_text(work).replace(new, old, 1)}
    if not any(old in b for b in check([work], undone)):
        fails.append("check: an undone print read passed")
    return fails


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["diff", "apply", "check", "verify", "selftest"])
    ap.add_argument("--work", action="append")
    ap.add_argument("--genie", type=Path, default=GENIE_DEFAULT)
    a = ap.parse_args(argv)
    works = a.work or WORKS
    if a.cmd == "diff":
        for w in works:
            d = diff(w, a.genie)
            print(f"## {w}: {len(d)} differences")
            for r in d:
                print(f"{r['gline']:>5} {r['op']:<7} ours=[{r['ours']}] genie=[{r['genie']}]  "
                      f"…{r['before']} ‖ {r['after']}…")
    elif a.cmd == "apply":
        apply(works)
    elif a.cmd == "check":
        bad = check(works)
        print("\n".join(bad) or "check: every print read in place")
        sys.exit(1 if bad else 0)
    elif a.cmd == "verify":
        found = verify(works, a.genie)
        print("\n".join(found) or "verify: every difference from Genie's read is ruled")
        sys.exit(1 if found else 0)
    elif a.cmd == "selftest":
        fails = selftest(a.genie)
        print("\n".join(fails) or f"selftest: {len(PLANTS)}/{len(PLANTS)} planted defects caught, undone read caught")
        sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
