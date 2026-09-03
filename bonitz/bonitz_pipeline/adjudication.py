"""Which findings John has already answered, and which are still open.

⚠ A STANDING FINDING IS NOT AN UNSEEN ONE. John read the sweeps table and asked
whether the red numbers were resolved. They are not resolved and they are not
new: most of them are places he has already ruled, where he told us to KEEP what
Bonitz printed — so the sweep's disagreement with its authority stands forever,
by design. A count that cannot tell "nobody has looked at this" from "he looked
and the printing wins" is the same two-states-where-there-are-three mistake this
pipeline has had to unlearn everywhere else, made by the page that reports on it.

So a finding is split against the sittings that closed:

    OPEN         it maps to no ruling anyone has given
    ADJUDICATED  it maps to a site John ruled, and his answer stands

⚠ AND THE DEFAULT IS OPEN. A mapping that fails — a form that will not anchor,
a site whose coordinates have drifted, a store in a shape this module does not
know — leaves the finding OPEN. Overstating the work left costs an hour;
understating it loses a site, and a lost site is what this project keeps paying
for.

Identity is John's standing rule: a ruling belongs to the SITE, not to the card.
The card's wording changes — whole printed tokens, hyphen halves joined, every
sweep's expectation offered — and a re-keyed card must still inherit its answer.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'work'
SWEEPS = WORK / 'sweeps'
LEDGER = WORK / 'rulings' / 'john.json'

# What a ledger entry's `kind` says about its site — and what it refuses to say.
# `declined` and `pending` are John stating he has NOT answered; turning those
# into answers is the one direction this module must never fail in.
LEDGER_VERDICTS = {'text': 'accept', 'keep': 'preserve'}

# (queue, ruling store, shape). Both shapes are read from disk at call time —
# nothing here is cached and no file records the mapping, so the answer cannot
# go stale behind a change to either.
SOURCES = [
    (WORK / 'queue-review-53-62.json', SWEEPS / 'review-rulings.json', 'settle'),
    (WORK / 'queue-review-53-62-fix.json', SWEEPS / 'review-rulings.json',
     'settle'),
    # ⚠ THE WHOLE-CORPUS SITTING, CLOSED 2026-08-18. John ruled all 245 cards
    # of `queue-review-15-102.json` and `settle_apply` carried them. It covers
    # 53-62 as well as everything else, and its verdicts share the settle
    # store — so leaving it out made every site it answered read as OPEN on
    # the dashboard, which is the one thing a status page must never do.
    (WORK / 'queue-review-15-102.json', SWEEPS / 'review-rulings.json',
     'settle'),
    # ⚠ AND THE FOLLOW-UP SITTING OF THE SAME DAY, WITH ITS OWN STORE. John
    # ruled 31 more cards there — the ἁλκυ- family, ἀλεώρα, ἄλυτόν, ἀκρώτη-,
    # the codec pair — and without this line every one of them read as OPEN on
    # the status page hours after he answered it. A sitting that closes has to
    # be named here or the dashboard reports work as undone.
    (WORK / 'queue-followup-2026-08-18.json',
     SWEEPS / 'followup-rulings.json', 'settle'),
    (WORK / 'queue-ligature.json', SWEEPS / 'ligature-rulings.json',
     'ligature'),
    # The sites John excluded from a ligature card are NOT adjudicated by it —
    # they were deliberately held back to be asked one at a time. They become
    # adjudicated only when that follow-up sitting answers them.
    (WORK / 'queue-ligature-excluded.json',
     SWEEPS / 'ligature-excluded-rulings.json', 'ligature'),
]

# The sweep names `merge_review.collect` uses, mapped to the dashboard's.
SWEEP_NAMES = {
    'accent': 'accent',
    'breathing': 'breathing',
    'accent_law': 'accent_law',
    'diacritic': 'diacritic_sweep',
    'siglum': 'siglum_check',
    'smyth': 'smyth_sweep',
}

MEMBER_SID = re.compile(r'page-(\d+)-([LR]):(\d+):(-?\d+)$')

# ⚠ `none` IS NOT AN ANSWER, IT IS A DEFERRAL. "None of these" says every
# reading offered was wrong — the card was defective and the dispute is still
# owed a resolution. Counting it as adjudicated retires a site nobody has
# settled, which is the same silent loss as never having asked. Seven of the
# eight sites John answered `none` on 53-62 proved the point: each came back as
# a corrected card and got a real verdict.
#
# ORDER: a `none` never adjudicates, whenever it was given. So a site ruled
# none-and-then-accept is adjudicated — by the accept — and a site ruled only
# none is open. That is not a tie-break on timestamps, which the stores do not
# carry; it falls out of `none` not being an answer at all. Where several real
# verdicts cover one place the LAST recorded wins the report, stores being
# written in the order the server received them.
REAL_VERDICTS = ('accept', 'preserve')


@dataclass(frozen=True)
class Ruled:
    """One site a sitting answered, and the answer."""
    page: int
    col: str
    spans: tuple            # ((line, start, end), …) in corpus coordinates
    sid: str
    verdict: str
    source: str             # the store that holds the answer

    @property
    def answers(self) -> bool:
        """True when this verdict settles the site rather than deferring it."""
        return self.verdict in REAL_VERDICTS


@dataclass
class Split:
    """One sweep's findings on a page range, divided."""
    total: int = 0
    open: int = 0
    adjudicated: int = 0
    sids: set = field(default_factory=set)

    def add(self, n: int, ruled: Ruled | None) -> None:
        self.total += n
        if ruled is None:
            self.open += n
        else:
            self.adjudicated += n
            self.sids.add(ruled.sid)


