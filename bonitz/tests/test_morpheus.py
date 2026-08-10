"""Greek, not a concordance: does this spelling exist at all?

⚠ THE AUTHORITY THIS PROJECT KEPT REACHING FOR AND DID NOT HAVE. Every other
source here answers about a CORPUS — what Aristotle writes, what LSJ lists —
and so mistakes its own gaps for facts about the language. That error has been
found seven times in this module's neighbours. Morpheus GENERATES forms from
the grammar, so its silence means "Greek does not form this", not "I have not
seen it".
"""

import pytest

from bonitz_pipeline import morpheus
from bonitz_pipeline.breathing_oracle import decide as lexicon

def test_morpheus_is_installed():
    """⚠ NOT A SKIP. Diogenes is installed on this machine, so a missing file
    is a moved or broken install — and an authority that switches itself off
    quietly is the failure this whole module was written to stop making."""
    assert morpheus.ANALYSES.exists(), (
        f'{morpheus.ANALYSES} is gone; the corpus pipeline reads the same file '
        f'for stage-4 morphology, so this breaks more than the oracle')


def test_the_beta_code_reader_is_actually_reading():
    """⚠ ASSERT IT FIRES. An index that decodes nothing returns silence, and
    silence is this module's normal answer — so a totally broken reader would
    look exactly like a cautious one."""
    assert morpheus.greek('a(lourgo/s') == 'ἁλουργός'
    assert morpheus.greek('ou)=sa') == 'οὖσα'
    assert morpheus.greek('a)/gei') == 'ἄγει'
    assert len(morpheus.index()) > 800_000


@pytest.mark.parametrize('word,want', [
    ('ἀλουργός', 'rough'),      # only ἁλουργός is Greek
    ('ἀγνή', 'rough'),          # only ἁγνή
    ('ἔκαστον', 'rough'),       # only ἕκαστον
])
def test_it_convicts_a_spelling_greek_does_not_form(word, want):
    got = morpheus.decide(word)
    assert got and got[0] == want, f'{word!r} -> {got}'


@pytest.mark.parametrize('word', ['ἕσθ', 'οὖσα', 'ἄγει', 'ἀγαθόν'])
def test_it_confirms_what_it_holds(word):
    got = morpheus.decide(word)
    assert got is None or got[0] == __import__(
        'bonitz_pipeline.breathing_oracle', fromlist=['breathing']
    ).breathing(word)


@pytest.mark.parametrize('word,why', [
    ('ἔστη', 'aorist of ἵστημι against the pluperfect ἕστη'),
    ('ἀφῆς', 'ἀφίημι against ἁφή — the lexicon oracle proposes rough here and '
             'Morpheus declines to corroborate it, which is the point of a '
             'second authority'),
])
def test_both_real_spellings_get_silence(word, why):
    assert morpheus.decide(word) is None, why


def test_it_never_contradicts_the_lexicon_oracle():
    """⚠ THE MEASUREMENT THAT EARNED IT ITS PLACE: over the whole adjudicated
    corpus, 4,214 words where both authorities speak, zero contradictions. Two
    independent sources agreeing is the only reason a second one is worth
    having; the day they diverge, something has broken and this says so."""
    from pathlib import Path
    from bonitz_pipeline.breathing_oracle import WORD, breathing, skeleton
    root = Path(__file__).resolve().parent.parent
    clash = []
    compared = 0
    for f in sorted((root / 'work/reconciled').glob('*.txt')):
        for line in f.read_text(encoding='utf-8').splitlines():
            for m in WORD.finditer(line):
                w = m.group(0)
                if breathing(w) == 'none' or len(skeleton(w)) < 4:
                    continue
                if line[m.end():m.end() + 1] in ('.', '-'):
                    continue
                a, b = morpheus.decide(w), lexicon(w)
                if a and b:
                    compared += 1
                if a and b and a[0] != b[0]:
                    clash.append((w, a[0], b[0]))
    # ⚠ AND ASSERT IT COMPARED SOMETHING. A test that iterates an empty set
    # passes for the wrong reason — the exact failure this project keeps
    # finding in its own lookups.
    assert compared > 5_000, f'only {compared} comparisons; the test went blind'
    assert not clash, f'{len(clash)} contradictions, e.g. {clash[:5]}'


def test_the_decoder_drops_almost_nothing():
    """⚠ THE CHECK THAT FOUND THE ELISION BUG. `greek()` returns None for a key
    it cannot read, and a decoder that silently refused 15,072 keys — every
    elided form Morpheus generates — produced an index 1.7% smaller with
    nothing anywhere to say so. Counting the refusals is the only way that is
    visible, so the count is the test."""
    dropped = kept = 0
    with morpheus.ANALYSES.open(encoding='utf-8', errors='replace') as fh:
        for line in fh:
            raw = line.split('\t', 1)[0]
            if raw.startswith('!'):
                continue
            g = morpheus.greek(raw)
            if g is None:
                dropped += 1
            else:
                assert g != '', f'{raw!r} decoded to nothing and would vanish'
                kept += 1
    # ⚠ A THRESHOLD IS NOT A MEASUREMENT. Codex, 2026-08-10: `dropped < 100`
    # would have passed with 99 corrupted records, and `greek()` returning an
    # EMPTY string counts as kept here while `index()` silently discards it.
    # Pin the exact number instead, so any new unreadable key has to be looked
    # at rather than absorbed.
    assert dropped == 13, f'{dropped:,} keys unread of {kept + dropped:,}'
    assert kept > 911_000, kept


def test_one_elision_mark_across_two_sources():
    """Bonitz's readers set U+1FBD, U+1FBF or U+2019; Morpheus writes ASCII."""
    assert morpheus.greek("a)ll'") == 'ἀλλ᾽'
    assert morpheus.key('ἀλλ᾽') == morpheus.key('ἀλλ’') == morpheus.key('ἀλλ᾿')


def test_the_one_known_wrong_proposal_is_still_wrong():
    """⚠ AN OCR FAILURE THAT LANDS ON A REAL WORD IS INVISIBLE HERE. Grok,
    2026-08-10: `χȣ̔́τω` is the χ of οὐχ glued onto οὕτω, and the glued result is
    Morpheus's crasis entry χοὔτω, smooth-only. So the module proposes smooth
    against a printed rough that is CORRECT — the only wrong proposal of 60.

    This pins it rather than fixing it, because the fix is not in this module:
    asking "is this a word?" cannot catch a word that was manufactured. An
    applier must not take this row, and the day the answer changes, someone
    should have to look at why."""
    got = morpheus.decide('χȣ̔́τω')
    assert got and got[0] == 'smooth', (
        f'χȣ̔́τω -> {got}. If this now returns None or rough, the behaviour '
        f'changed and the known-bad case needs re-judging, not re-pinning')
