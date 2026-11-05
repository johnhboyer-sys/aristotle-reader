import json, sys
S=json.load(open('streams.json')); ct=S['ct']; paras=S['paras']; pm=S['pm'][400:133754]; K=json.load(open('keep.json')); pm=[pm[i] for i in K]
items=json.load(open('items.json'))['items']; sec=json.load(open('second.json')); far=json.load(open('second_far.json'))
E=json.load(open('eyed.json'))
seen={(tuple(a),tuple(b)) for a,b in E['no']} | {(tuple(a),tuple(b)) for p in E['places'] for a,b in p[0]}
seen_a={a for a,b in seen}
new=[]; matched_places=0
for src in (sec, far):
    for i,o in src.items():
        it=items[int(i)]
        if o.get('ctrl') or o['v']=='CT': continue
        if src is sec and it['c'] not in ('word','ocr?','pm+','ct+'): continue
        key=(tuple(it['a']),tuple(it['b']))
        if key in seen: continue
        if it['c'] in ('ct+',) and tuple(it['a']) in seen_a: continue
        new.append(int(i))
new=sorted(set(new))
# which old places still exist as items?
cur={(tuple(it['a']),tuple(it['b'])) for it in items}
for p in E['places']:
    if all((tuple(a),tuple(b)) in cur for a,b in p[0]): matched_places+=1
print('new candidates', len(new), '| old places still matched exactly', matched_places, 'of', len(E['places']))
json.dump(new, open('new.json','w'))
for i in new[:400]:
    it=items[i]; a0,a1=it['a']; b0,b1=it['b']; o=sec.get(str(i)) or far.get(str(i))
    print(f"#{i} {paras[ct[min(a0,len(ct)-1)][2]]['pid']} {it['c']:7} {o['v']:5} M[{' '.join(x[1] for x in ct[a0:a1])}] P[{' '.join(x[1] for x in pm[b0:b1])}] | {' '.join(x[1] for x in ct[max(0,a0-3):a0])} _ {' '.join(x[1] for x in ct[a1:a1+3])} | T: {o['T'][:44]}")
