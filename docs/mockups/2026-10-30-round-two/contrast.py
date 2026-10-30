"""WCAG contrast of each direction's text colours on its grounds, both themes."""
import re, sys
def lum(h):
    h = h.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
TEXT = {'a': ['ink', 'mid', 'faint', 'acc'], 'b': ['ink', 'mid', 'faint', 'sepia'], 'c': ['ink', 'mid', 'faint', 'ind'], 'd': ['ink', 'mid', 'faint', 'red']}
GROUND = ['bg', 'paper', 'soft']
bad = 0
for d in 'abcd':
    css = open(f'dir-{d}.css', encoding='utf-8').read()
    for theme, sel in (('light', rf'\.frame\.dir-{d} \{{(.*?)\}}'), ('dark', rf'\.frame\.dir-{d}\.dark \{{(.*?)\}}')):
        block = re.search(sel, css, re.S).group(1)
        v = dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})', block))
        if theme == 'dark':
            base = dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})', re.search(rf'\.frame\.dir-{d} \{{(.*?)\}}', css, re.S).group(1)))
            base.update(v); v = base
        row = []
        for t in TEXT[d]:
            for g in GROUND:
                if t in v and g in v:
                    r = ratio(v[t], v[g]); row.append(f'{t}/{g} {r:.2f}')
                    if r < 4.5: bad += 1; row[-1] += ' <-- LOW'
        print(d, theme, ' | '.join(row))
sys.exit(1 if bad else 0)
