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

from bonitz_pipeline.book_review import CSS as _BASE_CSS, JS, _b64, serve
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

# Per-book Bekker spans, so a candidate can be tested at BOOK level.
from bonitz_pipeline.book_spans import OUT as _SPAN_FILE
_SPANS = json.loads(_SPAN_FILE.read_text(encoding='utf-8'))['spans']

# ⚠ ONE VISUAL ERROR IS NOT ALWAYS ONE CHARACTER EDIT.  John, 2026-08-09, on the
# crop at 016-L:32: "Clear double iota."  The ink reads `Ζιι` — Historia
# animalium, book ι — and our reader wrote `Ζυ`, because in this type two
# adjacent iotas sit exactly where a υ sits.  That is a single confusion to the
# eye and two edits to a string, so an edit-distance search cannot reach it, and
# the card offered only `Ζι` — the work with no book at all.
#
# Pairs are bidirectional and are applied as ONE edit. Keep this list to
# confusions seen in this type, not to everything Greek: each entry widens the
# candidate row, and a row full of readings nobody would see is the same
# failure as a row with nothing in it.
CONFUSIONS = (('ιι', 'υ'),)

# ⚠ RANK BY WHAT THE EYE CONFUSES, THEN BY FREQUENCY.  Frequency alone put
# `πκγ` in front of `πκϛ`, `κε` in front of `κϛ` and `Γα` in front of `Γβ` —
# Grok, 2026-08-09: "the docstring's own story — alphabetical order cut πκϛ off
# the row — is fixed, then recreated as 'frequent near-miss leads'."  It was
# right.  A sibling book letter Bonitz happens to use often is not a likelier
# READING of this ink than the letter that differs by a known confusion.
#
# Lower rank sorts first.  Each entry is a pair the scans actually confuse, and
# the rank is how much the confusion explains: an identical-ink pair outranks a
# case difference, which outranks a plain substitution.
EDIT_RANK = (
    (0, (('ς', 'ϛ'), ('ιι', 'υ'), ('ȣ', 'υ'))),      # the same ink, twice over
    (1, 'case'),                                      # Γ/γ, Ι/ι, Α/α, Τ/τ
)


def edit_rank(token: str, cand: str) -> int:
    """How well a known confusion explains the difference. Lower is better."""
    if token.lower() == cand.lower() and token != cand:
        return 1                                      # case alone
    for rank, pairs in EDIT_RANK[:1]:
        for a, b in pairs:
            for frm, to in ((a, b), (b, a)):
                if frm in token and token.replace(frm, to, 1) == cand:
                    return rank
    return 2

# Every character Bonitz uses in a siglum or a book numeral, so a substitution
# search covers the letters that actually occur — including ϛ, which is the
# whole point for the πκς family, and the capitals his work sigla use.
ALPHABET = ''.join(sorted(set(BOOK_LETTERS + 'ϛȣϗ' +
                              ''.join(inventory()))))


@dataclass
class Site:
    # The citations either side, already resolved. A siglum is read in company:
    # the ἀγγεῖον entry cites Ζιγ, Ζμγ, Ζγβ, Ζιβ, Ζμδ, Ζμδ, Ζγε around one
    # disputed token, and that neighbourhood settles more than any crop does.
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
    near: list[str] = field(default_factory=list)
    # Set when a RULE already changed this citation and John has not seen it.
    # An automated correction nobody audits is an assertion, not a finding.
    applied: str = ''

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


def holds(cand: str, page: int, works: dict) -> bool:
    """Does this reading actually contain the page — at BOOK level, not work?

    ⚠ IT USED TO ASK ONLY WHETHER THE WORK HELD THE PAGE, and that made the
    tool worse than useless on exactly the sites it exists for. John on
    `Πο4. 1290b`, 2026-08-09: **"Pi delta."** The ink reads `Πδ`, Politics book
    δ runs 1288-1301, and the citation is simply correct — but every one of the
    eight Politics books passed the work test, frequency put `Πε` first, and
    `Πδ` was ranked out of a four-button row. The tool offered four wrong
    readings and hid the right one.

    We have had per-book spans since this morning. Use them.
    """
    for w, b in split(cand, works):
        if not works[w].holds(page):
            continue
        table = _SPANS.get(w, {})
        if b and table:
            span = table.get(b)
            # A book the work does not have is not a reading. The Politics has
            # eight, α-θ, so `Πι` and `Πκ` are not near-misses to weigh — they
            # are impossible, and an impossible button is worse than no button.
            if span is None or not (span[0] <= page <= span[1]):
                continue
        return True
    return False


