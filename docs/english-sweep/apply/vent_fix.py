"""apply_real.py put the restored lacuna dots of Vent 973b after the closing
</p> ('the west.</p>..'); move them inside. Run from the repo root."""
from pathlib import Path
f = Path('sources/vent-forster/book-01.html')
raw = f.read_text(encoding='utf-8')
old, new = 'and the west.</p>..', 'and the west...</p>'
assert raw.count(old) == 1
f.write_text(raw.replace(old, new), encoding='utf-8')
print('moved')
