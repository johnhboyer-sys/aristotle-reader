"""Inline the shell, the three directions, the notes and the data
into one page, index.html, as published to the artifact. The pictures stay
beside it in img/ (images.py) and are published as supporting files.

    python3 docs/mockups/2026-10-30-round-four/build.py

The data is round one's data.json (the site's TLG Greek, built by
../2026-10-29-directions/prep.py) plus photos.json and aldine.json, so
index.html and test.html are gitignored.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '2026-10-29-directions', 'data.json')


def read(f):
    return open(os.path.join(HERE, f), encoding='utf-8').read()


dirs = 'abd'
css = read('shell.css') + ''.join(read(f'dir-{d}.css') for d in dirs)
js = ''.join(read(f) + '\n' for f in ['core.js'] + [f'dir-{d}.js' for d in dirs] + ['notes.js']) + 'window.U.boot();\n'
data = json.load(open(DATA, encoding='utf-8'))
data['photos'] = json.load(open(os.path.join(HERE, 'photos.json'), encoding='utf-8'))
data['aldine'] = json.load(open(os.path.join(HERE, 'aldine.json'), encoding='utf-8'))
page = read('page.html').replace('/*__CSS__*/', css).replace('/*__JS__*/', js).replace('/*__DATA__*/{}', json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(page)
# A local test page: the published page is wrapped with a doctype and charset
# at publish time; the local copy needs them too (verify.js).
open(os.path.join(HERE, 'test.html'), 'w', encoding='utf-8').write('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' + page + '\n</html>\n')
missing = [p for p in [f'img/{c}/{k}.jpg' for k in data['photos'] for c in ('desk', 'phone')] + [f'img/ald/{k}-page.jpg' for k in data['aldine']] if not os.path.exists(os.path.join(HERE, p))]
print('index.html', round(os.path.getsize(os.path.join(HERE, 'index.html')) / 1024), 'KB', f'({len(missing)} pictures missing: run images.py)' if missing else '')
