"""The PyLaia export must keep the holdout out and the two runs comparable.

The two training runs are the experiment: identical in every input except
tokenisation. A validation split that drifts between them, a holdout line in
tr.txt, or a symbol table missing a holdout glyph each quietly answers the
wrong question — so every one of those is pinned here against a synthetic
export whose lines exercise the exact clusters the corpus is about.
"""

from __future__ import annotations

import json

import pytest

from bonitz_pipeline import kraken_corpus as kc
from bonitz_pipeline import pylaia_export as pe

# NFC, like calamari_export writes. The marks over ȣ (U+0223) and ϗ (U+03D7)
# have no precomposed forms, so they stay combining codepoints.
TRAIN = [
    'τὸ ὄν',                          # plain Greek with a space
    'ϗ̀ τὸ',                     # kai-ligature + grave (U+03D7 U+0300)
    'ȣ̓ δὲ',                     # ou-ligature + smooth (U+0223 U+0313)
    'ȣ̓́ τι',               # multi-mark cluster (smooth + acute)
    'de anima 12',                    # Latin with spaces
    'τȣ͂ ἔτȣς',                  # ou-ligature + perispomeni
]
HOLDOUT = [
    'Ἕτι w ϗ̀',                  # Ἕ and w never occur in TRAIN
]
VA_EVERY = 3  # 6 train lines → va = lines 3 and 6 (1-based)

# The ruling the synthetic export was "gated on" — column stems, because
# holdout_columns() validates the shape even against a monkeypatched file.
HELD = ['page-055-L', 'page-061-R']


@pytest.fixture()
def ruling(tmp_path, monkeypatch):
    """A tmp kraken-holdout.json holding HELD, patched in as THE ruling."""
    p = tmp_path / 'kraken-holdout.json'
    p.write_text(json.dumps({'columns': [{'column': c} for c in HELD]}),
                 encoding='utf-8')
    monkeypatch.setattr(kc, 'HOLDOUT_RULING', p)
    return p


def write_src(tmp_path, manifest_columns=HELD):
    """A synthetic calamari-export directory; None = no MANIFEST.json."""
    src = tmp_path / 'calamari-export'
    for name, lines in (('train', TRAIN), ('holdout', HOLDOUT)):
        d = src / name
        d.mkdir(parents=True)
        for i, text in enumerate(lines):
            (d / f'{i:05d}.png').write_bytes(b'\x89PNG not-a-real-image')
            (d / f'{i:05d}.gt.txt').write_text(text, encoding='utf-8')
    if manifest_columns is not None:
        (src / 'MANIFEST.json').write_text(
            json.dumps({'source': 'synthetic', 'holdout_ruling': 'synthetic',
                        'holdout_columns': manifest_columns}),
            encoding='utf-8')
    return src


@pytest.fixture()
def export(tmp_path, ruling):
    """A synthetic calamari-export directory, converted once."""
    src = write_src(tmp_path)
    out = tmp_path / 'pylaia-export'
    pe.export(src, out, va_every=VA_EVERY)
    return out


def _tables(out, tok):
    return {t: (out / tok / f'{t}.txt').read_text(encoding='utf-8').splitlines()
            for t in ('tr', 'va', 'te')}


def _syms(out, tok):
    """syms.txt as an ordered {symbol: index} dict."""
    pairs = [line.rsplit(' ', 1) for line in
             (out / tok / 'syms.txt').read_text(encoding='utf-8').splitlines()]
    return {sym: int(idx) for sym, idx in pairs}


ORIGINALS = {f'train-{i:05d}': t for i, t in enumerate(TRAIN)} | \
            {f'holdout-{i:05d}': t for i, t in enumerate(HOLDOUT)}


@pytest.mark.parametrize('tok', pe.TOKENISATIONS)
def test_every_table_line_round_trips_to_the_original_text(export, tok):
    seen = {}
    for lines in _tables(export, tok).values():
        for line in lines:
            image_id, *toks = line.split(' ')
            seen[image_id] = ''.join(' ' if t == pe.SPACE else t for t in toks)
    assert seen == ORIGINALS


def test_cluster_syms_hold_the_marked_ligatures_as_single_symbols(export):
    cluster = _syms(export, 'cluster')
    assert 'ϗ̀' in cluster
    assert 'ȣ̓́' in cluster
    codepoint = _syms(export, 'codepoint')
    assert 'ϗ̀' not in codepoint
    assert 'ȣ̓́' not in codepoint
    assert {'ϗ', '̀', 'ȣ', '̓', '́'} <= codepoint.keys()


@pytest.mark.parametrize('tok', pe.TOKENISATIONS)
def test_ctc_is_index_zero(export, tok):
    syms = _syms(export, tok)
    assert syms[pe.CTC] == 0
    assert syms[pe.SPACE] == 1
    assert list(syms.values()) == list(range(len(syms)))


@pytest.mark.parametrize('tok', pe.TOKENISATIONS)
def test_no_holdout_id_ever_reaches_a_training_table(export, tok):
    """The holdout is John's ruling, not a hyperparameter."""
    tables = _tables(export, tok)
    trained_on = [line.split(' ', 1)[0]
                  for t in ('tr', 'va') for line in tables[t]]
    assert trained_on and not [i for i in trained_on
                               if i.startswith('holdout-')]
    te_ids = [line.split(' ', 1)[0] for line in tables['te']]
    assert te_ids == [f'holdout-{i:05d}' for i in range(len(HOLDOUT))]


