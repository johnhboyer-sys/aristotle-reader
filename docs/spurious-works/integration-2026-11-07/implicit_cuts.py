"""For every manifest with anchor_cuts: true, list anchors-file entries that sit
on a column's first spine line when that line is not 1, marked or not. The
first column of the work is reported too but cuts nothing (build_chunks only
cuts before a following column)."""
import re, sys, yaml
from pathlib import Path
sys.path.insert(0, 'pipeline')
from aristotle_pipeline.config import Manifest, SOURCES_DIR
from aristotle_pipeline import stage1_greek as g

B = re.compile(r'^(\d+[ab])(\d+)$')
examined = 0
for mp in sorted(Path('manifests').glob('*.yaml')):
    data = yaml.safe_load(mp.read_text())
    trs = (data.get('english') or {}).get('translations') or data.get('translations') or []
    text = mp.read_text()
    if not re.search(r'anchor_cuts:\s*true', text):
        continue
    m = Manifest.load(mp)
    xml = g.spine_xml(m)
    lin = (m.data.get('greek') or {}).get('lineation')
    if lin:
        from aristotle_pipeline.stage1_relineate import relineate
        spine = g._segments(relineate(xml, SOURCES_DIR / lin), [], m)
    else:
        spine = g.parse_spine(xml, m)
    first, order = {}, []
    for s in spine['segments']:
        if s['lines'] and s['column'] not in first:
            first[s['column']] = s['lines'][0]['n']; order.append(s['column'])
    low = {c: n for c, n in first.items() if n != 1}
    for rel in re.findall(r'anchors:\s*"([^"]+)"', text):
        ents = yaml.safe_load((SOURCES_DIR / rel).read_text()) or []
        examined += 1
        hits = []
        for e in ents:
            mm = B.match(str(e['bekker']).strip())
            if mm and mm.group(1) in low and int(mm.group(2)) == low[mm.group(1)]:
                hits.append(f"{e['bekker']}{' cut' if e.get('cut') is True else ' UNMARKED'}{' (first column)' if mm.group(1)==order[0] else ''}")
        print(f"{mp.stem}: {rel}: {len(ents)} entries, {len(first)} columns, below-1 columns {low} -> {hits or 'none'}")
print('anchors files examined:', examined)
if not examined: sys.exit('examined nothing')
