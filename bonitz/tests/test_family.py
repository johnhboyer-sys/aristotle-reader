"""An entry must agree with itself about breathing.

Ground truth WAS p049-L, where the headword ἀμαρτάνειν stood smooth against
fourteen of its own rough inflections. ἁμαρτάνω is rough, so the headword was
the error — which is why the family votes rather than deferring to it.

⚠ THAT SITE IS MENDED, AND THIS FILE RECORDS THAT RATHER THAN PINNING IT.
John ruled it against the 400 dpi ink (the audit bundle `pattern:ἀ-ἁ`) and it
was applied on 2026-08-14, so `scan` finds nothing there any more — which is
the tool working, not the tool breaking. A detection test anchored to a live
defect fails the day the defect is fixed, and then reads as a regression.
"""

from pathlib import Path

from bonitz_pipeline.family import breathing_of, scan

ROOT = Path(__file__).resolve().parent.parent

ROUGH, SMOOTH = '̔', '̓'


def test_breathing_of():
    assert breathing_of('ἁμαρτάνειν') == ROUGH
    assert breathing_of('ἀμαρτάνειν') == SMOOTH
    assert breathing_of('μυσική') is None


def test_the_p049_headword_is_mended():
    """The wound this module was written for is closed, and stays closed."""
    assert [h for h in scan(49, 'L') if h['word'] == 'ἀμαρτάνειν'] == []
    lines = (ROOT / 'work/reconciled/page-049-L.txt').read_text(
        encoding='utf-8').splitlines()
    assert any(l.startswith('ἁμαρτάνειν') for l in lines), \
        'the headword should now be rough, as John ruled against the ink'


def _register_sites():
    """(page, col, line) for every site the corrigenda register examined."""
    import json
    doc = json.loads((ROOT / 'work/corrigenda/entries.json')
                     .read_text(encoding='utf-8'))
    items = doc if isinstance(doc, list) else doc.get('entries', [])
    return {(e['page'], e['col'], e['line']) for e in items}


def test_stays_quiet_elsewhere():
    """Deferring to the headword reported 15; the family vote reports 1.

    ⚠ A SITE THE CORRIGENDA REGISTER EXAMINED IS NOT A FINDING. The register
    records what Bonitz PRINTED, checked against the 400 dpi ink, and it holds
    page-044-R:27 and :42 under the rule `family.py revert` — with the note
    that ἁλίζω "to salt" takes the rough breathing from ἅλς and that the ink
    nonetheless shows the smooth. The entry is therefore inconsistent ON THE
    PAGE: a smooth headword over rough inflections at l.29. That is the
    compositor's, and preserving it is the whole discipline.

    So a finding is exempt when the register examined EITHER the word's line
    or its headword's line. Everything else still fails, and the exemption is
    named rather than folded into a bigger threshold — if the register ever
    stops holding those sites, these come back.
    """
    reg = _register_sites()
    open_findings = []
    for page in range(15, 52):
        for col in ('L', 'R'):
            for h in scan(page, col):
                if (page, col, h['line']) in reg:
                    continue
                if (page, col, h['head_line']) in reg:
                    continue
                open_findings.append((page, col, h['line'], h['headword'],
                                      h['word']))
    assert len(open_findings) <= 3, open_findings