@pytest.mark.parametrize('tok', pe.TOKENISATIONS)
def test_holdout_only_symbols_are_appended_and_named(export, tok):
    syms = _syms(export, tok)
    assert 'Ἕ' in syms and 'w' in syms
    manifest = json.loads((export / 'MANIFEST.json').read_text('utf-8'))
    named = manifest['tokenisations'][tok]['holdout_only_symbols']
    assert set(named) == {'Ἕ', 'w'}
    # Appended after every training symbol, so training indices are stable.
    assert {syms[s] for s in named} == {len(syms) - 2, len(syms) - 1}


def test_va_split_is_deterministic_and_identical_across_tokenisations(
        export, tmp_path):
    ids = {}
    for tok in pe.TOKENISATIONS:
        tables = _tables(export, tok)
        ids[tok] = [line.split(' ', 1)[0] for line in tables['va']]
    assert ids['codepoint'] == ids['cluster']
    # Every Nth training line, 1-based: lines 3 and 6 of 6.
    assert ids['codepoint'] == ['train-00002', 'train-00005']
    # A second run over the same source picks the same lines.
    src = tmp_path / 'calamari-export'
    again = tmp_path / 'again'
    pe.export(src, again, va_every=VA_EVERY)
    for tok in pe.TOKENISATIONS:
        assert (again / tok / 'va.txt').read_text('utf-8') == \
               (export / tok / 'va.txt').read_text('utf-8')


@pytest.mark.parametrize('tok', pe.TOKENISATIONS)
def test_every_table_id_resolves_to_an_image(export, tok):
    for lines in _tables(export, tok).values():
        for line in lines:
            image_id = line.split(' ', 1)[0]
            assert (export / 'imgs' / f'{image_id}.png').is_file(), image_id


def test_a_text_without_its_image_raises(tmp_path, ruling):
    """A silently dropped line is the defect this pipeline exists to refuse."""
    src = tmp_path / 'calamari-export'
    d = src / 'train'
    d.mkdir(parents=True)
    (src / 'MANIFEST.json').write_text(
        json.dumps({'holdout_columns': HELD}), encoding='utf-8')
    (d / '00000.gt.txt').write_text('τὸ ὄν', encoding='utf-8')
    with pytest.raises(FileNotFoundError):
        pe.export(src, tmp_path / 'out')


# --- provenance: the export must prove the ruling it was gated on ----------


def test_an_export_without_a_manifest_is_refused(tmp_path, ruling):
    """No MANIFEST.json is exactly the hand-assembled directory."""
    src = write_src(tmp_path, manifest_columns=None)
    out = tmp_path / 'pylaia-export'
    with pytest.raises(kc.HoldoutError, match='provenance'):
        pe.export(src, out, va_every=VA_EVERY)
    assert not out.exists()  # refused before a byte was written


def test_an_unreadable_manifest_is_refused(tmp_path, ruling):
    src = write_src(tmp_path, manifest_columns=None)
    (src / 'MANIFEST.json').write_text('{not json', encoding='utf-8')
    out = tmp_path / 'pylaia-export'
    with pytest.raises(kc.HoldoutError, match='not readable JSON'):
        pe.export(src, out, va_every=VA_EVERY)
    assert not out.exists()


def test_a_manifest_without_the_ruling_is_refused(tmp_path, ruling):
    """calamari_export always records `holdout_columns`; its absence means
    this manifest was not written by the gated exporter."""
    src = write_src(tmp_path, manifest_columns=None)
    (src / 'MANIFEST.json').write_text(
        json.dumps({'source': 'somewhere'}), encoding='utf-8')
    out = tmp_path / 'pylaia-export'
    with pytest.raises(kc.HoldoutError, match='holdout_columns'):
        pe.export(src, out, va_every=VA_EVERY)
    assert not out.exists()


def test_an_export_gated_on_a_moved_ruling_is_refused_naming_the_drift(
        tmp_path, ruling):
    """The ruling moved since the export was made: its train/ may hold a
    column John has since ruled out. The refusal must name that column."""
    src = write_src(tmp_path, manifest_columns=['page-055-L'])  # 061-R missing
    out = tmp_path / 'pylaia-export'
    with pytest.raises(kc.HoldoutError, match='page-061-R') as e:
        pe.export(src, out, va_every=VA_EVERY)
    assert 'stale' in str(e.value)
    assert not out.exists()


def test_a_matching_manifest_lets_the_export_proceed(export):
    """The good case: provenance checks out, both tokenisations come out."""
    for tok in pe.TOKENISATIONS:
        assert (export / tok / 'tr.txt').is_file()
    assert (export / 'MANIFEST.json').is_file()


# --- tokenisation: the known orphan-mark shape ------------------------------


def test_an_orphan_mark_after_a_space_stands_alone():
    """The real stale-gt shape `τȣ ͂λόγȣ`: combining perispomeni AFTER the
    space. The mark must be its own symbol — never glued onto `<space>` —
    and the line must still round-trip."""
    text = 'τȣ ͂λόγȣ'
    toks = pe.cluster_tokens(text)
    assert toks == ['τ', 'ȣ', pe.SPACE, '͂', 'λ', 'ό', 'γ', 'ȣ']
    assert '͂' in toks                      # the mark is its own symbol
    assert pe.SPACE + '͂' not in toks       # <space> stays bare
    assert ''.join(' ' if t == pe.SPACE else t for t in toks) == text