def holds_or_inherits(cand: str, page: int, works: dict) -> bool:
    """…or is a bare book letter of the work that owns the page.

    ⚠ KEEP THIS OUT OF `holds`. Folding it in to rescue `κϛ` made EVERY single
    Greek letter a valid candidate everywhere — δ, θ, κ, γ all pass, because
    some work owns every page — and they promptly outranked the real answers:
    `Α4. 985a` was recommended `α` instead of `ΜΑ`, `Ι4. 1166b` got `ι` instead
    of `Ηι`, `χ7. 401b` got `θ` instead of `κ`. A test that accepts everything
    ranks nothing.

    Inheritance is only a reading when the TOKEN is bare to begin with, which
    is why it lives here and is called from the one branch that knows that.
    """
    return holds(cand, page, works) or by_page(cand, page, works) is not None


def well_formed(cand: str, works: dict) -> bool:
    """Is this a citation shape at all, page aside?

    `μιι` is not. The confusion rule turns `μυ` into it, `μ` is a real work, and
    nothing asked whether the Meteorologica has a book `ιι` — it has four,
    α to δ. An impossible reading recommended as the answer is worse than no
    recommendation.
    """
    for w, b in split(cand, works):
        table = _SPANS.get(w, {})
        if not b or not table or b in table:
            return True
    return bool(by_page(cand, 0, works)) or not split(cand, works)


