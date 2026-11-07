import re,sys,difflib,glob,collections
S=sys.argv[1]
def words(t): return re.findall(r"[A-Za-z]+(?:['’][a-z]+)?",t)
ours=[]
for f in sorted(glob.glob('sources/prob-forster/book-*.html')):
    t=open(f).read(); t=re.sub(r'<[^>]+>',' ',t); t=re.sub(r'\n\s*Part \d+\s*\n',' ',t)
    t=t.replace('Translated by E. S. Forster',' ')
    t=re.sub(r'Problemata, Book \d+',' ',t)
    ours+=words(t)
A=words(re.sub(r'-\s*\n\s*','',open(f'{S}/worksofaristotle07arisuoft.txt').read()))
B=set(w.lower() for w in words(re.sub(r'-\s*\n\s*','',open(f'{S}/worksofaristotle0007unse_o7n4.txt').read())))
lo=[w.lower() for w in ours]; la=[w.lower() for w in A]
sm=difflib.SequenceMatcher(None,la,lo,autojunk=False)
sus=[]
ops=sm.get_opcodes()
for i,(tag,a1,a2,b1,b2) in enumerate(ops):
    if tag=='delete' and a2-a1<=3:
        prev=ops[i-1] if i else None; nxt=ops[i+1] if i+1<len(ops) else None
        if prev and nxt and prev[0]=='equal' and nxt[0]=='equal' and prev[2]-prev[1]>=6 and nxt[2]-nxt[1]>=6:
            gone=la[a1:a2]
            if all(len(w)>=2 and w.isalpha() for w in gone):
                sus.append((' '.join(lo[max(0,b1-6):b1]),' '.join(A[a1:a2]),' '.join(lo[b1:b1+6])))
print('ours words',len(lo),'A words',len(la),'short mid-run drops',len(sus))
for s in sus[:40]: print(f'  …{s[0]} [{s[1]}] {s[2]}…')
D=set(w.strip().lower() for w in open('/usr/share/dict/words'))
real=[s for s in sus if all((w.lower() in D and len(w)>2) or w.lower() in ('a','in','to','of','is','it','be','by','or','an','as','at','on','we','he','if','so','no','do','up') for w in s[1].split()) and all(w.lower() in B for w in s[1].split())]
print('REAL-WORD drops (in dict and in witness B):',len(real))
for s in real: print(f'  …{s[0]} [{s[1]}] {s[2]}…')
