t = open('template2.html').read()
d = open('aquinas-data.js').read() + open('round2-data.js').read()
a = open('aristotle.json').read().strip()
assert '/*DATA*/' in t and '/*ARI*/' in t
t = t.replace('/*DATA*/', d, 1).replace('/*ARI*/', a, 1)
open('aquinas-r2.html', 'w').write(t)
open('preview2.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + t + '</html>')
print(len(t.encode()))