def siglum_candidates(token: str, page: int, works: dict,
                      seen: dict | None = None) -> list[str]:
    """Readings one edit away whose work AND book actually contain the page."""
    out = set()
    for s in near(token, works):
        if holds(s, page, works):
            out.add(s)
    # …and the same, read as work + book letter, where that book can exist
    if len(token) > 1 and token[-1] in BOOK_LETTERS:
        for s in near(token[:-1], works):
            if book_ok(s, token[-1]) and holds(s + token[-1], page, works):
                out.add(s + token[-1])
    # …and the pairs the eye confuses, which the character edits above miss
    for a, b in CONFUSIONS:
        for frm, to in ((a, b), (b, a)):
            start = 0
            while (i := token.find(frm, start)) >= 0:
                alt = token[:i] + to + token[i + len(frm):]
                if holds(alt, page, works):
                    out.add(alt)
                start = i + 1
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
            if holds(alt, page, works):
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
    # ⚠ AND OFFER WHAT THE INK READS EVEN WHEN IT CANNOT HOLD THE PAGE.
    # John on `Ζυ6. 700b`, 2026-08-09: "Double iota." The ink reads `Ζιι`, and
    # the Historia animalium ends at 638, so `Ζιι` cannot carry 700 — while the
    # Greek quoted beside it ("φαντασία and αἴσθησις occupy the same place as
    # νοῦς") is De motu 700b20, which is `Ζκ`.
    #
    # So BOTH are wrong: our transcription is not what is printed, and what is
    # printed is not what is meant. Pressing `preserve` there would bank OUR
    # misreading as Bonitz's, which is the one outcome the corrigenda register
    # must never contain. The reading is offered so it can be chosen, and
    # `recommend` names it a compound: fix the text to the ink, then record the
    # ink as the edition's error.
    for a, b in CONFUSIONS:
        for frm, to in ((a, b), (b, a)):
            if frm in token:
                alt = token.replace(frm, to, 1)
                if any(alt.startswith(w) for w in works) and \
                        well_formed(alt, works):
                    out.add(alt)
    # ⚠ ALWAYS OFFER THE WORK THE PAGE NAMES, however far it is from the token.
    # John on `πκ34. 726b`, 2026-08-09: "The hell am I judging." The card gave
    # him `preserve` and one page repair, because no siglum sits within one edit
    # of `πκ` — so the only reading it did NOT offer was the one the evidence
    # supports. 726 is De generatione, every citation around it in the ἀγγεῖον
    # entry is zoological, and the page is the hardest fact on the card.
    # Distance from the token is a hypothesis about the ink; the span is a fact.
    owner = [w for w, wk in works.items() if wk.holds(page)]
    if len(owner) == 1:
        w = owner[0]
        from bonitz_pipeline.book_spans import OUT as _S
        import json as _j
        sp = _j.loads(_S.read_text(encoding='utf-8'))['spans'].get(w, {})
        bk = [b for b, (lo, hi) in sp.items() if lo <= page <= hi]
        out.add(w + (bk[0] if bk else ''))
    seen = seen or {}
    return sorted(out, key=lambda c: (edit_rank(token, c),
                                      -seen.get(c, 0), c))[:MAX_CANDIDATES]


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
    """Everything that needs a reader's eye, in one queue.

    Two classes, and the second is the one John pointed at: a citation naming a
    multi-book work with NO book letter passes the work check (Ζι really does
    contain 621) and never reaches the book check (there is no letter to test).
    `Ζι 37. 621a` sat in that gap. Bonitz writes `Ζιι` 100 times and this is the
    hundred-and-first, an iota short.
    """
    import json as _json
    from bonitz_pipeline.book_spans import OUT as _SPAN_PATH, missing_book
    works = inventory()
    cites = read()
    resolve(cites, works)
    seen = usage(cites)
    table = _json.loads(_SPAN_PATH.read_text(encoding='utf-8'))
    gap = {}
    for c, w, owner in missing_book(cites, table):
        if owner != '?':
            gap[id(c)] = (c, w + owner)
    # ⚠ A RULE THAT RAN WITHOUT HIM STILL OWES HIM A LOOK. John, 2026-08-10:
    # "I want to double check your rule." `numeral_fix` corrected three
    # citations mechanically, and because they now resolve cleanly they had
    # vanished from the queue — the automation had made itself unauditable.
    # They come back as confirmation cards, showing what the rule did and why,
    # until he has seen each one.
    import json as _j2
    led = _j2.loads((ROOT / 'work/rulings/john.json').read_text(encoding='utf-8'))
    lk = 'rulings' if 'rulings' in led else [x for x in led if x != '_'][0]
    # ⚠ KEY ON THE CITATION, NOT THE LINE. A line carries several citations —
    # 025-L:46 holds both `κϛ56. 946b` and `πδ1. 889b` — so keying on (col,
    # line) flagged a neighbour the rule never touched and asked John to
    # confirm a change that was never made to it.
    byrule = {}
    for r in led[lk]:
        if r.get('source') == 'bonitz_pipeline.numeral_fix':
            byrule[(r['col'], r['line'], r['form'].split()[0].rstrip('.'))] = r
    seen_rule = set()
    if RULINGS.exists():
        seen_rule = {k for k, v in _j2.loads(
            RULINGS.read_text(encoding='utf-8')).items()
            if v.get('verdict') == 'confirm-rule'}

    queue = [c for c in cites if c.how == 'unresolved'] + \
            [c for c, _ in gap.values()] + \
            [c for c in cites
             if (c.col, c.line, c.raw.split()[0].rstrip('.')) in byrule
             and f'{c.col}:{c.line}:{c.token}:{c.page}' not in seen_rule]
    out = []
    for c in sorted(queue, key=lambda c: (c.col, c.line)):
        # ⚠ THREE KINDS REACH HERE NOW, and only one of them has a `why`.
        # An unresolved citation carries its own; a missing-book gap gets the
        # sentence below; a rule-applied citation resolves cleanly and has
        # neither, which used to raise KeyError off `gap` the moment the
        # confirmation cards were added.
        if c.why:
            why = c.why
        elif id(c) in gap:
            why = (f'{c.work} has books and none is named here; {c.page} is in '
                   f'book {gap[id(c)][1][len(c.work):]!r}. Bonitz names the '
                   f'book everywhere else — this reads like a lost letter, not '
                   f'a citation of the work.')
        else:
            why = (f'Now reads {c.work}{c.book}, and {c.page} sits inside it.')
        s = Site(c.col, c.line, c.raw, c.token, c.page, why)
        im, _, how = crop_word(c.col, c.line, c.token, scale=3.0, spread=8)
        s.crop, s.how = _b64(im), how
        s.whole = _b64(crop_word(c.col, c.line, c.token, scale=1.6,
                                 whole=True)[0])
        rk = (c.col, c.line, c.raw.split()[0].rstrip('.'))
        if rk in byrule and c.how != 'unresolved':
            s.applied = byrule[rk]['note']
        s.near = [f'{o.raw} = {o.work}{o.book}' for o in cites
                  if o.col == c.col and abs(o.line - c.line) <= 2
                  and o.how in ('explicit', 'inherited') and o is not c][:6]
        s.sigla = siglum_candidates(c.token, c.page, works, seen)
        if id(c) in gap and gap[id(c)][1] not in s.sigla:
            s.sigla = [gap[id(c)][1]] + s.sigla[:MAX_CANDIDATES - 1]
        opts = split(c.token, works)
        if opts:
            wk, bk = opts[0]
            # ⚠ BOUND BY THE BOOK, NOT THE WORK. Offering 1291-1294 for
            # `Πο4. 1290b` proposed pages inside the POLITICS while the token
            # names a book that does not contain any of them — repairs that
            # cannot both be right.
            span = _SPANS.get(wk, {}).get(bk)
            lo, hi = span if span else (works[wk].lo, works[wk].hi)
            s.pages = page_candidates(c.page, lo, hi)
        out.append(s)
    return out


