"""The space between two words must be in the right place.

A space landing one character off leaves two tokens that each look like a
word, and every sweep here tokenises on whitespace first — so the boundary
itself is what nothing examines. Two sites survived every check the project
has; both appear below verbatim, each pinned to the tier that must catch it.

Three disciplines pinned here:

The onset list is a DERIVED natural class, not a hunch, and its width is the
whole risk. `test_no_attested_form_has_an_impossible_onset` runs the claim
against the real 56k form set from both sides: zero forms begin with any
cluster on the list, and every legal cluster the first pass over-reached on
(πτ-, κτ-, χθ-, φθ-, σθ-, τμ-, βδ-, μν-, πν-, κν-, θν-, γν-) carries attested
forms. Widen the list to include πτ and `test_legal_onset_clusters_are_never_flagged`
fails.

Tier `join` decides on attested forms, never on plausibility. Drop the
"printed form is not attested" requirement and
`test_a_join_whose_moved_form_is_unattested_is_only_counted` fails.

And volume as well as verdict: `test_volumes_add_up` pins tokens = findings +
every skip reason, so a zero-finding run cannot be told apart from a run that
never looked. An empty glob raises, and an empty attested-forms set raises
rather than quietly disabling tier `join` — which would be this project's
standing defect wearing new clothes.

Unit tests run on synthetic column text; the two integration tests touch the
real corpus and skip (visibly) when it is not present.
"""

import pytest

from bonitz_pipeline import division_check
from bonitz_pipeline.division_check import (
    IMPOSSIBLE_ONSETS, DivisionError, key, main, run, scan, write_tsv)
from bonitz_pipeline.lexcheck import FORMS_CACHE, load_forms
from bonitz_pipeline.siglum_check import inventory

# The two sites John found against the 400 dpi ink on 2026-08-13, verbatim.
SITE_JOIN = 'μηδὲν ἀξιȣ͂ νἀξίωμ᾽ ἄλογον, ἀλλ᾽ ἢ ἐπαγωγὴν ἢ ἀπόδειξιν'
SITE_ONSET = 'ἀθλητής, opp ἰδιώτης Ηγ11. 1116 b13. κληρȣ͂ ντȣς ἀθλητάς'

# Enough attested forms to decide the join sites, and nothing else — so a
# tier that stopped consulting the set would show up as a new finding.
FORMS = {'αξιουν', 'ουχ', 'ουτω', 'λογος', 'κληρουντος'}

WORKS = inventory()


def counts_of(text, forms=FORMS):
    return scan(text, 'page-000-X', forms, WORKS)[1]


def rows_of(text, forms=FORMS):
    return scan(text, 'page-000-X', forms, WORKS)[0]


# ── the two real sites ────────────────────────────────────────────────────

def test_the_join_site_is_caught_by_tier_join():
    rows = rows_of(SITE_JOIN)
    assert [r['tier'] for r in rows] == ['join']
    assert rows[0]['printed'] == 'ἀξιȣ͂ νἀξίωμ'
    assert rows[0]['proposed'] == 'ἀξιȣ͂ν ἀξίωμ'
    assert 'αξιουν is attested' in rows[0]['evidence']


def test_the_onset_site_is_caught_by_tier_onset():
    rows = rows_of(SITE_ONSET)
    assert [r['tier'] for r in rows] == ['onset']
    assert rows[0]['printed'] == 'κληρȣ͂ ντȣς'
    assert rows[0]['proposed'] == 'κληρȣ͂ντȣς'
    assert 'ντ-' in rows[0]['evidence']


# ── the guard that cost 11 false positives on the first pass ──────────────

LEGAL = ['πτηνόν', 'κτῆμα', 'χθών', 'φθόνος', 'σθένος', 'τμῆμα', 'βδελυρός',
         'μνήμη', 'πνεῦμα', 'κνήμη', 'θνητός', 'γνώμη', 'στέρησις', 'ψυχή']


@pytest.mark.parametrize('word', LEGAL)
def test_legal_onset_clusters_are_never_flagged(word):
    """Widen IMPOSSIBLE_ONSETS to include πτ and this dies on πτηνόν."""
    c = counts_of(f'ἀλλὰ {word} ἐστίν')
    assert c['onset'] == 0
    assert c['tokens'] == 3           # it was read, not merely not flagged


