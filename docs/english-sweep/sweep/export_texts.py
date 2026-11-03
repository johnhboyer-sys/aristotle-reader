"""Write each public translation's text, as the site parses it, to <out>/<dir>.txt
with '=== book B, chapter C ===' lines between chapters. Run from the repo root."""
import glob, os, re, sys, yaml
from pathlib import Path
sys.path.insert(0, 'pipeline')
from aristotle_pipeline import stage1_archive
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
GATED = {'ee-rackham', 'cat-ackrill', 'int-ackrill'}
def english_slots(m):
    """Every translation config under a manifest's english block, overlays included."""
    out = []
    def walk(o, where):
        if isinstance(o, dict):
            if o.get('dir'): out.append((where, o)); return
            for k, v in o.items(): walk(v, f"{where}/{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, f"{where}[{i}]")
    walk(m.get('english') or {}, 'english')
    return out

done = set()
for f in sorted(glob.glob('manifests/*.yaml')):
    m = yaml.safe_load(open(f, encoding='utf-8'))
    if not isinstance(m, dict): continue
    for slot, e in english_slots(m):
        if e['dir'] in GATED | done or e['dir'] == 'ostwald': continue
        prose = stage1_archive.parse_translation(Path('sources') / e['dir'], e.get('books', 1), e.get('chapter_marker') or e.get('marker') or 'number', strip_quote_repeats=e.get('strip_quote_repeats', False))
        with open(out / f"{e['dir']}.txt", 'w', encoding='utf-8') as w:
            w.write(f"# {e.get('name')} · {os.path.basename(f)} {slot}\n")
            for (b, c), v in sorted(prose.items()):
                w.write(f"=== book {b}, chapter {c} ===\n{re.sub(chr(32) + '+', ' ', v.strip())}\n")
        done.add(e['dir'])
print(len(done), 'texts written')