INV = inventory()


# Characters this type renders identically, or near enough that a SCREEN font
# will not separate them either. John, 2026-08-10: "I think I can tell in the
# ink but the problem is the card." The crop was legible; `read πκϛ` against
# `keep πκς` was not, because on screen they are the same string twice.
# Sorts a screen font will not separate at reading size, however good the type.
# Stigma against final sigma is the worst pair in this book; iota against
# upsilon and omicron against delta are the others that have cost a ruling.
LOUD = 'ϛςιυοδΒβ'

NAMED = {'ϛ': 'stigma, 6', 'ς': 'final sigma, no value', 'ι': 'iota',
         'υ': 'upsilon', 'ο': 'omicron', 'δ': 'delta', 'θ': 'theta',
         'κ': 'kappa', 'β': 'beta', 'ν': 'nu', 'γ': 'gamma', 'ε': 'epsilon',
         'ζ': 'zeta', 'η': 'eta', 'α': 'alpha', 'χ': 'chi', 'π': 'pi'}


def spell(token: str, cand: str) -> str:
    """`cand` with the character that differs marked and NAMED.

    A button whose face is a Greek string is useless when the difference is one
    letter the screen draws the same way. Mark the letter, then say what it is.
    """
    if len(token) == len(cand):
        at = [i for i, (a, b) in enumerate(zip(token, cand)) if a != b]
        if len(at) == 1:
            i = at[0]
            name = NAMED.get(cand[i])
            # ⚠ SOME SORTS MUST BE UNMISTAKABLE, NOT MERELY MARKED. John,
            # 2026-08-10: "for stigma/sigma, make stigma BOLD so it clearly
            # pops." A highlight says WHERE the difference is; it does not make
            # ϛ look unlike ς, and on a phone at 19px they are still one shape
            # with a background behind it. These characters get their own size
            # and weight so the reader is not asked to resolve, at screen
            # resolution, the very distinction the scan could not settle.
            cls = ' class="loud"' if cand[i] in LOUD else ''
            return (f'{cand[:i]}<mark{cls}>{cand[i]}</mark>{cand[i + 1:]}'
                    + (f' <em>({name})</em>' if name else ''))
    return cand


