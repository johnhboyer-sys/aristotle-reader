"""The bare-book-letter rule, pinned before the checker is believed.

John's condition on this work: model the inheritance FIRST, because a checker
that reads a bare book letter as a work siglum condemns 29 correct citations
and buries the real errors under them.  A report nobody trusts is a report
nobody reads, so the inheritance is the load-bearing part and everything else
is arithmetic.

The rule: `Ζιε13. 544a32. ζ1. 558b13` — the second citation drops the work and
means "book ζ of the work I last named".  It does NOT mean the work ζ
(περὶ Νεότητος), even though ζ is a real siglum in Bonitz's key.

What makes this decidable without heuristics is that the BEKKER PAGE
adjudicates.  The work ζ runs 467b-470b; 558 is not in it.  HA runs 486a-638b;
558 is.  Both readings are offered to the page and the page picks.
"""

import pytest

from bonitz_pipeline.siglum_check import (BOOK_LETTERS, CITE, Cite, inventory,
                                          resolve, split)

WORKS = inventory()


def cite(token, page, col='page-000-L', line=1, chapter='1', column='a'):
    return Cite(col, line, f'{token}{chapter}. {page}{column}', token,
                chapter, page, column)


# ---------------------------------------------------------------- inventory

def test_the_three_range_entries_expand_to_their_members():
    """Bonitz prints `Ααβ` and `τα-θ` for families, not as sigla. A citation
    uses one member, so the family must be expanded or every Prior Analytics
    and Topics citation reports as an unknown siglum."""
    for s in ('Αα', 'Αβ', 'Αγ', 'Αδ'):
        assert s in WORKS, f'{s} missing — the Ααβ/Αγδ ranges did not expand'
    for s in ('τα', 'τβ', 'τγ', 'τδ', 'τε', 'τζ', 'τη', 'τθ'):
        assert s in WORKS, f'{s} missing — the τα-θ range did not expand'
    assert 'Ααβ' not in WORKS and 'τα-θ' not in WORKS, \
        'the family shorthand is not itself a citable siglum'
    assert 'τϛ' not in WORKS, 'the Topics has eight books, α…θ, with no stigma'


def test_the_historia_animalium_runs_through_book_kappa():
    """`486a-633b` is the Historia animalium WITHOUT book κ — 633b is exactly where
    book ι ends. Bonitz cites book κ eight times (636a, 637b ×4, 638a, and the bare
    `κ5. 637a`, `κ7. 638b`), so the range in this table has to hold them.

    This number is mine, not Bonitz's: his key prints the siglum and the title, and
    the Bekker spans in `work-sigla.json` are supplied reference data. Nothing
    diplomatic is at stake — it was simply wrong, and it manufactured seven of the
    thirteen "work named beside the wrong page" findings out of nothing."""
    assert WORKS['Ζι'].hi == 638, (
        f"Historia animalium ends at {WORKS['Ζι'].hi}; book κ runs 633b-638b and "
        f"Bonitz cites it")
    assert WORKS['Ζι'].holds(637) and WORKS['Ζι'].holds(638)
    assert not WORKS['Ζι'].holds(639), 'De partibus starts at 639a'


def test_the_ambiguous_sigla_are_all_present():
    """Case is Bonitz's own and is significant — Ζι/ζ, Μ/μ, Ο/ο, Π/π are
    different works. If the loader ever folds case, this fails."""
    for s in ('Ζι', 'ζ', 'Μ', 'μ', 'Ο', 'ο', 'Π', 'π', 'Ρ', 'ρ', 'Φ', 'φ',
              'Κ', 'κ'):
        assert s in WORKS, f'{s} is missing from the inventory'
    assert WORKS['Ζι'].lo != WORKS['ζ'].lo, 'Ζι and ζ collapsed into one work'


# ------------------------------------------------------------------- split

def test_split_enumerates_rather_than_decides():
    """`ζ` is a work AND a book letter; `Ζιε` is a work plus a book. The
    splitter must offer both readings, because only the page can choose."""
    assert ('ζ', '') in split('ζ', WORKS)
    assert ('Ζι', 'ε') in split('Ζιε', WORKS)


def test_split_refuses_a_tail_that_is_not_a_book_letter():
    assert split('Ζι9', WORKS) == []


# ------------------------------------------------------- the inheritance rule

def test_a_bare_book_letter_inherits_the_work_last_named():
    """The load-bearing case, from NOTES: HA book 6, not the work ζ."""
    cs = [cite('Ζιε', 544), cite('ζ', 558)]
    resolve(cs, WORKS)
    assert cs[0].work == 'Ζι' and cs[0].how == 'explicit'
    assert cs[1].work == 'Ζι', (
        f'bare ζ resolved to {cs[1].work!r}; it must inherit HA from the '
        f'citation before it')
    assert cs[1].book == 'ζ' and cs[1].how == 'inherited'


def test_the_same_letter_inherits_a_different_work_in_another_context():
    """`Ηζ2. 1139b9. ζ4. 1140a19` is EN book 6. Same letter, same shape,
    different answer — which is why this cannot be a lookup table."""
    cs = [cite('Ηζ', 1139), cite('ζ', 1140)]
    resolve(cs, WORKS)
    assert cs[0].work == 'Η'
    assert cs[1].work == 'Η' and cs[1].how == 'inherited'


