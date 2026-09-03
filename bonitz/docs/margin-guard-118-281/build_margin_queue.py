"""The 76 gutter numbers of 118-281, as a queue in the shape 107-117 used.

    python3 docs/margin-guard-118-281/build_margin_queue.py

⚠ THE READER FILE IS NOT EDITED. kraken's text is testimony; striking the
number out of it manufactures a reading nobody made. This writes a queue, the
way `queue-margin-107-117.json` did, and the correction reaches the text when
the corpus column is built — the same rule John gave for the line kraken missed
on 215-L: "add it to the corpus, but not to Kraken".

⚠ AND THE NUMBER IS NOT ALWAYS AT THE END. Bonitz sets the line numbers in the
INNER margin, between the two columns. For a left column that is its right-hand
edge, so the number lands at the END of the line; for a right column it is the
left-hand edge, so it lands at the START. Measured over all 76: 38 L columns,
every one at the tail; 37 R columns, every one at the head. A rule that strips
the trailing run would leave every R column untouched and corrupt nothing —
which is worse, because it would look done.

`becomes` is therefore side-dependent, and the entry says which end it cut.
"""
import csv
import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from bonitz_pipeline.normalize import canonical  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
SPINE = ROOT / 'work/kraken15-102/txt118-281'
CAL = ROOT / 'work/calamari/read118-281/txt'
OUT = ROOT / 'work/kraken15-102/apply/queue-margin-118-281.json'


def line_of(base, col, n):
    return base.joinpath(f'{col}.txt').read_text(
        encoding='utf-8').splitlines()[n - 1]


def strip_at(text, run, side):
    """Cut the marginal token off the head or the tail.

    ⚠ THE NUMBER IS USUALLY FUSED TO THE TEXT, NOT A SEPARATE WORD.
    `Ζιε14. 54540` is one token, `545` of it printed and `40` the margin. So the
    flagged SPAN is what gets cut, not a whole token — a token rule looks
    reasonable and silently drops every fused case, which is most of them.

    ⚠ EXCEPT A LEADING HYPHEN, WHICH BELONGS TO THE WORD. 209-L:45 comes through
    as `-4ς`, taking the hyphen of `ἀμ-` with it; cutting the span verbatim
    would eat the word-break the printer set. The hyphen is put back.

    ⚠ AND THE WHOLE RUN MUST BE THERE BEFORE ANY OF IT IS CUT. Trying the
    dash-stripped candidate as an alternative MATCH — rather than as an
    alternative CUT — lets it land on text the run never covered:
    `strip_at('λόγος145', '-45', 'L')` returned `λόγος1`, deleting a `45` that
    the flagged run does not sit on. Codex found it; no site in this tranche
    triggers it, which is exactly why it would have survived. So the presence
    test uses the run as flagged, and only the CUT is shortened to spare the
    hyphen.

    ⚠ AND THE TEST IGNORES SPACES, BECAUSE THE RUN DOES. The panel's regions are
    cut from `canonical()`'s whitespace-free stream, so `-4ς` is what it calls
    the `-` of `ἀμ-`, a space, and the `4ς` after it. A literal `endswith` never
    sees that and drops the site — which is how a stricter presence test lost
    three real sites the moment it was written.
    """
    core = ''.join(run.split())
    if not core:
        return None, None
    if side == 'L':
        s = text.rstrip()
        j, seen = len(s), ''
        while j > 0 and len(seen) < len(core):
            j -= 1
            if not s[j].isspace():
                seen = s[j] + seen
        if seen != core:
            return None, None
        # keep the printer's word-break hyphen; cut from the digits on
        if core[0] in '-—':
            j += 1
            while j < len(s) and s[j].isspace():
                j += 1
        return s[:j].rstrip(), j
    s = text.lstrip()
    lead = len(text) - len(s)
    j, seen = 0, ''
    while j < len(s) and len(seen) < len(core):
        if not s[j].isspace():
            seen += s[j]
        j += 1
    if seen != core:
        return None, None
    # at the head of a right column nothing precedes the margin, so a dash
    # there is the margin's own: cut the run whole.
    return s[j:].lstrip(), lead


WINDOW_TOKENS = 2


