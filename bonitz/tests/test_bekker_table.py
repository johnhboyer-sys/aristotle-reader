"""The Bekker-range table is DERIVED from Bonitz's printed key, not typed.

The 2026-07-25 hand-typed table was guessed before the key was transcribed;
`work/sigla/work-sigla.json` is now the authority (verified against the
400 dpi scan). These tests pin the derivation, its refusals, and — because a
gate that reads nothing reports nothing — that the range check actually fires.
"""

import json

import pytest

from bonitz_pipeline import bekker
from bonitz_pipeline.bekker import CITE, WORKS, load_works, scan
from bonitz_pipeline.siglum_check import SIGLA


def test_table_matches_the_printed_key_spot_checks():
    """Three sigla straight from the JSON, plus one only derivation can add."""
    raw = {r['siglum']: r['bekker']
           for r in json.loads(SIGLA.read_text(encoding='utf-8'))['works']
           if r.get('bekker')}

    def span(s):
        a, b = raw[s].split('-')
        return int(a.rstrip('ab')), int(b.rstrip('ab'))

    assert WORKS['Κ'] == span('Κ') == (1, 15)          # Categoriae
    assert WORKS['Ζγ'] == span('Ζγ') == (715, 789)     # De gen. animalium
    assert WORKS['πο'] == span('πο') == (1447, 1462)   # Poetica
    # τθ exists only through expansion of the printed range entry τα-θ.
    assert WORKS['τθ'] == span('τα-θ') == (100, 164)


def test_the_split_ink_survived_derivation():
    """The guessed table lumped De motu and De incessu into Ζκ 698-714; the
    printed key splits them. If derivation ever regresses to the lump, these
    two go back to being one work and ten pages of IA citations go unchecked."""
    assert WORKS['Ζκ'] == (698, 704)
    assert WORKS['Ζπ'] == (704, 714)


def test_duplicate_siglum_must_agree_on_its_span(tmp_path):
    """ζ is printed twice (περὶ Ζωῆς / περὶ Νεότητος) with the SAME span, so
    the real key loads. A duplicate with DIFFERENT spans is a misreading of
    the key, and picking either silently validates against the wrong range."""
    bad = tmp_path / 'work-sigla.json'
    bad.write_text(json.dumps({'works': [
        {'siglum': 'ζ', 'title': 'περὶ Ζωῆς', 'bekker': '467b-470b'},
        {'siglum': 'ζ', 'title': 'περὶ Νεότητος', 'bekker': '480a-486b'},
    ]}), encoding='utf-8')
    with pytest.raises(ValueError, match='DIFFERENT spans'):
        load_works(bad)


def test_agreeing_duplicate_is_accepted():
    """The real key's ζ collision is harmless and must stay loadable."""
    table = load_works()
    assert table['ζ'] == (467, 470)


def test_missing_key_raises(tmp_path):
    """Private tooling: no key, no table, no silent fallback."""
    with pytest.raises(FileNotFoundError):
        load_works(tmp_path / 'nowhere.json')


def test_fragments_have_no_range_and_are_not_in_the_table():
    """`f` is cited by fragment number; it cannot be range-checked. It must
    be absent from the table (not present with an invented span), and the
    impossible bound must stay above Bonitz's fragment pages (he cites
    1562b), so excluding f never condemns a fragment citation."""
    assert 'f' not in WORKS
    assert bekker.IMPOSSIBLE >= 1562


def test_book_number_cannot_eat_a_four_digit_page():
    """`(\\d{0,3})\\.?` once let the book group take the lead digits of a
    four-digit page: 1306a31 -> book 130, page 6a. The separator is now
    mandatory inside the optional group."""
    m = CITE.search('Π 1306a31')
    assert m, 'Π 1306a31 did not parse at all'
    assert m.group(2) is None, f'book group stole digits: {m.group(2)!r}'
    assert m.group(3) == '1306'
    # And WITH the separator the book number still parses as a book number.
    m = CITE.search('Πε 11. 1315a3')
    assert m.group(2) == '11' and m.group(3) == '1315'


def test_the_gate_fires_on_an_impossible_siglum_page_pair(tmp_path, monkeypatch):
    """VOLUME, not absence: Ζγ (De gen. an.) spans 715-789, so `Ζγ2. 482a17`
    is impossible, and the gate must SAY so. A scan that finds nothing here
    is a scan that read nothing — the 'absence rendered as clean' defect."""
    col = tmp_path / 'page-099-L.txt'
    col.write_text('τῆς γενέσεως Ζγ2. 482a17 λέγεται.\n', encoding='utf-8')
    monkeypatch.setattr(bekker, 'corpus_column',
                        lambda page, c, required=False: col)
    bad, unknown = scan(99, 'L', ranges=True)
    assert len(bad) == 1, f'gate reported {len(bad)} findings, want exactly 1'
    assert bad[0]['siglum'] == 'Ζγ'
    assert bad[0]['bekker'] == 482
    assert bad[0]['range'] == (715, 789)
    # 482 really is somewhere — in πν, De spiritu 481a-486a — and the
    # report must offer that. The old table had no πν at all.
    assert 'πν' in bad[0]['fits']


def test_the_gate_still_reads_the_real_corpus():
    """Same defect, real ink: page 056-R carries `Ζγε3. 482 b` (checked against
    the reconciled text). With the derived table the range check must flag it."""
    bad, _ = scan(56, 'R', ranges=True)
    hits = [b for b in bad if b['siglum'].startswith('Ζγ') and b['bekker'] == 482]
    assert hits, 'the known Ζγε3. 482b on page 056-R was not reported'