# ⚠ RULED ON A PHONE, so the phone is the design and the desktop is the
# override. John, 2026-08-10: "Bigger font. Optimized for mobile."
#
# The hard part is not the type — it is the CROP. A 1743px scan scaled into a
# 390px viewport makes the one letter under judgement about four pixels wide,
# which is no better than not showing it. So on a narrow screen the crop goes
# FULL BLEED and keeps its own scrollbar: it renders at a size where the ink is
# legible and the reader pans, rather than fitting a whole line into a width
# that destroys it.
MOBILE_CSS = """
html{-webkit-text-size-adjust:100%}
body{font-size:19px;line-height:1.5}
main{padding:.6rem;max-width:none}
header{padding:.6rem .8rem}
h1{font-size:1rem;line-height:1.25}
.card{padding:1rem .85rem;margin:0 0 1.6rem;border-radius:4px}
.loc{font-size:.78rem}
.said{font-size:1.5rem;line-height:1.35;margin:.4rem 0 .2rem}
.why{font-size:1rem;line-height:1.45}
.does{font-size:.95rem;line-height:1.45}
.lbl{font-size:.76rem}
.reclbl{font-size:.78rem}

/* The crop at a size the eye can use, panned rather than shrunk. */
.crops{margin:.8rem -.85rem .9rem;gap:.4rem}
.scrollcrop{overflow-x:auto;-webkit-overflow-scrolling:touch;
  border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);
  background:#fff}
.scrollcrop img{max-width:none;height:190px;width:auto;border:0;border-radius:0}
.panhint{font:.72rem "SF Mono",Menlo,monospace;color:var(--muted);
  padding:.25rem .85rem 0}

button{font-size:1rem;padding:.9rem 1.1rem;min-height:52px}
button.go{font-size:1.25rem;padding:1.05rem 1.5rem;width:100%;min-height:64px}
.row{gap:.5rem}
details summary{font-size:.9rem;padding:.9rem 0}
.alts{border-top:1px solid var(--rule);margin-top:.9rem}
mark{padding:0 .18em}
mark.loud{font-size:1.5em;font-weight:800;line-height:1;padding:0 .16em;
  vertical-align:-.06em}
.ask{font:600 1.15rem/1.3 Superclarendon,Rockwell,Georgia,serif;
  margin:1rem 0 .7rem}
.rec{display:flex;flex-direction:column;gap:.6rem;margin:0 0 .6rem}
button.go{width:100%;text-align:left;display:flex;flex-direction:column;
  gap:.25rem;font-size:1.1rem;padding:.95rem 1.1rem;min-height:64px}
button.go.no{background:var(--fix);border-color:var(--fix)}
button.go.yes{background:transparent;border:2px solid var(--keep);
  color:var(--keep)}
button.go.bothb{background:transparent;border:2px dashed var(--warn);
  color:var(--warn)}
.sub2{font-size:.82rem;font-weight:400;opacity:.9;line-height:1.3}
.reclbl{font-size:.82rem;margin:.2rem 0 0}

@media(min-width:760px){
  body{font-size:17px}
  main{max-width:62rem;padding:1.2rem}
  .said{font-size:1.25rem}
  .crops{margin:.8rem 0 .9rem}
  .scrollcrop img{height:auto;max-width:100%;width:auto}
  button.go{width:auto}
}
"""


def recommend(s: Site) -> tuple[str, str, str]:
    """One answer, one reason. Returns (verdict, detail, why).

    John, 2026-08-09: **"I just want an easy process."** A row of four buttons
    is not a process, it is a menu — it hands the reasoning back to the reader
    at every site, and the reader already has the hard part, which is reading
    the ink. So the tool commits to an answer and the reader ratifies or
    overrides it. Everything it considered stays on the card, smaller.
    """
    if s.sigla:
        top = s.sigla[0]
        if edit_rank(s.token, top) == 0 and \
                not holds_or_inherits(top, s.page, INV):
            # The ink is one thing, the page another, and neither is our text.
            page_says = [c for c in s.sigla if holds(c, s.page, INV)]
            return ('fix-siglum-and-record', top,
                    f'the ink reads {top}, which cannot carry {s.page} — so fix '
                    f'the text to {top} and record it as the edition\'s error'
                    + (f' for {page_says[0]}' if page_says else ''))
        if 'ς' in s.token and top == s.token.replace('ς', 'ϛ'):
            # ⚠ NOT A JUDGEMENT ABOUT THE INK. John, 2026-08-10: "I can't tell
            # the difference here between sigma and stigma in the font used
            # here." Nor can anyone — they are the same shape in this type. But
            # a book number is a NUMERAL, and final sigma has no numeric value
            # while stigma is 6, so the slot admits exactly one reading whatever
            # the glyph looks like. Asking a reader to see a difference that
            # carries no information is the tool wasting the only thing it
            # cannot automate.
            return ('fix-siglum', top,
                    'a book number is a numeral, and final sigma has no value '
                    '— only stigma (6) can stand here, whatever the glyph looks '
                    'like. Bonitz writes it 17 times elsewhere')
        if edit_rank(s.token, top) == 1:
            return ('fix-siglum', top, 'the same letter in the other case')
        if s.near:
            works = ', '.join(sorted({n.split('= ')[1][:2] for n in s.near}))
            return ('fix-siglum', top,
                    f'{s.page} is in {top}, and the citations around it are '
                    f'{works}')
        return ('fix-siglum', top, f'{s.page} is in {top} and nothing else')
    if s.pages:
        return ('fix-page', str(s.pages[0]),
                f'one digit from what we hold, and inside the work named')
    return ('preserve', '', 'nothing one edit away lands in range')


