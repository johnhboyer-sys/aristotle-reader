"""Apply the sweep's corrections IN PLACE to the repo's sources/<dir>/book-NN.html
(run from the repo root on the corrections branch). Ostwald and the five
cut-page entries (restored separately by restore_cut.py) are skipped.

usage: python3 -I apply_real.py <corrections.json> <report.json>"""
import difflib, html, json, re, sys
from pathlib import Path
SKIP_CUT = [('cael-stocks', 1, 'F and H coincident'), ('mete-webster', 2, 'it is ejected and causes </A'),
            ('pol-jowett', 2, 'tombs, whic'), ('pol-jowett', 5, 'let it b'), ('pol-jowett', 7, 'HREF="/Buy/Aris')]
allc = json.load(open(sys.argv[1], encoding='utf-8'))
corr, skipped = [], []
for c in allc:
    if c['dir'] == 'ostwald' or any(c['dir'] == d and c['book'] == b and n in c['find'] for d, b, n in SKIP_CUT):
        skipped.append(c); continue
    corr.append(c)
def visible(raw):
    """Visible text of raw HTML with, for each visible char, its raw span."""
    out = []; spans = []; i = 0; n = len(raw)
    while i < n:
        ch = raw[i]
        if ch == '<':
            j = raw.find('>', i)
            if j == -1: j = n - 1
            i = j + 1; continue
        if ch == '&':
            m = re.match(r'&(#\d+|#x[0-9a-fA-F]+|[A-Za-z]+);', raw[i:])
            if m:
                out.append(html.unescape(m.group(0))); spans.append((i, i + len(m.group(0)))); i += len(m.group(0)); continue
        if ch.isspace():
            j = i
            while j < n and (raw[j].isspace() or raw[j] == '<'):
                if raw[j] == '<':
                    k = raw.find('>', j)
                    if k == -1: break
                    j = k + 1
                else: j += 1
            if out and out[-1] != ' ': out.append(' '); spans.append((i, j))
            i = j; continue
        out.append(ch); spans.append((i, i + 1)); i += 1
    return ''.join(out), spans

def collapse(s): return re.sub(r'\s+', ' ', s).strip()
def esc(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def book_file(d, book):
    return Path('sources') / d / f'book-{int(book):02d}.html'

problems = []; applied = 0
for c in corr:
    d = c.get('dir'); f = book_file(d, c.get('book', 1))
    if not f.exists(): problems.append((c, f'no file {f.name}')); continue
    raw = f.read_text(encoding='utf-8', errors='replace')
    is_md = f.suffix == '.md'
    vis, spans = (collapse_md := None, None) if False else visible(raw) if not is_md else (None, None)
    find = collapse(c['find']); rep = collapse(c['replace'])
    if is_md:
        pat = r'\s+'.join(re.escape(w) for w in find.split(' '))
        ms = list(re.finditer(pat, raw))
        if len(ms) != 1: problems.append((c, f'{len(ms)} matches in markdown')); continue
        raw = raw[:ms[0].start()] + rep + raw[ms[0].end():]
        f.write_text(raw, encoding='utf-8'); applied += 1; continue
    k = vis.find(find)
    if k == -1 or vis.find(find, k + 1) != -1:
        problems.append((c, 'find not in the page' if k == -1 else 'find twice in the page')); continue
    # character edits from find to replace, applied right to left in raw
    sm = difflib.SequenceMatcher(None, find, rep, autojunk=False)
    edits = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal': continue
        if i1 < i2:
            r0 = spans[k + i1][0]; r1 = spans[k + i2 - 1][1]
        else:
            r0 = r1 = (spans[k + i1][0] if k + i1 < len(spans) else spans[-1][1])
        edits.append((r0, r1, esc(rep[j1:j2])))
    for r0, r1, txt in sorted(edits, reverse=True):
        # never delete tags inside a changed run: keep them after the new text
        tags = ''.join(re.findall(r'<[^>]*>', raw[r0:r1]))
        raw = raw[:r0] + txt + tags + raw[r1:]
    f.write_text(raw, encoding='utf-8'); applied += 1


json.dump({'applied': applied, 'total': len(corr), 'skipped': len(skipped),
           'problems': [dict(c, why=w) for c, w in problems]}, open(sys.argv[2], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f"{len(allc)} in the sweep; skipped {len(skipped)} (Ostwald, cut pages); applied {applied} of {len(corr)}; could not place {len(problems)}")
