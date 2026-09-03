"""A word that is half Greek and half Latin, where the apparatus is not.

    python3 -m bonitz_pipeline.script_mix
    python3 -m bonitz_pipeline.script_mix --out work/sweeps/script-mix.tsv

`encoding_check` asks whether the corpus spells one shape two ways, and stays
silent on a token that occurs once — one spelling is not a contradiction, and
that restraint is what let 63 conversions run unattended. But `Sάνθιππος`
occurs once. A Latin `S` standing where Bonitz set `Ξ` is a defect whether or
not a second site agrees, and nothing in the corpus was looking for it.

This module makes the other claim: INSIDE ONE WORD THE SCRIPTS DO NOT MIX.
The whole difficulty is that in Bonitz's apparatus they legitimately do, so
the claim is only worth anything with the exemptions measured off the settled
pages 15-106 — where, by construction, a `letter` finding is a false one.

⚠ THE EDITOR PREFIX IS A CLOSED SET, NOT A SHAPE. `AΖι` (61 sites) and
`Sάνθιππος` (1) have the same shape: one Latin capital, then Greek. Bonitz's
key p.11 makes `A` the editor and what follows the work siglum, so `AΖι` is
the notation and `Sάνθιππος` is a lost `Ξ`. Exempt the shape and the finder
goes quiet on exactly the token it exists to find.

⚠ A LOST SPACE IS NOT A LOST LETTER. `(pΦθ5` and `Φεsqq` are reported as
`joined`, not `letter`: the letters are right and the space between two words
is gone. They want a different ruling, so they carry a different reason.

⚠ A FINDER, NEVER A FIXER. It reads a corpus directory and returns findings.
It does not touch `work/reconciled` and it says nothing about what the ink
holds — `Ηz` is Heitz and `Tὰ` is a Greek tau, but reporting the mixing is
the whole of its authority.
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

LATIN = re.compile(r'[A-Za-zÀ-ɏ]')
GREEK = re.compile(r'[Ͱ-Ͽἀ-῿]')
# ȣ/Ȣ are Latin OU by name and Bonitz's Greek ou-ligature; ϗ is the kai. They
# are Greek here for the same reason `word_flags.is_word_char` admits them.
AS_GREEK = 'ȣȢϗ'
EDGE = '.,;:()[]—-–·’‘\'"?!᾽ʼ῾«»†'

# Bonitz's editor abbreviations, which stand immediately before a work siglum.
# Measured off pages 15-106: `A` (Aubert & Wimmer) 61 sites, `Ka` 2.
EDITORS = ('A', 'Ka')
# Latin apparatus words that abut a siglum when the space is lost.
APPARATUS = ('p', 'cf', 'ad', 'cfad', 'sed', 'al', 'sqq', 'n', 'v', 'i')


class ScriptMixError(RuntimeError):
    pass


@dataclass(frozen=True)
class Finding:
    page: int
    col: str
    line: int
    token: str
    reason: str          # 'letter' | 'joined'
    context: str

    @property
    def site(self) -> str:
        return f'{self.page}-{self.col}:{self.line}'


def _core(token: str) -> str:
    """The token without its punctuation shell, NFC, ligatures set aside.

    The word-division hyphen at line end is a different character from the
    em dash and is left alone here; `classify` does the dash splitting.
    """
    t = unicodedata.normalize('NFC', token).strip(EDGE)
    return ''.join(c for c in t if c not in AS_GREEK)


def _shape(core: str) -> str:
    """L / G / d / . per character, combining marks dropped."""
    out = []
    for c in core:
        if unicodedata.combining(c):
            continue
        out.append('L' if LATIN.match(c) else 'G' if GREEK.match(c)
                   else 'd' if c.isdigit() else '.')
    return ''.join(out)


def _letters(core: str) -> str:
    """The shape with digits and punctuation removed — runs only."""
    return _shape(core).replace('d', '').replace('.', '')


def _strip_bekker(core: str, shape: str) -> str:
    """Drop the `a`/`b` column letter and the `n` nota that sit among digits.

    `οβ1347a26`, `489b17n` — these are the citation apparatus, not a word,
    and without this the finder reports 130-odd settled citations as broken.
    """
    keep = []
    for i, (c, s) in enumerate(zip(core, shape)):
        if s == 'L' and c in 'abn':
            before = shape[i - 1] if i else ''
            after = shape[i + 1] if i + 1 < len(shape) else ''
            if before == 'd' and after in ('d', '', '.'):
                continue
        keep.append(c)
    return ''.join(keep)


def _strip_division(core: str, shape: str) -> str:
    """Drop a Latin capital that follows digits — `Ζιι49B`, `129D`."""
    keep = []
    for i, (c, s) in enumerate(zip(core, shape)):
        if (s == 'L' and c.isupper() and c in 'ABCDE'
                and i and shape[i - 1] == 'd'):
            continue
        keep.append(c)
    return ''.join(keep)


def _latin_head(core: str, shape: str) -> str:
    """The token's leading run of Latin letters, digits and marks skipped."""
    head = []
    for c, s in zip(core, shape):
        if s == 'L':
            head.append(c)
        elif s == 'G':
            break
        elif head:
            break
    return ''.join(head)


