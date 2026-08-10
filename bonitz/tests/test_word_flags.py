"""Character-level flags become word-level disputes — or are excluded out loud.

The recurring bug this project keeps finding: a lookup that silently stops
matching looks exactly like a cautious refusal. So these tests assert that the
join FIRES on known real sites, that reconstruction REFUSES rather than
guesses, and that exclusions are counted rather than vanishing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from bonitz_pipeline.word_flags import (
    report,
    skeleton,
    words,
    is_word_char,
    _aligned_slice,
    _classify,
)

ROOT = Path(__file__).resolve().parent.parent
FLAGS5 = ROOT / 'work' / 'flags5-053-062.jsonl'
FLAGS20 = ROOT / 'work' / 'flags-020-024.jsonl'
RECONCILED = ROOT / 'work' / 'reconciled'
OPUS = ROOT / 'raw' / 'opus'


# --- pure helpers -----------------------------------------------------------

def test_skeleton_expands_ligatures_and_strips_marks():
    assert skeleton('ȣ̓κ') == skeleton('οὐκ') == 'ουκ'
    # final sigma folds to medial — same key either way
    assert skeleton('ἁμῶς') == skeleton('ἀμώς') == 'αμωσ'


def test_classify_splits_letters_marks_breathing_accent():
    assert _classify(['ἁμῶς', 'ἁμιῶς']) == 'letters'
    assert _classify(['ἁμῶς', 'ἀμῶς']) == 'breathing-only'
    assert _classify(['ἀγωνιστικὴ', 'ἀγωνιστική']) == 'accent-only'
    # grave+smooth vs circumflex-only: both breathing and accent differ
    assert _classify(['κἂν', 'κᾶν']) == 'marks-only'


def test_aligned_slice_maps_subspan_or_refuses():
    assert _aligned_slice('abc', 'abc', 1, 2) == 'b'
    # Same letters, different breathing: the first character maps across.
    assert _aligned_slice('ἀφὴ', 'ἁφὴ', 0, 1) == 'ἁ'
    assert _aligned_slice('', 'x', 0, 0) == ''


def test_is_word_char_accepts_greek_and_ligatures_rejects_latin_digits():
    assert is_word_char('α') and is_word_char('ἁ') and is_word_char('ȣ')
    assert is_word_char('̓')  # combining smooth
    assert not is_word_char('a') and not is_word_char('4')
    assert not is_word_char(' ') and not is_word_char('.')


# --- synthetic column: reconstruction fires, refuse does not guess ----------

def _write_column(dir: Path, page: int, col: str, text: str) -> Path:
    p = dir / f'page-{page:03d}-{col}.txt'
    p.write_text(text, encoding='utf-8')
    return p


def test_join_fires_on_a_one_character_breathing_fight(tmp_path: Path):
    """The measured failure mode: readers differ on one mark; the word is whole."""
    # Two columns so the spine has somewhere to sit.
    _write_column(tmp_path, 90, 'L', 'ἀλλὰ ἁλουργός καὶ ἕτερον.\n')
    _write_column(tmp_path, 90, 'R', 'padding text here.\n')

    from bonitz_pipeline.normalize import canonical, clean_opus
    stream, _ = canonical(clean_opus(
        (tmp_path / 'page-090-L.txt').read_text(encoding='utf-8')))
    # Find the rough alpha of ἁλουργός
    word = 'ἁλουργός'
    at = stream.index(word)
    # Dispute only the first character (breathing).
    site = {
        'page': 90, 'col': 'L', 'spine_off': at,
        'ctx': stream[max(0, at - 5):at + 10],
        'opus': word[0],           # ἁ
        'kraken': 'ἀ',             # smooth
        'codex': word[0],
        'cls': 'soft', 'vote': word[0], 'flag': False, 'citation': False,
    }
    path = tmp_path / 'flags.jsonl'
    path.write_text(json.dumps(site, ensure_ascii=False) + '\n', encoding='utf-8')

    got = words(path, opus_dir=tmp_path)
    assert len(got) == 1, f'expected one word dispute, got {got}'
    w = got[0]
    assert w.readers['opus'] == 'ἁλουργός'
    assert w.readers['kraken'] == 'ἀλουργός'
    assert w.readers['codex'] == 'ἁλουργός'
    assert w.kind == 'breathing-only'
    assert w.page == 90 and w.col == 'L'


def test_refuse_when_opus_stream_does_not_match_the_record(tmp_path: Path):
    """A spine_off that does not point at opus is data rot — not a word."""
    _write_column(tmp_path, 91, 'L', 'ἁπλοῦς λόγος.\n')
    _write_column(tmp_path, 91, 'R', '.\n')
    site = {
        'page': 91, 'col': 'L', 'spine_off': 0,
        'ctx': 'zzzz',
        'opus': 'ΧΧΧΧ',   # not what the column holds
        'kraken': 'ΧΧΧΧ', 'codex': 'ΧΧΧΧ',
        'cls': 'soft', 'vote': None, 'flag': True, 'citation': False,
    }
    path = tmp_path / 'flags.jsonl'
    path.write_text(json.dumps(site, ensure_ascii=False) + '\n', encoding='utf-8')

    rep = report(path, opus_dir=tmp_path)
    assert rep.words == []
    assert len(rep.excluded) == 1
    assert rep.excluded[0].reason == 'opus_mismatch'


def test_refuse_latin_and_punctuation_sites(tmp_path: Path):
    """A fight over Latin digits or markup is not a Greek word."""
    _write_column(tmp_path, 92, 'L', 'see 196a16 for the ref.\n')
    _write_column(tmp_path, 92, 'R', '.\n')
    from bonitz_pipeline.normalize import canonical, clean_opus
    stream, _ = canonical(clean_opus(
        (tmp_path / 'page-092-L.txt').read_text(encoding='utf-8')))
    at = stream.index('196')
    site = {
        'page': 92, 'col': 'L', 'spine_off': at,
        'ctx': stream[max(0, at - 5):at + 8],
        'opus': '196', 'kraken': '195', 'codex': '196',
        'cls': 'majority-spine', 'vote': '196', 'flag': True, 'citation': True,
    }
    path = tmp_path / 'flags.jsonl'
    path.write_text(json.dumps(site, ensure_ascii=False) + '\n', encoding='utf-8')

    rep = report(path, opus_dir=tmp_path)
    assert rep.words == []
    assert len(rep.excluded) == 1
    assert rep.excluded[0].reason in ('not_greek_word', 'no_word_dispute')


def test_junk_reader_fragment_is_dropped_not_spliced(tmp_path: Path):
    """Genie sometimes returns a multi-line misalignment; never splice it in."""
    _write_column(tmp_path, 93, 'L', 'ἁμῶς γέ πως.\n')
    _write_column(tmp_path, 93, 'R', '.\n')
    from bonitz_pipeline.normalize import canonical, clean_opus
    stream, _ = canonical(clean_opus(
        (tmp_path / 'page-093-L.txt').read_text(encoding='utf-8')))
    at = stream.index('ἁμῶς')
    site = {
        'page': 93, 'col': 'L', 'spine_off': at,
        'ctx': stream[:20],
        'opus': 'ἁμῶ',
        'genie': 'f105.106.1494b43.ἀμῶς',  # alignment junk
        'kraken': 'ἁμιῶ',
        'codex': 'ἁμῶ',
        'cls': 'majority-spine', 'vote': 'ἁμῶ', 'flag': False, 'citation': False,
    }
    path = tmp_path / 'flags.jsonl'
    path.write_text(json.dumps(site, ensure_ascii=False) + '\n', encoding='utf-8')

    got = words(path, opus_dir=tmp_path)
    assert len(got) == 1
    assert 'genie' not in got[0].readers
    assert got[0].readers['opus'] == 'ἁμῶς'
    assert got[0].readers['kraken'] == 'ἁμιῶς'
    assert got[0].kind == 'letters'


def test_exclusions_are_counted_not_silent(tmp_path: Path):
    """Every input site is either a word dispute or an exclusion with a reason."""
    _write_column(tmp_path, 94, 'L', 'λόγος ἁπλοῦς.\n')
    _write_column(tmp_path, 94, 'R', '.\n')
    from bonitz_pipeline.normalize import canonical, clean_opus
    stream, _ = canonical(clean_opus(
        (tmp_path / 'page-094-L.txt').read_text(encoding='utf-8')))
    at = stream.index('ἁ')
    good = {
        'page': 94, 'col': 'L', 'spine_off': at,
        'ctx': stream[max(0, at - 3):at + 8],
        'opus': 'ἁ', 'kraken': 'ἀ', 'codex': 'ἁ',
        'cls': 'soft', 'vote': 'ἁ', 'flag': False, 'citation': False,
    }
    bad = {
        'page': 94, 'col': 'L', 'spine_off': 0,
        'ctx': 'x', 'opus': '@@@', 'kraken': '@@@', 'codex': '@@@',
        'cls': 'soft', 'vote': None, 'flag': True, 'citation': False,
    }
    path = tmp_path / 'flags.jsonl'
    path.write_text(
        json.dumps(good, ensure_ascii=False) + '\n'
        + json.dumps(bad, ensure_ascii=False) + '\n',
        encoding='utf-8')

    rep = report(path, opus_dir=tmp_path)
    assert rep.n_sites == 2
    assert len(rep.words) == 1
    assert len(rep.excluded) == 1
    assert rep.excluded[0].reason  # non-empty reason, not None / ""
    # Nothing vanishes: words + excluded cover the input (bad site only excluded;
    # good site only a word). Two outcomes for two sites.
    assert len(rep.words) + len(rep.excluded) == 2


# --- real flag files --------------------------------------------------------

@pytest.mark.skipif(not FLAGS20.exists() or not RECONCILED.exists(),
                    reason='flag/reconciled fixtures not present')
def test_join_fires_on_real_page20_accent_sites():
    """Hand-check: page 20 has mark fights that expand to whole words present
    in both the Opus column and the reconciled text."""
    rep = report(FLAGS20)
    # Known sites from flags-020-024 (compare3): accent on ἀγωνιστικὴ / ἀγωνίζεσθαι
    by_word = {w.readers['opus']: w for w in rep.words
               if w.page == 20 and w.col == 'L'}
    assert 'ἀγωνιστικὴ' in by_word, (
        f'join did not fire on ἀγωνιστικὴ; sample keys={list(by_word)[:12]}')
    w = by_word['ἀγωνιστικὴ']
    assert w.kind == 'accent-only'
    assert w.readers.get('genie') == 'ἀγωνιστική' or w.readers.get('llama') == 'ἀγωνιστική'

    recon = (RECONCILED / 'page-020-L.txt').read_text(encoding='utf-8')
    assert 'ἀγωνιστικ' in recon  # the lemma is on the page (marks may be final)

    if 'ἀγωνίζεσθαι' in by_word:
        assert by_word['ἀγωνίζεσθαι'].kind in ('accent-only', 'marks-only')


@pytest.mark.skipif(not FLAGS5.exists() or not OPUS.exists(),
                    reason='flags5 / raw opus not present')
def test_flags5_produces_word_disputes_and_counts_exclusions():
    """On the measured 53-62 batch: most sites become words; the rest say why."""
    rep = report(FLAGS5)
    assert rep.n_sites == 1197
    # Reconstruction must fire at scale — silent near-zero is the bug class.
    assert len(rep.words) >= 800, (
        f'only {len(rep.words)} word disputes from 1197 sites; join looks dead')
    assert len(rep.excluded) >= 1
    assert sum(rep.by_reason.values()) == len(rep.excluded)
    # Every exclusion carries a reason string.
    assert all(e.reason for e in rep.excluded)
    # Kind partition covers every word dispute.
    assert sum(rep.by_kind.values()) == len(rep.words)
    for k in rep.by_kind:
        assert k in ('letters', 'marks-only', 'breathing-only', 'accent-only')


@pytest.mark.skipif(not FLAGS5.exists() or not OPUS.exists(),
                    reason='flags5 / raw opus not present')
def test_flags5_first_site_is_whole_word_hamws():
    """The file's first record is a 4-char fragment of ἁμῶς — join must expand."""
    rep = report(FLAGS5)
    first = next(w for w in rep.words if w.page == 53 and w.col == 'L'
                 and w.word_off == 0)
    assert first.readers['opus'] == 'ἁμῶς'
    assert 'kraken' in first.readers
    # genie/llama on this site are alignment junk and must not appear as words
    # (or if somehow pure, must still be Greek words — never the raw junk).
    for name in ('genie', 'llama'):
        if name in first.readers:
            assert all(is_word_char(c) for c in first.readers[name])
            assert '.' not in first.readers[name]


@pytest.mark.skipif(not FLAGS5.exists(), reason='flags5 not present')
def test_breathing_words_are_long_enough_for_the_oracle():
    """The whole point: breathing-only disputes must not be 1-character frags."""
    from bonitz_pipeline.breathing_oracle import WORD
    rep = report(FLAGS5)
    breathing = [w for w in rep.words if w.kind == 'breathing-only']
    assert breathing, 'expected some breathing-only word disputes on 53-62'
    for w in breathing:
        for form in w.readers.values():
            assert len(skeleton(form)) >= 2
            # WORD requires 2+ Greek chars — the oracle's own gate.
            assert WORD.search(form), f'{form!r} would still fail the oracle gate'
