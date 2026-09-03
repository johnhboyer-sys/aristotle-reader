"""Ask the lexicon about the disagreements the vote threw away.

    python3 -m bonitz_pipeline.quiet_disputes --flags 'work/kraken15-102/flags4-*-carded.jsonl' \
        --pages 118-281 --out work/quiet-breathings-118-281.json

⚠ THE PANEL CANNOT SEE A BREATHING. `normalize.fold` strips every combining
mark before the tally, on purpose — otherwise an acute against a grave would
flag on every other word. The cost is that a rough/smooth disagreement can
NEVER reach a card on its own: the readers fold to the same string, the region
scores `soft` or `majority-spine`, and nobody is ever asked. 096-R on pages
63-102 is the worked example — the spine read smooth `ȣ̓́τω`, which is not a
word, kraken and genie both read rough, and the fold erased both dissents
before the vote. `breathing_oracle`'s own docstring names this: "the same
blindness as fold()".

So this walks the UNFLAGGED rows and hands the ones with a breathing
disagreement to the oracle, which does not vote — it looks the word up.

⚠ AND UNFLAGGED IS NOT UNCARDED. Measured 2026-08-31, AFTER this module first
claimed otherwise: `cold_queue.build` drops only `cls == 'soft'` and
`spans_word`, NOT `flag == False`, so an unflagged majority-spine row is
carded like any other. Of the 71 sites this module finds on 118-281, 66 are
already queue entries and 32 sit on cards John has ruled. The residue is 34
queued but unruled, and FIVE that reach no queue at all — every one of them a
one-token word where the whole dispute is the mark:

    124-L:14 ὅ·/ὃ·   180-R:15 ἢ/ἤ   193-L:43 ᾖ./ἡ.
    251-L:37 ἤ/ἢ     273-R:57 ᾖ/ἡ

which is `word_flags` declining a site whose word carries nothing but the
disputed mark. So the value here is PRIORITY and a lexical verdict, not
reachability. Saying otherwise was wrong, and the number that matters is 5.

⚠ BREATHING AND NOTHING ELSE. `arbitrate` returns a whole word, and its
evidence spells the ligature out as a LOOKUP KEY: on 118-281 it offered
`ϗ̀ -> ἐκ`, `τȣ́πισθεν -> τοὔπισθεν`, `τȣ͂ -> τῶ`. A caller that took those for
spellings would quietly rewrite Bonitz's ink — the exact misuse the oracle's
own ⚠ warns an applier against. The gate: strip the breathings from both
readings and refuse unless what is left is identical. It threw out 11 of 15.

⚠ AND ACCENTS ARE OUT OF SCOPE, so a proposal that also moves one is refused
even when it looks right. `Ἐβρος -> Ἕβρος` is probably correct and is still
held back here, because the oracle "does not reach accents" and a gate that
trusts it past its competence is not a gate.

⚠ THESE ARE CARDS, NOT CORRECTIONS. Rough in the ink is a transcription error;
smooth in the ink is Bonitz misprinting, which banks as a corrigendum and must
NOT be silently mended. Nothing here is applied — the ink decides.
"""

from __future__ import annotations

import argparse
import collections
import glob
import json
import sys
import unicodedata
from pathlib import Path

from .normalize import fold

ROUGH, SMOOTH = '̔', '̓'
VOTERS = ('genie', 'llama', 'calamari', 'kraken', 'paddle')


def breaths(s: str | None) -> tuple[str, ...]:
    return tuple(c for c in unicodedata.normalize('NFC', s or '')
                 if c in (ROUGH, SMOOTH)) or tuple(
        c for c in unicodedata.normalize('NFD', s or '')
        if c in (ROUGH, SMOOTH))


def without_breathings(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if c not in (ROUGH, SMOOTH))


def breathing_only(spine: str, proposed: str) -> bool:
    """True when the proposal moves a breathing and touches nothing else."""
    return (without_breathings(spine) == without_breathings(proposed)
            and spine != proposed)


def readings_for(row: dict) -> dict[str, str] | None:
    """{reader: whole word}, or None where this row cannot pose the question.

    The flags carry a character-level fragment and the spine's whole word; a
    reader's word is that word with the fragment swapped. An ambiguous
    fragment — one appearing twice in the word — is dropped rather than
    guessed at, because the wrong occurrence builds a word nobody read.
    """
    word, frag = row.get('word') or '', row.get('opus') or ''
    if not word or not frag or word.count(frag) != 1:
        return None
    out = {'spine': word}
    differs = False
    for v in VOTERS:
        f = row.get(v)
        if not f or not f.strip():
            continue
        out[v] = word.replace(frag, f)
        if breaths(f) != breaths(frag):
            differs = True
    return out if differs and len(set(out.values())) > 1 else None


def marks(s: str | None) -> collections.Counter:
    return collections.Counter(
        c for c in unicodedata.normalize('NFD', s or '')
        if unicodedata.combining(c))


