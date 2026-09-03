"""The corpus contradicting itself is a finding without a lexicon or a page.

`encoding_check` groups tokens by SHAPE — Latin homoglyphs folded into their
Greek twins — and reports any shape spelled two ways. These tests pin the
three things that make that claim worth anything:

THE MAP MUST BE NARROW. It holds only pairs that are the same ink, so a token
differing by a letter OUTSIDE it is a different word and not a finding.
`Bk` against `Βκ` is the case: `B`/`Β` is a homoglyph and `k`/`κ` is not, so
those are two tokens, not two spellings of one. Widen the map to include
`k`/`κ`, or `p`/`ρ`, and `test_a_difference_outside_the_map_is_a_different_word`
and `test_the_refused_lowercase_pairs_stay_out_of_the_map` fail. Empty the map
and the `AΖι` specimen stops being visible at all.

THE TIERS MUST STAY APART. A single-character token can be legitimately Latin
in one place and Greek in another — a Roman volume numeral beside a Greek
capital — so `I`/`Ι` is tier `weak` and never joins the strong count however
lopsided it is. Collapse the distinction and
`test_a_single_character_split_is_weak_never_split` fails.

THE CHECK MUST NOT RULE. The specimen is the reason: the RIGHT spelling of
`AΖι` has 3 sites and the wrong one 23, so majority is skew and not evidence.
Sites of the minority are listed because they are where a reader looks first,
and `test_the_siglum_note_is_evidence_not_a_verdict` pins that the one piece
of outside evidence offered is offered as a note.

And volume as well as verdict: shapes = consistent + split + weak by
construction, an empty glob raises, and the header is written even when
nothing is found. Unit tests run on synthetic columns in tmp_path; the last
test touches the real corpus and skips visibly when it is absent.
"""

import json
import unicodedata

import pytest

from bonitz_pipeline import encoding_check as ec
from bonitz_pipeline.encoding_check import EncodingCheckError
from bonitz_pipeline.siglum_check import Work

# Four works from Bonitz's key, enough for every siglum note below. The real
# key is not needed: these tests are about the corpus disagreeing with itself,
# which is the whole point of the module.
WORKS = {
    'Ζι': Work('Ζι', 'περὶ τὰ Ζῷα ἱστορίαι', 'HA', 486, 638),
    'Ρ': Work('Ρ', 'τέχνη Ῥητορική', 'Rh', 1354, 1420),
    'Η': Work('Η', 'Ἠθικὰ Νικομάχεια', 'EN', 1094, 1181),
    'ο': Work('ο', 'Οἰκονομικά', 'Oec', 1343, 1353),
}


def _columns(tmp_path, columns):
    """{'page-001-L': 'text', …} -> a reconciled directory's *.txt files."""
    rec = tmp_path / 'reconciled'
    rec.mkdir(exist_ok=True)
    for stem, text in columns.items():
        (rec / f'{stem}.txt').write_text(text, encoding='utf-8')
    return rec


def scan(tmp_path, columns, works=WORKS):
    """(findings, counts) over a synthetic corpus."""
    groups, counts = ec.gather(sorted(_columns(tmp_path, columns).glob('*.txt')))
    return ec.findings(groups, works, counts), counts


def by_shape(found):
    return {g.shape: g for g in found}


def spelt(group):
    """{spelling: count} — the row a reader reads."""
    return {s.text: s.count for s in group.spellings}


# ── the specimen ──────────────────────────────────────────────────────────

SPECIMEN = {
    'page-030-R': 'falconum species St Su p 100 n 13 AΖι I 93).\n',
    'page-040-R': 'saltatoria, genus incertum AZγ 35, acridium AZι 156 n 2,\n',
    'page-044-R': 'munis ad Ζι 32. 34 Su 106 n 30 AΖι I 77 n 1d).\n'
                  'scops AZι I 77 n 99. aquila AZι I 80.\n',
}