def classify(token: str) -> str | None:
    """`letter`, `joined`, or None if the token does not mix scripts.

    ⚠ THE EM DASH IS BONITZ'S SEPARATOR AND NEVER SITS INSIDE A WORD, so a
    token carrying one is two tokens the split missed: `a29.—Ἀγαμέμνων` is a
    citation tail and the next headword, and reading it whole made the
    settled corpus look defective. Every piece is classified, not just the
    last — a defect on either side of the dash is still a defect — and the
    strongest reason wins.
    """
    if '—' in token:
        seen = [_one(p) for p in token.split('—') if p]
        return ('letter' if 'letter' in seen
                else 'joined' if 'joined' in seen else None)
    return _one(token)


def _one(token: str) -> str | None:
    core = _core(token)
    if len(core) < 2:
        return None
    shape = _shape(core)
    core = _strip_bekker(core, shape)
    shape = _shape(core)
    core = _strip_division(core, shape)
    shape = _shape(core)
    if 'L' not in shape or 'G' not in shape:
        return None
    head = _latin_head(core, shape)
    if head in EDITORS:
        return None
    if head in APPARATUS:
        return 'joined'
    runs = [r for r in re.findall(r'L+|G+', _letters(core))]
    if all(len(r) >= 2 for r in runs):
        return 'joined'
    return 'letter'


def find(root: Path | str) -> list[Finding]:
    root = Path(root)
    cols = sorted(root.glob('page-*.txt'))
    if not cols:
        raise ScriptMixError(f'no page-*.txt under {root} — refusing to '
                             f'report a corpus clean that was never read')
    out: list[Finding] = []
    for p in cols:
        parts = p.stem.split('-')
        page, col = int(parts[1]), parts[2][0]
        for i, line in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
            for tok in line.split():
                reason = classify(tok)
                if reason:
                    out.append(Finding(page, col, i, tok, reason, line))
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--corpus', default='work/reconciled')
    ap.add_argument('--out')
    ap.add_argument('--from-page', type=int, default=0)
    a = ap.parse_args(argv)
    found = [f for f in find(a.corpus) if f.page >= a.from_page]
    rows = ['site\treason\ttoken\tcontext']
    rows += [f'{f.site}\t{f.reason}\t{f.token}\t{f.context}' for f in found]
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text('\n'.join(rows) + '\n', encoding='utf-8')
        print(f'{len(found)} findings -> {a.out}')
    else:
        print('\n'.join(rows))
    letter = sum(1 for f in found if f.reason == 'letter')
    print(f'{letter} letter · {len(found) - letter} joined', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
