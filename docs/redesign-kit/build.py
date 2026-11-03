"""Assemble the round mockup from the shell and direction modules.

usage:
  python3 build.py --out out/e --dirs e            # test page for direction E
  python3 build.py --out out/e --dirs e --ref-b    # E beside round five's B
  python3 build.py --out out/all --dirs e,f,g,h --publish   # no skeleton

A module lives in dirs/<k>/:
  style.css   CSS, every rule under .frame.dir-<k> (may start with one
              @import of Google Fonts)
  script.js   one IIFE that sets window.T.<k> = { home, work, reader, ... }
  notes.js    window.NOTES.<k> = { name, idea, pages, type, images, risk, tries }
  img/        optional images, referenced in the module as img/<k>/...

The test page gets the publish skeleton (doctype, charset, viewport meta and
the small reset) so it renders as it will once published; --publish leaves it
off, because the artifact service adds it.
"""
import argparse
import shutil
from pathlib import Path

KIT = Path(__file__).resolve().parent
SKELETON = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,'
            'initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;'
            'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px '
            '-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}'
            '[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')


def module(k: str, ref_b: bool):
    if k == 'b' and ref_b:
        d = KIT / 'ref'
        return d / 'dir-b.css', d / 'dir-b.js', d / 'notes-b.js', d / 'img'
    d = KIT / 'dirs' / k
    return d / 'style.css', d / 'script.js', d / 'notes.js', d / 'img'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--dirs', required=True, help='comma-separated keys, in switch order')
    ap.add_argument('--ref-b', action='store_true', help="add round five's B after the others")
    ap.add_argument('--publish', action='store_true', help='leave the skeleton off')
    a = ap.parse_args()
    keys = [k.strip() for k in a.dirs.split(',') if k.strip()]
    if a.ref_b and 'b' not in keys:
        keys.append('b')
    out = Path(a.out)
    if not out.is_absolute():
        out = KIT / out
    out.mkdir(parents=True, exist_ok=True)
    shell = (KIT / 'shell.html').read_text(encoding='utf-8')
    css, js = [], []
    for k in keys:
        c, s, n, img = module(k, a.ref_b)
        for f in (c, s, n):
            if not f.exists():
                raise SystemExit(f'missing {f}')
        css.append(f'<style>/* ── direction {k} ── */\n{c.read_text(encoding="utf-8")}\n</style>')
        js.append(f'<script>/* ── direction {k} ── */\n{s.read_text(encoding="utf-8")}\n</script>')
        js.append(f'<script>/* ── notes {k} ── */\n{n.read_text(encoding="utf-8")}\n</script>')
        dst = out / 'img' / k
        if dst.exists():
            shutil.rmtree(dst)
        if img.exists():
            shutil.copytree(img, dst)
    # The written overview (overview.html: a <style> and a <main id="overview">)
    # replaces the shell's placeholder; its pictures sit in ov/.
    ovf = KIT / 'overview.html'
    if ovf.exists():
        ov = ovf.read_text(encoding='utf-8')
        st = ov[:ov.index('</style>') + len('</style>')]
        main = ov[ov.index('<main id="overview"'):ov.index('</main>') + len('</main>')]
        a0 = shell.index('<main id="overview"')
        a1 = shell.index('</main>', a0) + len('</main>')
        shell = shell[:a0] + main + shell[a1:]
        css.append(st)
        dst = out / 'ov'
        if dst.exists():
            shutil.rmtree(dst)
        if (KIT / 'ov').exists():
            shutil.copytree(KIT / 'ov', dst)
    first_style_end = shell.index('</style>') + len('</style>')
    page = shell[:first_style_end] + '\n' + '\n'.join(css) + shell[first_style_end:]
    page = page.replace('<!-- DIRECTION MODULES -->', '\n'.join(js), 1)
    if not a.publish:
        page = SKELETON + page + '\n</body></html>\n'
    (out / 'index.html').write_text(page, encoding='utf-8')
    print(f'wrote {out / "index.html"} ({len(page.encode("utf-8")) // 1024} KB) with {", ".join(keys)}')


if __name__ == '__main__':
    main()