def test_a_two_spelling_multi_character_token_is_a_split_finding(tmp_path):
    """`AZι` with a LATIN Z against `AΖι` with a GREEK Ζ. Nothing outside the
    corpus is consulted: no lexicon, no Bekker range, no ink — only the fact
    that the file cannot have it both ways. Both counts are named, because
    29-against-5 and 15-against-14 are different findings."""
    found, _ = scan(tmp_path, SPECIMEN)
    g = by_shape(found)['ΑΖι']
    assert g.tier == 'split'
    assert spelt(g) == {'AZι': 3, 'AΖι': 2}
    assert g.majority == 'AZι'


def test_the_minority_sites_are_listed_and_the_majority_is_not(tmp_path):
    """Sites are where a reader looks first, so the likely errors carry them
    and the majority does not — a listing of 23 identical sites is noise."""
    found, _ = scan(tmp_path, SPECIMEN)
    g = by_shape(found)['ΑΖι']
    assert [s.text for s in g.minority()] == ['AΖι']
    assert set(g.minority()[0].sites) == {'page-030-R:1', 'page-044-R:1'}
    majority = [s for s in g.spellings if s.text == g.majority][0]
    assert majority.sites == ('page-040-R:1', 'page-044-R:2', 'page-044-R:2')


def test_the_siglum_note_is_evidence_not_a_verdict(tmp_path):
    """The one piece of outside evidence the report offers, and it points
    AGAINST the majority: the Greek run of `AΖι` is `Ζι`, one of Bonitz's
    sigla, while the Greek run of `AZι` is a bare `ι`, which is nothing. The
    module notes it and still calls `AZι` the majority — it reports skew and
    refuses to rule on it."""
    found, _ = scan(tmp_path, SPECIMEN)
    g = by_shape(found)['ΑΖι']
    notes = {s.text: s.sigla for s in g.spellings}
    assert notes['AΖι'] == 'Ζι = περὶ τὰ Ζῷα ἱστορίαι'
    assert notes['AZι'] == ''
    assert g.majority == 'AZι'      # the note did NOT move the verdict


# ── the map ───────────────────────────────────────────────────────────────

def test_a_consistent_corpus_yields_nothing(tmp_path):
    found, counts = scan(tmp_path, {
        'page-001-L': 'ἀδίκημα Ηε10. 1135 a8. εἴδη Ρα13. 1359a25.\n',
        'page-001-R': 'ἀδικεῖν Ηε15. 1136 a33. εἴδη Ρα14. 1360a1.\n'})
    assert found == []
    assert counts['split'] == counts['weak'] == 0
    assert counts['consistent'] == counts['shapes']


def test_a_difference_outside_the_map_is_a_different_word(tmp_path):
    """`Bk` is Bekker and `Βκ` is not anything of the sort. `B`/`Β` is the
    same ink; `k`/`κ` is not — Greek kappa has no ascender — so the map does
    not hold it and these stay two tokens. Admit `k`/`κ` and this fails,
    which is the guard: a pair that is NOT visually identical turns a real
    difference into an encoding split."""
    found, _ = scan(tmp_path, {'page-001-L': 'Bk 3 Βκ 4 Bk 5 Βκ 6\n'})
    assert found == []


def test_the_refused_lowercase_pairs_stay_out_of_the_map(tmp_path):
    """Bonitz's Latin apparatus is full of one-letter abbreviations — `p 100`
    (pagina), `n 13` (nota), `v l` (varia lectio), `i e`, `a` — and every one
    of them has a Greek letter it does NOT look like. Fold any of those pairs
    and the check files the apparatus as errors."""
    assert set(ec.LOWER_HOMOGLYPH) == {'o'}
    for latin, greek in (('p', 'ρ'), ('i', 'ι'), ('a', 'α'), ('n', 'η'),
                         ('v', 'ν'), ('u', 'υ'), ('x', 'χ'), ('y', 'γ'),
                         ('c', 'ϲ'), ('w', 'ω'), ('l', 'ι'), ('k', 'κ')):
        assert ec.FOLD.get(latin, latin) != greek, f'{latin}/{greek} admitted'
    found, _ = scan(tmp_path, {
        'page-001-L': 'St Su p 100 n 13 v l a 4\n',
        'page-001-R': 'ρ 100 η 13 ν λ α 4\n'})
    assert found == []


