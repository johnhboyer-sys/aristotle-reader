"""
Expand 19th-century Bonitz printing ligatures into standard polytonic Greek.

  ϗ  (U+03D7, kai symbol)         → καὶ before a following word (grave; oxytone
                                     grave-for-acute rule), καί before a pause /
                                     punctuation / end (acute). Any combining
                                     marks on the ligature are dropped.
  ȣ  (U+0223, ou digraph)        → ου, with the mark transferred onto the υ:
       ȣ̃ / ȣ̄ / ȣ̑  (overline forms) → οῦ   (circumflex; genitive/contraction)
       ȣ́            (acute)          → ού
       ȣ̀            (grave)          → οὺ
       ȣ̓            (smooth)         → οὐ
       ȣ̔            (rough)          → οὑ
       ȣ  + (other / none)           → ου

After glyph expansion, a WORD-LEVEL re-accent pass (ACCENT_TABLE) restores the
correct polytonic accent on words Bonitz printed with a *bare* ligature on the
accented ου-syllable — the genitive article τοῦ, the οὐ-negative family, νοῦς,
οὕτω, τοῦτο/τούτου/τούτων, contract verbs (-οῦσι/-οῦνται/-οῦν), oxytone
genitives (-οῦ), and participles (-ούμεν-). Bare expansion alone would leave
these unaccented, which is invalid Greek.

ACCENT_TABLE is curated for the α-section corpus (pages 15–60): it covers every
bare-unaccented form that occurs there (118 forms). It is a deterministic safety
net, NOT a scalable solution — future pages must be transcribed with an
accent-aware prompt (see transcribe.py Rule 13). Any bare-unaccented ου-word not
in the table is left unchanged and reported by analyze()/the build check.

Operates on raw text (XML/JSON content). Idempotent. NFC output.

CLI:
    python -m bonitz_pipeline.expand_ligatures --preview          # before/after samples
    python -m bonitz_pipeline.expand_ligatures --residual         # list bare ου-words NOT fixed
    python -m bonitz_pipeline.expand_ligatures --apply            # rewrite output/*.xml in place
"""

from __future__ import annotations
import argparse
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

_COMB = '̀-ͯ'

# Combining mark on ȣ → the mark to place on the υ of the expanded "ου".
_MARK_MAP = {
    '̃': '͂',  # tilde          → circumflex
    '̄': '͂',  # macron         → circumflex
    '̑': '͂',  # inverted breve → circumflex
    '́': '́',  # acute
    '̀': '̀',  # grave
    '̓': '̓',  # smooth breathing (comma above)
    '̔': '̔',  # rough breathing  (reversed comma)
    # diaeresis / dot above / breve: not mapped → expand to bare "ου"
}

_KAI_RE = re.compile('ϗ[' + _COMB + ']*')
_OU_RE  = re.compile('ȣ([' + _COMB + ']*)')

# Characters that count as a pause after καί (→ keep acute).
_PAUSE = set('.,··;;:·—–-)]}»"’\'')

