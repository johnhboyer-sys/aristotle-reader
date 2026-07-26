"""The reconciled text must still say what John ruled it should say.

Every check in this pipeline is a hypothesis about the ink. These are
judgments of it by someone who can read the page, and they outrank any
check. If a future change to lexcheck, breathing, family or reconcile
quietly undoes one of them, this fails.
"""

import json
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
RULINGS = json.loads((Path(__file__).parent / 'fixtures' / 'john-rulings.json')
                     .read_text(encoding='utf-8'))


def line_of(page, col, n):
    p = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
    lines = unicodedata.normalize('NFC', p.read_text(encoding='utf-8')).splitlines()
    return lines[n - 1]


def cases(section, key):
    return [pytest.param(r, id=f"p{r['page']:03d}{r['col']}:{r.get('line', 0)}")
            for r in RULINGS[section].get(key, [])]


@pytest.mark.parametrize('r', cases('ligature', 'applied')
                            + cases('breathing', 'applied')
                            + cases('family', 'applied'))
def test_approved_corrections_are_still_in_the_text(r):
    line = line_of(r['page'], r['col'], r['line'])
    assert r['now'] in line, f"{r['now']} missing from {line!r}"
    assert line.count(r['now']) >= r.get('count', 1)
    # and the form he rejected is gone
    assert r['wrote'] not in line or r['wrote'] in r['now']


@pytest.mark.parametrize('r', cases('breathing', 'declined')
                            + cases('family', 'held'))
def test_declined_corrections_were_not_applied(r):
    """Recording the printer's error is a decision, not an oversight."""
    line = line_of(r['page'], r['col'], r['line'])
    assert r['keep'] in line, f"{r['keep']} was changed despite being ruled kept"


@pytest.mark.parametrize('r', [pytest.param(x, id=f"p{x['page']:03d}{x['col']}")
                               for x in RULINGS['print_errors_recorded_as_printed']['items']])
def test_print_errors_stay_as_printed(r):
    line = line_of(r['page'], r['col'], r['line'])
    assert r['text'] in line


@pytest.mark.parametrize('r', [pytest.param(x, id=x['text'])
                               for x in RULINGS['not_errors']['items']])
def test_words_ruled_correct_are_untouched(r):
    """These were flagged by a check and ruled correct. They must not drift."""
    p = ROOT / f"work/reconciled/page-{r['page']:03d}-{r['col']}.txt"
    text = unicodedata.normalize('NFC', p.read_text(encoding='utf-8'))
    assert r['text'] in text, f"{r['text']} was 'corrected' despite being ruled correct"