def test_the_one_admitted_lowercase_pair_finds_the_oeconomica_site(tmp_path):
    """`o`/`ο` is in the map because a circle is a circle in any type, and it
    earns its place on the real corpus: `Αἰολίς oβ1351 b19` at page-030-L:31,
    one Latin o against 42 Greek."""
    found, _ = scan(tmp_path, {
        'page-030-L': 'Αἰολίς oβ1351 b19.\n',
        'page-030-R': 'Αἴγινα οβ1346 b13. Ἀθῆναι οβ1347 a4.\n'})
    g = by_shape(found)['οβ']
    assert g.tier == 'split' and spelt(g) == {'οβ': 2, 'oβ': 1}
    assert g.minority()[0].sites == ('page-030-L:1',)


# ── the tiers ─────────────────────────────────────────────────────────────

def test_a_single_character_split_is_weak_never_split(tmp_path):
    """`I` is a Roman volume numeral and `Ι` is a Greek capital, and both are
    right in their own places — the corpus alone cannot separate them. So a
    one-character group is `weak` however lopsided, and the strong count must
    not move. Collapse the tiers and this fails."""
    found, counts = scan(tmp_path, {
        'page-001-L': 'AΖι I 77 n 1. Su I 93. Ι 5.\n'})
    g = by_shape(found)['Ι']
    assert g.tier == 'weak'
    assert spelt(g) == {'I': 2, 'Ι': 1}
    assert counts['weak'] == 1
    assert counts['split'] == 0
    assert [x.shape for x in found if x.tier == 'split'] == []


def test_split_groups_are_printed_before_weak_ones(tmp_path):
    """Strength is the ordering, not size: the weak tier is a queue of
    ambiguities and must not sit above the findings."""
    found, _ = scan(tmp_path, {
        'page-001-L': 'I 1. I 2. I 3. I 4. Ι 5. AZι 6. AΖι 7.\n'})
    assert [g.tier for g in found] == ['split', 'weak']


def test_a_tie_lists_every_site(tmp_path):
    """Where no spelling has strictly more sites than the rest there is no odd
    one out, and calling the alphabetically first one "majority" would hide
    the other's sites. Both are listed."""
    found, counts = scan(tmp_path, {'page-001-L': 'AZγ 35. AΖγ 22.\n'})
    g = by_shape(found)['ΑΖγ']
    assert g.majority == ''
    assert {s.text for s in g.minority()} == {'AZγ', 'AΖγ'}
    assert counts['tied'] == 1


def test_a_shape_seen_once_cannot_be_a_finding(tmp_path):
    """Stated because it is load-bearing and invisible: a group needs two
    distinct spellings, so it needs two occurrences. Singletons never arise
    as findings by construction and no filter excludes them."""
    found, counts = scan(tmp_path, {'page-001-L': 'AΖι I 77 n 1d).\n'})
    assert found == []
    assert counts['consistent'] == counts['shapes']


# ── normalisation ─────────────────────────────────────────────────────────

def test_a_precomposed_accent_and_a_combining_one_are_one_spelling(tmp_path):
    """A normalisation difference is `normalize.py`'s business, not an
    encoding split. Folding it in here would file the corpus by the thousand,
    and none of them would be about a Latin letter."""
    word = 'ἀδίκημα'
    decomposed = unicodedata.normalize('NFD', word)
    assert decomposed != word, 'the fixture is not testing anything'
    found, counts = scan(tmp_path, {'page-001-L': f'{word} 1.\n',
                                    'page-001-R': f'{decomposed} 2.\n'})
    assert found == []
    assert counts['tokens'] == 2 and counts['consistent'] == 1


# ── volume ────────────────────────────────────────────────────────────────

