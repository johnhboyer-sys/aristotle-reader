"""Join character-level flag sites into word-level disputes.

Flag records from compare3/compare4 are disagreement REGIONS on the Opus
spine — often a single character — not words:

    spine_off  absolute index into the batch's whitespace-free Opus stream
    ctx        spine[s-25 : e+25]  (default context=25)
    opus       spine[s:e]
    genie/…    the other reader's aligned slice for the same spine interval

The automatic arbitrators (breathing_oracle, morpheus, siglum_check) take a
whole Greek word. Feeding them a one-character fragment makes the lookup
fail; that is not arbitrator weakness, it is the wrong question.

This module expands each site to the Opus word that contains it — by mapping
spine_off back into the original spaced column text — rebuilds every reader's
word by splicing their region into the agreed left/right, and joins sites
that land in the same word.

Where a word cannot be reconstructed reliably, the site is EXCLUDED with a
reason. A wrongly assembled word fed to an arbitrator is the worst outcome;
silence is always acceptable.
"""

from __future__ import annotations

import json
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path

from .normalize import canonical, clean_opus

ROOT = Path(__file__).resolve().parent.parent
READERS = ('opus', 'genie', 'llama', 'kraken', 'codex', 'calamari',
           'paddle')
# ⚠ A READER MISSING FROM THIS TUPLE IS DROPPED FROM THE CARD SILENTLY.
# `frags` below is built by filtering `rec` through it, so a voice that
# voted in `compare4` but is not named here shows John a four-reader
# card for a five-reader dispute — the panel disagreeing with itself,
# with nothing on screen to say why.
# compare3/compare4 default; ctx is spine[s-context:e+context].
CONTEXT = 25

ROUGH, SMOOTH = '̔', '̓'


# --- character classes ------------------------------------------------------

def is_word_char(c: str, latin: bool = False) -> bool:
    """A character that belongs inside a word in Bonitz's text.

    ⚠ `latin` WIDENS THE CLASS; IT DOES NOT DEFAULT ON. Every arbitrator
    downstream — breathing_oracle, morpheus, siglum_check — takes a Greek word,
    and handing one `posuimus` is the wrong question, not a hard question. The
    flag is for the cold card queue, where there are no arbitrators and every
    dispute goes to John: a fifth of Bonitz's ink is Latin, the readers'
    remaining damage is almost all in it, and a Greek-only class excluded all
    of it as `not_greek_word` before a card could be built.
    """
    if not c or c.isspace():
        return False
    if unicodedata.combining(c):
        return True
    # ligatures, elision marks (several code points the readers use)
    if c in "ȣȢϗ'᾽᾿ʼ":
        return True
    o = ord(c)
    if (0x0370 <= o <= 0x03FF) or (0x1F00 <= o <= 0x1FFF):
        return True
    # ⚠ STOPS SHORT OF U+0223. `ȣ` is LATIN SMALL LETTER OU by name and is
    # Bonitz's GREEK ou-ligature — it is admitted above as Greek, and a range
    # running only to U+017F cannot swallow it. `latin_check.LATIN_RE` draws
    # the same line for the same reason.
    return latin and ((0x0041 <= o <= 0x005A) or (0x0061 <= o <= 0x007A)
                      or (0x00C0 <= o <= 0x017F and o not in (0x00D7, 0x00F7)))


def skeleton(w: str) -> str:
    """Letters only, ligatures expanded, final sigma folded — comparison key."""
    w = w.replace('ȣ', 'ου').replace('Ȣ', 'ου').replace('ϗ', 'και')
    s = ''.join(c for c in unicodedata.normalize('NFD', w)
                if not unicodedata.combining(c))
    return s.lower().replace('ς', 'σ')


def breathing_of(w: str) -> str:
    d = unicodedata.normalize('NFD', w)
    return 'rough' if ROUGH in d else 'smooth' if SMOOTH in d else 'none'


