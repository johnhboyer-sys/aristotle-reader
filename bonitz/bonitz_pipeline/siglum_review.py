"""The 28 work-level findings, put to the ink.

`siglum_check` cannot resolve these: either the token is not one of Bonitz's 48
sigla at all, or it names a work whose Bekker span does not contain the page
beside it.  As with the book-level queue there are three ways to be here —

    the siglum is misread by us   ->  FIX the siglum
    a page digit is misread by us ->  FIX the page
    Bonitz set it wrong           ->  PRESERVE, and record in corrigenda

— and only the scan decides.  The card asks the one question a reader can answer
from a crop: DOES THE INK READ WHAT WE HOLD?

    python3 -m bonitz_pipeline.siglum_review          # write the page
    python3 -m bonitz_pipeline.siglum_review --wifi   # and serve it

⚠ A CANDIDATE THAT CANNOT BE RIGHT MUST NOT BE OFFERED.  `Ζυ` is one letter from
`Ζι`, and also one letter from `Ζιυ` if you read υ as a book — but υ is 400 and
the Historia animalium has ten books.  Offering it would put a reading in front
of John that no ink could justify, and the whole value of a fixed set of buttons
is that every one of them is a reading he might actually see.  Candidates are
filtered through `book_ok` for exactly this.

⚠ A DROPPED DIGIT IS NOT A CHANGED DIGIT.  `σ9. 73a` against a work that runs
973-973 is not a substitution away from anything; it is a lost leading 9.  Page
candidates therefore cover insertion and deletion as well as substitution, or
the one obviously repairable citation in the queue would arrive with no button.
"""

from __future__ import annotations
import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from bonitz_pipeline.book_review import CSS, JS, _b64, serve
from bonitz_pipeline.mark_review import crop_word
from bonitz_pipeline.siglum_check import (BOOK_LETTERS, book_ok, by_page,
                                          inventory, read, resolve, split)

ROOT = Path(__file__).resolve().parent.parent
RULINGS = ROOT / 'work/sweeps/siglum-rulings.json'
PAGE = ROOT / 'work/sweeps/siglum-review.html'
MAX_CANDIDATES = 4

# The characters a bare book numeral can be written with, final sigma included
# because reading it for a stigma is the error that puts `κς` in this queue.
BARE = set(BOOK_LETTERS + 'ς')

# Every character Bonitz uses in a siglum or a book numeral, so a substitution
# search covers the letters that actually occur — including ϛ, which is the
# whole point for the πκς family, and the capitals his work sigla use.
ALPHABET = ''.join(sorted(set(BOOK_LETTERS + 'ϛȣϗ' +
                              ''.join(inventory()))))


@dataclass
class Site:
    col: str
    line: int
    raw: str
    token: str
    page: int
    why: str
    crop: str = ''
    whole: str = ''
    how: str = ''
    sigla: list[str] = field(default_factory=list)
    pages: list[int] = field(default_factory=list)

    @property
    def sid(self) -> str:
        return f'{self.col}:{self.line}:{self.token}:{self.page}'


def near(token: str, works: dict) -> set[str]:
    """Real sigla one edit from `token` — substitution, deletion, insertion."""
    out = set()
    for s in works:
        if abs(len(s) - len(token)) > 1:
            continue
        if len(s) == len(token):
            if sum(a != b for a, b in zip(s, token)) == 1:
                out.add(s)
        elif len(s) == len(token) - 1:
            if any(token[:i] + token[i + 1:] == s for i in range(len(token))):
                out.add(s)
        elif any(s[:i] + s[i + 1:] == token for i in range(len(s))):
            out.add(s)
    return out


def usage(cites) -> dict:
    """How often Bonitz writes each token, across the citations that resolve.

    This is the ranking signal, and it is evidence rather than a guess: a form
    he uses fourteen times is a likelier reading of damaged ink than one he
    never uses at all. Sorting candidates alphabetically instead put `πκα` in
    front of `πκϛ` and then truncated `πκϛ` off the end of the row — the right
    answer, cut because it starts with the wrong letter.
    """
    n = {}
    for c in cites:
        if c.how in ('explicit', 'inherited'):
            n[c.token] = n.get(c.token, 0) + 1
    return n


def siglum_candidates(token: str, page: int, works: dict,
                      seen: dict | None = None) -> list[str]:
    """Readings one edit away whose work actually contains the page."""
    out = set()
    for s in near(token, works):
        if works[s].holds(page):
            out.add(s)
    # …and the same, read as work + book letter, where that book can exist
    if len(token) > 1 and token[-1] in BOOK_LETTERS:
        for s in near(token[:-1], works):
            if works[s].holds(page) and book_ok(s, token[-1]):
                out.add(s + token[-1])
    # ⚠ AND THE EDIT MAY BE INSIDE THE BOOK NUMERAL, not in the work siglum.
    # `πκς` is the Problemata, book κϛ — 26 — with a final sigma read for a
    # stigma, and π is perfectly correct. Proposing only whole work sigla left
    # the three best-understood findings in the queue with no button at all,
    # which is the one thing this tool must never do.
    for i in range(len(token)):
        for ch in ALPHABET:
            if ch == token[i]:
                continue
            alt = token[:i] + ch + token[i + 1:]
            for w, b in split(alt, works):
                if works[w].holds(page) and (not b or book_ok(w, b)):
                    out.add(alt)
            # A BARE BOOK LETTER NAMES NO WORK, so `split` can say nothing
            # about it — `κς` is book κϛ of whatever was last named, and the
            # only reason it is in this queue is the final sigma. Ask the page.
            #
            # ⚠ ONLY WHEN THE TOKEN IS ITSELF BARE-BOOK-SHAPED. Left open, this
            # answered every token with the generic letters δ γ β ι, which are
            # so common that frequency ranking floated them above the reading
            # that mattered: `Α4. 985a` lost `Μ` — Metaphysics book Α, its
            # actual sense — to four letters no reader would see in that ink.
            # `κϛ` DOES split — work κ plus book ϛ — but κ is περὶ Κόσμου at
            # 391-401 and the page is 946, so the split branch rejects it too.
            # What is left is the reading that is actually right: book ϛ of the
            # work Bonitz last named. Do not require the split to fail.
            if (BARE.issuperset(token) and not split(token, works)
                    and by_page(alt, page, works)):
                out.add(alt)
    seen = seen or {}
    return sorted(out, key=lambda c: (-seen.get(c, 0), c))[:MAX_CANDIDATES]


