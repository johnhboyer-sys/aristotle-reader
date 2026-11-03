"""Append the sweep's corrections (all but Ostwald) and the separator-line
records to sources/english-corrections.json, keeping its 62 entries as they are.
usage (repo root): python3 -I build_corrections_json.py <sweep-records.json> <furniture.json>"""
import json, re, sys
import yaml

path = 'sources/english-corrections.json'
doc = json.load(open(path, encoding='utf-8'))
assert len(doc['corrections']) == 62
sweep = json.load(open(sys.argv[1], encoding='utf-8'))
furn = json.load(open(sys.argv[2], encoding='utf-8'))

CUT = {
    ('cael-stocks', 1, 'F and H coincident'): (
        "Restored: the archive serves this page cut off at 101,499 bytes in 282b28, so the rest of I.12 "
        "(282b28-283b22, about 920 words) was missing. The lost text is the archive's own, from its complete "
        "full-text file heavens.mb.txt, with three of its readings corrected from the print: 'predictable' "
        "for 'predicable', 'neither infinite or finite' for 'nor', 'At that time' for 'At the time'. "
        "An append: the find stays the start of the replace.",
        "heavens.mb.txt (MIT Internet Classics Archive full text); decaeloleofric00arisuoft (Stocks, Oxford 1922), "
        "Cael. 282b28-283b22, page image n57 on"),
    ('mete-webster', 2, 'it is ejected and causes </A'): (
        "Restored: the archive serves this page cut off at 101,481 bytes, inside a tag, so the end of II.9 "
        "and the paragraph 'So much for thunder and lightning.' were missing and a stray '</A' showed. "
        "The lost words come from the archive's complete full-text file meteorology.mb.txt, which agrees "
        "with the print.",
        "meteorology.mb.txt (MIT Internet Classics Archive full text); worksofaristotle03arisuoft "
        "(E. W. Webster, Oxford 1923, reprinted 1931), Mete. 370a"),
    ('pol-jowett', 2, 'tombs, whic'): (
        "Restored: the archive serves this page cut off at 101,496 bytes ('tombs, whic'), and its full-text "
        "file politics.mb.txt is cut off earlier still, so no copy of the archive's text exists. The rest of "
        "II.12 (1274a36-b28: Philolaus, Charondas, Phaleas, Plato, Draco, Pittacus, Androdamas, and the close "
        "of Book II) is transcribed from the print, with its paragraph breaks. An append.",
        "worksofaristotle10arisuoft (Jowett, Politica, rev. W. D. Ross, Oxford Works vol. X, 1921), "
        "Pol. 1274a36-b28, page images n87-n88"),
    ('pol-jowett', 5, 'let it b'): (
        "Restored: the archive serves this page cut off at 101,497 bytes ('let it b'), and no complete copy "
        "of its text exists, so the rest of V.11 (1315a14-b10) and all of V.12 (1315b11-1316b27, the length "
        "of tyrannies and the critique of Plato's Republic) were missing. Transcribed from the print with its "
        "paragraph breaks; V.12 has its own 'Part XII' marker in the page. An append.",
        "worksofaristotle10arisuoft (Jowett, Politica, rev. W. D. Ross, Oxford Works vol. X, 1921), "
        "Pol. 1315a14-1316b27, page images n202-n207"),
    ('pol-jowett', 7, 'HREF="/Buy/Aris'): (
        "The archive serves this page cut off at 101,496 bytes inside its footer, leaving an unclosed "
        "'<A HREF=\"/Buy/Aris' that the parser showed as text. The text itself is whole; the footer is "
        "completed from the archive's Book VI page.",
        "the archive page itself (sources/pol-jowett/book-07.html)"),
}

books_end = {}
for w in ('Phys', 'GC'):
    m = yaml.safe_load(open(f'manifests/{w}.yaml', encoding='utf-8'))
    for b in m['books']:
        books_end[(w, b['n'])] = re.match(r'\d+[ab]', b['end']).group(0)

out = []
for c in sweep:
    e = {k: c[k] for k in ('work', 'book', 'column', 'find', 'replace', 'source')}
    e['dir'] = c['dir']
    e['kind'], e['confidence'], e['note'] = c['kind'], c['confidence'], c['note']
    for (d, b, needle), (note, src) in CUT.items():
        if c['dir'] == d and c['book'] == b and needle in c['find']:
            e['note'], e['source'] = note, src
    out.append(e)
for c in furn:
    out.append({'work': c['work'], 'book': c['book'], 'column': books_end[(c['work'], c['book'])],
                'find': c['find'], 'replace': c['replace'], 'source': c['source'], 'dir': c['dir'],
                'kind': c['kind'], 'confidence': c['confidence'], 'note': c['note']})


def col_key(col):
    m = re.match(r'(\d+)([ab])', str(col))
    return (int(m.group(1)), m.group(2)) if m else (0, '')


out.sort(key=lambda e: (e['dir'], int(e['book']), col_key(e['column'])))
assert len(out) == 3005 and len({(e['dir'], e['book'], e['find']) for e in out}) == len(out)
doc['about'] = (
    "Print-checked corrections already made in sources/<dir>/book-NN.html. Each find/replace is "
    "whitespace-collapsed text of one translation as stage 1 parses it: the work's public primary English, "
    "or, when an entry names a `dir`, the translation in that sources/ folder (primary, secondary, third or "
    "overlay slot). find must be absent from the parsed book and replace present; where find is part of "
    "replace (an append: text restored where the archive serves a page cut off), only replace is checked: "
    "pipeline/tests/test_english_corrections.py. Ported 2026-09-29 from classical-philosophy-reader "
    "sources/aristotle-english/corrections.json (commit 85c876b); source names the scan each was checked "
    "against. Four Lin entries were retired 2026-09-29: they had corrected Joachim's commentary, which the "
    "OCR had run into his translation and which was then removed (pipeline/tests/test_lin_joachim_clean.py). "
    "2026-11-03: 3,005 entries (those with `dir`) from a sweep of every public English translation against "
    "archive.org scans of the printed books (Ostwald's Ethics left for later: no free scan). `kind` sorts "
    "them; `confidence` says how each was checked (print-checked: a checker read the page image; "
    "scan-agrees: the scan's own text has the printed reading; sense-only: the scan could not settle it); "
    "`note` says what was wrong.")
doc['corrections'] = doc['corrections'] + out
with open(path, 'w', encoding='utf-8') as f:
    json.dump(doc, f, indent=1, ensure_ascii=False)
    f.write('\n')
print(len(doc['corrections']), 'entries;', len(out), 'new;', len({e['dir'] for e in out}), 'translations')