MIXED = {
    'page-001-L': 'εἴδη Ρα13. 1359a25. AZι I 77. Bk 3.\n'
                  'ἀδικεῖν Ηε15. 1136 a33.\n',
    'page-001-R': 'AΖι I 93. Βk 4. εἴδη Ρα14.\n',
}


def test_the_volumes_add_up(tmp_path):
    found, c = scan(tmp_path, MIXED)
    assert c['columns'] == 2
    assert c['shapes'] == c['consistent'] + c['split'] + c['weak']
    assert c['split'] + c['weak'] == len(found)
    assert c['tokens'] == c['foldable'] + c['unfoldable']
    assert c['minority-sites'] == sum(s.count for g in found
                                      for s in g.minority())


def test_summary_states_every_volume(tmp_path):
    _, c = scan(tmp_path, MIXED)
    s = ec.summary(c)
    assert '2 columns read' in s
    assert f"{c['tokens']} tokens examined" in s
    assert f"{c['shapes']} distinct shape keys" in s
    for tier in ec.TIERS:
        assert f'tier {tier}' in s
    assert 'consistent' in s
    assert 'cannot split, by construction' in s     # what was passed over
    assert 'NFC' in s                               # and why


# ── main ──────────────────────────────────────────────────────────────────

def _sigla(tmp_path):
    """Bonitz's key, cut to the works these runs need."""
    p = tmp_path / 'work-sigla.json'
    p.write_text(json.dumps({'works': [
        {'siglum': 'Ζι', 'title': 'περὶ τὰ Ζῷα ἱστορίαι', 'manifest': 'HA',
         'bekker': '486a-638b'},
        {'siglum': 'Ρ', 'title': 'τέχνη Ῥητορική', 'manifest': 'Rh',
         'bekker': '1354a-1420a'},
    ]}), encoding='utf-8')
    return p


def test_empty_reconciled_glob_raises(tmp_path):
    """Never looked must never read as clean."""
    (tmp_path / 'reconciled').mkdir()
    with pytest.raises(EncodingCheckError, match='no reconciled columns'):
        ec.main(['--reconciled', str(tmp_path / 'reconciled'),
                 '--sigla', str(_sigla(tmp_path)),
                 '--out', str(tmp_path / 'out.tsv')])


def test_main_writes_the_tsv_and_prints_the_volumes(tmp_path, capsys):
    rec = _columns(tmp_path, SPECIMEN)
    out = tmp_path / 'sweeps' / 'encoding-check.tsv'
    assert ec.main(['--reconciled', str(rec), '--sigla', str(_sigla(tmp_path)),
                    '--out', str(out)]) == 0
    lines = out.read_text(encoding='utf-8').splitlines()
    assert lines[0] == ec.TSV_HEADER.rstrip('\n')
    rows = [dict(zip(lines[0].split('\t'), l.split('\t'))) for l in lines[1:]]
    minority = [r for r in rows if r['shape'] == 'ΑΖι'
                and r['spelling'] == 'AΖι'][0]
    assert minority['tier'] == 'split' and minority['count'] == '2'
    assert minority['codepoints'] == (
        'LATIN CAPITAL LETTER A + GREEK CAPITAL LETTER ZETA + '
        'GREEK SMALL LETTER IOTA')
    assert minority['sites'] == 'page-030-R:1 page-044-R:1'
    assert minority['sigla'] == 'Ζι = περὶ τὰ Ζῷα ἱστορίαι'
    majority = [r for r in rows if r['shape'] == 'ΑΖι'
                and r['spelling'] == 'AZι'][0]
    assert majority['sites'] == ''       # sites are for the likely errors
    printed = capsys.readouterr().out
    assert '3 columns read' in printed
    assert 'never edits the corpus' in printed        # the diplomatic rule
    assert 'ENCODING claim, not a claim about the ink' in printed


