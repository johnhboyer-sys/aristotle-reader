"""Restore the five MIT archive pages that the archive itself serves cut off at
about 101.5 KB (its HTML pages and, for the Politics, its full-text dump too).

usage (repo root): python3 -I restore_cut.py <corrections.json> <refetch dl dir>

- De Caelo I and Meteorology II: the lost ends come from the archive's own
  full-text dumps (heavens.mb.txt, meteorology.mb.txt), which are complete.
  Three dump readings in De Caelo I.12 are corrected from the print
  (decaeloleofric00arisuoft): predictable -> predicable, 'neither infinite or
  finite' -> 'nor', 'At that time' -> 'At the time'.
- Politics II and V: the archive has no complete copy. The text is the
  checkers' transcription from the print (worksofaristotle10arisuoft); the
  paragraph breaks are read off the printed pages (n87-n88, n202-n207), and
  V.12 gets its own 'Part XII' marker.
- Politics VII: the text is whole; only the page footer is cut, leaving a
  stray '<A HREF="/Buy/Aris' that the parser shows as text.

Each restored page ends the way the archive's complete pages do: an
<A NAME="end"> anchor and the standard footer, copied from a sibling page
of the same work with its previous/next links set for this book."""
import json, re, sys
from pathlib import Path

corr = json.load(open(sys.argv[1], encoding='utf-8'))
dl = Path(sys.argv[2])
SRC = Path('sources')


def one(d, b, needle):
    hits = [c for c in corr if c['dir'] == d and c['book'] == b and needle in c['find']]
    assert len(hits) == 1, (d, b, needle, len(hits))
    return hits[0]


def wrap(words, width=72):
    lines, cur = [], ''
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f'{cur} {w}' if cur else w
    if cur:
        lines.append(cur)
    return lines


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def tail_html(blocks, start_n):
    """blocks: list of ('para', text, continues) | ('part', roman). The first
    block continues the page's last paragraph when continues=True."""
    out, n = [], start_n
    for blk in blocks:
        if blk[0] == 'part':
            out.append('<BR><BR>')
            out.append(f'<A NAME="{n}"></A><B>Part {blk[1]}</B>')
            out.append('')
            n += 1
            continue
        _, text, cont = blk
        for i, ln in enumerate(wrap(text.split())):
            lead = '' if (cont and i == 0) or i > 0 else '<BR><BR>'
            out.append(f'<A NAME="{n}"></A>{lead}{esc(ln)} ')
            n += 1
    return '\n'.join(out) + '\n'


def footer(sibling, prev_link, next_link):
    raw = (SRC / sibling).read_text(encoding='utf-8')
    i = raw.index('<A NAME="end"></A>')
    foot = raw[i:]
    # the sibling's two nav cells, rewritten for this book
    cells = re.findall(r'<TD ALIGN="(?:LEFT|RIGHT)" WIDTH="30%" NOWRAP>.*?</TD>', foot, flags=re.S)
    assert len(cells) == 2, sibling
    def cell(side, link):
        if not link:
            return f'<TD ALIGN="{side}" WIDTH="30%" NOWRAP>&nbsp;</TD>'
        href, title = link
        if side == 'LEFT':
            return (f'<TD ALIGN="LEFT" WIDTH="30%" NOWRAP><A HREF="{href}" onMouseOver="window.status=\'{title}\'; return true;">'
                    '<IMG SRC="/Images/larrow.gif" WIDTH="16" HEIGHT="10" BORDER="0" ALIGN="BOTTOM" HSPACE="5" ALT="Go to previous"></A>\n\n&nbsp;&nbsp;&nbsp;</TD>')
        return (f'<TD ALIGN="RIGHT" WIDTH="30%" NOWRAP>&nbsp;&nbsp;&nbsp;<A HREF="{href}" onMouseOver="window.status=\'{title}\'; return true;">'
                '<IMG SRC="/Images/rarrow.gif" WIDTH="16" HEIGHT="10" BORDER="0" ALIGN="BOTTOM" HSPACE="5" ALT="Go to next"></A>\n\n</TD>')
    foot = foot.replace(cells[0], cell('LEFT', prev_link), 1).replace(cells[1], cell('RIGHT', next_link), 1)
    return foot


def last_n(raw):
    return max(int(x) for x in re.findall(r'<A NAME="(\d+)"></A>', raw))


def cut_tail(raw, fragment):
    raw = raw.rstrip('\n')
    assert raw.endswith(fragment), repr(raw[-80:])
    return raw[: len(raw) - len(fragment)]


def paras_from_dump(text):
    """Blank-line paragraphs of an archive .mb.txt slice, whitespace collapsed."""
    return [re.sub(r'\s+', ' ', p).strip() for p in re.split(r'\n\s*\n', text) if p.strip()]


def split_at(text, starts):
    """Split a run-on transcription into paragraphs at each opening phrase."""
    out, rest = [], text
    for s in starts:
        k = rest.index(s)
        out.append(rest[:k].strip())
        rest = rest[k:]
    out.append(rest.strip())
    return out


report = []

# ---- De Caelo I: the rest of I.12 from heavens.mb.txt -------------------------
f = SRC / 'cael-stocks' / 'book-01.html'
raw = f.read_text(encoding='utf-8')
assert raw.rstrip().endswith('as these do, F and H coincident,'), raw[-80:]
dump = (dl / 'heavens.mb.txt').read_text(encoding='utf-8')
i = dump.index('as these do, F and H coincident,') + len('as these do, F and H coincident,')
j = dump.index('------', i)
lost = dump[i:j]
fixes = [('F is predictable of everything', 'F is predicable of everything'),
         ('neither infinite or finite', 'neither infinite nor finite'),
         ('being generated. At that time, then,', 'being generated. At the time, then,')]
