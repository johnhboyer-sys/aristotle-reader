"""Parse every archive English slot the way stage 1 does and save
{dir|marker|sq: {"book:chapter": prose}} to a JSON file.
usage (repo root): python3 snapshot.py <out.json>"""
import json, sys, glob
from pathlib import Path
sys.path.insert(0, 'pipeline')
import yaml
from aristotle_pipeline import stage1_archive
out = {}
for mf in sorted(glob.glob('manifests/*.yaml')):
    m = yaml.safe_load(open(mf, encoding='utf-8')) or {}
    eng = m.get('english') or {}
    cfgs = []
    for slot, cfg in eng.items():
        if isinstance(cfg, list): cfgs += [c for c in cfg if isinstance(c, dict)]
        elif isinstance(cfg, dict): cfgs.append(cfg)
    for cfg in cfgs:
        if not cfg.get('dir') or cfg.get('model') == 'perseus_tei': continue
        if not (Path('sources') / cfg['dir']).is_dir(): continue
        if cfg['dir'] == 'ostwald': continue
        key = f"{cfg['dir']}|{cfg.get('chapter_marker', cfg.get('marker', 'number'))}|{bool(cfg.get('strip_quote_repeats'))}"
        if key in out: continue
        books = cfg.get('books', 1)
        prose = stage1_archive._load_prose(dict(cfg, books=books))
        out[key] = {f"{b}:{c}": t for (b, c), t in sorted(prose.items())}
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), 'slots;', sum(len(v) for v in out.values()), 'chapters')
