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
    for f in sorted((root / 'work/reconciled').glob('*.txt')):
        for line in f.read_text(encoding='utf-8').splitlines():
            for m in WORD.finditer(line):
                w = m.group(0)
                if breathing(w) == 'none' or len(skeleton(w)) < 4:
                    continue
                if line[m.end():m.end() + 1] in ('.', '-'):
                    continue
                a, b = morpheus.decide(w), lexicon(w)
                if a and b and a[0] != b[0]:
                    clash.append((w, a[0], b[0]))
    assert not clash, f'{len(clash)} contradictions, e.g. {clash[:5]}'
