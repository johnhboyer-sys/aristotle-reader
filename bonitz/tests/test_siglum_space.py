"""The siglum gap as a DISPLAY rule, and the two ways it could stop being one.

John ruled the gap between a siglum and its number a matter of rendering for
the site and the PDF, not a change to `work/reconciled` (2026-08-13, 14:21).
Two things follow, and both are pinned here rather than trusted:

  * the module must not be able to write the corpus — the version that could
    was written first, and never run;
  * the rule must not reach kraken or calamari. Their training corpora are
    built from `work/reconciled`, and spacing every siglum there would teach
    the model a gap the ink does not always print — the same defect
    `kraken_corpus.BEKKER_SPACE` exists to prevent, pointed the other way.
"""

import ast
from pathlib import Path

import pytest

from bonitz_pipeline import siglum_space as ss

ROOT = Path(__file__).resolve().parent.parent
REAL = sorted((ROOT / 'work' / 'reconciled').glob('page-*.txt'))


def test_a_chapter_number_is_spaced_off_its_siglum():
    assert ss.space_sigla('Ηε10. 1135a24') == 'Ηε 10. 1135a24'
    assert ss.space_sigla('Μδ22.') == 'Μδ 22.'


def test_a_bookless_works_bekker_page_is_spaced_too():
    """John's ruling covers both: `οβ1350` is the Oeconomica at Bekker 1350,
    with no chapter between."""
    assert ss.space_sigla('οβ1350 b33') == 'οβ 1350 b33'
    assert ss.space_sigla('οβ1351b19.') == 'οβ 1351b19.'


def test_the_rule_is_idempotent():
    """A renderer may hand it a fragment that has already been through it."""
    once = ss.space_sigla('Ηε10. 1135a24. οβ1350 b33')
    assert ss.space_sigla(once) == once
    assert '  ' not in once


def test_the_bekker_line_gap_is_not_this_rule():
    """`1136 a33` is the printed gap inside a Bekker reference — a different
    question, already settled, and this rule must not touch it."""
    assert ss.space_sigla('1136 a33.') == '1136 a33.'
    assert ss.space_sigla('497 a10.') == '497 a10.'


def test_the_ou_ligature_is_never_a_siglum():
    """`ȣ` is the ou-ligature. A word ending in it, followed by a number, is
    not a citation."""
    assert ss.space_sigla('τȣ̀ς 12.') == 'τȣ̀ς 12.'
    assert ss.space_sigla('καλȣσι4.') == 'καλȣσι4.'


def test_a_line_with_no_citation_is_returned_untouched():
    plain = 'quod intellexit, sed non satis'
    assert ss.space_sigla(plain) == plain


# --- the two guards -----------------------------------------------------------

def test_the_module_cannot_write_anything():
    """⚠ THE VERSION THAT COULD WAS THE WRONG LAYER. It carried an `--apply`
    that rewrote every column of `work/reconciled`; John ruled the gap a
    rendering question before it was ever run. If a writer comes back — or an
    `--apply` — this fails, and it should."""
    # ⚠ THE CODE, NOT THE PROSE. A plain substring scan reads the docstring
    # that EXPLAINS why there is no `--apply` and fails on its own
    # explanation — a check that cannot tell a warning from the thing it
    # warns about.
    tree = ast.parse((ROOT / 'bonitz_pipeline' / 'siglum_space.py')
                     .read_text('utf-8'))
    called = {n.func.attr for n in ast.walk(tree)
              if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
    called |= {n.func.id for n in ast.walk(tree)
               if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    for writer in ('write_text', 'write_bytes', 'open', 'mkdir', 'replace'):
        assert writer not in called, f'{writer}() is back in the display rule'
    flags = {c.value for c in ast.walk(tree)
             if isinstance(c, ast.Constant) and isinstance(c.value, str)
             and c.value.startswith('--')}
    assert '--apply' not in flags, 'the writer\'s flag is back'


def test_the_display_rule_never_reaches_the_training_corpora():
    """⚠ JOHN'S OWN CONCERN, 2026-08-13. `kraken_corpus` builds the training
    targets out of `work/reconciled`, and the exports build from those. If
    any of them imported this rule, the model would be taught a gap the ink
    does not always print."""
    for module in ('kraken_corpus.py', 'calamari_export.py',
                   'pylaia_export.py', 'kraken_export.py'):
        f = ROOT / 'bonitz_pipeline' / module
        if not f.exists():
            continue
        assert 'siglum_space' not in f.read_text('utf-8'), (
            f'{module} imports the display rule — the training corpus would '
            f'carry a gap the ink does not print')


# --- volume, on the real corpus -----------------------------------------------

@pytest.mark.skipif(not REAL, reason='no reconciled corpus here')
def test_the_measurement_reads_the_whole_corpus_and_changes_nothing_on_disk():
    before = {f: f.read_bytes() for f in REAL}
    changes, c = ss.measure(REAL)
    assert c['columns'] >= 96 and c['lines'] > 5_000
    # It is a real rule with real reach: thousands of citations, not a corner.
    assert c['gaps opened'] > 1_000
    assert len(changes) == c['lines displayed differently']
    assert {f: f.read_bytes() for f in REAL} == before


def test_an_empty_corpus_refuses_rather_than_reporting_a_clean_run():
    """A report of zero from a run that read nothing is the defect this
    pipeline keeps re-fixing."""
    with pytest.raises(SystemExit):
        ss.measure([])