def _settle_spans(e: dict) -> tuple:
    """Where a settle-queue entry's printed token sits.

    The fix queue records `pieces` — a word broken at the measure occupies two
    lines. The first sitting's queue predates them and records one offset with
    the sweep's own token.
    """
    if e.get('pieces'):
        return tuple((p['line'], p['start'], p['start'] + len(p['text']))
                     for p in e['pieces'])
    word = (e.get('readers') or {}).get('opus') or ''
    at = e.get('char_at_corpus', e.get('char_at', 0))
    return ((e['line'], at, at + len(word)),)


def _settle_question(e: dict) -> tuple:
    """The span a settle card actually disputes — not its whole printed token.

    A card headed `εὐ-θείαν / εὐ-θεῖαν` varies the TAIL; the card beside it at
    the same word varies the head. `_dress` has already worked out which piece
    that is and recorded it as the entry's own `line` and `char_at_corpus` —
    the place the crop points at — so the answer is read back rather than
    recomputed. An entry with no pieces predates them, and its single recorded
    span is the question.
    """
    spans = _settle_spans(e)
    if len(spans) < 2:
        return spans
    here = (e['line'], e.get('char_at_corpus', e.get('char_at')))
    return tuple(s for s in spans if (s[0], s[1]) == here) or spans


def _finding_question(f, tok, at: tuple) -> tuple:
    """The span a sweep's finding disputes, by the rule that built the cards.

    The same word can be flagged twice — the accent sweep about its head, the
    diacritic sweep about its tail — so a finding is located by the piece its
    own candidates vary, exactly as `merge_review._dress` locates the crop. A
    finding with no candidate (`smyth` only says a token cannot end that way)
    disputes the piece it was anchored in.
    """
    from . import merge_review as mr
    texts = tok.texts
    if len(texts) < 2:
        p = tok.pieces[0]
        return ((p.line, p.start, p.start + len(p.text)),)
    laid = [x for x in (mr.lay_on(texts, cand, sweep)
                        for cand, sweep in f.expecteds)
            if x and len(x) == len(texts)]
    idx = next((i for i in range(len(texts))
                if any(a[i] != texts[i] for a in laid)), None)
    if idx is None:
        idx = mr._piece_of(tok, *at)
    p = tok.pieces[idx]
    return ((p.line, p.start, p.start + len(p.text)),)


def _member_sid(m: dict) -> str:
    """How the ligature sitting names one site — `page-015-R:43:51`.

    ⚠ `char_at`, NOT `word_off`. Every other queue in this project identifies a
    member by its stream offset, and building this key from `word_off` matched
    no member at all — so every site John excluded from a card was silently
    counted as answered by it, which is precisely the site he had protected.
    Nothing raised; the set was simply empty. `ligature_review.Member.sid` is
    `col_key:line:char_at`, and this must follow it rather than the habit.
    """
    return f"page-{m['page']:03d}-{m['col']}:{m['line']}:{m['char_at']}"


