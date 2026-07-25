"""The ou-ligature lexical discriminator.

Ground truth is the pages 50-51 batch, where the seven leaked spots were
found by hand, plus the three spots where LlamaParse wrongly inserted a
ligature into a word that genuinely has plain upsilon (pp. 29, 42, 45).
"""

import pytest

from bonitz_pipeline.lexcheck import judge, load_forms, to_ou, to_upsilon


@pytest.fixture(scope='module')
def forms():
    return load_forms()


# Sonnet reader wrote plain upsilon; the ligature is correct.
LIGATURE = [
    'ἀκολȣθεῖ', 'διαφέρȣσι', 'ἔχȣσιν', 'καθόλȣ', 'σκέλȣς', 'τȣς',
    'λόγȣ', 'καλȣσι', 'ἀμπέλȣς', 'μιμȣμενον',
]

# LlamaParse wrongly read a ligature; plain upsilon is correct.
UPSILON = ['ὀξȣ', 'δίδȣμα', 'πάρȣδρον']


@pytest.mark.parametrize('word', LIGATURE)
def test_ligature_spots_resolve_to_ou(word, forms):
    verdict, why = judge(word, forms)
    assert verdict == 'ligature', f'{word}: {why}'


@pytest.mark.parametrize('word', UPSILON)
def test_llamaparse_false_fires_resolve_to_upsilon(word, forms):
    verdict, why = judge(word, forms)
    assert verdict == 'upsilon', f'{word}: {why}'


def test_expansions():
    assert to_ou('τȣς') == 'τους'
    assert to_upsilon('τȣς') == 'τυς'


def test_unknown_when_unattested():
    verdict, _ = judge('ζzȣzz', forms=set())
    assert verdict == 'unknown'


def test_scan_reconciled_finds_shared_reader_errors(tmp_path, monkeypatch, forms):
    """The ἄμουσος entry every reader flattened to plain upsilon (p51-L)."""
    from bonitz_pipeline import lexcheck
    col = tmp_path / 'work/reconciled'
    col.mkdir(parents=True)
    (col / 'page-051-L.txt').write_text(
        "ἀμυσία ϗ̀ μυσική, πάθος καθ' αὑτόν Γα4. 319 b27.\n"
        "ἄμυσος. ῥαθυμία ἄμυσος ρ1. 1421 a33. γίγνεται ἐκ μυσικῷ\n"
        # a word broken by the printed line end is only half a word
        "ἀγορὰ ἀναγκαία, ἐλευ-\nθέρα Πη12. 1331a31.\n",
        encoding='utf-8')
    monkeypatch.setattr(lexcheck, 'ROOT', tmp_path)
    rows = lexcheck.scan_reconciled(51, 'L', forms)
    assert [r['wrote'] for r in rows] == [
        'ἀμυσία', 'μυσική', 'ἄμυσος', 'ἄμυσος', 'μυσικῷ']
    assert all(r['attested_as'].startswith(('αμουσ', 'μουσικ')) for r in rows)
