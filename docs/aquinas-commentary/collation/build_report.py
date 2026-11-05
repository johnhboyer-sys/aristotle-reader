import json, base64, io, html, sys, collections
from PIL import Image
D = sys.argv[1]; P = f'{D}/pdiff'
S = json.load(open(f'{P}/streams.json')); ct = S['ct']; paras = S['paras']; pn = S['pn']
pm = S['pm'][400:133754]; K = json.load(open(f'{P}/keep.json')); pm = [pm[i] for i in K]
BX = json.load(open(f'{P}/boxes.json')); BX = [BX[i] for i in K]
items = json.load(open(f'{P}/items.json'))['items']
sec = json.load(open(f'{P}/second.json')); sec.update(json.load(open(f'{P}/second_far.json')))
places = json.load(open(f'{P}/places.json'))
ROM = {'1': 'I', '2': 'II', '3': 'III'}
e = html.escape
def ref(pid):
    b, l, n = pid.split('.'); return f'{ROM[b]}, l.&nbsp;{l}, n.&nbsp;{n}'
def img64(paths):
    ims = [Image.open(p).convert('L') for p in paths]
    h = max(im.height for im in ims); gap = 18
    W = sum(im.width for im in ims) + gap * (len(ims) - 1)
    out = Image.new('L', (W, h), 255); x = 0
    for im in ims: out.paste(im, (x, (h - im.height) // 2)); x += im.width + gap
    buf = io.BytesIO(); out.save(buf, 'JPEG', quality=82); return base64.b64encode(buf.getvalue()).decode(), out.width, out.height
arts = collections.defaultdict(list); counts = collections.Counter()
for ids, kind, mr, pr in places:
    it0 = items[ids[0]]; it1 = items[ids[-1]]
    a0, a1 = it0['a'][0], it1['a'][1]; b0 = it0['b'][0]
    pid = paras[ct[min(a0, len(ct) - 1)][2]]['pid']
    k = BX[b0][0]; page = pn.get(str(k), '?')
    crops = [c[0] for c in sec[str(ids[0])]['crops']]
    b64, w, h = img64(crops)
    L = ' '.join(x[1] for x in ct[max(0, a0 - 7):a0]); R = ' '.join(x[1] for x in ct[a1:a1 + 7])
    if kind == 'adds':
        lem = ct[a0 - 1][1].rstrip('.,;:'); L = ' '.join(x[1] for x in ct[max(0, a0 - 8):a0 - 1])
        mid = f'<mark>{e(ct[a0-1][1])}</mark>'
        app = f'<span class="lem">{e(lem)}</span> <span class="sg">ct</span>&ensp;]&ensp;<span class="rd">{e(lem)} {e(pr)}</span> <span class="sg">p</span>'
    else:
        mid = f'<mark>{e(" ".join(x[1] for x in ct[a0:a1]))}</mark>'
        rd = f'<span class="rd"><i>om.</i></span>' if kind == 'lacks' else f'<span class="rd">{e(pr)}</span>'
        app = f'<span class="lem">{e(mr)}</span> <span class="sg">ct</span>&ensp;]&ensp;{rd} <span class="sg">p</span>'
    k2 = 'word' if kind == 'order' else kind; counts[k2] += 1
    arts[pid.split('.')[0]].append(f'''<article class="pl" data-k="{k2}">
  <div class="ref">{ref(pid)}<span class="pg">Parma p.&nbsp;{e(page)}</span></div>
  <div class="body">
    <p class="app" lang="la">{app}</p>
    <p class="ctx" lang="la">&hellip; {e(L)} {mid} {e(R)} &hellip;</p>
    <a class="scan" href="https://archive.org/details/sanctithomaeaqui20thom/page/n{k-1}/mode/1up" target="_blank" rel="noopener"><img alt="Parma vol. 20, p. {e(page)}: the printed words at this place" width="{w}" height="{h}" src="data:image/jpeg;base64,{b64}"></a>
  </div>
</article>''')
body = []
for b in '123':
    body.append(f'<section class="book" data-book="{b}"><h3>Book {ROM[b]} <span class="n">{len(arts[b])}</span></h3>\n' + '\n'.join(arts[b]) + '</section>')
tpl = open(f'{P}/report_tpl.html', encoding='utf-8').read()
out = tpl.replace('{{PLACES}}', '\n'.join(body)).replace('{{N_ALL}}', str(len(places))).replace('{{N_WORD}}', str(counts['word'])).replace('{{N_LACKS}}', str(counts['lacks'])).replace('{{N_ADDS}}', str(counts['adds']))
open(f'{D}/parma-vs-ct.html', 'w', encoding='utf-8').write(out)
print('written', len(out), 'bytes', dict(counts))
