"""Publish maps for round seven, in three parts (one publish sends at most 255
files): what is new goes up from disk; the pictures earlier rounds already hold
are copied on the server.

usage: python3 maps_r7.py <build dir>   → writes <build dir>/../pub7-map-{1,2,3}.json
"""
import json
import sys
from pathlib import Path

R4 = 'https://claude.ai/artifact/PNuw2yLEayHuLAn7FjivTn'   # round four: D's Aldine pages
R5 = 'https://claude.ai/artifact/4JKoRv15wqC1mSFfFcmMmz'   # round five: B's photographs
R6 = 'https://claude.ai/artifact/MkNU79qNssQ7Pco5TKomvj'   # round six: H's 1500s plates

out = Path(sys.argv[1]).resolve()
img = out / 'img'
local, copies_b, copies_dh = {}, {}, {}
for f in sorted(out.rglob('*')):
    if not f.is_file() or f.name == 'index.html':
        continue
    rel = f.relative_to(out).as_posix()
    parts = rel.split('/')
    if parts[:2] == ['img', 'b']:
        if parts[2] == 'printed':          # img/b/printed/<cut>/<id>.jpg ← R5 img/<cut>/<id>.jpg
            copies_b[rel] = {'artifact': R5, 'path': f'img/{parts[3]}/{parts[4]}'}
        else:                              # img/b/<cut>/<id>.jpg ← R5 img/bw/<cut>/<id>.jpg
            copies_b[rel] = {'artifact': R5, 'path': f'img/bw/{parts[2]}/{parts[3]}'}
    elif parts[:2] == ['img', 'd']:        # img/d/<k>.jpg ← R4 img/ald/<k>.jpg
        copies_dh[rel] = {'artifact': R4, 'path': f'img/ald/{parts[2]}'}
    elif parts[:2] == ['img', 'h'] and parts[2] in ('desk', 'phone'):
        copies_dh[rel] = {'artifact': R6, 'path': rel}   # same path in round six
    else:
        local[rel] = rel
for n, m in enumerate([local, copies_b, copies_dh], 1):
    p = out.parent / f'pub7-map-{n}.json'
    p.write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
    size = sum((out / k).stat().st_size for k in m) // 1024
    print(f'part {n}: {len(m)} files, {size} KB on disk -> {p.name}')
