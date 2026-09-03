"""The gutter number inside a line box — caught before a character is read."""

import json

import pytest

from bonitz_pipeline import margin_guard as mg

REAL = [mg.ROOT / 'work' / 'calamari' / 'read107-112',
        mg.ROOT / 'work' / 'calamari' / 'read113-117']


def _read_dir(tmp_path, name, cols, widths):
    """A read directory whose line images have the given widths."""
    from PIL import Image
    d = tmp_path / name
    (d / 'images').mkdir(parents=True)
    (d / 'read.json').write_text(json.dumps({'columns': cols}), encoding='utf-8')
    for i, w in enumerate(widths):
        Image.new('RGB', (w, 40), (255, 255, 255)).save(d / 'images' / f'{i:05d}.png')
    return d


def test_a_column_whose_numbered_lines_run_wide_is_named(tmp_path):
    """⚠ THE SIGNAL IS THE BOX, NOT THE TEXT. The recogniser often reads the
    margin number as LETTERS — `35` came through as `as`, `55` as `ς` — so
    `…τῆς πρώτης as` reads as ordinary prose and no digit rule can find it.
    The line box was wider before a character was read."""
    cols = {'page-109-L': [f'l{i}' for i in range(1, 21)]}
    w = [1250] * 20
    for n in (5, 10, 15, 20):
        w[n - 1] = 1300
    d = _read_dir(tmp_path, 'read', cols, w)
    sus = mg.suspect_columns(mg.line_widths(d))
    assert [c for c, *_ in sus] == ['page-109-L']
    assert sus[0][3] == [5, 10, 15, 20], 'every numbered line wants checking'


def test_an_even_column_is_not_flagged(tmp_path):
    cols = {'page-108-R': [f'l{i}' for i in range(1, 21)]}
    d = _read_dir(tmp_path, 'read', cols, [1250] * 20)
    assert mg.suspect_columns(mg.line_widths(d)) == []


def test_a_column_wide_everywhere_is_not_flagged(tmp_path):
    """Wide LINES are not the finding — wide NUMBERED lines are. A column set
    in a broader measure would otherwise report all of itself."""
    cols = {'page-108-R': [f'l{i}' for i in range(1, 21)]}
    d = _read_dir(tmp_path, 'read', cols, [1400] * 20)
    assert mg.suspect_columns(mg.line_widths(d)) == []


def test_the_report_names_lines_not_a_verdict(tmp_path):
    """⚠ WIDTH SAYS THE GUTTER WAS IN FRAME, NOT THAT IT WAS READ. Page 107-L's
    numbered lines run exactly as wide as 109-L's and every one of them is
    clean. Calling a wide column corrupt would condemn 43 good lines to make a
    point about 17 bad ones, so the guard hands over a list to check."""
    cols = {'page-107-L': [f'l{i}' for i in range(1, 21)]}
    w = [1250] * 20
    for n in (5, 10, 15, 20):
        w[n - 1] = 1300
    d = _read_dir(tmp_path, 'read', cols, w)
    col, med, nmed, lines = mg.suspect_columns(mg.line_widths(d))[0]
    assert nmed > med and lines == [5, 10, 15, 20]


def test_a_manifest_naming_more_lines_than_it_has_raises(tmp_path):
    """[[absence-rendered-as-clean]] — a short directory must not read as a
    clean one."""
    cols = {'page-109-L': [f'l{i}' for i in range(1, 21)]}
    d = _read_dir(tmp_path, 'read', cols, [1250] * 18)
    with pytest.raises(SystemExit):
        mg.line_widths(d)


def test_an_empty_read_dir_raises(tmp_path):
    d = tmp_path / 'empty'
    (d / 'images').mkdir(parents=True)
    (d / 'read.json').write_text(json.dumps({'columns': {}}), encoding='utf-8')
    with pytest.raises(SystemExit):
        mg.line_widths(d)


# --- against the tranche this was written for -------------------------------

@pytest.mark.skipif(not all(d.exists() for d in REAL),
                    reason='the 107-117 read directories are not in this tree')
def test_it_finds_every_column_that_actually_lost_lines():
    """⚠ THE MEASUREMENT THIS GUARD IS. Seventeen numbered lines on 107-117 had
    the printed line number inside them, spread over four columns; a fifth
    column had the gutter in frame and came through clean. The guard names all
    five and nothing else, so its recall on the real fault is total and it
    costs 60 lines of checking to find 17.

    The four that lost lines: 109-L (8), 110-L (2), 113-L (3), 117-L (4).
    """
    widths = {}
    for d in REAL:
        widths.update(mg.line_widths(d))
    assert len(widths) == 22
    flagged = {c for c, *_ in mg.suspect_columns(widths)}
    assert flagged == {'page-107-L', 'page-109-L', 'page-110-L',
                       'page-113-L', 'page-117-L'}
    assert {'page-109-L', 'page-110-L', 'page-113-L', 'page-117-L'} <= flagged


# --- the gate in the cold pipeline ------------------------------------------

def test_batch_cold_refuses_a_tranche_with_the_gutter_in_frame(tmp_path,
                                                               monkeypatch):
    """⚠ THE GUARD HAS TO BE IN THE PATH, NOT BESIDE IT. `kraken_corpus` has
    dropped these lines from the training corpus since the beginning and the
    cold path simply never asked — so 107-117 was read, carded, ruled and
    promoted with seventeen bad citations in it before anyone measured a line
    box. The refusal names the columns and the way past it."""
    from bonitz_pipeline import batch_cold
    cols = {'page-109-L': [f'l{i}' for i in range(1, 21)]}
    w = [1250] * 20
    for n in (5, 10, 15, 20):
        w[n - 1] = 1300
    d = _read_dir(tmp_path, 'read', cols, w)
    with pytest.raises(SystemExit) as e:
        batch_cold.main(['107-117', '--kraken-dir', str(tmp_path),
                         '--calamari-dir', str(tmp_path),
                         '--out', str(tmp_path / 'o.json'),
                         '--reads', str(d)])
    assert 'gutter' in str(e.value), e.value


def test_batch_cold_says_so_when_the_guard_did_not_run(tmp_path, capsys):
    """[[absence-rendered-as-clean]] — omitting `--reads` must not read like a
    pass. It is the same fault as a check that globs one corpus stage."""
    from bonitz_pipeline import batch_cold
    with pytest.raises(SystemExit):
        batch_cold.main(['107-117', '--kraken-dir', str(tmp_path),
                         '--calamari-dir', str(tmp_path),
                         '--out', str(tmp_path / 'o.json')])
    assert 'NOT RUN' in capsys.readouterr().err
