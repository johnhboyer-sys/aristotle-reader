import json
import os
from pathlib import Path

import pytest

from bonitz_pipeline import space_policy
from bonitz_pipeline import batch4, compare3, compare4
from bonitz_pipeline.normalize import (
    canonical,
    clean_llamaparse,
    clean_opus,
)
from bonitz_pipeline.reconcile import reconcile


ROOT = Path(__file__).resolve().parent.parent
BATCHES = ((63, 99), (100, 102))


def _rulings():
    rows = []
    path = ROOT / 'work/audit/rulings-063-102.tsv'
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        fields = line.split('\t')
        rows.append({
            'card': int(fields[0]),
            'opus': fields[1],
            'ruling': fields[2],
            'sites': fields[3].split(),
            'excluded': fields[4].split(),
        })
    return rows


@pytest.fixture(scope='module')
def committed_regions():
    records = []
    source_by_col = {}
    for lo, hi in BATCHES:
        columns = []
        sources = {}
        for page in range(lo, hi + 1):
            for col in ('L', 'R'):
                raw = (ROOT / f'raw/opus/page-{page:03d}-{col}.txt').read_text(
                    encoding='utf-8'
                )
                cleaned = clean_opus(raw)
                stream, offsets = canonical(cleaned)
                columns.append((page, col, stream))
                sources[(page, col)] = (cleaned, offsets)
                source_by_col[(page, col)] = (cleaned, stream, offsets)
        _, segs = compare3.build_spine(columns)
        starts = {(seg.page, seg.col): seg.start for seg in segs}
        path = ROOT / f'work/flags4-{lo:03d}-{hi:03d}.jsonl'
        batch = [json.loads(line) for line in path.read_text(
            encoding='utf-8'
        ).splitlines()]
        compare4.add_locations(batch, segs, sources)
        for record in batch:
            key = (record['page'], record['col'])
            record['_local_off'] = record['spine_off'] - starts[key]
        records.extend(batch)
    return records, source_by_col


def _site_matches(row, records):
    matches = []
    for site in row['sites']:
        if site in row['excluded']:
            continue
        page_col, line = site.rsplit(':', 1)
        _, page, col = page_col.split('-')
        matches.extend(
            record for record in records
            if record['page'] == int(page)
            and record['col'] == col
            and record['line'] == int(line)
            and record['opus'] == row['opus']
        )
    return list({
        (record['page'], record['col'], record['spine_off']): record
        for record in matches
    }.values())


def test_compare4_finds_card_61_from_the_real_readers(capsys):
    pages = [78]
    columns = []
    sources = {}
    for col in ('L', 'R'):
        raw = (ROOT / f'raw/opus/page-078-{col}.txt').read_text(
            encoding='utf-8'
        )
        cleaned = clean_opus(raw)
        stream, offsets = canonical(cleaned)
        columns.append((78, col, stream))
        sources[(78, col)] = (cleaned, offsets)
    spine, segs = compare3.build_spine(columns)
    genie = batch4.locate_genie_slice(spine, batch4.genie400_stream(pages))
    llama_text = (ROOT / 'raw/llama400/page-078.md').read_text(
        encoding='utf-8'
    )
    llama, _ = canonical(clean_llamaparse(llama_text))
    readers = {
        'genie': genie,
        'llama': llama,
        'kraken': batch4.kraken_stream(pages),
    }

    records = compare4.compare(spine, segs, readers)
    compare4.add_locations(records, segs, sources)
    capsys.readouterr()
    card, = [
        record for record in records
        if record['page'] == 78
        and record['col'] == 'L'
        and record['line'] == 6
        and record['opus'] == 'όπκα'
    ]

    assert card['word'] == 'αὑτό'
    assert card['spans_word'] is True
    assert card['spans_line'] is False


def test_real_card_set_boundaries_and_source_slice_invariant(committed_regions):
    records, _ = committed_regions
    cards = [(row, _site_matches(row, records)) for row in _rulings()]

    assert len(cards) == 80
    assert all(matches for _, matches in cards)
    assert {
        row['card'] for row, matches in cards
        if any(record['spans_word'] for record in matches)
    } == {
        11, 12, 13, 14, 15, 16, 18, 33, 35, 36, 37, 39, 40, 41, 43,
        44, 45, 46, 47, 49, 50, 51, 54, 59, 60, 61, 66, 67, 68, 69,
        74, 77, 80,
    }
    assert {
        row['card'] for row, matches in cards
        if any(record['spans_line'] for record in matches)
    } == {15, 34, 39, 57}
    for record in records:
        if not record['spans_word'] and not record['spans_line']:
            assert canonical(record['source_opus'])[0] == record['opus']


