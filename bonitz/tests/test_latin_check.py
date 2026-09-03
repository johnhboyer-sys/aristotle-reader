"""Bonitz's Latin, against the Latin language rather than against his habits.

Two sites survived every check the project has, and John ruled both against
the 400 dpi ink on 2026-08-13: `intcllexit` for *intellexit* on page-018-L,
`affcrtur` for *affertur* on page-025-R. Both are the same accident — an `e`
sort with its crossbar broken away prints a `c` — and both appear below
verbatim, pinned to the tier that must catch them.

Four disciplines pinned here:

The authority is a LEXICON, not a word count. Diogenes' Latin analyses hold
`intellexit` and do not hold `intcllexit`, and that is a fact about Latin
rather than about how often Bonitz used the word — so
`test_a_rare_but_attested_token_is_skipped_not_reported` fails if attestation
ever stops out-ranking rarity, and the argument survives a corpus where the
right spelling never occurs at all.

Frequency is the FALLBACK where the lexicon is silent, and it is still a skew
test. Drop the "the neighbour must be much commoner" requirement and
`test_an_unattested_minimal_pair_is_not_a_finding` fails.

Bonitz's own inventories do the excluding — his printed abbreviation key and
his printed apparatus sigla, never a shape test. Remove the abbreviation skip
and `test_an_abbreviation_is_skipped_and_counted` fails.

And volume as well as verdict: `test_volumes_add_up` pins Latin tokens =
findings + every skip class, so a zero-finding run cannot be told apart from
a run that never looked. An empty glob raises; a missing lexicon raises rather
than quietly attesting nothing, which would convict every Latin word in the
book.

Unit tests run on synthetic columns against a stub lexicon, so each claim is
decided by exactly the forms the test names. Three tests touch the real
Diogenes file, and one touches the real corpus.
"""

import pytest

from bonitz_pipeline import latin_check
from bonitz_pipeline.latin_check import (
    ABBREVIATIONS, LatinCheckError, fold, is_ce, main, neighbours, run,
    sigla, write_tsv)

# The two sites, verbatim from the columns John ruled on.
SITE_INTELLEXIT = '(i e non intcllexit) Γα1. 314 a13. ὅσα εἰρημένα'
SITE_AFFERTUR = 'Αἴας, versus Hom affcrtur Ρβ9. 1387 a34 (Λ 542). Αἴας'

# Enough Latin to decide the tests that name it, and nothing else — so a rule
# that stopped consulting the lexicon would show up as a new finding.
# `mare`/`more` are a real minimal pair: both are Latin, and neither is an
# error for the other.
FORMS = frozenset(fold(w) for w in (
    'intellexit', 'affertur', 'versus', 'mare', 'more', 'causa',
    'natura', 'Anaxagoras'))


@pytest.fixture
def sweep(tmp_path, monkeypatch):
    """One synthetic column through the real run(), against a stub lexicon."""
    def go(text, forms=FORMS, name='page-000-L'):
        (tmp_path / f'{name}.txt').write_text(text, encoding='utf-8')
        monkeypatch.setattr(latin_check, 'lexicon', lambda: forms)
        return run(sorted(tmp_path.glob('*.txt')))
    return go


# ── the two real sites ────────────────────────────────────────────────────

def test_the_intcllexit_shape_is_found(sweep):
    """⚠ THE MOTIVATING SITE. The `e` later in the SAME word prints closed and
    barred, so the type distinguishes them on the page; the check reaches the
    same verdict from the forms alone."""
    rows, _ = sweep(SITE_INTELLEXIT)
    assert [(r['token'], r['neighbour'], r['substitution'], r['tier'])
            for r in rows] == [('intcllexit', 'intellexit', 'c->e', 'ce')]


def test_the_affcrtur_shape_is_found(sweep):
    """Bonitz's standing formula is `versus Hom affertur`; the printed
    `affcrtur` is one broken sort away from it."""
    rows, _ = sweep(SITE_AFFERTUR)
    assert [(r['token'], r['neighbour'], r['substitution'], r['tier'])
            for r in rows] == [('affcrtur', 'affertur', 'c->e', 'ce')]


