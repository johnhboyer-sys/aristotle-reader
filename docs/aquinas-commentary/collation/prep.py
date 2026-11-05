# Build two token streams: Corpus Thomisticum (can1-3) and Parma vol. 20 OCR (archive.org searchtext, page-indexed).
import re, html, json, sys, unicodedata
D = sys.argv[1]
def norm(w):
    w = unicodedata.normalize('NFD', w.lower())
    w = ''.join(c for c in w if not unicodedata.combining(c))
    w = w.replace('æ', 'ae').replace('œ', 'oe').replace('j', 'i').replace('v', 'u')
    return re.sub(r'[^a-z]', '', w)
# --- CT
ct = []   # tokens: [norm, raw, pid]
paras = []
for b in (1, 2, 3):
    s = open(f'{D}/ct/can{b}.html', encoding='latin1').read()
    s = re.sub(r'(?is)<(script|style).*?</\1>', '', s)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    parts = re.split(r'\[(\d+)\]\s+Sentencia De anima, lib\. (\d+) l\. (\d+) n\. (\d+)', t)
    for i in range(1, len(parts), 5):
        it, lib, lec, n, body = parts[i:i+5]
        body = body.split('©')[0]
        body = re.split(r'\b(?:Lectio|Liber) \d+\b', body)[0]   # the next lectio's heading is not Aquinas's text
        pid = f'{lib}.{lec}.{n}'
        raws = body.split()
        paras.append({'pid': pid, 'it': it, 'text': ' '.join(raws)})
        for r in raws:
            k = norm(r)
            if k: ct.append([k, r, len(paras) - 1])
# --- Parma
txt = open(f'{D}/pdiff/p20_hocr_searchtext.txt', encoding='utf-8').read()
pidx = json.load(open(f'{D}/pdiff/p20_hocr_pageindex.json'))
pn = {p['leafNum']: p['pageNumber'] for p in json.load(open(f'{D}/pdiff/p20_page_numbers.json'))['pages']}
pm = []   # [norm, raw, page_k, line_start_flag]
for k, (a, z, *_ ) in enumerate(pidx):
    page = txt[a:z]
    page = re.sub(r'(\w)[-¬]\s+(\w)', r'\1\2', page)        # rejoin words broken at line ends
    for ln, line in enumerate(page.split('\n')):
        for j, r in enumerate(line.split()):
            n = norm(r)
            if n: pm.append([n, r, k, ln])
json.dump({'ct': ct, 'paras': paras, 'pm': pm, 'pn': {str(k): v for k, v in pn.items()}}, open(f'{D}/pdiff/streams.json', 'w'))
print('CT paragraphs', len(paras), 'tokens', len(ct), '| books', {b: sum(1 for p in paras if p['pid'].startswith(f'{b}.')) for b in '123'})
print('Parma tokens (whole vol.)', len(pm), 'pages', len(pidx))
# where does De anima sit in Parma? first and last CT paragraph openings
def find(seq):
    s = ' '.join(seq); P = ' '.join(x[0] for x in pm)
    i = P.find(s); return i if i < 0 else P[:i].count(' ')
print('n.1 opening at Parma token', find([x[0] for x in ct[:6]]), '| last 5 CT tokens:', ' '.join(x[1] for x in ct[-8:]), 'at', find([x[0] for x in ct[-5:]]))