def test_the_work_wins_when_the_page_is_actually_in_it():
    """Inheritance must not swallow a genuine citation of the work ζ. Given a
    page inside 467b-470b, ζ is the work and nothing is inherited."""
    lo = WORKS['ζ'].lo
    cs = [cite('Ζιε', 544), cite('ζ', lo + 1)]
    resolve(cs, WORKS)
    assert cs[1].work == 'ζ' and cs[1].how == 'explicit'


def test_inheritance_does_not_cross_an_unresolved_citation():
    """A misreading must not become the context for what follows it, or one
    bad siglum silently re-labels every bare book letter after it."""
    cs = [cite('Ζιε', 544), cite('Ζμ', 9999), cite('ζ', 558)]
    resolve(cs, WORKS)
    assert cs[1].how == 'unresolved'
    assert cs[2].work == 'Ζι', 'inheritance took its context from a misreading'


def test_a_bare_letter_with_no_context_is_unresolved_not_guessed():
    cs = [cite('δ', 1295)]
    resolve(cs, WORKS)
    assert cs[0].how == 'unresolved'


# ----------------------------------------------------------- the real finding

def test_a_work_named_beside_the_wrong_page_is_reported():
    """The Ζιθ28 class, and the whole point of the exercise: Ζμ is De partibus
    at 639-697, so it cannot stand beside a page in the 600s that belongs to
    HA... nor beside 1139, which is the Ethics."""
    cs = [cite('Ζμ', 1139)]
    resolve(cs, WORKS)
    assert cs[0].how == 'unresolved'
    assert 'De part' in cs[0].why or str(WORKS['Ζμ'].lo) in cs[0].why


def test_an_unknown_siglum_is_reported_as_such():
    cs = [cite('Ζυ', 616)]
    resolve(cs, WORKS)
    assert cs[0].how == 'unresolved'


def test_final_sigma_is_not_accepted_as_the_numeral_six():
    """`πκς` against `πκϛ`×14 — ς in a numeral slot is a misread stigma, and
    accepting it would launder a known reader error."""
    assert 'ς' not in BOOK_LETTERS
    assert 'ϛ' in BOOK_LETTERS


# ------------------------------------------- when the page knows and nothing else does

def test_a_bare_letter_whose_page_names_one_work_is_inferred_not_condemned():
    """The module's docstring promises the page adjudicates, and step 2 only ever
    offered the page ONE candidate — the work last named. When that fails, the page
    still knows the answer: Bekker spans are disjoint, so 731 is De generatione and
    nothing else.

    This is a THIRD outcome, not a resolution. It says the citation is sound and the
    context we carried into it was not, which is a parser complaint, not a reader's
    misreading — so it must not sit in the same pile as `Ζιθ28`."""
    cs = [cite('Φθ', 260), cite('β', 731)]
    resolve(cs, WORKS)
    assert cs[1].how == 'page-inferred', (
        f'reported as {cs[1].how!r}; 731 is uniquely De generatione')
    assert cs[1].work == 'Ζγ' and cs[1].book == 'β'
    assert 'Φ' in cs[1].why, 'the report must name the context it overrode'


def test_an_inference_does_not_become_the_context_for_what_follows():
    """⚠ THIS TEST REPLACES ONE THAT CLAIMED THE OPPOSITE, and the claim was
    wrong. I had page-inference set the work last named, reasoning that the page
    is better evidence than inheritance. Grok's review of the fix, 2026-08-09:
    *"the code confuses 'context was invisible' with 'context was wrong'."*

    A page can be mistyped. If it is, and the wrong page happens to name some
    other work uniquely, then setting the context from it spends the one error
    signal we had on repairing the context — and every bare letter after it
    inherits the wrong work in silence, with the work-level check content.

    Nothing is lost by refusing. A following bare letter that really is in the
    same work will infer that work from its OWN page, and be labelled an
    inference rather than borrowing the standing of one."""
    cs = [cite('Φθ', 260), cite('β', 731), cite('δ', 764)]
    resolve(cs, WORKS)
    assert cs[2].work == 'Ζγ', 'the page still names De generatione'
    assert cs[2].how == 'page-inferred', (
        f'reported as {cs[2].how!r} — it must stand on its own page, not on the '
        f'inference before it')


def test_page_inference_is_not_blocked_by_the_numeral_bound():
    """The bound belongs to the INHERITANCE claim, not to the branch. It used to
    gate both, so a bare Metaphysics μ or ν after any non-Metaphysics work was
    thrown out before the page was ever consulted: read against the wrong work
    they are 40 and 50, over the bound, and the branch was skipped whole.

    The asymmetry is the tell — bare κ (20) after Physics inferred the
    Metaphysics happily, and bare μ (40) did not, though the page is just as
    decisive for both."""
    for letter, page in (('μ', 1080), ('ν', 1090), ('κ', 1050)):
        cs = [cite('Φθ', 260), cite(letter, page)]
        resolve(cs, WORKS)
        assert cs[1].how == 'page-inferred', (
            f'bare {letter} at {page} reported as {cs[1].how!r}; {page} is in the '
            f'Metaphysics and nothing else')
        assert cs[1].work == 'Μ'