def page_candidates(page: int, lo: int, hi: int) -> list[int]:
    """In-range pages one digit EDIT away — changed, dropped, or gained."""
    s, out = str(page), set()
    for i in range(len(s)):                                  # substitution
        for d in '0123456789':
            if d != s[i]:
                out.add(s[:i] + d + s[i + 1:])
    for i in range(len(s) + 1):                              # insertion
        for d in '0123456789':
            out.add(s[:i] + d + s[i:])
    for i in range(len(s)):                                  # deletion
        out.add(s[:i] + s[i + 1:])
    ok = {int(n) for n in out
          if n and not n.startswith('0') and lo <= int(n) <= hi}
    return sorted(ok, key=lambda n: (abs(len(str(n)) - len(s)), abs(n - page),
                                     n))[:MAX_CANDIDATES]


def sites() -> list[Site]:
    works = inventory()
    cites = read()
    resolve(cites, works)
    seen = usage(cites)
    out = []
    for c in sorted((c for c in cites if c.how == 'unresolved'),
                    key=lambda c: (c.col, c.line)):
        s = Site(c.col, c.line, c.raw, c.token, c.page, c.why)
        im, _, how = crop_word(c.col, c.line, c.token, scale=3.0, spread=8)
        s.crop, s.how = _b64(im), how
        s.whole = _b64(crop_word(c.col, c.line, c.token, scale=1.6,
                                 whole=True)[0])
        s.sigla = siglum_candidates(c.token, c.page, works, seen)
        opts = split(c.token, works)
        if opts:
            w = works[opts[0][0]]
            s.pages = page_candidates(c.page, w.lo, w.hi)
        out.append(s)
    return out


def html(ss: list[Site], out: Path = PAGE) -> Path:
    cards = []
    for s in ss:
        warn = ('<div class="warnflag">⚠ this crop was placed by geometry, not '
                'by matching the line text — check it against the printed line'
                '</div>') if s.how != 'text' else ''
        sig = ''.join(
            f'<button class="fix" onclick="rule({s.sid!r},\'fix-siglum\','
            f'{c!r},this)"><span class="gk">{c}</span></button>' for c in s.sigla)
        sig = (f'<div class="lbl">the siglum is ours, and the ink reads</div>'
               f'<div class="row">{sig}</div>') if sig else ''
        pgs = ''.join(
            f'<button class="fix" onclick="rule({s.sid!r},\'fix-page\','
            f'{p},this)">{p}</button>' for p in s.pages)
        pgs = (f'<div class="lbl">or the page is ours, and the ink reads</div>'
               f'<div class="row">{pgs}</div>') if pgs else ''
        none = ('<div class="warnflag">no repair suggested — nothing one edit '
                'away lands in range. Read the line and preserve, or say so.'
                '</div>') if not (s.sigla or s.pages) else ''
        cards.append(f"""
<div class="card" id="{s.sid}">
  <div class="loc">{s.col} · line {s.line}</div>
  <div class="said gk">{s.raw}</div>
  <div class="why">{s.why}</div>
  {warn}
  <div class="crops">
    <img src="data:image/png;base64,{s.crop}" alt="the citation in the scan">
    <details><summary>the whole printed line</summary>
      <img src="data:image/png;base64,{s.whole}" alt="the whole line"></details>
  </div>
  {none}
  <div class="lbl">the ink reads what we hold — Bonitz set it wrong</div>
  <div class="row">
    <button class="keep" onclick="rule({s.sid!r},'preserve','',this)">
      preserve <span class="gk">{s.token}</span> · corrigenda</button>
  </div>
  {sig}{pgs}
</div>""")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        f'<!doctype html><meta charset="utf-8"><title>Work-level findings</title>'
        f'<style>{CSS}</style>'
        f'<header><h1>Which is wrong — the siglum, the page, or Bonitz?</h1>'
        f'<span id="count">0 / {len(ss)} ruled</span></header>'
        f'<main>{"".join(cards)}</main><script>{JS}</script>',
        encoding='utf-8')
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--serve', action='store_true')
    p.add_argument('--wifi', action='store_true')
    p.add_argument('--port', type=int, default=8792)
    a = p.parse_args(argv)

    ss = sites()
    html(ss)
    weak = [s.sid for s in ss if s.how != 'text']
    bare = [s.sid for s in ss if not (s.sigla or s.pages)]
    print(f'{len(ss)} findings -> {PAGE}')
    if weak:
        print(f'{len(weak)} crops placed by geometry:  ' + ', '.join(weak))
    if bare:
        print(f'{len(bare)} with no repair candidate: ' + ', '.join(bare))
    if a.serve or a.wifi:
        serve(ss, a.port, '0.0.0.0' if a.wifi else '127.0.0.1',
              page=PAGE, store=RULINGS,
              verdicts=('preserve', 'fix-siglum', 'fix-page'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
