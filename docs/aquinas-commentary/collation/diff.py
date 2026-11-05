import json, subprocess, re
S = json.load(open('streams.json')); ct = S['ct']; pm = S['pm'][400:133754]; KEEP = json.load(open('keep.json')); pm = [pm[i] for i in KEEP]
open('a.txt', 'w').write('\n'.join(x[0] for x in ct) + '\n'); open('b.txt', 'w').write('\n'.join(x[0] for x in pm) + '\n')
out = subprocess.run(['git', 'diff', '--no-index', '--histogram', '-U0', '--no-color', 'a.txt', 'b.txt'], capture_output=True, text=True).stdout
H = []
for m in re.finditer(r'^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', out, re.M):
    a = int(m[1]); ac = int(m[2]) if m[2] is not None else 1; b = int(m[3]); bc = int(m[4]) if m[4] is not None else 1
    a0 = a - 1 if ac > 0 else a; b0 = b - 1 if bc > 0 else b; H.append((a0, a0 + ac, b0, b0 + bc))
json.dump(H, open('hunks.json', 'w'))
print('hunks', len(H), 'CT words matching the OCR exactly', f"{1 - sum(h[1] - h[0] for h in H) / len(ct):.1%}")
big = [h for h in H if max(h[1] - h[0], h[3] - h[2]) > 20]
print('hunks over 20 words:', len(big))
for h in big: print('  ', h, 'ct', h[1]-h[0], 'pm', h[3]-h[2], S['paras'][ct[min(h[0], len(ct)-1)][2]]['pid'], '|', ' '.join(x[1] for x in pm[h[2]:h[2]+10])[:90], '|CT:', ' '.join(x[1] for x in ct[h[0]:h[0]+6])[:50])