def mark_conflicts(rows: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """Unflagged sites where a reader has a DIFFERENT mark from the spine.

    ⚠ LOSING A MARK IS NOT DISPUTING IT. On 118-281, 1,500 unflagged rows are
    a reader shedding diacritics wholesale — 1,444 of them llama, which is a
    known property of the Latin pair and testimony about the reader, not about
    the word. Counting those as disagreement buries the 75 that are real under
    twenty times their number of noise, which is the complaint against genie
    and llama in the first place.

    So a row counts only when the reader's marks are neither a subset nor a
    superset of the spine's: it has a mark the spine lacks AND lacks one the
    spine has. `αὑτȣ̀ς` against `αὐτȣ̀ς` is that; `ȣ` against `ȣ͂` is not.

    ⚠ AND NOTHING HERE HAS AN ARBITER. `breathing_oracle` is silent on most of
    them because both readings are real Greek — αὑτούς and αὐτούς both exist,
    and a lexicon that picked one would be guessing. These go to John.
    """
    out, noise = [], collections.Counter()
    for r in rows:
        if r.get('flag'):
            continue
        sp = r.get('opus') or ''
        for v in VOTERS:
            got = r.get(v)
            if not got or not got.strip() or got == sp:
                continue
            if fold(got) != fold(sp):
                continue                   # the vote saw this one
            ms, mg = marks(sp), marks(got)
            if ms == mg:
                continue
            if not (mg - ms) or not (ms - mg):
                noise[v] += 1
            else:
                out.append({'page': r['page'], 'col': r['col'],
                            'line': r.get('line'), 'reader': v,
                            'spine': sp, 'reading': got,
                            'word': r.get('word'), 'ctx': r.get('ctx', '')})
            break
    return out, dict(noise)


def scan(rows: list[dict], arbitrate) -> tuple[list[dict], list[dict]]:
    kept, refused = [], []
    for r in rows:
        if r.get('flag'):
            continue                      # already going to John
        readings = readings_for(r)
        if not readings:
            continue
        try:
            got = arbitrate(readings)
        except Exception:
            continue
        if not got or got[0] == readings['spine']:
            continue
        rec = {'page': r['page'], 'col': r['col'], 'line': r.get('line'),
               'spine': readings['spine'], 'oracle': got[0], 'why': got[1],
               'ctx': r.get('ctx', '')}
        (kept if breathing_only(readings['spine'], got[0])
         else refused).append(rec)
    return kept, refused


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--flags', required=True, help='glob of carded jsonl')
    p.add_argument('--pages', default='118-281')
    p.add_argument('--out', type=Path)
    p.add_argument('--marks', action='store_true',
                   help='also list mark conflicts no lexicon '
                        'can arbitrate')
    a = p.parse_args(argv)

    from .breathing_oracle import arbitrate

    lo, hi = (int(x) for x in a.pages.split('-'))
    rows, seen = [], set()
    for f in sorted(glob.glob(a.flags)):
        for line in open(f, encoding='utf-8'):
            r = json.loads(line)
            if not (lo <= r['page'] <= hi):
                continue
            # ⚠ THE GLOB CAN MATCH THE SAME TRANCHE TWICE. `cold_queue.build`
            # writes `stem + '-carded.jsonl'`, so running it on an
            # already-carded file makes a byte-identical TWIN rather than
            # overwriting: work/kraken15-102 holds
            # flags4-118-127-carded-carded.jsonl at the same md5 as its
            # parent. Every count taken over `*-carded.jsonl` before
            # 2026-08-31 counted pages 118-127 twice — 9,362 rows where there
            # are 8,801, and the printed site list repeated each 118-127
            # entry in plain view.
            k = (r['page'], r['col'], r.get('spine_off'), r.get('word'),
                 r.get('opus'))
            if k in seen:
                continue
            seen.add(k)
            rows.append(r)

    kept, refused = scan(rows, arbitrate)
    print(f'{len(rows)} carded rows on {a.pages}')
    print(f'{len(kept)} breathing-only questions the panel could not raise')
    print(f'{len(refused)} refused — the oracle changed more than the '
          f'breathing\n')
    for r in kept:
        print(f"  {r['page']}-{r['col']}:{r['line']}  {r['spine']} -> "
              f"{r['oracle']}\n        {r['why']}")
    if refused:
        print('\nrefused:')
        for r in refused:
            print(f"  {r['page']}-{r['col']}:{r['line']}  {r['spine']!r} -> "
                  f"{r['oracle']!r}")
    conflicts: list[dict] = []
    if a.marks:
        conflicts, noise = mark_conflicts(rows)
        print(f'\n{sum(noise.values())} unflagged rows are a reader losing or '
              f'adding marks wholesale, which is testimony about the reader: '
              f'{noise}')
        print(f'{len(conflicts)} are a GENUINE mark conflict the vote could '
              f'not see, and no lexicon can arbitrate them:')
        for c in conflicts[:30]:
            print(f"  {c['page']}-{c['col']}:{c['line']}  spine "
                  f"{c['spine']!r}  {c['reader']} {c['reading']!r}  "
                  f"word={c['word']!r}")

    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps({'pages': a.pages, 'questions': kept,
                                     'refused': refused,
                                     'mark_conflicts': conflicts},
                                    ensure_ascii=False, indent=1) + '\n',
                         encoding='utf-8')
        print(f'\n-> {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