def window(spine, run, side):
    """The few words the card actually asks about, not the whole printed line.

    ⚠ A WHOLE-LINE OPTION RULES ON EVERYTHING IN THE LINE. 200-R:10 is the
    proof: kraken read a Latin `S` for the `Ξ` of `Ξενοφάνης`, genie and
    LlamaParse both read `Ξ`, and the panel had already flagged it on its own.
    With the whole line as the button, answering the MARGIN question would have
    written that `S` into the corpus as a ruling — converting a caught error
    into a settled one, on a card that never mentioned it. John caught it by
    eye on the first sitting.

    So the card offers a window: the last (or first) `WINDOW_TOKENS` words, the
    same size `queue-margin-107-117.json` used (`Ζμδ5. 682`). Everything else in
    the line stays a question for the panel, where it belongs.

    ⚠ AND BOTH BUTTONS MUST COVER THE SAME SPAN OF THE LINE. Taking the window
    from `spine` and the alternative from `becomes` independently slides it: on
    200-R the "was" read `1 διασαφηνίζω.` while the "read" option started a word
    later, at `διασαφηνίζω. Sενοφάνης` — putting the very `S` this window exists
    to keep out back into the button. So the window is cut ONCE, from the
    printed line, and the alternative is that same window with the run removed.
    """
    a = spine.split()
    if side == 'L':
        was = ' '.join(a[-WINDOW_TOKENS:])
        at = len(spine.rstrip()) - len(was)
    else:
        was = ' '.join(a[:WINDOW_TOKENS])
        at = len(spine) - len(spine.lstrip())
    now, _ = strip_at(was, run, side)
    # The cut has to fall INSIDE the window, or the card shows two identical
    # buttons and asks nothing.
    if now is None or now == was:
        return None, None, None
    return was, now, at


def stream_offset(col, n, idx):
    """`word_off`: the index in the column's canonical stream of the run's
    first character.

    ⚠ THE CARD CROPS BY THIS NUMBER, NOT BY SEARCHING FOR THE TEXT. John's rule
    4, from a real failure: `want.find(word)` once cropped the first occurrence
    of a repeated token and misled him on 417 sites. A marginal `2` occurs
    dozens of times in a column, so a search here would be that failure again.
    """
    text = SPINE.joinpath(f'{col}.txt').read_text(encoding='utf-8')
    lines = text.splitlines()
    raw = sum(len(l) + 1 for l in lines[:n - 1]) + idx
    # canonical() drops whitespace, so map through its offsets: the first
    # stream index whose source offset is at or past the cut.
    if len(unicodedata.normalize('NFC', text)) != len(text):
        # a length-changing normalisation would invalidate the arithmetic above
        return None
    _, offs = canonical(text)
    for i, o in enumerate(offs):
        if o >= raw:
            return i
    return None


rows = list(csv.DictReader(
    (ROOT / 'docs/margin-guard-118-281/gutter-candidates.tsv').open(
        encoding='utf-8'), delimiter='\t'))