def test_tsv_rulings_reproduce_the_committed_corpus(
    tmp_path,
    committed_regions,
):
    records, source_by_col = committed_regions
    changed = [row for row in _rulings() if row['ruling'] != row['opus']]
    selected = [(row, _site_matches(row, records)) for row in changed]
    assert [row['card'] for row, _ in selected] == [17, 23, 31, 61, 71, 75, 77]
    assert all(len(matches) == 1 for _, matches in selected)

    columns = []
    for page in range(63, 103):
        for col in ('L', 'R'):
            source = ROOT / f'raw/opus/page-{page:03d}-{col}.txt'
            target = tmp_path / f'raw/opus/page-{page:03d}-{col}.txt'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())
            stream = source_by_col[(page, col)][1]
            columns.append((page, col, stream))
    _, segs = compare3.build_spine(columns)
    starts = {(seg.page, seg.col): seg.start for seg in segs}

    flags_by_col = {}
    verdicts_by_col = {}
    for row, matches in selected:
        record = dict(matches[0])
        key = (record['page'], record['col'])
        record['spine_off'] = starts[key] + record.pop('_local_off')
        flags_by_col.setdefault(key, []).append(record)
        verdicts_by_col.setdefault(key, []).append({
            'ctx': record['ctx'],
            'verdict': row['ruling'],
            'agrees_with': 'human',
            'confidence': 'high',
            'note': f"card {row['card']}",
        })

    for (page, col), flags in flags_by_col.items():
        flag_path = tmp_path / f'work/flags-by-col/page-{page:03d}-{col}.json'
        verdict_path = tmp_path / f'work/adjudicated/page-{page:03d}-{col}.json'
        flag_path.parent.mkdir(parents=True, exist_ok=True)
        verdict_path.parent.mkdir(parents=True, exist_ok=True)
        flag_path.write_text(
            json.dumps(flags, ensure_ascii=False), encoding='utf-8'
        )
        verdict_path.write_text(
            json.dumps(verdicts_by_col[(page, col)], ensure_ascii=False),
            encoding='utf-8',
        )
        os.utime(flag_path, (1_000_000, 1_000_000))
        os.utime(verdict_path, (1_001_000, 1_001_000))

    edits, queue = reconcile(tmp_path, list(range(63, 103)))

    assert edits == 7
    assert queue == []
    # ⚠ THE CORPUS CARRIES ONE NORMALISATION THIS CHAIN DOES NOT PRODUCE, AND
    # IT IS NAMED RATHER THAN TOLERATED. `reconcile` replays Opus plus the
    # seven TSV rulings; John's editor-key ruling of 2026-08-13 (Latin editor
    # letters, GREEK work siglum) is a separate, corpus-wide step, recorded in
    # `work/rulings/john.json` as a policy and carried to these pages on
    # 2026-08-18. Applying it here keeps the comparison byte-for-byte instead
    # of loosening it to "close enough", and a DIFFERENT drift still fails.
    #
    # The rule is about what follows the Z: before a Greek letter it is a work
    # siglum; before anything else it is Zeller, Zeitschr or a Homeric book
    # letter, and untouched.
    # The rule has TWO limbs and both are the one ruling: the editor's letters
    # are Latin, the work siglum is Greek. `AZι` gets the zeta corrected;
    # `ΑΖγ` at page-094-L:21 was the mirror image, a GREEK alpha where the
    # editor's Latin A belongs.
    import json as _json
    import re as _re
    WORK_SIGLUM = _re.compile(r'Z(?=[Ͱ-Ͽἀ-῿])')      # Latin Z -> Greek Ζ
    EDITOR_A = _re.compile(r'Α(?=Ζ)')                  # Greek Α -> Latin A

    # ⚠ AND JOHN KEEPS RULING. Reconcile replays Opus plus the seven TSV
    # rulings; every site he rules AFTERWARDS moves the corpus and not the
    # reconstruction. Hardcoding each one here would mean this test breaks on
    # every sitting and gets "fixed" by pasting in whatever changed, which is
    # how a byte-for-byte guarantee quietly becomes a diff-of-the-day.
    #
    # So later rulings are read from the LEDGER — the record that already
    # exists — and their lines are exempted BY NAME. Everything else must
    # still match byte for byte, and the count of exemptions is asserted, so a
    # line drifting without a ruling behind it still fails.
    ledger = _json.loads((ROOT / 'work/rulings/john.json')
                         .read_text(encoding='utf-8'))['rulings']
    later = {(r['col'], r['line']) for r in ledger
             if r.get('kind') == 'text' and r.get('date', '') > '2026-08-17'
             and not r.get('reversed_by')
             and 63 <= int(r['col'].split('-')[1]) <= 102}

    # ⚠ AND THE SETTLE STORE IS A SECOND SOURCE OF RULINGS. `settle_apply`
    # writes John's card verdicts straight into the corpus and records them in
    # `work/sweeps/review-rulings.json`, not in the ledger — 58 edits landed
    # that way on 2026-08-18. Reading only the ledger would leave every one of
    # them looking like unexplained drift. The queue says which SITES each
    # form-set card binds, so an `accept` names its own lines.
    # ⚠ EVERY SETTLE SITTING, NOT JUST THE FIRST. The follow-up sitting of the
    # same day carries its own store and its own queue — `ȣ͂τοι -> ȣ̔͂τοι` at
    # page-071-R:33 landed through it — and reading only the first pair made
    # that edit look like unexplained drift.
    for store, queue in ((ROOT / 'work/sweeps/review-rulings.json',
                          ROOT / 'work/queue-review-15-102.json'),
                         (ROOT / 'work/sweeps/followup-rulings.json',
                          ROOT / 'work/queue-followup-2026-08-18.json')):
      if store.exists() and queue.exists():
        verdicts = _json.loads(store.read_text(encoding='utf-8'))
        entries = _json.loads(queue.read_text(encoding='utf-8'))['entries']
        accepted = {sid for sid, v in verdicts.items()
                    if v.get('verdict') == 'accept'}
        for e in entries:
            sid = 'forms:' + '|'.join(sorted(e.get('form_set') or []))
            if sid in accepted and 63 <= int(e['page']) <= 102:
                for pc in (e.get('pieces') or [{'line': e['line']}]):
                    later.add((f"page-{int(e['page']):03d}-{e['col']}",
                               int(pc['line'])))

    normalised = 0
    policy = 0
    exempt = 0
    for page in range(63, 103):
        for col in ('L', 'R'):
            actual = tmp_path / f'work/reconciled/page-{page:03d}-{col}.txt'
            expected = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
            got, n = WORK_SIGLUM.subn('Ζ', actual.read_text(encoding='utf-8'))
            got, n2 = EDITOR_A.subn('A', got)
            normalised += n + n2
            # ⚠ THE CORPUS IS THE RULINGS PLUS THE RECORDED EDITORIAL POLICY.
            # `space_policy` separates `139sqq` -> `139 sqq` and `cfa16` ->
            # `cf a16` on John's 2026-08-26 ruling, and those edits are in the
            # corpus without being in any per-site ledger — they are a policy,
            # not 29 decisions. Rebuilding without applying it makes every one
            # of them look like unexplained drift. It does NOT touch the
            # Bekker citation itself: `1573a25` is one token.
            got, _pol = space_policy.normalise(got)
            policy += sum(_pol.values())
            a = got.splitlines()
            b = expected.read_text(encoding='utf-8').splitlines()
            assert len(a) == len(b), f'{page:03d}-{col}: line count moved'
            for i, (x, y) in enumerate(zip(a, b), 1):
                if x == y:
                    continue
                key = (f'page-{page:03d}-{col}', i)
                assert key in later, (
                    f'{page:03d}-{col}:{i} differs and no ruling in the '
                    f'ledger accounts for it\n  rebuilt: {x!r}\n  corpus : {y!r}')
                exempt += 1
    # ⚠ NOT AN EQUALITY ANY MORE, AND HERE IS WHY. A `preserve` ruling
    # legitimately changes nothing, and a form-set card binds every site in
    # its group whether or not each one needed an edit — so `later` is a
    # superset of the lines that actually moved. What must still hold is the
    # direction that catches a lost ruling: every differing line is accounted
    # for, which the loop above asserts line by line.
    assert exempt <= len(later), (exempt, len(later))
    assert exempt > 0, ('no line on 63-102 differs from the reconstruction, '
                        'which would mean the 58 settle edits never landed')
    # And the step is real: if it ever stops firing, this test would be
    # asserting the identity and would not notice.
    assert normalised == 26, normalised
    # ⚠ AND THE POLICY STEP IS REAL TOO. 21 `sq`/`sqq` sites on 63-102 are in
    # the corpus by editorial policy rather than by a per-site ruling; if this
    # ever reaches 0 the step has silently stopped firing and the test above
    # would be exempting real drift instead of explaining it.
    assert policy == 21, policy