def accent_key(w: str) -> str:
    """Combining marks other than breathings (and their order)."""
    d = unicodedata.normalize('NFD', w)
    return ''.join(c for c in d
                   if unicodedata.combining(c) and c not in (ROUGH, SMOOTH))


# --- data -------------------------------------------------------------------

@dataclass(frozen=True)
class WordFlag:
    """One word-level dispute, ready for an arbitrator."""
    page: int
    col: str
    word_off: int                 # column-local offset into the Opus stream
    readers: dict[str, str]       # reader name -> full reconstructed word
    kind: str                     # letters | marks-only | breathing-only | accent-only
    n_sites: int = 1              # character-level sites joined into this word
    spine_off: int = 0            # batch spine offset of the word start


@dataclass(frozen=True)
class Exclusion:
    """A character-level site that could not become a reliable word dispute."""
    page: int
    col: str
    spine_off: int
    reason: str
    opus: str = ''


@dataclass
class Report:
    """Full join result: word disputes, exclusions, and counts."""
    words: list[WordFlag] = field(default_factory=list)
    excluded: list[Exclusion] = field(default_factory=list)
    n_sites: int = 0

    @property
    def by_kind(self) -> Counter:
        return Counter(w.kind for w in self.words)

    @property
    def by_reason(self) -> Counter:
        return Counter(e.reason for e in self.excluded)


# --- spine / column index ---------------------------------------------------

@dataclass
class _Column:
    page: int
    col: str
    start: int          # batch spine offset of this column
    stream: str         # whitespace-free canonical
    offs: list[int]     # stream index -> offset in base
    base: str           # NFC(cleaned) original with spaces


def _load_columns(pages: list[int],
                  opus_dir: Path | None = None,
                  cleaner=None) -> dict[tuple[int, str], _Column]:
    """Build the same batch spine batch4/compare4 uses, per column.

    ⚠ THE CLEANER MUST MATCH THE SPINE THAT MADE THE FLAGS.  `clean_opus`
    drops lines it judges junk; on kraken's filtered column text — which is
    already exactly the printed body lines — a dropped line would shift every
    offset after it, and `batch_cold` builds its spine with no cleaner at all.
    Pass `cleaner=lambda t: t` for a kraken-spined tranche.
    """
    opus_dir = opus_dir or (ROOT / 'raw' / 'opus')
    cleaner = cleaner or clean_opus
    out: dict[tuple[int, str], _Column] = {}
    pos = 0
    for p in pages:
        for c in ('L', 'R'):
            path = opus_dir / f'page-{p:03d}-{c}.txt'
            if not path.exists():
                continue
            cleaned = cleaner(path.read_text(encoding='utf-8'))
            stream, offs = canonical(cleaned)
            base = unicodedata.normalize('NFC', cleaned)
            out[(p, c)] = _Column(p, c, pos, stream, offs, base)
            pos += len(stream)
    return out


def _pages_of(records: list[dict]) -> list[int]:
    return sorted({int(r['page']) for r in records})


def _read_jsonl(path: Path | str) -> list[dict]:
    rows = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


# --- alignment helper (compare4's slicer, bound to one pair of strings) -----

def _aligned_slice(a: str, b: str, s: int, e: int) -> str | None:
    """Map a[s:e] onto the corresponding slice of b via SequenceMatcher.

    Returns None when the alignment cannot place the interval (caller must
    exclude rather than guess).
    """
    if s == e:
        return ''
    if s < 0 or e > len(a) or s > e:
        return None
    if a == b:
        return b[s:e]
    sm = SequenceMatcher(None, a, b, autojunk=False)
    ops = sm.get_opcodes()
    lo = hi = None
    for tag, i1, i2, j1, j2 in ops:
        if i1 <= s < i2 or (s == i2 and tag == 'equal'):
            lo = j1 + (s - i1 if tag == 'equal' else 0)
        if i1 < e <= i2:
            hi = j1 + (e - i1 if tag == 'equal' else (j2 - j1))
    if lo is None or hi is None:
        return None
    if hi < lo:
        return None
    return b[lo:hi]


