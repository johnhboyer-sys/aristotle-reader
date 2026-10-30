"""Build titles.html: every title setting in title-layout.js on every B
poster (the home page and the 41 works), desktop and phone, for John to
browse and annotate. It is published as its own artifact, with the
photographs in img/desk and img/phone (images.py) as supporting files.

    python3 docs/mockups/2026-10-30-round-four/titles.py

Takes the work titles and their order from round one's data.json (which
holds the site's TLG Greek; only the titles are read) and writes titles.html
and titles-test.html, a copy with a doctype for titles-check.cjs.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '2026-10-29-directions', 'data.json')
# B's names for the divisions (dir-b.js DIV).
DIV = {'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', 'Metaphysics': 'Metaphysics',
       'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics'}


def read(f):
    return open(os.path.join(HERE, f), encoding='utf-8').read()


reg = json.load(open(DATA, encoding='utf-8'))['registry']
photos = json.load(open(os.path.join(HERE, 'photos.json'), encoding='utf-8'))
by = {w['id']: w for w in reg['works']}
# The home page opens on the first of its photographs (core.js U.HERO).
hero = re.search(r"U\.HERO = \['(\w+)'", read('core.js')).group(1)

groups = []
for c in reg['categories']:
    label = 'Doubted and spurious works' if c.get('appendix') else DIV.get(c['title'], c['title'])
    subs = c.get('subcategories') or [{'works': c.get('works') or []}]
    groups.append((label, [x['id'] for s in subs for x in s['works']]))
listed = {i for _, ids in groups for i in ids}
groups.append(('Commentary', [w['id'] for w in reg['works'] if w['id'] not in listed]))

posters = [{'id': 'home', 'name': 'Home page', 'title': 'The complete works of Aristotle', 'photo': hero, 'kind': 'hero', 'group': ''}]
for label, ids in groups:
    posters += [{'id': i, 'name': by[i]['title'], 'title': by[i]['title'], 'photo': i, 'kind': 'work', 'group': label} for i in ids]
for p in posters:
    ph = photos[p['photo']]
    p['alt'] = f"{ph['title']}, {ph['maker']}, {ph['date']}"
    # The photograph's line above each work: what it is and why it was
    # chosen (photos.json's caption, which carries its own <i> markup).
    p['ph'] = {'title': ph['title'], 'maker': ph['maker'], 'date': ph['date'], 'cap': ph['cap']}
posters[0]['ph']['cap'] = f"The home page’s first photograph, also the <i>{by[hero]['title']}</i>’s."

data = {'posters': posters}
page = read('titles-page.html').replace('/*__TL__*/', read('title-layout.js')).replace('/*__DATA__*/{}', json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
open(os.path.join(HERE, 'titles.html'), 'w', encoding='utf-8').write(page)
# The published page is wrapped at publish time with a doctype, a charset,
# a viewport and a small reset; the local copy gets the same.
SKELETON = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
            'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n')
open(os.path.join(HERE, 'titles-test.html'), 'w', encoding='utf-8').write(SKELETON + page + '\n</body></html>\n')
missing = [f'img/{c}/{p["photo"]}.jpg' for p in posters for c in ('desk', 'phone') if not os.path.exists(os.path.join(HERE, 'img', c, p['photo'] + '.jpg'))]
print('titles.html', round(os.path.getsize(os.path.join(HERE, 'titles.html')) / 1024), 'KB,', len(posters), 'posters', f'({len(missing)} pictures missing: run images.py)' if missing else '')
