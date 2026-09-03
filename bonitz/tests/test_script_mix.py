"""A word cannot be half Greek and half Latin — except where the apparatus is.

`encoding_check` reports a shape the corpus spells two ways, and is right to
stay silent on a token that occurs once: one spelling is not a contradiction.
But `Sάνθιππος` occurs once, and a Latin `S` standing where Bonitz set `Ξ` is
a defect whether or not the corpus says so twice. This module makes the other
claim — that inside one word the scripts do not mix — and the whole difficulty
is that in Bonitz's apparatus they legitimately do.

FOUR EXEMPTIONS, EACH MEASURED OFF THE SETTLED CORPUS (pages 15-106):

  the Bekker column letter   `οβ1347a26`, `ε7.1131b23` — 130-odd tokens whose
                             only Latin is the `a`/`b` between digits. Drop
                             this exemption and the finder reports the
                             citation apparatus as broken.
  the editor prefix          `AΖι` 61 times, `AΖγ`, `KaΖμ`. Bonitz's key p.11
                             makes `A` the editor and what follows the work,
                             so the mixing is the notation. A CLOSED SET, not
                             a shape: `Sάνθιππος` has the same shape and is
                             a defect — `test_the_editor_prefix_is_a_closed_
                             set_not_a_shape` is the whole point of the module.
  the division letter        `Ζιι49B`, `129D` — a Latin capital after digits.
  the apparatus word         `p`, `cf`, `ad`, `sqq`, `n` run onto a siglum.
                             These are reported, but as `joined` — a lost
                             space, not a lost letter — because that is what
                             they are and the two want different rulings.

A FINDER, NEVER A FIXER, on the pattern `encoding_check` sets: it reads
`work/reconciled` and returns findings. It does not say what the ink holds;
`Ηz` is Heitz and `Tὰ` is Greek tau, but the module reports the mixing and
stops. The last test touches the real corpus and skips when it is absent.
"""

import pytest

from bonitz_pipeline import script_mix as sm


def _col(tmp_path, name, lines):
    d = tmp_path / 'reconciled'
    d.mkdir(exist_ok=True)
    (d / name).write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return d


def test_a_bekker_column_letter_is_not_script_mixing(tmp_path):
    d = _col(tmp_path, 'page-020-L.txt', ['οβ1347a26. ε7.1131b23. Ζγδ8.776b5.'])
    assert sm.find(d) == []


def test_the_editor_prefix_is_exempt(tmp_path):
    d = _col(tmp_path, 'page-020-L.txt', ['staceorum C AΖι I 152. KaΖμ β3.'])
    assert sm.find(d) == []


def test_the_editor_prefix_is_a_closed_set_not_a_shape(tmp_path):
    """`Sάνθιππος` is Latin-then-Greek exactly as `AΖι` is, and is a defect.

    Exempt the SHAPE instead of the set and this test fails silently — which
    is the failure that matters, because nothing else in the corpus would
    ever report it.
    """
    d = _col(tmp_path, 'page-020-L.txt', ['Ἀρίφρων. Sάνθιππος ὁ Ἀρίφρονος f 361.'])
    got = sm.find(d)
    assert [(f.token, f.reason) for f in got] == [('Sάνθιππος', 'letter')]


def test_a_division_letter_after_digits_is_exempt(tmp_path):
    d = _col(tmp_path, 'page-020-L.txt', ['Ζιι49B. cf Plat Symp 129D).'])
    assert sm.find(d) == []


def test_an_apparatus_word_run_onto_a_siglum_is_joined_not_letter(tmp_path):
    d = _col(tmp_path, 'page-020-L.txt', ['δῆλον (pΦθ5, cf infra. λόγοις (cfadβ3.'])
    assert sorted((f.token, f.reason) for f in sm.find(d)) == [
        ('(cfadβ3.', 'joined'), ('(pΦθ5,', 'joined')]


def test_two_real_runs_of_letters_abutting_is_joined(tmp_path):
    d = _col(tmp_path, 'page-020-L.txt', ['δεῖ λεχθῆναι (p Φεsqq). δ12.'])
    assert [(f.token, f.reason) for f in sm.find(d)] == [('Φεsqq).', 'joined')]


def test_one_foreign_letter_inside_a_word_is_a_letter_finding(tmp_path):
    d = _col(tmp_path, 'page-020-L.txt',
             ['— Ηistoria animalium. Μeteoro1ogica citan-', 'ac dοcti- Tὰ μετὰ τὰ φυσικά'])
    assert sorted(f.token for f in sm.find(d)) == [
        'Tὰ', 'dοcti-', 'Ηistoria', 'Μeteoro1ogica']
    assert {f.reason for f in sm.find(d)} == {'letter'}


def test_the_finding_carries_where_to_look(tmp_path):
    d = _col(tmp_path, 'page-113-L.txt', ['x', 'y', 'rantur, incertum est). — Tὰ μετὰ τὰ φυσικά Α1. 981'])
    f, = sm.find(d)
    assert (f.page, f.col, f.line) == (113, 'L', 3)
    assert f.token == 'Tὰ' and 'incertum' in f.context


def test_an_empty_directory_raises_rather_than_reporting_clean(tmp_path):
    """Absence rendered as clean is the defect this repo has fixed four times."""
    (tmp_path / 'empty').mkdir()
    with pytest.raises(sm.ScriptMixError):
        sm.find(tmp_path / 'empty')


def test_the_settled_corpus_holds_no_letter_findings_it_has_not_earned():
    """Pages 15-106 are adjudicated. A `letter` finding there is a false one.

    This is the control that stopped 171 imagined rho/p defects and 468
    imagined Bekker pages: a rule that fires on settled text is describing
    the rule, not the corpus.
    """
    from pathlib import Path
    d = Path(__file__).resolve().parent.parent / 'work' / 'reconciled'
    if not d.is_dir():
        pytest.skip('work/reconciled absent')
    settled = [f for f in sm.find(d) if f.page <= 106 and f.reason == 'letter']
    assert settled == [], settled