# --- word spans in the original spaced text ---------------------------------

def _stream_range_for_orig(col: _Column, a: int, b: int) -> tuple[int, int] | None:
    """Column-local stream [ws, we) covering original base[a:b]."""
    idxs = [i for i, o in enumerate(col.offs) if a <= o < b]
    if not idxs:
        return None
    return idxs[0], idxs[-1] + 1


def _words_overlapping(col: _Column, local: int, frag_len: int,
                       latin: bool = False
                       ) -> list[tuple[int, int, int, int]] | None:
    """Word spans that touch the dispute.

    Each item is (orig_a, orig_b, stream_start, stream_end), column-local.
    Returns None on an unrecoverable geometry problem.
    """
    n = len(col.stream)
    if local < 0 or local > n:
        return None
    if frag_len == 0:
        # Insertion: pin to the character at/after the point.
        if n == 0:
            return None
        pin = min(local, n - 1)
        i0 = col.offs[pin]
        i1 = i0
    else:
        if local + frag_len > n:
            return None
        i0 = col.offs[local]
        i1 = col.offs[local + frag_len - 1] + 1

    base = col.base
    # Maximal word-char runs that overlap [i0, i1). For a pure insertion
    # (i0 == i1) take the word containing i0, or the one ending at i0.
    spans: list[tuple[int, int]] = []
    i = 0
    while i < len(base):
        if not is_word_char(base[i], latin):
            i += 1
            continue
        j = i
        while j < len(base) and is_word_char(base[j], latin):
            j += 1
        if frag_len == 0:
            if i <= i0 <= j:
                spans.append((i, j))
        elif j > i0 and i < i1:
            spans.append((i, j))
        i = j

    out: list[tuple[int, int, int, int]] = []
    for a, b in spans:
        sr = _stream_range_for_orig(col, a, b)
        if sr is None:
            continue
        ws, we = sr
        out.append((a, b, ws, we))
    return out


def _usable_word(cand: str) -> bool:
    """Long enough that an arbitrator sees a word, not a one-character frag.

    skeleton('ȣ') is 'ου' (length 2) after ligature expansion, but the form
    itself is still one character and fails the oracle's WORD gate. Require
    both the written form and its letter skeleton to be length ≥ 2.
    """
    return bool(cand) and len(cand) >= 2 and len(skeleton(cand)) >= 2


def _splice_word(opus_word: str, d0: int, d1: int, frag: str,
                 latin: bool = False) -> str | None:
    """Replace opus_word[d0:d1] with frag. Refuse non-word results."""
    if d0 < 0 or d1 > len(opus_word) or d0 > d1:
        return None
    if frag and not all(is_word_char(c, latin) for c in frag):
        return None
    cand = opus_word[:d0] + frag + opus_word[d1:]
    if not cand or not all(is_word_char(c, latin) for c in cand):
        return None
    if not _usable_word(cand):
        return None
    return unicodedata.normalize('NFC', cand)


def _classify(forms: list[str]) -> str:
    if len({skeleton(w) for w in forms}) > 1:
        return 'letters'
    br = {breathing_of(w) for w in forms}
    ac = {accent_key(w) for w in forms}
    if len(br) > 1 and len(ac) == 1:
        return 'breathing-only'
    if len(br) == 1 and len(ac) > 1:
        return 'accent-only'
    # both breathing and accent, or some other mark (diaeresis, iota sub.)
    return 'marks-only'


# --- per-site reconstruction ------------------------------------------------

