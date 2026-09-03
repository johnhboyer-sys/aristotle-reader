"""Turn a cold tranche's flags into the card queue `settle_review` serves.

    python3 -m bonitz_pipeline.cold_queue \
        --flags work/kraken15-102/flags4-107-117.jsonl \
        --spine-dir work/kraken15-102/txt107-117 \
        --out work/kraken15-102/queue-107-117.json

`apply_settled` builds the same queue for the Opus panel, but only after the
arbitrators have settled what they can — and it reads `raw/opus`, which a cold
tranche does not have.  Here every word dispute goes to John, because there is
no spine he has already accepted: the tranche exists to BUILD the ground truth,
not to correct one.

Cards group by form-set, which is what makes the sitting finite — 22 columns of
disagreement collapse to a few hundred distinct questions, and one ruling
answers every site that prints the same form.

⚠ The spine is kraken round 6, not Opus, and it lands in the queue under the
key `readers.opus` because that is the key `settle_review` and `word_flags`
require.  `spine_reader` travels with the queue so the page can label it
honestly; a card that says "Opus" over a kraken reading would be a lie about
who read the ink.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from bonitz_pipeline import word_flags as wf
from bonitz_pipeline.normalize import canonical


def _column_index(spine_dir: Path, page: int, col: str) -> tuple[str, list[int]]:
    text = (spine_dir / f'page-{page:03d}-{col}.txt').read_text(encoding='utf-8')
    base = unicodedata.normalize('NFC', text)
    _, offs = canonical(text)
    return base, offs


# Regions that must never become a card, and why.
#
# `soft` — the panel's own verdict that every reader reads the SAME once
# ligature and encoding folding is applied. `ȣϗ̀` against genie's `ουκαὶ` is
# genie spelling out both ligatures; there is no dispute in the ink and
# nothing to rule. 241 of the 896 regions on 107-117 are this, and putting
# them to John asks him to adjudicate an encoding.
#
# `spans_word` — the region crosses a printed word boundary, so the reader's
# alternative is TWO spine words run together. Spliced back into the first
# word it produced `χρόνȣ → χρόνουκαὶ`: not a competing reading, not a word.
# These need a proper two-word treatment; until they have one they are
# reported, never offered.
SKIP_CLASSES = ('soft',)


def build(flags: Path, spine_dir: Path, spine_reader: str = 'kraken-r6',
          alto_dirs: list[Path] | None = None,
          include_all: bool = False, latin: bool = False) -> dict:
    """`include_all` keeps the regions no card is built from.

    Not for a sitting — for LOOKUP. John can exclude a site from a card that a
    later filter removes, and that exclude then points at nothing. His click is
    evidence about the ink and outranks the filter's opinion that there was
    nothing there, so the site has to remain findable.
    """
    # ⚠ REFUSE AN ALREADY-CARDED INPUT. This function names its output
    # `stem + '-carded.jsonl'`, so handed its own output it appends again and
    # writes a byte-identical TWIN rather than overwriting. The twin then sits
    # in the directory and every later glob of `*-carded.jsonl` counts that
    # tranche twice — 9,362 rows where there were 8,801, and a printed site
    # list that repeated each entry in plain view.
    #
    # It happened on 2026-08-29, was diagnosed on 2026-08-31, and was
    # committed AGAIN the next morning by a loop whose glob picked up the
    # files the previous pass had just written. Documenting a footgun does not
    # disarm it, so this refuses instead.
    if flags.name.endswith('-carded.jsonl'):
        sys.exit(f'{flags} is already a carded file — carding it again writes '
                 f'a twin rather than overwriting, and every later glob then '
                 f'counts this tranche twice. Pass the source flags instead.')
    rows = [json.loads(l) for l in flags.read_text(
        encoding='utf-8').splitlines() if l.strip()]
    keep, dropped = [], {'soft': 0, 'spans_word': 0}
    for r in rows:
        if not include_all and r.get('cls') in SKIP_CLASSES:
            dropped['soft'] += 1
            continue
        if not include_all and r.get('spans_word'):
            dropped['spans_word'] += 1
            continue
        keep.append(r)
    kept_path = flags.with_name(flags.stem + '-carded.jsonl')
    kept_path.write_text(
        ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in keep),
        encoding='utf-8')

    # No cleaner: `batch_cold` builds its spine from the filtered column text
    # untouched, and every offset in the flags file counts from that.
    rep = wf.report(kept_path, opus_dir=spine_dir, cleaner=lambda t: t,
                    latin=latin)

    groups: dict[tuple[str, ...], list[wf.WordFlag]] = defaultdict(list)
    for w in rep.words:
        forms = tuple(sorted({unicodedata.normalize('NFC', v)
                              for v in w.readers.values() if v}))
        groups[forms].append(w)

    cache: dict[tuple[int, str], tuple[str, list[int]]] = {}
    entries: list[dict] = []
    # Cheapest first: the form-set that answers the most sites at once.
    for forms in sorted(groups, key=lambda f: (-len(groups[f]), f)):
        for w in sorted(groups[forms], key=lambda x: (x.page, x.col, x.word_off)):
            key = (w.page, w.col)
            if key not in cache:
                cache[key] = _column_index(spine_dir, w.page, w.col)
            base, offs = cache[key]
            line, char_at = 0, -1
            if 0 <= w.word_off < len(offs):
                base_off = offs[w.word_off]
                line = base[:base_off].count('\n') + 1
                char_at = base_off - (base.rfind('\n', 0, base_off) + 1)
            entries.append({
                'page': w.page,
                'col': w.col,
                'line': line,
                'word_off': w.word_off,
                'char_at': char_at,
                'readers': dict(w.readers),
                'kind': w.kind,
                'reason': f'cold:{w.kind}',
                'forms': list(forms),
                'form_set': list(forms),
                'n_same_form_set': len(groups[forms]),
            })

    # ⚠ EXCLUSIONS ARE WRITTEN OUT, NEVER JUST COUNTED. `not_greek_word` is
    # where the Bekker citations, the work sigla AND — until `latin` — the
    # whole Latin apparatus live: the classes this project has found real
    # errors in. A queue that quietly drops half its sites reads as "nothing
    # to see" when nothing looked.
    excluded = [{'page': e.page, 'col': e.col, 'spine_off': e.spine_off,
                 'reason': e.reason, 'spine': e.opus} for e in rep.excluded]

    return {
        'n_regions': len(rows),
        'n_not_carded': dropped,
        # The FILTERED ALTO — one line per printed line, the same lines the
        # spine holds. Cropping against the raw read risks landing on a gutter
        # digit the filter dropped, which is a crop of the wrong ink.
        'alto_dirs': [str(d) for d in (alto_dirs or [])],
        'excluded': excluded,
        'source_flags': str(flags),
        'alphabet': 'greek+latin' if latin else 'greek',
        'spine_reader': spine_reader,
        'spine_dir': str(spine_dir),
        'n_sites': rep.n_sites,
        'n_words': len(rep.words),
        'n_excluded': len(rep.excluded),
        'n_distinct_decisions': len(groups),
        'entries': entries,
    }


def dispute_signature(entry: dict) -> tuple:
    """What this site actually DISPUTES, independent of which word it is in.

    `Λακεδαιμονίȣς / Λακεδαιμονίους` and `καλȣ́μεναι / καλούμεναι` are the same
    question — the ou-ligature against ου spelled out — asked of two words.
    Grouped by byte-identical FORM they are two cards; grouped by the
    substitution they are one, and one look at nineteen crops answers all of
    them.
    """
    import difflib
    spine = unicodedata.normalize('NFC', entry['readers'].get('opus', ''))
    subs = set()
    for name, v in entry['readers'].items():
        if name == 'opus':
            continue
        v = unicodedata.normalize('NFC', v)
        if v == spine:
            continue
        sm = difflib.SequenceMatcher(None, spine, v, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag != 'equal':
                subs.add((spine[i1:i2], v[j1:j2]))
    return (entry.get('kind', ''), tuple(sorted(subs)))


def bundle(queue: Path, rulings: Path) -> dict:
    """Group the UNANSWERED sites by dispute; leave every answered card alone.

    ⚠ AN ANSWERED CARD KEEPS ITS IDENTITY. Re-keying a card John has ruled
    orphans the ruling ([[carry-rulings-by-site]]) — his answer belongs to the
    site, and a rebuild that renames the card costs a sitting. So only sites
    with no ruling are re-grouped, and a dispute that occurs once stays exactly
    the card it already was.
    """
    doc = json.loads(queue.read_text(encoding='utf-8'))
    entries = doc['entries'] if isinstance(doc, dict) else doc
    store = (json.loads(rulings.read_text(encoding='utf-8'))
             if rulings.exists() else {})

    def form_sid(e):
        return 'forms:' + '|'.join(sorted(e['form_set']))

    groups: dict[tuple, list[dict]] = defaultdict(list)
    out: list[dict] = []
    for e in entries:
        if e.get('card_sid') or form_sid(e) in store:
            out.append(e)                       # answered, or already its own
            continue
        groups[dispute_signature(e)].append(e)

    n_bundled = 0
    for (kind, subs), members in sorted(groups.items(),
                                        key=lambda kv: (-len(kv[1]), str(kv[0]))):
        if len(members) < 2 or not subs:
            out.extend(members)                 # a dispute of one is its card
            continue
        n_bundled += 1
        label = ' · '.join(f'{a or "∅"} → {b or "∅"}' for a, b in subs)
        sid = 'dispute:' + kind + ':' + '|'.join(f'{a}>{b}' for a, b in subs)
        for e in members:
            spine = unicodedata.normalize('NFC', e['readers'].get('opus', ''))
            # What THIS site becomes if the substitution is accepted: its own
            # alternative reading, never the bundle's exemplar word.
            becomes = next(
                (unicodedata.normalize('NFC', v)
                 for n, v in e['readers'].items()
                 if n != 'opus' and unicodedata.normalize('NFC', v) != spine),
                '')
            out.append({**e, 'card_sid': sid, 'becomes': becomes,
                        'n_same_form_set': len(members),
                        'bundle': {'kind': kind, 'label': label,
                                   'subs': [list(x) for x in subs]}})

    new = dict(doc) if isinstance(doc, dict) else {}
    new['entries'] = out
    new['n_bundles'] = n_bundled
    new['n_distinct_decisions'] = len({e.get('card_sid') or form_sid(e)
                                       for e in out})
    return new


def followup(rulings: Path, queue: Path, *extra: Path) -> dict:
    """A card of its own for every site an exclude pulled out of a group.

    ⚠ AN EXCLUDE THAT GOES NOWHERE IS A LOST SITE. It is the click that makes a
    group ruling safe — John excluded or none-d every site whose ink differed
    across the ligature sitting — and the site it removes is then answered by
    nobody. It has to come back as its own question, carrying WHY it was set
    aside, or the exclude quietly turns "this one is different" into silence.

    Keyed by SITE, never by form-set: the group card already owns that key, and
    a follow-up sharing it would overwrite the ruling it was excluded from.
    """
    store = json.loads(rulings.read_text(encoding='utf-8')) if rulings.exists() else {}
    doc = json.loads(queue.read_text(encoding='utf-8'))
    entries = doc['entries'] if isinstance(doc, dict) else doc

    by_site = {}
    # The live queue first, then the wider ones: a site John excluded from a
    # card a filter later removed is still a site he looked at and set apart.
    for src in (queue, *extra):
        d = json.loads(src.read_text(encoding='utf-8'))
        for e in (d['entries'] if isinstance(d, dict) else d):
            sid = f"page-{e['page']:03d}-{e['col']}:{e['line']}:{e['word_off']}"
            by_site.setdefault(sid, e)

    out, missing = [], []
    for card_sid, entry in sorted(store.items()):
        for site in entry.get('excluded') or ():
            e = by_site.get(site)
            if e is None:
                # Never a silent drop: a site excluded and then unfindable is
                # exactly the loss this function exists to prevent.
                missing.append((card_sid, site))
                continue
            forms = card_sid[len('forms:'):].split('|') if \
                card_sid.startswith('forms:') else e['forms']
            gone = card_sid not in {
                x.get('card_sid') or 'forms:' + '|'.join(sorted(x['form_set']))
                for x in entries}
            # ⚠ DROP THE BUNDLE. A follow-up is ONE site, and it exists
            # because its ink was NOT like the rest of that card — so it must
            # be asked as its own word, not handed the group's substitution
            # again. Two of the first four came back answered `bundle:keep`
            # and `bundle:ι>`, which record what the group would have done
            # rather than what this site reads.
            out.append({**{k: v for k, v in e.items() if k != 'bundle'},
                        'card_sid': f'site:{site}',
                        'n_same_form_set': 1,
                        'note': (f'excluded from the group ruling on '
                                 f'{" / ".join(forms)} — its ink read '
                                 f'differently from the rest of that card, so '
                                 f'it is asked on its own'
                                 + (' · that card has since been filtered out '
                                    'of the queue; YOUR EXCLUDE IS WHY THIS '
                                    'SITE IS STILL BEING ASKED'
                                    if gone else '')),
                        })
    if missing:
        raise SystemExit('excluded sites with no entry in the queue: '
                         + ', '.join(f'{c}->{s}' for c, s in missing))
    return {'source_rulings': str(rulings), 'source_queue': str(queue),
            'n_distinct_decisions': len(out), 'entries': out}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--flags', type=Path)
    p.add_argument('--followup', type=Path,
                   help='build the excluded-site queue from this rulings store '
                        'instead of from flags')
    p.add_argument('--from-queue', type=Path, action='append', default=[],
                   help='the queue those exclusions were recorded against; '
                        'repeatable — later ones are lookup only')
    p.add_argument('--include-all', action='store_true',
                   help='keep the regions no card is built from (lookup only)')
    p.add_argument('--latin', action='store_true',
                   help="card Bonitz's Latin too. Without it every Latin word "
                        'is excluded as `not_greek_word` before a card exists '
                        '— 234 sites on 107-117, and the tranche\'s remaining '
                        'reader damage is almost all in them')
    p.add_argument('--bundle', type=Path,
                   help='regroup the UNANSWERED sites of --from-queue by '
                        'dispute, against this rulings store')
    p.add_argument('--spine-dir', type=Path)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--spine-reader', default='kraken-r6')
    p.add_argument('--alto-dir', type=Path, action='append', default=[],
                   help='filtered ALTO for these columns; repeatable')
    a = p.parse_args(argv)

    if a.bundle:
        if not a.from_queue:
            raise SystemExit('--bundle needs --from-queue')
        doc = bundle(a.from_queue[0], a.bundle)
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                         encoding='utf-8')
        print(f"{doc['n_bundles']} dispute bundle"
              f"{'s' if doc['n_bundles'] != 1 else ''} · "
              f"{doc['n_distinct_decisions']} cards -> {a.out}")
        return 0

    if a.followup:
        if not a.from_queue:
            raise SystemExit('--followup needs --from-queue')
        doc = followup(a.followup, *a.from_queue)
        src = json.loads(a.from_queue[0].read_text(encoding='utf-8'))
        for k in ('spine_reader', 'spine_dir', 'alto_dirs'):
            if isinstance(src, dict) and k in src:
                doc[k] = src[k]
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                         encoding='utf-8')
        print(f"{doc['n_distinct_decisions']} excluded site"
              f"{'s' if doc['n_distinct_decisions'] != 1 else ''} -> {a.out}")
        return 0

    if not a.flags or not a.spine_dir:
        raise SystemExit('--flags and --spine-dir are required unless '
                         '--followup is given')
    doc = build(a.flags, a.spine_dir, a.spine_reader, a.alto_dir,
                include_all=a.include_all, latin=a.latin)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                     encoding='utf-8')
    print(f"{doc['n_sites']} sites -> {doc['n_words']} word disputes "
          f"({doc['n_excluded']} excluded) -> "
          f"{doc['n_distinct_decisions']} cards -> {a.out}")
    for reason, n in doc['n_not_carded'].items():
        why = {'soft': 'every reader reads the same once ligature and encoding '
                       'folding is applied — nothing to rule',
               'spans_word': 'the region crosses a word boundary; the '
                             'alternative would be two words run together'}
        print(f'  not carded {n:5d}  {reason}  ← {why[reason]}')
    from collections import Counter
    for reason, n in Counter(e['reason'] for e in doc['excluded']).most_common():
        note = {'not_greek_word': '  ← citations, sigla, punctuation AND ALL '
                                   'LATIN; none is ruled by this queue',
                'not_a_word': '  ← citations, sigla and punctuation; not a '
                              'word in either alphabet',
                }.get(reason, '')
        print(f'  excluded {n:5d}  {reason}{note}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