def test_header_is_written_even_with_no_findings(tmp_path, capsys):
    rec = _columns(tmp_path, {'page-001-L': 'ἀδίκημα Ηε10. 1135 a8.\n'})
    out = tmp_path / 'encoding-check.tsv'
    assert ec.main(['--reconciled', str(rec), '--sigla', str(_sigla(tmp_path)),
                    '--out', str(out)]) == 0
    # "ran, found none" must be distinguishable from "never ran"
    assert out.read_text(encoding='utf-8') == ec.TSV_HEADER


# ── the real corpus ───────────────────────────────────────────────────────

REAL = sorted((ec.ROOT / 'work/reconciled').glob('*.txt'))


@pytest.mark.skipif(not REAL or not ec.SIGLA.exists(),
                    reason='the real corpus or the siglum key is not present')
def test_the_real_corpus_reproduces_the_aubert_wimmer_split():
    """The specimen, after John ruled it.

    ⚠ THE SPLIT THIS TEST WAS BUILT ON IS CLOSED. It read 23 `AZι` against 3
    `AΖι`, and 3 `AZγ` against 2 `AΖγ`, and pinned the whole 34-token family
    so a change in tokenising could not quietly move a count. On 2026-08-13
    John ruled the zeta Greek throughout — 29 sites carried a Latin `Z` and
    were wrong — and `audit_apply` wrote it. The family is now spelt one way,
    so the counts move from a split to a total, and what this test pins is
    that the mending reached every member and invented no new one.
    """
    from bonitz_pipeline.siglum_check import inventory
    groups, counts = ec.gather(REAL)
    found = ec.findings(groups, inventory(), counts)
    assert counts['columns'] == len(REAL) >= 96
    assert counts['shapes'] == (counts['consistent'] + counts['split']
                                + counts['weak'])
    shapes = by_shape(found)

    text = '\n'.join(p.read_text(encoding='utf-8') for p in REAL)
    # ⚠ FLOORS, NOT A SNAPSHOT. These were exact counts over pages 15-62 and
    # broke the moment 63-102 were reconciled — page-072-L:52 carries a 27th
    # `AΖι` in `(πλὴν ἀνθρώπȣ om AΖι II 183)`, which is the very form being
    # counted. The claim under test is that the family is Latin A + GREEK Ζι,
    # never Latin AZ; pinning a total asserts the corpus has stopped growing,
    # which it has not.
    assert text.count('AΖι') >= 26 and text.count('AΖγ') >= 5

    # ⚠ THE RULE IS ABOUT WHAT FOLLOWS THE Z, NOT ABOUT THE TOKEN. An earlier
    # version of this test asserted `AZιI` KEEPS a Latin Z, on the reading that
    # a Roman volume numeral made it Latin apparatus. That was wrong and it
    # pinned the defect in place: `AΖι I 77` is the editor's key (Latin A,
    # Aubert-Wimmer) followed by the ARISTOTELIAN WORK siglum (Greek Ζι) and
    # then the volume as a Roman numeral. Only the numeral is Latin. Three
    # sites on pages 27-48 kept a Latin Z through the 2026-08-13 mend for
    # exactly this reason, inside the range that mend had already run over.
    #
    # So the claim is stated where it actually lives — on the boundary. A
    # Latin Z before a GREEK letter is a work siglum spelt wrong; a Latin Z
    # before anything else is Zeller, Zeitschr, Ztschr, or a Homeric book
    # letter, and is not this family's business.
    import re as _re
    wrong = _re.findall(r'.{0,6}Z(?=[Ͱ-Ͽἀ-῿])', text)
    assert wrong == [], wrong

    # And the mend did not over-reach: the genuinely Latin ones survive.
    assert 'Zeller' in text and 'Zeitschr' in text

    # ⚠ AND THE SHAPES ARE NO LONGER FINDINGS. A split group that stayed a
    # split group after the apply would mean a member was missed.
    for shape in ('ΑΖι', 'ΑΖγ', 'ΑΖιΙ'):
        assert shape not in shapes

    # ⚠ NAMED, NOT COUNTED — for the same reason the weak set is, twelve lines
    # down. This was `counts['split'] == 0`, true of the corpus the day the
    # last encoding sweep finished, and promoting 107-117 made it false: the
    # Latin spine brought ten families spelt two ways (`cοrum`/`corum`,
    # `Rοse`/`Rose`, `Βran`/`Bran`), which is a sitting's work and not a bug.
    #
    # A count cannot tell "the new tranche arrived unswept" from "a swept
    # family came apart again", and only the second is worth failing over. So
    # the OUTSTANDING set is pinned. Sweeping shrinks it — an empty set still
    # passes — and any family not on this list is a regression in text that
    # was already settled.
    # Swept on 2026-08-26 — John ruled all ten and the set is closed again.
    # It stays a SET rather than reverting to `== 0` so the next tranche can
    # arrive unswept without breaking a guard that is about regressions.
    OUTSTANDING: set = set()
    # ⚠ THE SPLIT TIER ONLY. `shapes` holds both tiers, and the weak one —
    # single-character tokens like `Α` and `ο` — is reported apart, never
    # counted strong, and pinned as its own set below.
    split_shapes = {k for k in shapes if len(k) > 1}
    unexpected = sorted(split_shapes - OUTSTANDING)
    assert not unexpected, (
        f'a family that was settled is spelt two ways again: {unexpected}')

    # ⚠ NAMED, NOT COUNTED. This was `counts['weak'] == 6`, a snapshot of
    # pages 15-62, and the doubled corpus made it 7 — `Ζ` joined when Zeller
    # and the Homeric book letters arrived. A count cannot tell "a seventh
    # letter turned up" from "one of the six changed into another", and the
    # second is worth failing over. So the SET is pinned.
    #
    # These are genuine ambiguity, not a queue. Each is a single capital whose
    # Greek and Latin forms are one printed sort, where the citation does not
    # settle which codepoint was meant. John has not ruled them and this test
    # does not ask him to.
    #
    # ⚠ `ο` JOINED WHEN 107-117 ARRIVED, and it is the first LOWERCASE member.
    # That tranche is half Latin and was spined by swapping calamari in line by
    # line, so Latin `o` and Greek omicron now stand in the same corpus in words
    # that are otherwise identical. Same reason as `Ζ`: a new letter turning up
    # is the corpus growing, and the set says which letters, not how many.
    weak = {g.shape for g in found if g.tier == 'weak'}
    # ⚠ `ο` LEFT THIS SET ON 2026-08-27 AND THAT IS THE POINT OF THE SWEEP. The
    # weak tier is shapes the corpus spells two ways, and the Greek omicron sat
    # here only because Latin words held one: `Sο-`, `Μeteoro1ogica`, `dοcti-`,
    # `coe1`. Ruling those closed the split, so the corpus no longer contradicts
    # itself about `ο` at all. If `ο` comes BACK, a Latin word has taken a Greek
    # omicron again and `script_mix` should have caught it first.
    assert weak == set('ΑΒΖΙΚΜΧ'), sorted(weak)
    assert all(len(g.shape) == 1 for g in found if g.tier == 'weak')


@pytest.mark.skipif(not REAL, reason='work/reconciled is absent')
def test_every_spelling_in_a_group_has_the_shape_s_length():
    """The fold is 1:1, which is what makes "the position where the spellings
    differ" a well-formed question and the tier test (`len(shape) > 1`) mean
    what it says. A many-to-one map would break both silently."""
    groups, counts = ec.gather(REAL[:12])
    for shape, spellings in groups.items():
        assert all(len(s) == len(shape) for s in spellings), shape
    assert counts['tokens'] > 1000, f'only {counts["tokens"]} tokens read'


def test_fold_leaves_a_character_the_map_does_not_hold(tmp_path):
    """A shape key is a canonical form, not a claim that the token is Greek:
    `Bk` folds to `Βk` and keeps its Latin k."""
    assert ec.fold('Bk') == 'Βk'
    assert ec.fold('AZι') == ec.fold('AΖι') == 'ΑΖι'
    assert ec.fold('oβ') == 'οβ'
