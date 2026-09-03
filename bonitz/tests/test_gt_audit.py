"""The training-column audit must classify honestly and refuse to run blind.

The audit's value is the SHORTNESS of its queue — a model that memorised its
targets disagrees rarely, so every line it surfaces deserves the ink. That
collapses if a class is mislabelled (a base-letter error filed under
'spacing' is never reviewed) or if a missing input reads as a clean column.
"""

from __future__ import annotations

import pytest

from bonitz_pipeline import gt_audit
from bonitz_pipeline.gt_audit import (AuditError, audit_column, classify,
                                      _kind, write_tsv)
from bonitz_pipeline.kraken_eval import align

PAGE_NS = 'http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15'


def _xml(path, lines):
    body = '\n'.join(
        f'<TextLine id="l{i}"><TextEquiv><Unicode>{t}</Unicode></TextEquiv>'
        f'</TextLine>' for i, t in enumerate(lines, 1))
    path.write_text(
        f'<?xml version="1.0"?><PcGts xmlns="{PAGE_NS}"><Page>{body}</Page>'
        f'</PcGts>', encoding='utf-8')


@pytest.fixture
def tree(tmp_path, monkeypatch):
    """A one-column corpus: gt XML, predictions, and a reconciled file."""
    (tmp_path / 'gt').mkdir()
    (tmp_path / 'eval').mkdir()
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    monkeypatch.setattr(gt_audit, 'RECONCILED', rec)
    return tmp_path


def _column(tree, gt, pred, reconciled=None):
    _xml(tree / 'gt' / 'page-015-L.xml', gt)
    _xml(tree / 'eval' / 'page-015-L.pred.xml', pred)
    (tree / 'reconciled' / 'page-015-L.txt').write_text(
        '\n'.join(reconciled if reconciled is not None else gt) + '\n',
        encoding='utf-8')


# --- classification -----------------------------------------------------------

def _label(gt, hyp):
    return classify(align(gt, hyp))[0]


def test_a_base_letter_difference_is_the_top_class():
    assert _label('σπᾶσθαι εἰς', 'τπᾶσθαι εἰς') == 'letter'


def test_a_mark_only_difference_is_marks():
    assert _label('τȣ͂ λόγȣ', 'τȣ λόγȣ') == 'mark'          # dropped perispomeni
    assert _label('ἀφῆς', 'ἁφῆς') == 'mark'    # precomposed breathing (NFC
    # makes it one codepoint) — still an accent dispute, not a letter one
    assert _label('ἄγειν', 'ἅγειν') == 'mark'


def test_a_homoglyph_is_a_letter_dispute():
    """The Latin a standing where Greek α belongs strips to a DIFFERENT
    base — the audit's highest-value class, and it must not drown in the
    accent noise."""
    assert _label('θάλατταν', 'θάλαττaν') == 'letter'
    assert _label('νεοττȣ̀ς Ζιι9', 'νεοττȣ̀ς Zιι9') == 'letter'


def test_whitespace_only_is_spacing():
    assert _label('740a22 al', '740a 22 al') == 'spacing'


def test_digits_and_punctuation():
    assert _label('Ζιι49. 631b8', 'Ζιι49. 681b8') == 'digit'
    assert _label("ἀλλ' ὡς", 'ἀλλ᾽ ὡς') == 'punct'


def test_the_worst_kind_present_names_the_line():
    """A letter error must never hide behind an accompanying space error."""
    assert _label('ἄγειν τȣς', 'ἄγειν  τȣτ') == 'letter'


def test_kind_handles_insertions_and_deletions():
    assert _kind(None, 'θ') == 'letter'
    assert _kind('.', None) == 'punct'
    assert _kind(None, ' ') == 'spacing'
    assert _kind('͂', None) == 'mark'


# --- the audit ---------------------------------------------------------------

def test_disagreements_become_candidates_and_agreement_is_counted(tree):
    _column(tree, ['ἄγειν τὸν', 'ϗ̀ τὸ ἐξ'], ['ἄγειν τὸν', 'ϗ τὸ ἐξ'])
    r = audit_column('page-015-L', tree, tree / 'eval')
    assert r['identical'] == 1
    assert len(r['rows']) == 1
    assert r['rows'][0][0] == 'mark'


def test_a_line_the_corpus_no_longer_holds_is_stale_not_scored(tree):
    """The orphan-mark shape: the corpus was fixed after the tree was staged,
    so the training target disagrees with reconciled. Scoring it against
    either text alone would mislead — it is its own tier."""
    _column(tree, ['τȣ ͂λόγȣ'], ['τȣ͂ λόγȣ'], reconciled=['τȣ͂ λόγȣ'])
    r = audit_column('page-015-L', tree, tree / 'eval')
    assert r['rows'] == []
    assert [s[3] for s in r['stale']] == ['τȣ ͂λόγȣ']


def test_bekker_spacing_maps_gt_to_reconciled(tree):
    """reconciled keeps the printed Bekker gap; the training XML strips it.
    The stale-gt check must compare through that normalisation or every
    spaced reference reads as stale."""
    _column(tree, ['Με2.1026 b28'], ['Με2.1026 b28'],
            reconciled=['Με2.1026 b28'])
    # gt spells it stripped; reconciled spells it printed
    _xml(tree / 'gt' / 'page-015-L.xml', ['Με2.1026b28'])
    _xml(tree / 'eval' / 'page-015-L.pred.xml', ['Με2.1026b28'])
    r = audit_column('page-015-L', tree, tree / 'eval')
    assert r['stale'] == []
    assert r['identical'] == 1


def test_a_missing_prediction_is_a_refusal_not_a_clean_column(tree):
    _xml(tree / 'gt' / 'page-015-L.xml', ['ἄγειν'])
    (tree / 'reconciled' / 'page-015-L.txt').write_text('ἄγειν\n')
    with pytest.raises(AuditError):
        audit_column('page-015-L', tree, tree / 'eval')


def test_a_line_count_mismatch_is_a_refusal(tree):
    _column(tree, ['ἄγειν', 'τὸν'], ['ἄγειν'])
    with pytest.raises(AuditError):
        audit_column('page-015-L', tree, tree / 'eval')


def test_a_missing_reconciled_column_is_a_refusal(tree):
    _xml(tree / 'gt' / 'page-015-L.xml', ['ἄγειν'])
    _xml(tree / 'eval' / 'page-015-L.pred.xml', ['ἄγειν'])
    with pytest.raises(AuditError):
        audit_column('page-016-R', tree, tree / 'eval')


def test_an_empty_queue_still_writes_a_header(tmp_path):
    p = tmp_path / 'audit.tsv'
    write_tsv(p, ['class', 'gt'], [])
    assert p.read_text(encoding='utf-8') == 'class\tgt\n'


def test_an_empty_column_list_is_a_refusal_not_a_clean_audit(tree, tmp_path):
    """Grok: an empty train.txt printed `columns audited: 0` and exited 0 —
    a clean report from a run that never opened a column."""
    (tree / 'train.txt').write_text('\n')
    with pytest.raises(AuditError):
        gt_audit.main(['--work', str(tree), '--eval', str(tree / 'eval'),
                       '--out', str(tmp_path / 'out.tsv')])
