"""Correction records for the separator lines handfix.py removed from the
Physics and GC book files (not in the sweep's list): find = the book's last
words plus the separators, as the old parse showed them; replace = the words.
usage: python3 -I furniture_entries.py <old.json> <out.json>"""
import json, re, sys
old = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
for key, work, books in [('phys-hardie|part|False', 'Phys', range(1, 9)), ('gc-joachim|part|False', 'GC', range(1, 3))]:
    chs = old[key]
    for b in books:
        last = max((k for k in chs if int(k.split(':')[0]) == b), key=lambda k: int(k.split(':')[1]))
        t = re.sub(r'\s+', ' ', chs[last]).strip()
        m = re.search(r'((?:\S+ ){6}\S+)( -{70})+$', t)
        assert m, (key, last, t[-200:])
        find = t[m.start():]
        rep = m.group(1)
        out.append({'dir': key.split('|')[0], 'work': work, 'book': b, 'find': find, 'replace': rep,
                    'kind': 'stray or doubled text', 'confidence': 'scan-agrees',
                    'note': "page furniture: the archive's 70-hyphen separator line(s) at the end of the book file, parsed into the last chapter; not in the print",
                    'source': 'the archive page itself (sources/%s/book-%02d.html); the print has no such line' % (key.split('|')[0], b),
                    '_chapter': last})
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(len(out), 'entries'); print(out[0]['find'][-90:], '=>', out[0]['replace'])
