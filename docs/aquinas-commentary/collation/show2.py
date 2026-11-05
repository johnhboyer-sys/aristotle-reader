import json, sys
S=json.load(open('streams.json')); ct=S['ct']; paras=S['paras']; pm=S['pm'][400:133754]; KEEP = json.load(open(f'{P}/keep.json')) if 'P' in dir() else json.load(open('keep.json')); pm = [pm[i] for i in KEEP]
items=json.load(open('items.json'))['items']; out=json.load(open('second.json'))
cls=sys.argv[1].split(','); vs=sys.argv[2].split(',')
for i,o in sorted(out.items(), key=lambda x:int(x[0])):
    it=items[int(i)]
    if it['c'] not in cls or o['v'] not in vs or o.get('ctrl'): continue
    a0,a1=it['a']; b0,b1=it['b']
    print(f"{paras[ct[min(a0,len(ct)-1)][2]]['pid']:>8} {it['c']:5} {o['v']:5} CT«{' '.join(x[1] for x in ct[a0:a1])}» P«{' '.join(x[1] for x in pm[b0:b1])}» | {' '.join(x[1] for x in ct[max(0,a0-3):a0])} _ {' '.join(x[1] for x in ct[a1:a1+3])} | T: {o['T'][:60]} ({o['dc']}/{o['dp']})")