def test_the_argument_does_not_need_the_right_spelling_in_the_corpus(sweep):
    """⚠ THE POINT OF USING A LEXICON. `intellexit` occurs exactly once in
    pages 15-62 — at the very site in question — so a check resting on
    "the correct form is commoner" would have nothing to stand on. Here the
    column holds the broken form and nothing else, and the finding still
    holds."""
    rows, _ = sweep('non intcllexit')
    assert [r['token'] for r in rows] == ['intcllexit']
    assert rows[0]['neighbour_count'] == 0


# ── what must NOT be reported ─────────────────────────────────────────────

def test_a_rare_token_with_no_neighbour_is_not_reported(sweep):
    """One occurrence of a word no lexicon holds and nothing resembles is not
    evidence of anything — it is counted `unjudged`, which is the lexicon's
    limit stated rather than hidden."""
    rows, counts = sweep('quibusdam zzqwrtus scriptum')
    assert rows == []
    assert counts['unjudged'] == 3


def test_a_rare_but_attested_token_is_skipped_not_reported(sweep):
    """⚠ ATTESTATION OUT-RANKS RARITY, ALWAYS. `natura` here occurs once and
    has `naturd`-shaped neighbours all over Latin; it is a word, so it is not
    a finding, however rare Bonitz's use of it."""
    rows, counts = sweep('natura')
    assert rows == []
    assert counts['attested'] == 1


def test_an_attested_minimal_pair_is_not_a_finding(sweep):
    """`mare` and `more` are one substitution apart and both are Latin. A
    check that reported every near-miss would report this."""
    rows, counts = sweep('mare more')
    assert rows == []
    assert counts['attested'] == 2


def test_an_unattested_minimal_pair_is_not_a_finding(sweep):
    """⚠ THE SKEW GUARD, AND THE ONLY TEST THAT PINS IT. Where Diogenes knows
    neither spelling the corpus is the only witness left, and two occurrences
    against two is not a witness — it is two words. Drop the "much commoner"
    requirement from the fallback and this test reports both."""
    rows, counts = sweep('gryllina gryllino gryllina gryllino')
    assert rows == []
    assert counts['unjudged'] == 4


def test_a_line_end_fragment_is_not_a_word(sweep):
    """`enun-` / `ciatio` is one word set on two lines. Counted as words, each
    half is an unattested token one substitution from something, and every
    wrap in the column enters the report."""
    rows, counts = sweep('ratio enun-\nciatio quaedam')
    assert counts['hyphen-fragment'] == 2
    assert counts['tokens'] == 2               # ratio, quaedam
    assert all(r['token'] not in ('enun', 'ciatio') for r in rows)


# ── the skips, each counted as itself ─────────────────────────────────────

def test_an_abbreviation_is_skipped_and_counted(sweep):
    """Bonitz's editorial Latin, from his own printed key. `codd` is not a
    misprint of `coddi`; remove this skip and it is reported as one."""
    rows, counts = sweep('codd veluti ibid')
    assert rows == []
    assert counts['abbreviation'] == 3
    assert {'codd', 'veluti', 'ibid'} <= ABBREVIATIONS


def test_an_editor_siglum_is_skipped_and_counted(sweep):
    """⚠ BY BONITZ'S INVENTORY, NOT BY SHAPE. `Trdllbg` carries the double l
    the 1870 page actually prints, and nothing about its shape says it is
    Trendelenburg rather than a mangled word."""
    rows, counts = sweep('Trdllbg Siebld Sonnenburg')
    assert rows == []
    assert counts['siglum'] == 3
    assert {'Trdllbg', 'Siebld', 'Sonnenburg'} <= sigla()


def test_a_capitalised_proper_name_is_skipped_and_counted(sweep):
    """The residue after the lexicon has had its say: a 19th-century name it
    was never built to hold, with no attested neighbour to argue from."""
    rows, counts = sweep('Bernays Goettling')
    assert rows == []
    assert counts['proper-name'] == 2


