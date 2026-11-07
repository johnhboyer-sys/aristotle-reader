"""Per-work counts in the built corpus (build/dist) and site (app/dist).
Run from the repo root after npm run build:public; edit WORKS for the works to check."""
import json, glob, os, re, collections
D = 'build/dist'
WORKS = ['Prob', 'Spir', 'MM', 'Plant', 'RhetAl', 'AthPol', 'Cat', 'Int']
eng = collections.Counter(); eng_src = collections.defaultdict(collections.Counter)
for f in glob.glob(f'{D}/search-shards/english/*.json'):
    for word, by in json.load(open(f)).items():
        for src, posts in by.items():
            w, _, slot = src.partition('/')
            eng[w] += len(posts); eng_src[w][slot] += len(posts)
greek = {s: collections.Counter() for s in ('lemma', 'form')}
greek_words = {s: collections.Counter() for s in ('lemma', 'form')}
for s in greek:
    for f in glob.glob(f'{D}/search-shards/{s}/*.json'):
        for word, by in json.load(open(f)).items():
            for w, posts in by.items():
                greek[s][w] += len(posts); greek_words[s][w] += 1
lsj = collections.Counter()
pat = re.compile(r'href=\\?"/([A-Za-z]+)/book/\d+\?loc=')
for f in glob.glob(f'{D}/lsj/*.json'):
    for m in pat.finditer(open(f).read()):
        lsj[m.group(1)] += 1
ng = {s: collections.Counter() for s in ('form', 'lemma', 'english')}
ngocc = {s: collections.Counter() for s in ng}
for s in ng:
    for f in glob.glob(f'{D}/ngrams/{s}/occ/*.json'):
        for gram, by in json.load(open(f)).items():
            for w, offs in by.items():
                w0 = w.partition('/')[0]
                ng[s][w0] += 1; ngocc[s][w0] += len(offs)
pages = collections.Counter()
for w in WORKS:
    pages[w] = sum(len(fs) for r, _, fs in os.walk(f'app/dist/{w}') if 'index.html' in fs and fs.count('index.html'))
lemma_pages = collections.Counter()
for f in glob.glob(f'{D}/lemmata/*.json'):
    if f.endswith('_index.json'): continue
    for bw in json.load(open(f)).get('byWork', []): lemma_pages[bw['work']] += 1
print(f"{'work':7} {'Eng post':>9} {'Eng slots':30} {'lemma post':>10} {'lemma wds':>9} {'form post':>9} {'LSJ links':>9} {'ng form':>8} {'ng lem':>8} {'ng eng':>8} {'lex pgs':>7} {'site pgs':>8}")
for w in WORKS:
    slots = ','.join(f'{k}:{v}' for k, v in sorted(eng_src[w].items()))
    print(f"{w:7} {eng[w]:>9} {slots:30} {greek['lemma'][w]:>10} {greek_words['lemma'][w]:>9} {greek['form'][w]:>9} {lsj[w]:>9} {ng['form'][w]:>8} {ng['lemma'][w]:>8} {ng['english'][w]:>8} {lemma_pages[w]:>7} {pages[w]:>8}")
zeros = [(w, k) for w in WORKS for k, v in [('eng', eng[w]), ('lemma', greek['lemma'][w]), ('form', greek['form'][w]), ('lsj', lsj[w]), ('ngf', ng['form'][w]), ('ngl', ng['lemma'][w]), ('nge', ng['english'][w]), ('pages', pages[w])] if not v]
print('ZEROS:', zeros or 'none')
print('sanity (examined): english sources', len(eng), '| lemma works', len(greek['lemma']), '| lsj works linked', len(lsj), '| ngram works', len(ng['form']))
