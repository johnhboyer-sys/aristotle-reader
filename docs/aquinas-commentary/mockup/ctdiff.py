import re, html, sys, difflib
ct = open(sys.argv[1], encoding='utf-8').read()
t = html.unescape(re.sub(r'<[^>]+>', '\n', ct))
paras = {}
for m in re.finditer(r'\[\d+\] Sentencia De anima, lib\. 1 l\. 1 n\. (\d+)\s*\n(.*?)(?=\n\s*\[\d+\] Sentencia|\nLectio 2)', t, re.S):
    paras[int(m.group(1))] = ' '.join(m.group(2).split())
js = open(sys.argv[2], encoding='utf-8').read()
ours = []
for m in re.finditer(r"la:'((?:[^'\\]|\\.)*)'", js):
    ours.append(m.group(1))
def words(s):
    s = re.sub(r'<[^>]+>', '', s).replace("\\'", "'")
    return re.findall(r"[A-Za-zæœÆŒ]+", s.lower().replace('j', 'i').replace('v', 'u'))
print('CT paras', len(paras), 'ours la fields', len(ours))
tot = 0
for n in range(1, 16):
    a, b = words(ours[n-1]), words(paras.get(n, ''))
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    diffs = [(op, ' '.join(a[i1:i2]), ' '.join(b[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != 'equal']
    tot += len(diffs)
    print(f'n.{n}: parma {len(a)} w, CT {len(b)} w, {len(diffs)} differences')
    for d in diffs[:8]: print('   ', d)
print('total', tot)