def test_a_broken_sort_inside_a_name_is_still_caught(sweep):
    """⚠ WHY THE NEIGHBOUR SEARCH RUNS BEFORE THE PROPER-NAME SKIP. A blanket
    exemption for capitalised tokens would hide exactly the class this module
    exists for, whenever it lands in a name the lexicon does hold."""
    rows, _ = sweep('Anaxagoras Anaxagoras Anaxagoras Anaxagcras')
    assert [(r['token'], r['neighbour'], r['tier']) for r in rows] == [
        ('Anaxagcras', 'Anaxagoras', 'other')]


def test_a_roman_numeral_is_skipped_and_counted(sweep):
    rows, counts = sweep('CLXVIII XVII')
    assert rows == []
    assert counts['numeral'] == 2


def test_bekker_column_letters_are_too_short_to_judge(sweep):
    """`a` and `b` are 7,624 of the corpus's Latin runs and every one of them
    is a Bekker column, not a word."""
    _, counts = sweep('314 a13. 1387 b40.')
    assert counts['short'] == 2


def test_a_form_bonitz_sets_often_is_his_usage_not_a_slip(sweep):
    """⚠ THE RARITY CEILING. `enunciatio` is post-classical and Diogenes has
    only `enuntiatio`; Bonitz spells it his way every time. Correcting a
    spelling he sets three times would be correcting Bonitz, not his
    printer."""
    _, counts = sweep('gryllina gryllina gryllina')
    assert counts['frequent'] == 3


# ── volume as well as verdict ─────────────────────────────────────────────

def test_volumes_add_up(sweep):
    """Latin tokens = findings + every skip class, by construction. The
    project's standing defect is a check that answers "nothing" without
    saying whether it looked."""
    rows, counts = sweep(
        'codd veluti Trdllbg CLXVIII Bernays natura mare more\n'
        'gryllina gryllina gryllina zzqwrtus non intcllexit 314 a13\n'
        'ratio enun-\nciatio quaedam')
    skips = sum(counts[k] for k in (
        'short', 'abbreviation', 'siglum', 'numeral', 'frequent',
        'attested', 'proper-name', 'unjudged'))
    assert counts['tokens'] == len(rows) + skips
    assert counts['columns'] == 1


def test_the_summary_states_what_it_read(sweep):
    rows, counts = sweep(SITE_INTELLEXIT)
    text = latin_check.summary(counts)
    assert '1 columns read' in text
    assert 'distinct Latin words' in text
    assert 'tier ce:' in text and 'tier other:' in text
    for k in ('short', 'abbreviation', 'siglum', 'numeral', 'frequent',
              'attested', 'proper-name', 'unjudged'):
        assert f'skipped {k}' in text


def test_an_empty_glob_raises(tmp_path):
    """⚠ NOT A CLEAN RUN. No columns means we never looked."""
    with pytest.raises(LatinCheckError, match='refusing to report an empty'):
        main(['--reconciled', str(tmp_path), '--out', str(tmp_path / 'o.tsv')])


def test_a_missing_lexicon_raises(tmp_path, monkeypatch):
    """⚠ AN EMPTY LEXICON ATTESTS NOTHING, which is not caution — it is every
    Latin word in the book convicted at once. morpheus's rule for the Greek
    file in the same install: absence is a broken install, not a machine
    without it."""
    latin_check.lexicon.cache_clear()
    monkeypatch.setattr(latin_check, 'ANALYSES', tmp_path / 'gone.txt')
    try:
        with pytest.raises(LatinCheckError, match='moved or broken install'):
            latin_check.lexicon()
    finally:
        latin_check.lexicon.cache_clear()


def test_the_tsv_carries_a_header_even_when_empty(tmp_path):
    """A header-only file says "ran, found none"; a missing file cannot be
    told from a run that never happened."""
    out = tmp_path / 'sweeps' / 'latin-check.tsv'
    write_tsv([], out)
    assert out.read_text(encoding='utf-8').split('\t')[:3] == [
        'column', 'line', 'token']