# ---------------------------------------------------------------------------
# Word-level accent restoration (keys = bare-unaccented expansion; NFC).
# Curated as a classicist for the α-section corpus, pages 15–60.
# ---------------------------------------------------------------------------
ACCENT_TABLE: dict[str, str] = {
    # ── article / demonstratives / pronouns ──
    'του': 'τοῦ', 'τους': 'τοὺς', 'τουτο': 'τοῦτο', 'τουτον': 'τοῦτον',
    'τουτου': 'τούτου', 'τουτων': 'τούτων', 'τουτοις': 'τούτοις',
    'τοιουτον': 'τοιοῦτον', 'τοιουτους': 'τοιούτους', 'τοιουδε': 'τοιοῦδε',
    'ουτος': 'οὗτος',
    # ── negative family (proclitic: breathing, no accent) ──
    'ου': 'οὐ', 'ουκ': 'οὐκ', 'ουχ': 'οὐχ', 'ουδ': 'οὐδ', 'ουπω': 'οὔπω',
    'ουτε': 'οὔτε', 'ουτ': 'οὔτ', 'ουν': 'οὖν',
    'ουὐκ': 'οὐκ', 'ουὐδ': 'οὐδ', 'κουκ': 'κοὐκ',          # OCR-doubled / crasis
    # ── οὕτω, νοῦς, οὐσία, participle of εἰμί ──
    'ουτω': 'οὕτω', 'νους': 'νοῦς', 'ουσης': 'οὔσης',
    'ουρανου': 'οὐρανοῦ',
    # ── indefinite ──
    'ἡντινουν': 'ἡντινοῦν', 'ὁποιανουν': 'ὁποιανοῦν',
    # ── contract verbs / oxytone genitives → circumflex ──
    'αἰσθητου': 'αἰσθητοῦ', 'αἰσθητικου': 'αἰσθητικοῦ', 'νοητικου': 'νοητικοῦ',
    'θρεπτικου': 'θρεπτικοῦ', 'ἀγαπητου': 'ἀγαπητοῦ', 'αὐτου': 'αὐτοῦ',
    'καλου': 'καλοῦ', 'καρπου': 'καρποῦ', 'κηρου': 'κηροῦ', 'χυμου': 'χυμοῦ',
    'ξηρου': 'ξηροῦ', 'ψυχρου': 'ψυχροῦ', 'ὑγρου': 'ὑγροῦ', 'ποσου': 'ποσοῦ',
    'στερεου': 'στερεοῦ', 'ἀστακου': 'ἀστακοῦ', 'ᾠου': 'ᾠοῦ', 'αἰδους': 'αἰδοῦς',
    'βους': 'βοῦς', 'ἁπλους': 'ἁπλοῦς', 'φρουδον': 'φροῦδον',
    'φοινικουν': 'φοινικοῦν', 'ἀκριβουν': 'ἀκριβοῦν', 'διακριβουν': 'διακριβοῦν',
    'ἐξακριβουν': 'ἐξακριβοῦν', 'κινουν': 'κινοῦν', 'θεωρουν': 'θεωροῦν',
    'ἀναλογουν': 'ἀναλογοῦν', 'περικυκλουν': 'περικυκλοῦν',
    'αἱρουνται': 'αἱροῦνται', 'ποιουνται': 'ποιοῦνται', 'μιμουνται': 'μιμοῦνται',
    'στεφανουνται': 'στεφανοῦνται', 'ἀλλοιουται': 'ἀλλοιοῦται',
    'ἀποτελουνται': 'ἀποτελοῦνται', 'καλουνται': 'καλοῦνται',
    'καλουσι': 'καλοῦσι', 'καλουσιν': 'καλοῦσιν', 'ποιουσιν': 'ποιοῦσιν',
    'δοκουσιν': 'δοκοῦσιν', 'μετρουσιν': 'μετροῦσιν', 'ψοφουσιν': 'ψοφοῦσιν',
    'ἐξανθουσιν': 'ἐξανθοῦσιν', 'ἀμφιδοξουσιν': 'ἀμφιδοξοῦσιν',
    'καρποφορουσιν': 'καρποφοροῦσιν', 'ἱδρουσι': 'ἱδροῦσι', 'ἀκουσιν': 'ἀκούσιν',
    'διαιρουντα': 'διαιροῦντα', 'διαριθμουντα': 'διαριθμοῦντα',
    'ᾠοτοκουντα': 'ᾠοτοκοῦντα', 'ἀλγουντι': 'ἀλγοῦντι',
    'ἀκολουθουν': 'ἀκολουθοῦν', 'ἀκολουθουσαι': 'ἀκολουθοῦσαι',
    'ἰχθυοφαγουσα': 'ἰχθυοφαγοῦσα',
    # ── participles / nouns where ου is antepenult/penult → acute ──
    'ἀκολουθησις': 'ἀκολούθησις', 'ἀκολουθησιν': 'ἀκολούθησιν',
    'ἀκολουθοις': 'ἀκολούθοις', 'ἀκολουθως': 'ἀκολούθως',
    'καλουμεναι': 'καλούμεναι', 'καλουμενον': 'καλούμενον', 'καλουμενοι': 'καλούμενοι',
    'κινουμενον': 'κινούμενον', 'διαιρουμενα': 'διαιρούμενα',
    'μαρτυρουμενον': 'μαρτυρούμενον', 'κατηγορουμενον': 'κατηγορούμενον',
    'κεφαλαιουμενοι': 'κεφαλαιούμενοι', 'ὁμολογουμενα': 'ὁμολογούμενα',
    'αἱρουμεθα': 'αἱρούμεθα', 'αἰδουμενος': 'αἰδούμενος',
    'ἀποθανουμενος': 'ἀποθανούμενος', 'ἐνεργουσης': 'ἐνεργούσης',
    'πληθουσης': 'πληθούσης', 'συντελουντων': 'συντελούντων',
    'ἀρρωστουντων': 'ἀρρωστούντων', 'δουλων': 'δούλων',
    'ἀκουει': 'ἀκούει', 'ἀκουειν': 'ἀκούειν', 'ἀκουεται': 'ἀκούεται',
    'ἀκουσιον': 'ἀκούσιον', 'ἑκουσιος': 'ἑκούσιος', 'ἀγανακτουσι': 'ἀγανακτοῦσι',
    'βουλεσθαι': 'βούλεσθαι', 'φιλουσι': 'φιλοῦσι',
    'αἰγιαλους': 'αἰγιαλούς', 'ποταμους': 'ποταμούς', 'ἀλλαχου': 'ἀλλαχοῦ',
    # ── proper names ──
    'Λυκουργος': 'Λυκοῦργος', 'Μουσαι': 'Μοῦσαι', 'Πιττακου': 'Πιττακοῦ',
    'Ἀμμους': 'Ἀμμοῦς',
}