paras = paras_from_dump(lost)
joined = '\n\n'.join(paras)
for a, b in fixes:
    assert joined.count(a) == 1, a
    joined = joined.replace(a, b)
paras = joined.split('\n\n')
blocks = [('para', paras[0], True)] + [('para', p, False) for p in paras[1:]]
raw = raw.rstrip() + ' \n' + tail_html(blocks, last_n(raw) + 1)
raw += '\n' + footer('cael-stocks/book-02.html', None, ('heavens.2.ii.html', 'Book II'))
f.write_text(raw, encoding='utf-8')
report.append(('cael-stocks', 1, len(' '.join(paras).split()), 'heavens.mb.txt + 3 print fixes'))

# ---- Meteorology II: the end of II.9 from meteorology.mb.txt ------------------
f = SRC / 'mete-webster' / 'book-02.html'
raw = f.read_text(encoding='utf-8')
raw = cut_tail(raw, '<A NAME="1110"></A')
assert raw.rstrip().endswith('it is ejected and causes'), raw[-80:]
dump = (dl / 'meteorology.mb.txt').read_text(encoding='utf-8')
i = dump.index('into water, it is ejected and causes') + len('into water, it is ejected and causes')
j = dump.index('------', i)
paras = paras_from_dump(dump[i:j])
blocks = [('para', paras[0], True)] + [('para', p, False) for p in paras[1:]]
raw = raw.rstrip() + ' \n' + tail_html(blocks, last_n(raw) + 1)
raw += '\n' + footer('mete-webster/book-03.html', ('meteorology.1.i.html', 'Book I'), ('meteorology.3.iii.html', 'Book III'))
f.write_text(raw, encoding='utf-8')
report.append(('mete-webster', 2, len(' '.join(paras).split()), 'meteorology.mb.txt'))

# ---- Politics II: the rest of II.12 from the print ----------------------------
c = one('pol-jowett', 2, 'tombs, whic')
f = SRC / 'pol-jowett' / 'book-02.html'
raw = f.read_text(encoding='utf-8')
raw = cut_tail(raw, 'whic')
lead = 'The inhabitants still point out their tombs, '
assert c['replace'].startswith(lead)
paras = split_at(c['replace'][len(lead):], [
    'In the legislation of Charondas', '(Characteristic of Phaleas', 'Draco has left laws',
    'Pittacus, too, was only', 'Androdamas of Rhegium', 'And here let us conclude'])
blocks = [('para', paras[0], True)] + [('para', p, False) for p in paras[1:]]
raw = raw.rstrip() + ' \n' + tail_html(blocks, last_n(raw) + 1)
raw += '\n' + footer('pol-jowett/book-04.html', ('politics.1.one.html', 'Book One'), ('politics.3.three.html', 'Book Three'))
f.write_text(raw, encoding='utf-8')
report.append(('pol-jowett', 2, len(' '.join(paras).split()), 'print transcription'))

# ---- Politics V: the rest of V.11 and all of V.12 from the print --------------
c = one('pol-jowett', 5, 'let it b')
f = SRC / 'pol-jowett' / 'book-05.html'
raw = f.read_text(encoding='utf-8')
raw = cut_tail(raw, 'b')
assert raw.endswith('let it '), raw[-40:]
lead = 'is to be deprived of his power, let it '
assert c['replace'].startswith(lead)
body = c['replace'][len(lead):]
k = body.index('Yet no forms of government are so short-lived')
v11, v12 = body[:k].strip(), body[k:].strip()
p11 = split_at(v11, ['Of those who attempt assassination', 'And whereas states consist', 'But enough of these details'])
p12 = split_at(v12, ['Next in duration to the tyranny', 'I have now gone through almost', 'In the Republic of Plato', 'Finally, although there are many forms'])
blocks = [('para', p11[0], True)] + [('para', p, False) for p in p11[1:]] + [('part', 'XII')] + [('para', p, False) for p in p12]
raw = raw.rstrip() + ' \n' + tail_html(blocks, last_n(raw) + 1)
raw += '\n' + footer('pol-jowett/book-04.html', ('politics.4.four.html', 'Book Four'), ('politics.6.six.html', 'Book Six'))
f.write_text(raw, encoding='utf-8')
report.append(('pol-jowett', 5, len(body.split()), 'print transcription; Part XII added'))

# ---- Politics VII: complete the cut footer ------------------------------------
f = SRC / 'pol-jowett' / 'book-07.html'
raw = f.read_text(encoding='utf-8')
frag = '<FONT SIZE="-1"><BR><A HREF="/Buy/Aris'
raw = cut_tail(raw, frag)
sib = (SRC / 'pol-jowett' / 'book-06.html').read_text(encoding='utf-8')
# the page header carries the same Buy link: take the one in the footer
k = sib.index('<FONT SIZE="-1"><BR><A HREF="/Buy/Aristotle.html"', sib.index('<A NAME="end"></A>'))
raw += sib[k:]
f.write_text(raw, encoding='utf-8')
report.append(('pol-jowett', 7, 0, 'footer completed from book-06'))

for r in report:
    print(*r)