def _site_words(rec: dict, cols: dict[tuple[int, str], _Column],
                latin: bool = False) -> tuple[list[dict], Exclusion | None]:
    """Expand one flag record into zero or more per-word reconstructions.

    Each success dict: page, col, word_off (column-local), spine_off (batch),
    readers {name: word}, d0/d1 (dispute inside the opus word), site.
    """
    page, col_name = int(rec['page']), rec['col']
    col = cols.get((page, col_name))
    if col is None:
        return [], Exclusion(page, col_name, rec.get('spine_off', 0),
                             'missing_column', rec.get('opus') or '')

    local = int(rec['spine_off']) - col.start
    opus_frag = rec.get('opus') or ''
    if local < 0 or local + len(opus_frag) > len(col.stream):
        return [], Exclusion(page, col_name, rec['spine_off'],
                             'off_oob', opus_frag)
    if col.stream[local:local + len(opus_frag)] != opus_frag:
        return [], Exclusion(page, col_name, rec['spine_off'],
                             'opus_mismatch', opus_frag)

    spans = _words_overlapping(col, local, len(opus_frag), latin)
    if spans is None:
        return [], Exclusion(page, col_name, rec['spine_off'],
                             'bad_geometry', opus_frag)
    if not spans:
        # The reason has to say which class was applied. Under `latin` the
        # site is not in a word of EITHER alphabet — digits, punctuation, a
        # bare siglum — and reporting that as `not_greek_word` would read as
        # "Latin was never looked at", which is the opposite of the truth.
        return [], Exclusion(page, col_name, rec['spine_off'],
                             'not_a_word' if latin else 'not_greek_word',
                             opus_frag)

    # Reader fragments for the full dispute region.
    frags = {name: rec[name] for name in READERS if name in rec}
    # Opus is authoritative for the spine slice.
    frags['opus'] = opus_frag

    results: list[dict] = []
    for _oa, _ob, ws, we in spans:
        opus_word = col.stream[ws:we]
        if not _usable_word(opus_word):
            continue
        if not all(is_word_char(c, latin) for c in opus_word):
            continue

        # Overlap of the dispute with this word, in column-local stream coords.
        ov_s = max(local, ws)
        ov_e = min(local + len(opus_frag), we)
        if ov_s >= ov_e and len(opus_frag) > 0:
            continue
        d0 = ov_s - ws
        d1 = ov_e - ws
        # Indices into opus_frag for the portion that lands in this word.
        rel_s = ov_s - local
        rel_e = ov_e - local

        readers: dict[str, str] = {}
        for name, frag in frags.items():
            if name == 'opus':
                readers['opus'] = unicodedata.normalize('NFC', opus_word)
                continue
            if frag is None:
                continue
            # Map the word's share of the dispute onto this reader's fragment.
            if len(opus_frag) == 0:
                piece: str | None = frag  # pure insertion
            elif rel_s == 0 and rel_e == len(opus_frag):
                piece = frag
            else:
                piece = _aligned_slice(opus_frag, frag, rel_s, rel_e)
            if piece is None:
                continue
            got = _splice_word(opus_word, d0, d1, piece, latin)
            if got is not None:
                readers[name] = got

        if 'opus' not in readers:
            continue
        if len(readers) < 2:
            continue
        if len(set(readers.values())) < 2:
            # Every reconstructable reader agrees on the full word — this
            # site's disagreement was outside this word (multi-word region).
            continue
        results.append({
            'page': page,
            'col': col_name,
            'word_off': ws,
            'spine_off': col.start + ws,
            'readers': readers,
            'd0': d0,
            'd1': d1,
            'site': rec,
        })

    if not results:
        return [], Exclusion(page, col_name, rec['spine_off'],
                             'no_word_dispute', opus_frag)
    return results, None


# --- join sites that share a word -------------------------------------------

def _piece_from_solo(opus_w: str, d0: int, d1: int, solo: str) -> str | None:
    """Recover the spliced mid-piece from a site-local full-word reconstruction."""
    left, right = opus_w[:d0], opus_w[d1:]
    if not solo.startswith(left):
        return None
    if right:
        if not solo.endswith(right):
            return None
        return solo[len(left):-len(right)]
    return solo[len(left):]