_WORD_RE = re.compile('[Ͱ-Ͽἀ-῿' + _COMB + ']+')


def _next_meaningful(s: str, j: int) -> str:
    """First non-space char at/after j, skipping XML tags (e.g. <cit>…</cit>)."""
    while j < len(s):
        c = s[j]
        if c.isspace():
            j += 1
        elif c == '<':
            k = s.find('>', j)
            if k == -1:
                return ''
            j = k + 1
        else:
            return c
    return ''


def _ou_repl(m: re.Match) -> str:
    marks = m.group(1)
    for ch in marks:
        if ch in _MARK_MAP:
            return 'ο' + unicodedata.normalize('NFC', 'υ' + _MARK_MAP[ch])
    return 'ου'


def _reaccent(text: str) -> str:
    """Restore accents on bare-unaccented ου-words via ACCENT_TABLE."""
    def repl(m: re.Match) -> str:
        return ACCENT_TABLE.get(m.group(0), m.group(0))
    return _WORD_RE.sub(repl, text)


def expand_ligatures(text: str) -> str:
    # 1. ου digraph (glyph-level, transfers any printed mark)
    text = _OU_RE.sub(_ou_repl, text)

    # 2. kai symbol (context-sensitive accent)
    out, pos = [], 0
    for m in _KAI_RE.finditer(text):
        out.append(text[pos:m.start()])
        nxt = _next_meaningful(text, m.end())
        out.append('καί' if (nxt == '' or nxt in _PAUSE) else 'καὶ')
        pos = m.end()
    out.append(text[pos:])
    text = unicodedata.normalize('NFC', ''.join(out))

    # 3. word-level accent restoration for bare ligatures
    text = _reaccent(text)

    return unicodedata.normalize('NFC', text)


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------

_DEFAULT_XML_DIR = Path(__file__).resolve().parent.parent / "output"


def _iter_xml(directory: Path):
    return sorted(directory.glob('page-*.xml'))


def _preview(directory: Path, limit: int = 16) -> None:
    shown = 0
    for f in _iter_xml(directory):
        for line in f.read_text(encoding='utf-8').splitlines():
            if 'ȣ' in line or 'ϗ' in line:
                i = min((line.find(c) for c in 'ȣϗ' if c in line), default=0)
                a, b = max(0, i - 30), i + 60
                print(f"[{f.name}]")
                print("  before: …" + line[a:b].strip())
                print("  after : …" + expand_ligatures(line[a:b]).strip())
                print()
                shown += 1
                if shown >= limit:
                    return


def _residual(directory: Path) -> None:
    """Report any bare-unaccented ου-word the table did NOT fix."""
    import collections
    ACCENT = set('́̀͂')
    miss = collections.Counter()
    for f in _iter_xml(directory):
        s = re.sub(r'</?cit>', '', f.read_text(encoding='utf-8'))
        s = re.sub(r'<[^>]+>', ' ', s)
        s = expand_ligatures(s)
        for w in _WORD_RE.findall(s):
            if 'ου' in w and not any(c in ACCENT for c in unicodedata.normalize('NFD', w)):
                miss[w] += 1
    if not miss:
        print("No residual bare-unaccented ου-words. ✔")
    else:
        print(f"Residual bare-unaccented ου-words: {len(miss)} forms / {sum(miss.values())} occ")
        for w, c in miss.most_common():
            print(f"  {c:3}  {w}")


def _expand_xml_text_nodes(path: Path) -> bool:
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True))
    tree = ET.parse(path, parser=parser)
    root = tree.getroot()
    changed = False
    for el in root.iter():
        if el.text:
            new_text = expand_ligatures(el.text)
            if new_text != el.text:
                el.text = new_text
                changed = True
        if el.tail:
            new_tail = expand_ligatures(el.tail)
            if new_tail != el.tail:
                el.tail = new_tail
                changed = True
    if changed:
        xml = ET.tostring(root, encoding='unicode')
        path.write_text(unicodedata.normalize('NFC', xml) + '\n', encoding='utf-8')
    return changed


def _apply(directory: Path) -> None:
    changed = 0
    for p in _iter_xml(directory):
        if _expand_xml_text_nodes(p):
            changed += 1
    print(f"Rewrote {changed} XML files.", file=sys.stderr)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Expand Bonitz ϗ/ȣ ligatures")
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--residual', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--dir', type=Path, default=_DEFAULT_XML_DIR,
                    help=f"Directory containing page-*.xml (default: {_DEFAULT_XML_DIR})")
    ap.add_argument('--limit', type=int, default=16)
    args = ap.parse_args(argv)
    xml_dir = args.dir.resolve()
    if args.apply:
        _apply(xml_dir)
    elif args.residual:
        _residual(xml_dir)
    else:
        _preview(xml_dir, args.limit)


if __name__ == '__main__':
    main()