def html(ss: list[Site], out: Path = PAGE) -> Path:
    cards = []
    for s in ss:
        warn = ('<div class="warnflag">⚠ this crop was placed by geometry, not '
                'by matching the line text — check it against the printed line'
                '</div>') if s.how != 'text' else ''
        sig = ''.join(
            f'<button class="fix" onclick="rule({s.sid!r},\'fix-siglum\','
            f'{c!r},this)"><span class="gk">{spell(s.token, c)}</span>'
            f'</button>' for c in s.sigla)
        sigbtn = sig or '<span class="does">nothing else is possible here</span>'
        pgs = ''.join(
            f'<button class="fix" onclick="rule({s.sid!r},\'fix-page\','
            f'{p},this)">{p}</button>' for p in s.pages)
        pgs = (f'<div class="lbl">the page digits are ours</div>'
               f'<div class="does">We misread a digit. The corpus <b>is</b> '
               f'corrected to the page you read.</div>'
               f'<div class="row">{pgs}</div>') if pgs else ''
        rv, rd, rw = recommend(s)
        ask = ('A rule already changed this. Was it right?' if s.applied
               else 'Did Bonitz print this wrong?')
        both = ('<button class="go bothb" onclick="rule(%r,'
                r'&#39;fix-siglum-and-record&#39;,%r,this)">Both — we misread '
                r'it AND he printed it wrong<span class="sub2">corpus becomes '
                r'%s, and %s is recorded</span></button>'
                % (s.sid, rd, rd, rd)) if rv == 'fix-siglum-and-record' else ''
        rdoes = {
            'preserve': 'Corpus untouched; the error goes to the corrigenda '
                        'register.',
            'fix-siglum': 'Corpus corrected. Nothing recorded — the edition was '
                          'never wrong, only our reading of it.',
            'fix-page': 'Corpus corrected. Nothing recorded.',
            'fix-siglum-and-record': 'BOTH: the corpus is corrected to what is '
                                     'printed, AND what is printed is recorded '
                                     'as the edition\'s own error.',
        }[rv]
        ruled = (f'<div class="applied"><b>Already corrected by rule.</b> '
                 f'{s.applied}</div>') if s.applied else ''
        rface = ('keep <span class="gk">%s</span> as printed' % s.token
                 if rv == 'preserve' else
                 'read <span class="gk">%s</span> · and record it'
                 % spell(s.token, rd) if rv == 'fix-siglum-and-record' else
                 'read <span class="gk">%s</span>'
                 % (spell(s.token, rd) if rv == 'fix-siglum' else rd))
        none = ('<div class="warnflag">no repair suggested — nothing one edit '
                'away lands in range. Read the line and preserve, or say so.'
                '</div>') if not (s.sigla or s.pages) else ''
        cards.append(f"""
<div class="card" id="{s.sid}">
  <div class="loc">{s.col} · line {s.line}</div>
  <div class="said gk">{s.raw}</div>
  <div class="why">{s.why}</div>
  {('<div class="lbl">what the citations around it are</div><div class="why gk">'
    + ' &nbsp;·&nbsp; '.join(s.near) + '</div>') if s.near else ''}
  {warn}
  <div class="crops">
    <div class="scrollcrop">
      <img src="data:image/png;base64,{s.crop}" alt="the citation in the scan">
    </div>
    <div class="panhint">drag the scan sideways · pinch to zoom</div>
    <details><summary>the whole printed line</summary>
      <div class="scrollcrop">
        <img src="data:image/png;base64,{s.whole}" alt="the whole line"></div>
    </details>
  </div>
  {none}
  <div class="ask">{ask}</div>
  {both}
  {ruled}
  <div class="rec">
    <button class="go no" onclick="rule({s.sid!r},{rv!r},{rd!r},this)">
      No — we misread it<span class="sub2">the corpus becomes {rface}</span>
    </button>
    <button class="go yes" onclick="rule({s.sid!r},'preserve','',this)">
      Yes — he printed it wrong<span class="sub2">corpus untouched · goes to
      corrigenda</span>
    </button>
  </div>
  <div class="reclbl">{rw}</div>
  <details class="alts"><summary>we misread it, but not as {rd}</summary>
    <div class="lbl">the ink reads a different siglum</div>
    <div class="row">{sigbtn}</div>
    {pgs}
  </details>
</div>""")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        f'<!doctype html><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">'
        '<title>Work-level findings</title>'
        f'<style>{_BASE_CSS}{MOBILE_CSS}</style>'
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
              verdicts=('preserve', 'fix-siglum', 'fix-page',
                        'fix-siglum-and-record'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