def _merge_word_sites(sites: list[dict],
                      latin: bool = False) -> WordFlag | Exclusion:
    """Combine character-level reconstructions that share (page, col, word_off).

    ⚠ `latin` MUST MATCH `_site_words`. This function re-checks the merged word
    against the character class, and a Greek-only check here throws away every
    Latin reconstruction that `_site_words` just built — leaving `opus` alone,
    which then falls out as `merge_no_dispute`. It cost 99 sites on 107-117 and
    made carding the Latin look like it had gained five cards.
    """
    base = max(sites, key=lambda s: len(s['readers']['opus']))
    opus_w = base['readers']['opus']
    page, col = base['page'], base['col']
    word_off = base['word_off']
    spine_off = base['spine_off']

    if any(s['readers'].get('opus') != opus_w for s in sites):
        return Exclusion(page, col, sites[0]['site']['spine_off'],
                         'opus_word_conflict', opus_w)

    ordered = sorted(sites, key=lambda s: s['d0'])
    cur = 0
    for s in ordered:
        if s['d0'] < cur:
            return Exclusion(page, col, s['site']['spine_off'],
                             'overlapping_sites', opus_w)
        cur = s['d1']

    names: set[str] = set()
    for s in sites:
        names |= set(s['readers'])

    # Start from the Opus word; apply each site's mid-piece left-to-right.
    # The piece is recovered from the site-local solo reconstruction so a
    # multi-site word (two mark fights in one lemma) stays well-defined.
    merged: dict[str, str] = {'opus': opus_w}
    for name in names:
        if name == 'opus':
            continue
        working = opus_w
        shift = 0
        touched = False
        ok = True
        for s in ordered:
            if name not in s['readers']:
                continue
            piece = _piece_from_solo(opus_w, s['d0'], s['d1'], s['readers'][name])
            if piece is None:
                ok = False
                break
            d0, d1 = s['d0'] + shift, s['d1'] + shift
            working = working[:d0] + piece + working[d1:]
            shift += len(piece) - (s['d1'] - s['d0'])
            touched = True
        if not ok or not touched:
            continue
        if (working and all(is_word_char(c, latin) for c in working)
                and _usable_word(working)):
            merged[name] = unicodedata.normalize('NFC', working)

    if len(merged) < 2 or len(set(merged.values())) < 2:
        return Exclusion(page, col, sites[0]['site']['spine_off'],
                         'merge_no_dispute', opus_w)

    return WordFlag(
        page=page,
        col=col,
        word_off=word_off,
        readers=merged,
        kind=_classify(list(merged.values())),
        n_sites=len(sites),
        spine_off=spine_off,
    )


# --- public API -------------------------------------------------------------

def report(path: Path | str,
           opus_dir: Path | None = None,
           cleaner=None,
           latin: bool = False) -> Report:
    """Full join of a flags JSONL file: word disputes + exclusions."""
    records = _read_jsonl(path)
    pages = _pages_of(records)
    cols = _load_columns(pages, opus_dir=opus_dir, cleaner=cleaner)

    per_word: dict[tuple[int, str, int], list[dict]] = defaultdict(list)
    excluded: list[Exclusion] = []

    for rec in records:
        parts, ex = _site_words(rec, cols, latin)
        if ex is not None and not parts:
            excluded.append(ex)
            continue
        for p in parts:
            key = (p['page'], p['col'], p['word_off'])
            per_word[key].append(p)

    words: list[WordFlag] = []
    for sites in per_word.values():
        got = _merge_word_sites(sites, latin)
        if isinstance(got, Exclusion):
            excluded.append(got)
        else:
            words.append(got)

    words.sort(key=lambda w: (w.page, w.col, w.word_off))
    return Report(words=words, excluded=excluded, n_sites=len(records))


def words(path: Path | str,
          opus_dir: Path | None = None,
          cleaner=None,
          latin: bool = False) -> list[WordFlag]:
    """Word-level disputes from a flags JSONL file. Exclusions are dropped."""
    return report(path, opus_dir=opus_dir, cleaner=cleaner, latin=latin).words


def classify_site_readers(readers: dict[str, str]) -> str:
    """Public classify for tests: letters / marks-only / breathing-only / accent-only."""
    return _classify(list(readers.values()))
