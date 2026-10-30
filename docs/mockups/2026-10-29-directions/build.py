"""Inline the shell, the four directions, the notes, data.json and the shots of
the current site into one page, index.html, as published to the artifact.

    python3 docs/mockups/2026-10-29-directions/build.py

index.html embeds data.json (the site's TLG Greek), so it is gitignored.
"""
import base64, os

HERE = os.path.dirname(os.path.abspath(__file__))


def read(f):
    return open(os.path.join(HERE, f), encoding='utf-8').read()


css = ''.join(read(f) for f in ['shell.css', 'dir-a.css', 'dir-b.css', 'dir-c.css', 'dir-d.css'])
js = ''.join(read(f) + '\n' for f in ['core.js', 'dir-a.js', 'dir-b.js', 'dir-c.js', 'dir-d.js', 'notes.js']) + 'window.U.boot();\n'
page = read('page.html')
# The overview's shots of the current site (shoot-current.cjs); left as links
# if they have not been taken.
for k in ['home', 'work', 'reader', 'search']:
    p = os.path.join(HERE, 'shots', f'{k}.jpg')
    if os.path.exists(p):
        b64 = base64.b64encode(open(p, 'rb').read()).decode()
        page = page.replace(f'src="shots/{k}.jpg"', f'src="data:image/jpeg;base64,{b64}"')
page = page.replace('/*__CSS__*/', css).replace('/*__JS__*/', js).replace('/*__DATA__*/{}', read('data.json').replace('</', '<\\/'))
open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(page)
print('index.html', round(os.path.getsize(os.path.join(HERE, 'index.html')) / 1024), 'KB')