def _ledger_sites(lo: int, hi: int) -> list[Ruled]:
    """Sites John answered in the one ledger, whatever route the answer took.

    ⚠ A RULING GIVEN IN CONVERSATION IS STILL A RULING. `john_rulings` is the
    ONE ledger, appended to whenever he rules — including sites he settles by
    naming the form rather than by clicking a card. Those never pass through a
    queue, so `SOURCES` is structurally blind to them, and on 2026-08-18 the
    status page reported 041-R:32 and 043-L:35 as OPEN for hours after he had
    answered both. A page that counts only the answers arriving by one route is
    reporting the route, not the work.

    Conservative on every axis, because overstating what is settled loses a
    site: only `text` and `keep` yield verdicts, and only when the form is still
    on the line the entry names. A form that has moved does not anchor and the
    finding stays open, which is the same rule the queue shapes follow.
    """
    if not LEDGER.exists():
        return []
    try:
        doc = json.loads(LEDGER.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        return []
    from . import merge_review as mr
    out: list[Ruled] = []
    for r in doc.get('rulings', []):
        verdict = LEDGER_VERDICTS.get(r.get('kind') or '')
        col, line, form = r.get('col'), r.get('line'), r.get('form')
        if not (verdict and col and line and form):
            continue
        # ⚠ THE LEDGER SPELLS A COLUMN `page-024-L`; EVERYTHING ELSE HERE
        # SPELLS IT `L`. `corpus_column` builds the filename from the page and
        # the side, so handing it the full stem asks for `page-024-page-024-L`,
        # which is in no stage — and `required=False` answers None, exactly as
        # it would for a page nobody has transcribed. First cut of this
        # function took that None for absence and anchored 0 of 689 sites while
        # reporting no error at all. Parse strictly: a stem that will not split
        # is a defect in the ledger, not a missing page.
        m = re.fullmatch(r'page-(\d+)-([LR])', col)
        if not m or not (lo <= int(m.group(1)) <= hi):
            continue
        page, side = int(m.group(1)), m.group(2)
        lines = mr.corpus_lines(page, side)
        if not lines or not (0 < line <= len(lines)):
            continue
        text = lines[line - 1]
        # One Ruled per occurrence: a form printed twice on its line is two
        # places, and the entry answers whichever of them a finding names.
        at = text.find(form)
        while at >= 0:
            out.append(Ruled(page, side, ((line, at, at + len(form)),),
                             r.get('id') or f'{col}:{line}:{form}',
                             verdict, 'john.json'))
            at = text.find(form, at + 1)
    return out


def ruled_sites(lo: int, hi: int) -> list[Ruled]:
    """Every site in [lo, hi] that some closed sitting has answered."""
    out: list[Ruled] = []
    for queue, store, shape in SOURCES:
        if not queue.exists() or not store.exists():
            continue                     # a sitting that has not happened
        try:
            doc = json.loads(queue.read_text(encoding='utf-8'))
            answers = json.loads(store.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            continue
        if shape == 'settle':
            for e in doc.get('entries', []):
                if not (lo <= e['page'] <= hi):
                    continue
                sid = 'forms:' + '|'.join(e.get('form_set')
                                          or e.get('forms') or [])
                if sid not in answers:
                    continue
                out.append(Ruled(e['page'], e['col'], _settle_question(e), sid,
                                 answers[sid].get('verdict', ''), store.name))
        else:
            for card in doc.get('cards', []):
                sid = card.get('sid', '')
                answer = answers.get(sid)
                if not answer:
                    continue
                excluded = set(answer.get('excluded') or ())
                for m in card.get('members', []):
                    if not (lo <= m['page'] <= hi):
                        continue
                    if _member_sid(m) in excluded:
                        continue         # held back for the follow-up sitting
                    # A ligature card asks about the cluster and nothing else —
                    # the sort and the mark over it — so the recorded span IS
                    # the question and needs no narrowing.
                    at = m['char_at']
                    out.append(Ruled(
                        m['page'], m['col'],
                        ((m['line'], at, at + len(m.get('form') or '')),),
                        sid, answer.get('verdict', ''), store.name))
    # ⚠ THE LEDGER GOES FIRST SO A QUEUE'S ANSWER OUTRANKS IT. `adjudicated_by`
    # scans newest-last, so anything appended here would outrank every sitting.
    # Where both cover a site the card John actually clicked is the better
    # record of what he was shown, and the ledger is here to reach the sites no
    # card ever raised.
    return _ledger_sites(lo, hi) + out


def _within(a: tuple, b: tuple) -> bool:
    """True when span `a` sits inside span `b`, on the same printed line."""
    return a[0] == b[0] and b[1] <= a[1] and a[2] <= b[2]


def adjudicated_by(page: int, col: str, spans, sites) -> Ruled | None:
    """The ruling that answers this place, or None.

    ⚠ CONTAINMENT EITHER WAY, NEVER A STRADDLE. A card's printed token grew
    when the builder started showing whole words — `θειαν` became `βοή-θειαν`,
    `τον` became `υ[?]τον` — so the ruled span may be inside the finding's or
    the other way round. Two spans that merely overlap at an edge are not one
    word, and treating them as one would hand John's answer to a place he never
    saw.

    ⚠ AND BOTH SPANS ARE THE QUESTION, NOT THE WORD. `εὐ-θεῖαν` on 58-L is one
    printed word carrying TWO cards — the breathing on the head, the circumflex
    on the tail — and matching whole tokens let either ruling answer both. Grok
    found it by deleting the `εὐ` ruling and watching the `εὐ` finding stay
    green. Callers pass the span under dispute; see `_settle_question` and
    `_finding_question`.

    Scanned newest-first so the last real verdict is the one reported.
    """
    for site in reversed(list(sites)):
        if (site.page, site.col) != (page, col) or not site.answers:
            continue
        for a in spans:
            for b in site.spans:
                if _within(a, b) or _within(b, a):
                    return site
    return None


def _finding_spans(f, lines) -> list:
    """Where each of a finding's places puts its question, or [] if it will not
    anchor. Uses the queue builder's own anchoring so the two agree."""
    from . import merge_review as mr
    out = []
    for ln, off in mr.anchor(f):
        tok = mr.token_at(lines, ln, off, f.printed)
        out.append(_finding_question(f, tok, (ln, off)))
    return out


def _extra_sweep_findings(lo: int, hi: int):
    """(dashboard sweep name, page, col, line, token) for the sweeps
    `merge_review.collect` does not enumerate: quotecheck, bekker, lexcheck,
    alphacheck and the breathing oracle. Before this, all five read NOT
    MAPPED on the dashboard forever — John could rule every finding and the
    page still could not say so.

    Counted by CALLING the sweeps, on exactly the filter the dashboard's
    live counters use — the totals must match row for row, because
    `dashboard.adjudication` compares them and reports NOT MAPPED on any
    drift. That comparison is the alarm, not a formality: an enumerator
    counting differently would silently show findings as answered.

    Each row is (dashboard name, page, col, line, token, mode). The token is
    the printed form the QUESTION is about, and the mode says what may answer
    it — the first cut passed the whole citation with either-way containment
    and Grok's review caught it stealing: the 2-character `Οβ` siglum card
    closed the 035-L:22 quotation finding, and whole-line audit accepts
    closed citation and word findings they were never asked about.

    - quotecheck/bekker, mode 'address': token = (citation segment, address),
      located through the cite and re-expanded in the line (the sweeps'
      regexes truncate: `f. 596. 1595b2` for a printed 1595b25), on the line
      the address is PRINTED on (a wrapped cite like `αν2.\\n476a17` puts it
      on the next line). A ruling answers only from inside the address (John
      naming `688` or `1595b25`) or covering it within the citation's own
      extent (`Ηγ11. 1126`); a siglum card rules letters the finding does
      not dispute, and a whole-line accept rules the line, not the citation
      — neither answers.
    - the word sweeps: token = the flagged word, mode 'exact': only a ruling
      naming that very span answers. A whole-line audit accept vouches for
      the transcription wholesale without ever being ASKED the sweep's
      question, so it does not retire the finding — conservative on the
      same axis as `_ledger_sites`.

    Raises stay raises: bonitz tooling is private, and a missing forms table
    or corpus must fail loudly, not degrade one row (the dashboard's live
    counters guard themselves; this mapper does not pretend to a number).
    """
    from .normalize import corpus_columns
    cols_in_range = []
    for f in corpus_columns():
        m = re.match(r'page-(\d+)-([LR])$', f.stem)
        if m and lo <= int(m.group(1)) <= hi:
            cols_in_range.append((int(m.group(1)), m.group(2)))

    from . import quotecheck
    index = quotecheck.load_corpus()
    for page, col in cols_in_range:
        for r in quotecheck.scan(page, col, index):
            # The dashboard's counter: checkable, zero overlap, no standing
            # benign ruling. Any other filter here trips the NOT MAPPED alarm.
            if (not r.get('skipped') and r['overlap'] <= 0.0
                    and not r.get('adjudicated')):
                page_digits = r['column'][:-1]     # '476a' -> '476'
                ln, seg, addr = _address_site(r['cite'], r['line'], page_digits)
                yield ('quotecheck', page, col, ln, (seg, addr, page_digits),
                       'address')

    from . import bekker
    for page, col in cols_in_range:
        for b in bekker.scan(page, col)[0]:
            ln, seg, addr = _address_site(b['cite'], b['line'], str(b['bekker']))
            yield ('bekker', page, col, ln, (seg, addr, str(b['bekker'])),
                   'address')

    from . import lexcheck
    forms = lexcheck.load_forms()
    for page, col in cols_in_range:
        for h in lexcheck.sweep_column(page, col, forms):
            yield ('lexcheck', page, col, h['line'], h['wrote'], 'exact')

    from . import alphacheck
    # ⚠ DISTINCT PAGES, SORTED — handing scan a page once per column shatters
    # the alphabetical run it walks (the dashboard's 1782-for-34 failure).
    for v in alphacheck.scan(sorted({p for p, _ in cols_in_range})):
        yield ('alphacheck', v['page'], v['col'], v['line'], v['word'], 'exact')

    from . import breathing_oracle
    for stem, line, word, _want, _why in breathing_oracle.disagreements(lo, hi)[0]:
        m = re.fullmatch(r'page-(\d+)-([LR])', stem)
        if m:
            yield ('breathing_oracle', int(m.group(1)), m.group(2), line, word,
                   'exact')


# The printed shape of a Bekker address: page digits, an optional spaced
# column letter, optional line digits. Used to RE-EXPAND a sweep's truncated
# cite against the line it is printed on, never to find addresses on its own.
_ADDRESS = re.compile(r'\d{2,4}(?:\s?[ab]\d*)?')


def _address_site(cite: str, line: int, page_digits: str
                  ) -> tuple[int, str, str]:
    """(printed line, citation segment, address token) for a citation finding.

    The address is what the finding disputes, so it is what a ruling must
    cover; the segment is the citation's own extent on that line, the widest
    span a ruling may occupy and still be ABOUT the citation. Both found via
    the cite (not by searching the line, which may carry several numbers),
    on the line the address is PRINTED on — a wrapped cite starts on `line`
    but its number may sit on the next.
    """
    at = cite.find(page_digits)
    if at < 0:
        seg = cite.split('\n')[0].strip()          # defensive; anchor the head
        return line, seg, seg
    addr_line = line + cite[:at].count('\n')
    seg_start = cite.rfind('\n', 0, at) + 1
    segment = cite[seg_start:].split('\n')[0].strip()
    tail = cite[at:].split('\n')[0]
    m = _ADDRESS.match(tail)
    return addr_line, segment, (m.group(0) if m else tail).strip()


def split(lo: int = 53, hi: int = 62) -> dict[str, Split]:
    """Each sweep's findings on [lo, hi], divided into open and adjudicated.

    Findings come from `merge_review.collect`, which is the enumerator the
    review queue itself is built from: one entry per report row, carrying the
    coordinates the row lacks. The dashboard counts the same rows its own way
    and compares totals — a sweep whose numbers disagree is reported as NOT
    MAPPED rather than split on a guess.

    A row whose form occurs twice on its line has two sites. It counts as
    adjudicated only when BOTH are, because the row is not answered until every
    place it names is.
    """
    from . import merge_review as mr
    sites = ruled_sites(lo, hi)
    out: dict[str, Split] = {}
    for f in mr.collect(lo, hi):
        lines = mr.corpus_lines(f.page, f.col) or []
        spans = _finding_spans(f, lines)
        if spans:
            hits = [adjudicated_by(f.page, f.col, s, sites) for s in spans]
            ruled = hits[0] if all(h is not None for h in hits) else None
        elif mr._gone_from_column(f):
            # ⚠ UNANCHORABLE FOR TWO DIFFERENT REASONS, AND ONLY ONE IS OPEN.
            # A form still somewhere in its column is one the anchor could not
            # place — nobody has answered it. A form nowhere in the column has
            # been REWRITTEN since the sweep ran, by a ruling in another
            # queue: `τον` at 60-R:56 went when John read `(τὸν υ[?]τον)` as
            # `(τὸν ὦτον)` on 2026-08-15. Counting that as open is the
            # dashboard reporting work that no longer exists.
            ruled = Ruled(f.page, f.col, (), 'resolved-since', 'accept',
                          'work/audit/audit-rulings.json')
        else:
            ruled = None                 # unanchorable: open, never assumed
        per: dict[str, int] = {}
        for sweep, _why in f.sources:
            name = SWEEP_NAMES.get(sweep.split(':')[0])
            if name:
                per[name] = per.get(name, 0) + 1
        for name, n in per.items():
            out.setdefault(name, Split()).add(n, ruled)
    for name, page, col, line, token, mode in _extra_sweep_findings(lo, hi):
        lines = mr.corpus_lines(page, col) or []
        text = lines[line - 1] if 0 < line <= len(lines) else ''
        places = []          # (pd_span, addr_span, cluster_span) per occurrence
        if mode == 'address':
            seg, addr, pd = (mr._nfc(token[0]), mr._nfc(token[1]),
                             mr._nfc(token[2]))
            off = seg.find(addr)
            at = text.find(seg) if seg and off >= 0 else -1
            while at >= 0:
                a0 = at + off
                # Re-expand the truncated address against the print: bekker's
                # regex keeps one line digit, so its cite says 1595b2 where
                # the page says 1595b25 — a ruling naming the full number
                # must not straddle the token and miss.
                m = _ADDRESS.match(text, a0)
                a1 = m.end() if m else a0 + len(addr)
                # The citation's address CLUSTER: John's forms span whatever
                # the print does — `Ηγ11. 1126` stops before the line number,
                # `1126 a28, 31` runs past the regex's capture into the second
                # member. The ceiling is the printed run of address characters
                # from the citation's own start, never the rest of the line.
                end = max(at + len(seg), a1)
                while end < len(text) and text[end] in '0123456789ab ,.–-':
                    end += 1
                places.append(((line, a0, a0 + len(pd)), (line, a0, a1),
                               (line, at, end)))
                at = text.find(seg, at + 1)
        else:
            word = mr._nfc(token)
            at = text.find(word) if word else -1
            while at >= 0:
                span = (line, at, at + len(word))
                places.append((span, span, span))
                at = text.find(word, at + 1)
        if places:
            # A token printed twice on its line is two places, and the finding
            # is answered only when every one of them is — the same rule the
            # collect-shaped findings above follow. What may answer is the
            # mode's business — never a whole-line accept, never a card about
            # a different piece of the line (Grok's Οβ theft).
            hits = [_answers_extra(page, col, p, a, c, mode, sites)
                    for p, a, c in places]
            ruled = hits[0] if all(h is not None for h in hits) else None
        else:
            ruled = None                 # unanchorable: open, never assumed
        out.setdefault(name, Split()).add(1, ruled)
    return out


def _answers_extra(page: int, col: str, pd: tuple, addr: tuple, cluster: tuple,
                   mode: str, sites) -> Ruled | None:
    """The ruling that answers an extra-sweep finding, or None.

    Not `adjudicated_by`: its either-way containment is right for queue
    cards, whose spans are the disputed piece, and wrong here — it let a
    2-char siglum verdict and whole-line audit accepts retire citation
    findings nobody had ruled on (Grok, 2026-08-20).

    'address': the ruled span must lie inside the address (John naming
    `688` or `1595`), or cover the PAGE DIGITS while staying inside the
    citation's printed address cluster — his ruling shapes run from bare
    page (`688`) through siglum+page (`Ηγ11. 1126`) to page+members
    (`1126 a28, 31`), and all of those stay inside the cluster. A span
    reaching beyond it — the whole-line audit accept — ruled the LINE's
    transcription, never the citation, and does not answer. (The one blind
    edge: a citation that IS an entire line under a whole-line accept would
    match; no such line exists today, and the accept would at least have
    put the citation's ink before John.)
    'exact': only a ruling naming the very span. Scanned newest-first.
    """
    for site in reversed(list(sites)):
        if (site.page, site.col) != (page, col) or not site.answers:
            continue
        for b in site.spans:
            if mode == 'exact':
                if b == addr:
                    return site
            elif _within(b, addr) or (_within(pd, b) and _within(b, cluster)):
                return site
    return None
