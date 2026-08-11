"""The sigla reference and the sigla data must not drift apart.

`docs/front-matter.md` is what a future agent reads; `work/sigla/*.json` is what
the checks read. If those two can disagree, the document is worse than nothing —
it is a confident, wrong answer. So the document is generated and these tests
assert it is in sync, plus the conventions that were settled against the ink.
"""

from __future__ import annotations

import json
import unicodedata

from bonitz_pipeline import front_matter_doc as fm

KAI_GRAVE = 'ϗ' + '̀'


def _works() -> list[dict]:
    return json.loads(fm.WORKS.read_text(encoding='utf-8'))['works']


def test_the_document_is_not_stale():
    """Regenerating must be a no-op. Edit the JSON, rerun, commit both."""
    assert fm.DOC.exists(), 'run: python3 -m bonitz_pipeline.front_matter_doc --write'
    assert fm.DOC.read_text(encoding='utf-8') == fm.render(), (
        'docs/front-matter.md is out of date with work/sigla/*.json — '
        'rerun `python3 -m bonitz_pipeline.front_matter_doc --write`')


def test_every_siglum_reaches_the_document():
    """A table that silently drops a row is the failure this project keeps
    paying for, so assert VOLUME as well as content."""
    doc = fm.DOC.read_text(encoding='utf-8')
    works = _works()
    assert len(works) == 48, len(works)
    for e in works:
        assert f'| `{e["siglum"]}` |' in doc, e['siglum']
    app = json.loads(fm.APPARATUS.read_text(encoding='utf-8'))
    assert len(app['editors_p11']) == 20, sorted(app['editors_p11'])
    assert len(app['zoological_p12']) == 25, len(app['zoological_p12'])
    for sig in list(app['editors_p11']) + list(app['zoological_p12']):
        assert f'| `{sig}`' in doc, sig


def test_the_kai_abbreviation_always_carries_its_grave():
    """John, 2026-08-11, reading the leaf: 'every kai ligature i see on the
    page has a grave'. The corpus agrees 760 of 785. Nine titles held a bare ϗ.
    """
    for e in _works():
        t = unicodedata.normalize('NFD', e['title'])
        for i, ch in enumerate(t):
            if ch != 'ϗ':
                continue
            nxt = t[i + 1] if i + 1 < len(t) else ''
            assert nxt == '̀', (
                f'{e["siglum"]}: kai without a grave in {e["title"]!r}')
    assert KAI_GRAVE in fm.render()


def test_a_circumflex_over_the_ligature_is_perispomeni():
    """U+0342, not U+0303. The corpus uses U+0342 after ȣ 544 times and the
    combining tilde zero times; `περὶ Οὐρανȣ͂` was the one outlier."""
    for e in _works():
        t = unicodedata.normalize('NFD', e['title'])
        assert 'ȣ̃' not in t, f'{e["siglum"]}: combining tilde after ȣ'


def test_no_stigma_anywhere_in_the_front_matter():
    """Stigma is the numeral 6 and the key carries no numeral book letters, so
    a ϛ here would be a misread final sigma — the `πκς`/`πκϛ` confusion moving
    into a new file.

    Assert on the DATA, not the rendered page: the Conventions section names ϛ
    in order to rule it out, and a test that reads the prose fails on its own
    warning.
    """
    app = json.loads(fm.APPARATUS.read_text(encoding='utf-8'))
    fields = [e['siglum'] for e in _works()] + [e['title'] for e in _works()]
    fields += list(app['editors_p11']) + list(app['zoological_p12'])
    fields += [v for v in app['zoological_p12'].values() if isinstance(v, str)]
    for f in fields:
        assert 'ϛ' not in f, f


def test_the_editor_designation_is_not_part_of_the_siglum():
    """The leaf prints a small `i e` after `αι` and `Μ`. It is Bonitz glossing
    the row, not part of the siglum, and a siglum carrying it matches nothing."""
    for e in _works():
        assert 'i e' not in e['siglum'], e['siglum']
    doc = fm.render()
    assert '| `αι` |' in doc and '| `Μ` |' in doc


def test_repeated_titles_are_given_in_full():
    """Bonitz prints `— ὕστερα` for a repeated title. Clear on the leaf,
    confusing in a reference, so the reference expands it — and the printed
    form is kept beside it rather than thrown away."""
    printed = {e['siglum']: e for e in _works() if e.get('printed')}
    assert set(printed) == {'Αγδ', 'ημ', 'ηε', 'Η'}, sorted(printed)
    for sig in ('Αγδ', 'ημ', 'ηε'):
        assert printed[sig]['printed'].startswith('—')
        assert not printed[sig]['title'].startswith('—')
    # The bare eta is a reading, not a repeat: no breathing on the leaf.
    assert printed['Η']['printed'].startswith('Η')
    assert printed['Η']['title'].startswith('Ἠ')