# ── the real Diogenes lexicon ─────────────────────────────────────────────

def test_the_latin_analyses_are_installed():
    """⚠ NOT A SKIP. Diogenes is installed on every machine this pipeline
    runs on — the Greek file beside it is what `morpheus` reads for stage-4
    morphology — so a missing Latin file is a moved or broken install."""
    assert latin_check.ANALYSES.exists(), (
        f'{latin_check.ANALYSES} is gone; its Greek twin in the same '
        f'directory is what morpheus reads, so this breaks more than this '
        f'check')


def test_the_real_lexicon_decides_both_confirmed_sites():
    """The whole argument, against the real 349,741 forms: the printed
    spellings are not Latin and the words they displaced are."""
    forms = latin_check.lexicon()
    assert fold('intellexit') in forms and fold('affertur') in forms
    assert fold('intcllexit') not in forms and fold('affcrtur') not in forms
    assert [n[2] for n in neighbours('intcllexit', forms)] == ['intellexit']
    assert [n[2] for n in neighbours('affcrtur', forms)] == ['affertur']


def test_the_uv_fold_is_not_a_finding():
    """⚠ ONE WORD, TWO SORTS. Diogenes writes `adiectiuo` where Bonitz writes
    `adiectivo`; unfolded, that is an unattested token one substitution from
    an attested one — the exact shape of a finding, and wrong."""
    forms = latin_check.lexicon()
    assert fold('adiectivo') in forms
    assert fold('janthina') in forms


# ── the real corpus ───────────────────────────────────────────────────────

CORPUS = latin_check.ROOT / 'work/reconciled'


def _corpus_text():
    return '\n'.join(f.read_text(encoding='utf-8')
                     for f in sorted(CORPUS.glob('*.txt')))


@pytest.mark.skipif(not CORPUS.exists(), reason='no reconciled corpus here')
def test_the_real_corpus_yields_both_confirmed_sites():
    """The two `e` sorts whose crossbar is gone, printing as `c`.

    This test was skipif-gated until the apply step existed: John's erratum
    rulings were recorded in `work/audit/audit-rulings.json` and nothing wrote
    them, so the corpus still read the corrected `intellexit`/`affertur` and
    the printed sorts were not there to find. `audit_apply` ran on 2026-08-13
    and wrote `intcllexit`.

    ⚠ `affcrtur` CAME BY A DIFFERENT ROAD, AND THAT IS WORTH KNOWING. No card
    in the audit queue ever carried the site, so nothing in the store could
    apply it; it was recorded by hand on John's ruling of 2026-08-13 ("mark
    it as erratum. we fix when we publish our own version"). Both readings
    are in `work/corrigenda/entries.json` — the corpus keeps the ink, the
    register carries the correction to the edition we publish.
    """
    rows, _ = run(sorted(CORPUS.glob('*.txt')))
    found = {(r['column'], r['token'], r['neighbour']) for r in rows
             if r['tier'] == 'ce'}
    assert ('page-018-L', 'intcllexit', 'intellexit') in found
    assert ('page-025-R', 'affcrtur', 'affertur') in found


@pytest.mark.skipif(not CORPUS.exists(), reason='no reconciled corpus here')
def test_the_real_corpus_is_read_whole():
    """⚠ VOLUME, ON THE REAL THING. The unit tests can all pass over three
    synthetic words; this one says the sweep actually read a book."""
    _, counts = run(sorted(CORPUS.glob('*.txt')))
    assert counts['columns'] >= 90
    assert counts['tokens'] > 10_000
    assert counts['vocabulary'] > 1_000
    assert counts['vocabulary-attested'] / counts['vocabulary'] > 0.5


def test_is_ce_names_the_confirmed_swap():
    assert is_ce('c', 'e') and is_ce('e', 'c') and is_ce('C', 'e')
    assert not is_ce('c', 'o') and not is_ce('a', 'e')
