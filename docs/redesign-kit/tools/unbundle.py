"""Split a published round page back into the kit's source files.

usage: python3 -I unbundle.py <published index.html> <kit dir> [--modules]

build.py --publish writes one page: the shell, then each direction's CSS,
script and notes between markers, then the overview. This reverses it:

- always writes <kit>/shell.html (the published page with the modules and the
  overview's style cut out and the <!-- DIRECTION MODULES --> placeholder put
  back; build.py replaces the overview's <main> again on the next build);
- with --modules, also writes <kit>/dirs/<k>/{style.css,script.js,notes.js}
  and <kit>/overview.html, for a kit that has lost them.

Images are not in the page: fetch img/<k>/... and ov/... from the artifact's
published files. Check the result: python3 build.py --publish into a new out
dir must reproduce the published page byte for byte.
"""
import re
import sys
from pathlib import Path


def main() -> None:
    src, kit = Path(sys.argv[1]), Path(sys.argv[2])
    modules = '--modules' in sys.argv[3:]
    page = src.read_text(encoding='utf-8')
    if page.lstrip().lower().startswith('<!doctype'):
        raise SystemExit('this page has the test skeleton; use the published (--publish) page')

    # Styles: right after the shell's first </style> come "\n" and the module
    # styles joined by "\n", the overview's style last.
    first = page.index('</style>') + len('</style>')
    keys = re.findall(r'<style>/\* ── direction (\w[\w-]*) ── \*/\n', page)
    if not keys:
        raise SystemExit('no direction styles found: is this a round page?')
    pos = first
    if page[pos] != '\n':
        raise SystemExit('unexpected text after the shell style')
    pos += 1
    styles = {}
    for k in keys:
        head = f'<style>/* ── direction {k} ── */\n'
        if not page.startswith(head, pos):
            raise SystemExit(f'direction {k}: style not where expected')
        end = page.index('\n</style>', pos)
        styles[k] = page[pos + len(head):end]
        pos = end + len('\n</style>')
        if page[pos] != '\n':
            raise SystemExit(f'direction {k}: no newline after its style')
        pos += 1
    ov_style = ''
    if page.startswith('<style>', pos) and not page.startswith('<style>/* ── direction', pos):
        end = page.index('</style>', pos) + len('</style>')
        ov_style = page[pos:end]
        pos = end
    shell = page[:first] + page[pos:]

    # Scripts: one run of direction and notes scripts replaced the placeholder.
    scripts, notes = {}, {}
    a = shell.index(f'<script>/* ── direction {keys[0]} ── */\n')
    p = a
    for i, k in enumerate(keys):
        for kind, store in (('direction', scripts), ('notes', notes)):
            head = f'<script>/* ── {kind} {k} ── */\n'
            if not shell.startswith(head, p):
                raise SystemExit(f'{kind} {k}: script not where expected')
            end = shell.index('\n</script>', p)
            store[k] = shell[p + len(head):end]
            p = end + len('\n</script>')
            last = i == len(keys) - 1 and kind == 'notes'
            if not last:
                if shell[p] != '\n':
                    raise SystemExit(f'{kind} {k}: no newline after its script')
                p += 1
    shell = shell[:a] + '<!-- DIRECTION MODULES -->' + shell[p:]

    kit.mkdir(parents=True, exist_ok=True)
    (kit / 'shell.html').write_text(shell, encoding='utf-8')
    print(f'shell.html ({len(shell.encode("utf-8")) // 1024} KB); directions {", ".join(keys)}')
    if modules:
        for k in keys:
            d = kit / 'dirs' / k
            d.mkdir(parents=True, exist_ok=True)
            (d / 'style.css').write_text(styles[k], encoding='utf-8')
            (d / 'script.js').write_text(scripts[k], encoding='utf-8')
            (d / 'notes.js').write_text(notes[k], encoding='utf-8')
        main_m = re.search(r'<main id="overview".*?</main>', shell, re.S)
        if ov_style and main_m:
            (kit / 'overview.html').write_text(ov_style + '\n' + main_m.group(0) + '\n', encoding='utf-8')
        print('modules and overview written')


if __name__ == '__main__':
    main()