def test_a_book_numeral_too_large_for_its_own_work_is_reported():
    """`Πο4. 1290b` resolved as healthy Politics — book ο, which is 70. The
    numeral guard existed and was never applied on the path where a work IS
    named, which is where a complete piece of garbage most often sits: page 1290
    really is in the Politics, so nothing else could catch it.

    1290 is Politics book δ, and δ/ο is the kind of confusion the ink decides."""
    cs = [cite('Πο', 1290)]
    resolve(cs, WORKS)
    assert cs[0].how == 'unresolved', (
        f'reported as {cs[0].how!r} — the 70th book of the Politics')
    assert '70' in cs[0].why, f'the report should name the number: {cs[0].why!r}'
    ok = [cite('Πδ', 1290)]
    resolve(ok, WORKS)
    assert ok[0].how == 'explicit', 'the guard must not touch a real book letter'


def test_a_page_no_work_owns_is_still_unresolved():
    """Inference must not become a way of never failing."""
    cs = [cite('Ζιε', 544), cite('β', 1835)]
    resolve(cs, WORKS)
    assert cs[1].how == 'unresolved'


def test_a_named_work_beside_a_wrong_page_is_not_relabelled_as_a_book_letter():
    """`πο8. 1408b` was reported as "book πο of the work last named" — and 1408 IS
    in the Rhetoric, so it did not even fail; it resolved, wrongly and silently.
    Both π and ο are book letters, so step 2 claimed the token and step 3 never ran.

    πο is περὶ Ποιητικῆς, a work in its own right. That is the fact a reader needs,
    because the choice in front of them is `Ργ7` against a misread Poetics siglum.
    Read as a numeral, πο is 80+70 = 150, and no work of Aristotle has 150 books.

    Inheritance still wins when it WORKS; this only governs what is said when the
    book numeral is impossible."""
    cs = [cite('Ρα', 1354), cite('πο', 1408)]
    resolve(cs, WORKS)
    assert cs[1].how == 'unresolved', (
        f'reported as {cs[1].how!r} — a 150th book of the Rhetoric')
    assert 'Ποιητ' in cs[1].why or '1447' in cs[1].why, (
        f'the report says {cs[1].why!r} — it must name πο as a work in its own '
        f'right, since that is the reading a misreading would have corrupted')


def test_inheritance_still_wins_where_it_works():
    """The guard on the change above: the load-bearing case must not regress."""
    cs = [cite('Ζιε', 544), cite('ζ', 558)]
    resolve(cs, WORKS)
    assert cs[1].work == 'Ζι' and cs[1].how == 'inherited'


# ------------------------------------------------------------------- regex

@pytest.mark.parametrize('text,token,page', [
    ('Ζγβ6. 743 b36, 37.', 'Ζγβ', 743),
    ('ψγ7. 431 a5.', 'ψγ', 431),
    ('Ηε8. 1133 b26.', 'Ηε', 1133),
    ('κ6. 399a23.', 'κ', 399),
    ('δ10. 1295 a14.', 'δ', 1295),
])
def test_the_citation_regex_finds_the_shapes_bonitz_prints(text, token, page):
    m = CITE.search(text)
    assert m, f'no citation found in {text!r}'
    assert m.group(1) == token and int(m.group(3)) == page


# ------------------------------------------------------- Latin/Greek homoglyphs

def test_a_latin_capital_in_a_greek_siglum_is_caught_not_skipped():
    """Ρ and P are identical ink and different codepoints, so a reader typing
    the Latin one writes a citation that is correct on the page and wrong in
    the file. 67 are in the corpus and nothing caught them: every check either
    exempts siglum-shaped tokens or folds only Greek, and a Latin P never even
    looked like a siglum."""
    from bonitz_pipeline.siglum_check import HOMOGLYPH
    cs = [cite('Pα', 1354)]           # Rhetoric book α — Ρ written as Latin P
    resolve(cs, WORKS)
    assert cs[0].how == 'latin', (
        f'Latin-headed siglum reported as {cs[0].how!r}; it must be named as '
        f'the encoding error it is, not buried in the unresolved pile')
    assert cs[0].work == 'Ρ'
    assert HOMOGLYPH['P'] == 'Ρ'


def test_a_latin_headed_siglum_still_supplies_context_to_what_follows():
    """The citation is RIGHT on the page — only its encoding is wrong — so a
    bare book letter after it must still inherit. Treating it as unresolved
    would cascade into every citation that follows."""
    cs = [cite('Pα', 1354), cite('β', 1380)]
    resolve(cs, WORKS)
    assert cs[1].work == 'Ρ' and cs[1].how == 'inherited'


def test_a_latin_lookalike_that_is_not_a_real_siglum_stays_unresolved():
    """The homoglyph map must not become a way to invent sigla."""
    cs = [cite('XQ', 999)]
    resolve(cs, WORKS)
    assert cs[0].how == 'unresolved'
