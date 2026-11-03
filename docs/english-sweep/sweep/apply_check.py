"""Apply the checkers' corrections to a scratch copy of the repo's sources/ and
prove each one took, with the site's own parser.

usage (from the repo root): python3 <this> <results dir> <scratch dir> <report.json>

For each correction the `find` is located in the page's visible text (tags
skipped, entities decoded, whitespace collapsed), and only the characters that
change are edited in the raw file, so line anchors and other tags stay where
they are. Ostwald's Markdown is edited the same way. Then every translation is
parsed again from the scratch copy, and each `find` must be gone and each
`replace` present in its book (an append keeps its find as the start of its
replace). Nothing in the repo is touched."""
import difflib, glob, html, json, os, re, shutil, sys
from pathlib import Path
sys.path.insert(0, 'pipeline')
import yaml
from aristotle_pipeline import stage1_archive
res_dir, scratch, report_path = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
if scratch.exists(): shutil.rmtree(scratch)
shutil.copytree('sources', scratch)

corr = []
for f in sorted(glob.glob(str(res_dir / 'g[0-9].json'))):
    for c in json.load(open(f, encoding='utf-8')):
        c['_group'] = Path(f).stem; corr.append(c)

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
    if d == 'ostwald': return scratch / 'ostwald' / 'ostwald-ethics.md'
    return scratch / d / f'book-{int(book):02d}.html'

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

# parse every touched translation from the scratch copy, as stage 1 does
cfgs = {}
for mf in sorted(glob.glob('manifests/*.yaml')):
    m = yaml.safe_load(open(mf, encoding='utf-8'))
    def walk(o):
        if isinstance(o, dict):
            if o.get('dir'): cfgs.setdefault(o['dir'], o); return
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk((m or {}).get('english') or {})
books = {}
def book_text(d, b):
    if (d, b) not in books:
        if d == 'ostwald':
            books[(d, b)] = collapse(book_file(d, b).read_text(encoding='utf-8'))
        else:
            e = cfgs[d]
            prose = stage1_archive.parse_translation(scratch / d, e.get('books', 1), e.get('chapter_marker') or e.get('marker') or 'number', strip_quote_repeats=e.get('strip_quote_repeats', False))
            for (bb, cc), v in prose.items(): books.setdefault((d, bb), []).append((cc, v))
            for key in [x for x in books if x[0] == d and isinstance(books[x], list)]:
                books[key] = collapse(' '.join(v for _, v in sorted(books[key])))
    return books.get((d, b), '')
failed = []
for c in corr:
    if any(c is p[0] for p in problems): continue
    t = book_text(c['dir'], int(c.get('book', 1)))
    find = collapse(c['find']); rep = collapse(c['replace'])
    append = rep.startswith(find) and len(rep) > len(find) + 40
    ok = (rep in t) and (append or find not in t or find in rep)
    if not ok: failed.append(c)
by = {}
for c in corr: by.setdefault(c['dir'], 0); by[c['dir']] += 1
json.dump({'applied': applied, 'total': len(corr), 'problems': [{'dir': c['dir'], 'book': c.get('book'), 'find': c['find'], 'why': w} for c, w in problems],
           'failed_after_parse': [{'dir': c['dir'], 'book': c.get('book'), 'find': c['find'], 'replace': c['replace']} for c in failed], 'by_dir': by},
          open(report_path, 'w'), indent=1, ensure_ascii=False)
print(f"{len(corr)} corrections; applied to raw pages: {applied}; could not place: {len(problems)}; placed but not as expected after parsing: {len(failed)}")