def test_every_impossible_onset_is_flagged_when_it_is_a_real_token():
    """Each cluster on the list earns its place: one synthetic word apiece."""
    for cluster in IMPOSSIBLE_ONSETS:
        c = counts_of(f'λόγος {cluster}ωσις ἐστίν')
        assert c['onset'] == 1, f'{cluster}- was not flagged'


# ── skips, each with its reason ───────────────────────────────────────────

def test_a_citation_siglum_is_skipped_and_counted():
    """`μβ` is Meteorologica β. Read as a word it is an impossible μ+β
    onset, and it occurs 110 times in the real corpus."""
    c = counts_of('ἀάζειν θερμόν μβ 8. 367b2.')
    assert c['onset'] == 0
    assert c['siglum'] == 1


def test_a_hyphenated_line_end_split_is_skipped_and_counted():
    """Bonitz's own line-end word breaks are legitimate: `κληρȣ-` / `ντȣς`
    is one word on two lines, and its second half may begin with anything."""
    c = counts_of('ἀλλὰ κληρȣ-\nντȣς ἀθλητάς\nἀθλητὰς ντȣ-\nσιν λόγος')
    assert c['onset'] == 0
    assert c['hyphen-fragment'] == 2   # the line-start half and the line-end one


def test_a_join_whose_moved_form_is_unattested_is_only_counted():
    """Delete the `moved in forms` requirement and this reports a finding."""
    c = counts_of('τȣ͂ ζωον ἐστίν')     # key('τȣ͂ζ') is not in FORMS
    assert c['join'] == 0
    assert c['pairs'] == 1
    assert c['no-evidence'] == 1


def test_a_join_whose_printed_token_is_also_attested_is_only_counted():
    """Delete the `printed not in forms` requirement and this reports."""
    forms = FORMS | {'ουλ', 'λογος'}
    c = counts_of('ȣ̓ λογος ἐστίν', forms)
    assert c['pairs'] == 1
    assert c['join'] == 0
    assert c['both-attested'] == 1


def test_a_pair_not_separated_by_a_plain_space_is_no_pair():
    """The tier is about a boundary; punctuation between the two tokens
    means the printer set a boundary there deliberately."""
    assert counts_of('ἀξιȣ͂, νἀξίωμ')['pairs'] == 0


# ── volume as well as verdict ─────────────────────────────────────────────

def test_volumes_add_up():
    text = ('ἀθλητής κληρȣ͂ ντȣς ἀθλητάς μβ 8. πτηνόν ἐστίν\n'
            'μηδὲν ἀξιȣ͂ νἀξίωμ ἄλογον, τȣ͂ ζωον\n'
            'ἀλλὰ κληρȣ-\nντȣς λόγος')
    rows, c = scan(text, 'page-000-X', FORMS, WORKS)
    legal = c['tokens'] - c['onset'] - c['siglum'] - c['hyphen-fragment']
    assert legal >= 0
    assert c['tokens'] == c['onset'] + c['siglum'] + c['hyphen-fragment'] + legal
    assert c['pairs'] == c['join'] + c['no-evidence'] + c['both-attested']
    assert len(rows) == c['onset'] + c['join']
    # and the counters are not all zero — the text really was read
    assert c['onset'] == 1 and c['join'] == 1 and c['siglum'] == 1
    # `κληρȣ͂ ντȣς` is weighed by BOTH tiers: onset flags it, and join finds
    # no evidence (the real word is κληρȣ͂ντȣς, not κληρȣ͂ν). The tiers are
    # independent by design, so the same boundary may appear in both tallies.
    assert c['hyphen-fragment'] == 1 and c['no-evidence'] == 2


def test_the_summary_states_every_skip_reason():
    _, c = scan(SITE_ONSET, 'page-000-X', FORMS, WORKS)
    text = division_check.summary(c)
    for reason in ('siglum', 'hyphen-fragment', 'no-evidence', 'both-attested',
                   'columns read', 'Greek tokens', 'ligature pairs'):
        assert reason in text


# ── refusing to report an empty scan ──────────────────────────────────────

def test_an_empty_reconciled_glob_raises(tmp_path):
    with pytest.raises(DivisionError, match='refusing to report an empty scan'):
        main(['--reconciled', str(tmp_path), '--out', str(tmp_path / 'o.tsv')])