entries, unresolved = [], []
for r in rows:
    col, n, run = r['column'], int(r['line']), r['spine'].strip()
    side = col[-1]
    page = int(col.split('-')[1])
    spine = line_of(SPINE, col, n)
    becomes, cut_at = strip_at(spine, run, side)
    digits = ''.join(c for c in run if c.isdigit())
    # ⚠ THE DIGITS ARE THE PRINTED LINE NUMBER, AND THAT IS THE EVIDENCE. 27 of
    # the 76 carry it exactly, 42 carry one digit of the pair, 3 are off by one.
    # The 4 that carry neither are not asserted here: they go to `unresolved`
    # with their line, for a look at the ink. A queue that guessed would put a
    # deletion in front of John under the same confidence as a proof.
    if digits == str(n):
        strength = 'exact'
    elif digits and (digits in str(n) or str(n).startswith(digits)
                     or str(n).endswith(digits)):
        strength = 'partial'
    elif digits and abs(int(digits) - n) <= 1:
        strength = 'off-by-one'
    else:
        strength = 'unmatched'
    if becomes is None:
        # No marginal token at the edge at all: nothing to propose, and a card
        # with no proposal is not a question, it is a shrug.
        unresolved.append({'column': col, 'line': n, 'run': run, 'side': side,
                           'strength': strength, 'spine': spine,
                           'why': 'no short numeric token at either edge'})
        continue
    end = 'end' if side == 'L' else 'start'
    # ⚠ THE WEAK ONES GO IN THE SAME QUEUE, MARKED. John asked for them: held
    # back they are invisible, and they are the sites most likely to be wrong —
    # exactly the ones worth his eyes rather than mine. The card says the digits
    # do not match the line number, so the ink decides on its own evidence.
    uncertain = strength == 'unmatched'
    was, now, win_at = window(spine, run, side)
    cal_line = line_of(CAL, col, n)
    cal_parts = cal_line.split()
    cal_window = ' '.join(cal_parts[-WINDOW_TOKENS:] if side == 'L'
                          else cal_parts[:WINDOW_TOKENS])
    if was is None:
        unresolved.append({'column': col, 'line': n, 'run': run, 'side': side,
                           'strength': strength, 'spine': spine,
                           'why': 'the cut falls outside the window the card '
                                  'would show, so the two buttons would read '
                                  'identically'})
        continue
    # ⚠ ANCHORED ON THE WINDOW, NOT THE RUN — the same as 107-117, where
    # `char_at` 44 is the start of `Ζμδ5. 6821` and not of the stray `1`. The
    # crop is then centred on what the buttons say.
    word_off = stream_offset(col, n, win_at)
    char_at = win_at
    # ⚠ THE LENGTH GUARD IN stream_offset IS NOT ENOUGH, so check the answer.
    # Codex: one cluster can shrink while another grows, leaving the total
    # length unchanged and the index one place off. Nothing in this tranche
    # does that — the text is already NFC — but an offset that is wrong crops
    # the wrong ink, and a card cropped on the wrong ink is worse than no card.
    if word_off is not None:
        stream, _ = canonical(SPINE.joinpath(f'{col}.txt').read_text(
            encoding='utf-8'))
        # ⚠ COMPARED IN THE FOLD, NOT IN THE RAW. `canonical()` maps Latin
        # homoglyphs onto Greek — `Bz.` becomes `Βζ.`, `notio` becomes `nοtiο` —
        # so a raw comparison here failed on two perfectly good sites and would
        # have dropped them silently as "offset could not be pinned".
        head = canonical(was)[0][:6]
        if stream[word_off:word_off + len(head)] != head:
            word_off = None
    if word_off is None:
        unresolved.append({'column': col, 'line': n, 'run': run, 'side': side,
                           'strength': strength, 'spine': spine,
                           'why': 'the canonical offset could not be pinned, '
                                  'so the card could not crop by offset'})
        continue
    entries.append({
        'page': page, 'col': side, 'line': n,
        'word_off': word_off, 'char_at': char_at,
        # ⚠ THE WINDOW, NOT THE LINE — settle_review builds `keep as printed`
        # and its confusable-variant offers FROM THIS FIELD. Given the whole
        # line it offered `keep as printed · <58 characters>` annotated
        # "omicron (Greek), final sigma, no value, v (Latin)", plus two `read`
        # buttons differing only by the leading `1` and both labelled "ου
        # spelled out" — labels generated off a `ȣ` that is nowhere near the
        # margin number. Opaque, and John said so. The card asks about the
        # window; every option must be built from the window.
        'readers': {'opus': was},            # the spine field, per batch_cold
        'calamari': cal_window,
        'kind': 'margin',
        'reason': (
            (f'⚠ THE DIGITS ARE NOT THIS LINE NUMBER — read {run!r} where the '
             f'margin would print {n}. One digit of a pair misread would look '
             f'like this, and so would a real reading. The ink decides. '
             if strength == 'unmatched' else
             f'Bonitz prints the line number {n} in the '
             f'{"right" if side == "L" else "left"}-hand (inner) margin here, '
             f'and it was read into the text as {run!r}. ')
            + f'It sits at the {end} of the line, which is the margin side for '
              f'the {"left" if side == "L" else "right"} column. '
              f'genie and LlamaParse read nothing there.'),
        'run': run, 'at': end, 'digits_match': strength,
        'uncertain': uncertain,
        'forms': [now, was],
        'form_set': [now, was],
        'line_becomes': becomes,   # the whole line, for the applier
        'line_was': spine,
        'card_sid': f'margin:{col}:{n}',
        'becomes': becomes,
    })

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    'spine_dir': 'work/kraken15-102/txt118-281',
    'spine_reader': 'kraken-r6',
    # ⚠ settle_review refuses to crop a non-Opus queue against Opus, and takes
    # the ALTO from here so nobody has to remember the flag.
    'alto_dirs': ['work/kraken15-102/alto118-281'],
    'n_sites': len(entries),
    'n_unresolved': len(unresolved),
    'entries': entries,
    # ⚠ CARRIED, NOT DROPPED. A site the queue cannot prove is still a site.
    'unresolved': unresolved,
}, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
print(f'{OUT}: {len(entries)} sites, {len(unresolved)} unresolved')
from collections import Counter
print(' ', Counter(e['digits_match'] for e in entries).most_common())
print(' ', Counter(e['at'] for e in entries).most_common())
