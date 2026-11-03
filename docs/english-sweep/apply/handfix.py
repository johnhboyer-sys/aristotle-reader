"""The ten sweep corrections apply_real.py could not place (their find spans a
paragraph break or a page heading in the raw page), plus page furniture the
checkers did not list: the archive's 70-hyphen separator lines left at the end
of the Physics and De Generatione books. Each edit is a regex on the raw file
that must match exactly once. Run from the repo root.

usage: python3 -I handfix.py <report.json>"""
import json, re, sys
from pathlib import Path

GAP = r'(\s*(?:<[^>]+>\s*)*)'   # whitespace and tags between two words
CHAP = r'(\s*\n\s*\d{1,2}\s*\n\s*)'  # a bare chapter number on its own line
SEP = '-' * 70

EDITS = [
    # (file, pattern, replacement, why)
    ('gc-joachim/book-01.html', r'Let explain the way in', 'Let us explain the way in', "dropped 'us'"),
    ('da-wallace/book-01.html', r'abstraction from it' + CHAP + r'The investigation of', r'abstraction from it.\1The investigation of', 'lost full stop'),
    ('da-wallace/book-02.html', r'appropriate to it' + CHAP + r'The character of', r'appropriate to it.\1The character of', 'lost full stop'),
    ('sens-beare/book-01.html', r'\n[ \t]*Section 2[ \t]*\n', '\n', "the archive's page heading 'Section 2'"),
    ('juv-ross/book-01.html', r'\n[ \t]*Section 2[ \t]*\n', '\n', "the archive's page heading 'Section 2'"),
    ('ha-thompson/book-03.html', r'\bdepthways\b', 'depth-ways', "print 'depth-ways'"),
    ('ha-thompson/book-09.html', r'\bshoreweed\b', 'shore-weed', "print 'shore-weed'"),
    ('ha-thompson/book-09.html', r'(THE END\s*)\n-{70}\n\s*Copyright statement:.*?Thomas Bushnell, BSG\.\s*$', r'\1', "the archive's rule and copyright footer"),
    ('meta-ross/book-09.html', r'It' + GAP + r'is' + GAP + r'an' + GAP + r'activity' + GAP + r'also', r'It\1is\2by an\3activity\4also', "dropped 'by'"),
    ('meta-ross/book-11.html', r'claims the tide\.', 'claims the title.', "'tide' for 'title'"),
]

# The separator lines at the end of each Physics book file and in GC.
for b in range(1, 9):
    EDITS.append((f'phys-hardie/book-{b:02d}.html', r'(\n\s*-{70}\s*)+\s*$', '\n', "the archive's separator lines"))
EDITS.append(('gc-joachim/book-01.html', r'(\n\s*-{70}\s*)+\s*$', '\n', "the archive's separator lines"))
EDITS.append(('gc-joachim/book-02.html', r'(\n\s*-{70}\s*)+\s*$', '\n', "the archive's separator lines"))

# Check every edit before writing any; an edit whose result is already there
# (a rerun) is skipped, so the script can be run again safely.
DONE = {
    'gc-joachim/book-01.html|Let explain': 'Let us explain the way in',
}
files, log = {}, []
for rel, pat, rep, why in EDITS:
    raw = files.get(rel) or (Path('sources') / rel).read_text(encoding='utf-8')
    ms = list(re.finditer(pat, raw, flags=re.S))
    key = f"{rel}|{pat[:11]}"
    if not ms and key in DONE and DONE[key] in raw:
        log.append({'file': rel, 'why': why, 'removed': 0, 'note': 'already made'})
        files[rel] = raw
        continue
    assert len(ms) == 1, (rel, pat, len(ms))
    new = re.sub(pat, rep, raw, count=1, flags=re.S)
    assert new != raw, rel
    log.append({'file': rel, 'why': why, 'removed': len(raw) - len(new)})
    files[rel] = new
for rel, text in files.items():
    (Path('sources') / rel).write_text(text, encoding='utf-8')
json.dump(log, open(sys.argv[1], 'w', encoding='utf-8'), indent=1)
for l in log:
    print(l['file'], '|', l['why'], '|', l['removed'], l.get('note', ''))