def test_an_empty_forms_set_raises_rather_than_disabling_join(tmp_path, monkeypatch):
    """The decision this project keeps re-fixing: no evidence must never
    read as no findings. Tier `join` is not allowed to switch itself off."""
    (tmp_path / 'page-000-X.txt').write_text(SITE_JOIN, encoding='utf-8')
    monkeypatch.setattr(division_check, 'load_forms', set)
    with pytest.raises(DivisionError, match='attested-forms set is empty'):
        main(['--reconciled', str(tmp_path), '--out', str(tmp_path / 'o.tsv')])


def test_a_missing_cache_takes_lexchecks_rebuilding_loader(tmp_path):
    """The other half of that decision. An absent work/aristotle-forms.json
    is DERIVED data, so it is rebuilt from app/dist/data by lexcheck's own
    loader — not replaced by a local fallback that returns nothing."""
    assert division_check.load_forms is load_forms


def test_the_tsv_carries_a_header_even_when_empty(tmp_path):
    out = tmp_path / 'sweeps' / 'division-check.tsv'
    write_tsv([], out)
    assert out.read_text(encoding='utf-8').splitlines() == [
        'source\ttier\tprinted\tproposed\tevidence']


# ── the real corpus ───────────────────────────────────────────────────────

needs_cache = pytest.mark.skipif(
    not FORMS_CACHE.exists(),
    reason=f'{FORMS_CACHE} absent — the attested-forms evidence is unavailable')


@needs_cache
def test_no_attested_form_has_an_impossible_onset():
    """The derivation, checked from both sides against 56k real forms.

    The impossible clusters carry nothing; the legal ones the first pass
    over-reached on carry plenty. `μπ`, `γκ` and `γγ` each match the bare
    two-letter string itself — an LSJ headword artefact, not a word — so the
    bound is 1, not 0, and it is stated rather than rounded away.
    """
    forms = load_forms()
    assert len(forms) > 50_000, f'only {len(forms)} forms — the set is not the real one'
    for cluster in IMPOSSIBLE_ONSETS:
        real = [f for f in forms if f.startswith(cluster) and f != cluster]
        assert not real, f'{cluster}- is attested after all: {real[:5]}'
    for cluster in ('πτ', 'κτ', 'χθ', 'φθ', 'σθ', 'τμ', 'βδ', 'μν', 'πν',
                    'κν', 'θν', 'γν'):
        n = sum(1 for f in forms if f.startswith(cluster))
        assert n >= 4, f'{cluster}- has only {n} attested forms — is it legal?'


@needs_cache
def test_the_real_corpus_yields_the_known_sites_and_little_else():
    """Volume before verdict: the whole corpus, read, with the two known
    sites present and the finding count small enough to hand to John."""
    from bonitz_pipeline.division_check import ROOT
    files = sorted((ROOT / 'work/reconciled').glob('*.txt'))
    if not files:
        pytest.skip('work/reconciled is absent')
    rows, c = run(files, load_forms(), WORKS)
    assert c['columns'] >= 96, f'only {c["columns"]} columns read'
    assert c['tokens'] > 30_000, f'only {c["tokens"]} tokens examined'
    found = {(r['source'], r['tier']) for r in rows}
    # ⚠ AND THE ONSET FINDING IS GONE TOO, WHICH IS THE POINT OF IT. John
    # ruled it `none` on 2026-08-13 — neither the join the sweep proposed nor
    # the moved space the card offered was what the ink reads. On 2026-08-15
    # he read it himself: "two errors. `κληρȣ͂ν τȣς` but `τȣς` should have a
    # grave over the ligature". The space moved right AND the ligature took
    # its accent, which no card in this pipeline could offer, so it went in as
    # a hand card and the sweep now passes over mended text.
    assert ('page-025-L:12', 'onset') not in found
    # ⚠ THE TWO JOINS ARE GONE, AND THAT IS THE APPLY. He ruled both —
    # `ἀξιȣ͂ νἀξίωμ` → `ἀξιȣ͂ν ἀξίωμ` here, and `ȣ̓ χȣ̔́τω` → `ȣ̓χ ȣ̔́τω` at
    # page-050-R:50 — and `audit_apply` wrote them, so this sweep now passes
    # over mended text.
    assert ('page-047-R:2', 'join') not in found
    assert len(rows) <= 6, f'{len(rows)} findings is a queue, not a card: {rows}'


@needs_cache
def test_key_expands_the_ligature_the_way_lexcheck_does():
    assert key('ἀξιȣ͂ν') == 'αξιουν'
    assert key('ȣ̓χ') == 'ουχ'
