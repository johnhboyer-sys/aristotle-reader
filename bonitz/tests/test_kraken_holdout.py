"""A held-out column must never reach the training set.

The holdout was a literal in `kraken_corpus`, and `stage_split` rewrites
holdout.txt from it on every run — so John's round-4 ruling (pages 55 and 61
entire, appended to that file by hand) would have been undone by the next
corpus rebuild, silently, with the four columns back in training and the model
then scored on pages it had memorised. `HOLDOUT-53-62.md` asks for a refusal
that does not trust the note; this is the test that the refusal is real.

Three things are pinned, and the middle one is the point:

  * the ruling on disk still says what John ruled — twelve columns, the
    round-3 eight plus 55 and 61 entire;
  * the guard FAILS when a held-out column is in the training set, checked by
    putting one there — a test that only asserts the good case passes against
    a guard whose body has been deleted;
  * `split` partitions the paired columns exactly, so a column cannot be lost
    from the corpus or shared between the two sets without the build stopping.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from bonitz_pipeline import kraken_corpus as kc

ROOT = Path(__file__).resolve().parent.parent

RULED = sorted([
    'page-017-L', 'page-022-R', 'page-027-L', 'page-032-R',
    'page-037-L', 'page-042-R', 'page-047-L', 'page-052-R',
    'page-055-L', 'page-055-R', 'page-061-L', 'page-061-R',
])


def test_the_ruling_on_disk_is_johns_twelve():
    assert sorted(kc.holdout_columns()) == RULED


def test_pages_55_and_61_are_held_out_entire():
    """His words: *pages 55 and 61 entire*. Both columns of each, or neither."""
    held = set(kc.holdout_columns())
    for page in (55, 61):
        assert {f'page-{page:03d}-L', f'page-{page:03d}-R'} <= held


def test_every_round_4_column_cites_the_dossier_and_appears_in_it():
    """The ruling file and HOLDOUT-53-62.md cannot drift apart.

    Each round-4 entry must name the dossier as its source, the dossier must
    exist, and it must name every column the ruling claims it ruled. A
    substring check on four fixed strings would pass against a ruling that had
    lost them, which is the thing being guarded.
    """
    entries = json.loads((ROOT / 'work' / 'rulings' / 'kraken-holdout.json')
                         .read_text(encoding='utf-8'))['columns']
    four = [e for e in entries if e.get('round') == 4]
    assert sorted(e['column'] for e in four) == [
        'page-055-L', 'page-055-R', 'page-061-L', 'page-061-R']
    for e in four:
        dossier = ROOT / e['source']
        assert dossier.exists(), e['source']
        text = dossier.read_text(encoding='utf-8')
        assert e['column'].removeprefix('page-') in text
        assert e['ruled'] in text


def test_a_held_out_column_in_training_is_refused():
    """The mutation: put one where it must not be, and the guard must stop."""
    train = ['page-015-L', 'page-016-R', 'page-055-L']
    with pytest.raises(kc.HoldoutError) as e:
        kc.refuse_holdout_in_training(train, 'test')
    assert 'page-055-L' in str(e.value)


def test_every_ruled_column_is_refused_individually():
    """No column is protected only by the company it keeps."""
    for col in kc.holdout_columns():
        with pytest.raises(kc.HoldoutError):
            kc.refuse_holdout_in_training(['page-015-L', col], 'test')


def test_a_clean_training_set_passes():
    kc.refuse_holdout_in_training(['page-015-L', 'page-016-R'], 'test')


def _ruling(tmp_path: Path, columns: list[str]) -> Path:
    p = tmp_path / 'holdout.json'
    p.write_text(json.dumps({'columns': [{'column': c} for c in columns]}),
                 encoding='utf-8')
    return p


def test_an_empty_or_missing_ruling_raises_rather_than_reading_as_none(tmp_path):
    """Nothing held out and no ruling found must never look alike, and neither
    may look like a clean build: both are a training run with no independent
    evaluation."""
    with pytest.raises(kc.HoldoutError):
        kc.holdout_columns(tmp_path / 'nothing-here.json')
    with pytest.raises(kc.HoldoutError):
        kc.holdout_columns(_ruling(tmp_path, []))


def test_a_malformed_ruling_raises(tmp_path):
    bad = tmp_path / 'bad.json'
    bad.write_text('{not json', encoding='utf-8')
    with pytest.raises(kc.HoldoutError):
        kc.holdout_columns(bad)
    with pytest.raises(kc.HoldoutError):
        kc.holdout_columns(_ruling(tmp_path, ['page-55-L']))
    with pytest.raises(kc.HoldoutError):
        kc.holdout_columns(_ruling(tmp_path, ['page-055-L', 'page-055-L']))


# --- split ------------------------------------------------------------------

TRAIN_SIDE = ['page-015-L', 'page-015-R', 'page-016-L', 'page-016-R']


def _pairing(work: Path, cols: list[str], *, matched: set[str] | None = None):
    work.mkdir(parents=True, exist_ok=True)
    matched = set(cols) if matched is None else matched
    (work / 'pairing.json').write_text(json.dumps([
        {'column': c, 'match': c in matched, 'kept': 61, 'excluded': [5, 10]}
        for c in cols]), encoding='utf-8')


def _whole_corpus(work: Path, **kw):
    """A pairing report holding every ruled column and four to train on."""
    _pairing(work, sorted(RULED + TRAIN_SIDE), **kw)


@pytest.fixture
def work(tmp_path, monkeypatch):
    w = tmp_path / 'kraken400'
    monkeypatch.setattr(kc, 'WORK', w)
    return w


def test_split_keeps_the_holdout_out_of_train(work):
    _whole_corpus(work)
    assert kc.stage_split() == 0
    train = (work / 'train.txt').read_text().split()
    holdout = (work / 'holdout.txt').read_text().split()
    assert train == TRAIN_SIDE
    assert sorted(holdout) == RULED
    assert not set(train) & set(kc.holdout_columns())


def test_split_refuses_when_a_ruled_column_is_not_in_the_corpus(work):
    """*Pages 55 and 61 entire.* A quarantined half honours the ruling in the
    weak sense — not trained on — and breaks it in the sense he meant, since
    the model is then never scored on the page he chose. A printed warning
    scrolls past; this stops."""
    _whole_corpus(work, matched=set(RULED + TRAIN_SIDE) - {'page-055-L'})
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_split()
    assert 'page-055-L' in str(e.value)


def test_split_calls_both_guards(work, monkeypatch):
    """⚠ THE WIRING, NOT THE FUNCTIONS. Grok's finding: deleting the two guard
    CALLS out of `stage_split` left the whole suite green, because the
    selection above them is correct and the guards were only ever tested
    directly. A guard nothing calls protects nothing."""
    _whole_corpus(work)
    called = []
    real_refuse, real_partition = (kc.refuse_holdout_in_training,
                                   kc.check_partition)
    monkeypatch.setattr(kc, 'refuse_holdout_in_training',
                        lambda *a, **k: (called.append('refuse'),
                                         real_refuse(*a, **k))[1])
    monkeypatch.setattr(kc, 'check_partition',
                        lambda *a, **k: (called.append('partition'),
                                         real_partition(*a, **k))[1])
    assert kc.stage_split() == 0
    assert called == ['partition', 'refuse']


def test_split_refuses_a_corpus_with_no_surviving_holdout(work):
    """Every held-out column quarantined = nothing to evaluate against."""
    _pairing(work, TRAIN_SIDE)
    with pytest.raises(kc.HoldoutError):
        kc.stage_split()


def test_the_partition_invariant_catches_a_lost_column():
    """A paired column in neither list — the silent loss."""
    with pytest.raises(kc.HoldoutError) as e:
        kc.check_partition(['page-015-L'], ['page-017-L'],
                           ['page-015-L', 'page-016-R', 'page-017-L'])
    assert 'page-016-R' in str(e.value)


def test_the_partition_invariant_catches_a_shared_column():
    """Trained on and evaluated against — the same column in both lists."""
    with pytest.raises(kc.HoldoutError) as e:
        kc.check_partition(['page-015-L', 'page-017-L'], ['page-017-L'],
                           ['page-015-L', 'page-017-L'])
    assert 'page-017-L' in str(e.value)


def test_the_partition_invariant_passes_a_clean_split():
    kc.check_partition(['page-015-L'], ['page-017-L'],
                       ['page-015-L', 'page-017-L'])


# --- compile ----------------------------------------------------------------

def test_compile_refuses_before_ketos_sees_anything(work, monkeypatch):
    """The gate that matters: train.txt can be days older than the ruling."""
    work.mkdir(parents=True, exist_ok=True)
    (work / 'train.txt').write_text('page-015-L\npage-042-R\n')
    (work / 'holdout.txt').write_text('page-017-L\n')

    def boom(*a, **k):                  # ketos must never be reached
        raise AssertionError('ketos was invoked with a leaked holdout column')

    monkeypatch.setattr(kc.subprocess, 'run', boom)
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_compile()
    assert 'page-042-R' in str(e.value)


def test_compile_refuses_lists_that_share_a_column(work, monkeypatch):
    work.mkdir(parents=True, exist_ok=True)
    (work / 'train.txt').write_text('page-015-L\npage-016-R\n')
    (work / 'holdout.txt').write_text('page-016-R\n')
    monkeypatch.setattr(kc.subprocess, 'run',
                        lambda *a, **k: pytest.fail('ketos was invoked'))
    with pytest.raises(kc.HoldoutError):
        kc.stage_compile()


def test_compile_refuses_a_missing_or_empty_list(work, monkeypatch):
    work.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(kc.subprocess, 'run',
                        lambda *a, **k: pytest.fail('ketos was invoked'))
    with pytest.raises(kc.HoldoutError):
        kc.stage_compile()
    (work / 'train.txt').write_text('')
    (work / 'holdout.txt').write_text('page-017-L\n')
    with pytest.raises(kc.HoldoutError):
        kc.stage_compile()


def test_a_wrongly_cased_stem_is_still_refused():
    """⚠ THE FILE SYSTEM IS CASE-INSENSITIVE AND THE GUARD MUST BE TOO.
    Grok's probe: `../gt/page-055-l.xml` opens the real held-out column on this
    volume, so an exact-string test would have handed ketos a held-out column
    through a hand-edited list."""
    with pytest.raises(kc.HoldoutError) as e:
        kc.refuse_holdout_in_training(['page-015-L', 'page-055-l'], 'test')
    assert 'page-055-L' in str(e.value)


# --- the holdout list must BE the ruling ------------------------------------

def _tree(work: Path, train: list[str], holdout: list[str],
          corpus: list[str] | None = None):
    """A corpus tree with gt XML for `corpus` and the two lists written."""
    (work / 'gt').mkdir(parents=True, exist_ok=True)
    for c in (corpus if corpus is not None else train + holdout):
        _gt(work, c, [f'{c} line {i}' for i in range(1, 4)])
    (work / 'train.txt').write_text('\n'.join(train) + '\n')
    (work / 'holdout.txt').write_text('\n'.join(holdout) + '\n')


def _gt(work: Path, col: str, lines: list[str]):
    ns = kc.PAGE_NS
    body = '\n'.join(
        f'<TextLine id="l{i}"><TextEquiv><Unicode>{t}</Unicode></TextEquiv>'
        f'</TextLine>' for i, t in enumerate(lines, 1))
    (work / 'gt' / f'{col}.xml').write_text(
        f'<?xml version="1.0"?><PcGts xmlns="{ns}"><Page>{body}</Page></PcGts>',
        encoding='utf-8')


def test_compile_refuses_a_holdout_that_is_not_the_ruling(work, monkeypatch):
    """The hollow evaluation: train is clean, and the round-4 pages are neither
    trained on nor scored. Every printed count looks right."""
    monkeypatch.setattr(kc.subprocess, 'run',
                        lambda *a, **k: pytest.fail('ketos was invoked'))
    _tree(work, TRAIN_SIDE, [c for c in RULED if not c.startswith('page-055')],
          corpus=RULED + TRAIN_SIDE)
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_compile()
    assert 'page-055-L' in str(e.value)


def test_compile_refuses_a_holdout_column_nobody_ruled(work, monkeypatch):
    monkeypatch.setattr(kc.subprocess, 'run',
                        lambda *a, **k: pytest.fail('ketos was invoked'))
    _tree(work, ['page-015-L'], RULED + ['page-016-R'],
          corpus=RULED + TRAIN_SIDE)
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_compile()
    assert 'page-016-R' in str(e.value)


# --- the arrow, which is what training actually reads ------------------------

def _arrow(path: Path, texts: list[str], images: list[bytes] | None = None):
    """A compiled arrow.

    ⚠ EVERY LINE GETS DISTINCT IMAGE BYTES, AND THAT IS NOT COSMETIC.  This
    fixture once wrote `im: b''` for every row, which no real arrow does — each
    row there holds the line's own PNG.  With every image identical the pixels
    carry no information, so a verifier that reasons about them cannot be
    tested at all.  `images` is exposed so a test can deliberately place the
    SAME pixels on both sides, which is the leak the text check cannot see.
    """
    import pyarrow as pa
    import pyarrow.ipc as ipc
    if images is None:
        images = [f'pixels of {t}'.encode() for t in texts]
    assert len(images) == len(texts)
    lines = pa.array([{'text': t, 'im': im, 'language': []}
                      for t, im in zip(texts, images)])
    table = pa.table({'lines': lines,
                      'train': pa.array([True] * len(texts)),
                      'validation': pa.array([False] * len(texts)),
                      'test': pa.array([False] * len(texts))})
    with ipc.new_file(pa.OSFile(str(path), 'wb'), table.schema) as w:
        w.write_table(table)


def _verifiable(work: Path):
    """A tree whose arrows honestly match its lists."""
    _tree(work, TRAIN_SIDE, RULED, corpus=RULED + TRAIN_SIDE)
    # `verify` re-checks the partition, so the tree needs the pairing report a
    # real one always has.
    _whole_corpus(work)
    for name, cols in (('train', TRAIN_SIDE), ('holdout', RULED)):
        _arrow(work / f'{name}.arrow',
               [t for c in cols for t in (f'{c} line 1', f'{c} line 2',
                                          f'{c} line 3')])


def test_verify_passes_when_the_arrows_are_the_lists(work):
    _verifiable(work)
    assert kc.stage_verify() == 0


def test_verify_catches_a_held_out_line_inside_train_arrow(work):
    """⚠ THE ARTIFACT, NOT THE BOOKKEEPING. `ketos train` reads train.arrow and
    never re-enters this module, so a stale arrow built before John ruled would
    train on the held-out pages with every list on disk innocent."""
    _verifiable(work)
    _arrow(work / 'train.arrow',
           [t for c in TRAIN_SIDE for t in (f'{c} line 1', f'{c} line 2',
                                            f'{c} line 3')]
           + ['page-055-L line 1'])
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_verify()
    assert 'page-055-L line 1' in str(e.value)


def test_verify_catches_a_truncated_arrow(work):
    """Volume as well as verdict: half an arrow has nothing wrong IN it."""
    _verifiable(work)
    _arrow(work / 'train.arrow', ['page-015-L line 1'])
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_verify()
    assert 'stale' in str(e.value)


def test_verify_refuses_a_missing_arrow(work):
    _tree(work, TRAIN_SIDE, RULED, corpus=RULED + TRAIN_SIDE)
    with pytest.raises(kc.HoldoutError):
        kc.stage_verify()


# --- the two holes the 2026-08-22 audit found in `verify` --------------------
#
# Both were failures of the GUARD, not of the corpus: the arrows were clean and
# the verifier could not have told anyone if they had not been.


def test_a_shared_string_does_not_quietly_leave_a_line_unchecked(work):
    """⚠ COUNTER SUBTRACTION DISCARDS WHAT THE TWO SIDES SHARE.

    `held_only = gt_texts(holdout) - gt_texts(train)` removes every text that
    also occurs in training — so the lines that are hardest to tell apart were
    the exact ones dropped before the test ran. Bonitz prints `b19.` on page 47
    and again on page 99; on the real 722-line holdout that reduced "no
    held-out line is in train.arrow" to a claim about 720 of them, while
    reading as a clean pass.

    A shared STRING with different pixels is not a leak, so this must pass —
    and the printed summary must say the text check could not speak for it.
    """
    _verifiable(work)
    _arrow(work / 'train.arrow',
           [t for c in TRAIN_SIDE for t in (f'{c} line 1', f'{c} line 2',
                                            f'{c} line 3')])
    # the holdout reprints a training string on its own, different line image
    _gt(work, RULED[0], ['page-054-R line 1', f'{RULED[0]} line 2',
                         f'{RULED[0]} line 3'])
    _arrow(work / 'holdout.arrow',
           ['page-054-R line 1']
           + [f'{RULED[0]} line 2', f'{RULED[0]} line 3']
           + [t for c in RULED[1:] for t in (f'{c} line 1', f'{c} line 2',
                                             f'{c} line 3')],
           images=[b'DIFFERENT PIXELS, SAME STRING']
           + [f'pixels of {RULED[0]} line 2'.encode(),
              f'pixels of {RULED[0]} line 3'.encode()]
           + [f'pixels of {c} line {i}'.encode()
              for c in RULED[1:] for i in (1, 2, 3)])
    assert kc.stage_verify() == 0


def test_verify_catches_a_held_out_IMAGE_hidden_under_another_string(work):
    """⚠ THE LEAK THE TEXT CHECK STRUCTURALLY CANNOT SEE.

    Give a training row the PIXELS of a held-out line and a string that occurs
    nowhere in the holdout. Every text-based comparison passes — the string is
    not held out, and the held-out string is still absent from training — while
    the model has in fact trained on a line it will be scored against. Only a
    claim about images catches this, which is why the claim is made about them.
    """
    _verifiable(work)
    stolen = f'pixels of {RULED[0]} line 1'.encode()
    texts = [t for c in TRAIN_SIDE for t in (f'{c} line 1', f'{c} line 2',
                                             f'{c} line 3')]
    _arrow(work / 'train.arrow', texts + ['a string no holdout column prints'],
           images=[f'pixels of {t}'.encode() for t in texts] + [stolen])
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_verify()
    assert 'IMAGE' in str(e.value)
    assert f'{RULED[0]} line 1' in str(e.value), 'the message must name the line'


def test_verify_re_checks_the_partition_and_not_only_split(work):
    """⚠ `check_partition` RAN ONLY WHERE THE SPLIT WAS WRITTEN.

    So a train.txt with a column trimmed out of it — plus arrows honestly
    recompiled to match that shorter list — verified perfectly while dropping
    the column from the corpus entirely. Every printed count was true; the
    corpus was simply smaller than the pairing says it is, and nothing said so.
    """
    _verifiable(work)
    kept = TRAIN_SIDE[:-1]
    (work / 'train.txt').write_text('\n'.join(kept) + '\n')
    _arrow(work / 'train.arrow',
           [t for c in kept for t in (f'{c} line 1', f'{c} line 2',
                                      f'{c} line 3')])
    with pytest.raises(kc.HoldoutError) as e:
        kc.stage_verify()
    assert 'every paired column' in str(e.value)
