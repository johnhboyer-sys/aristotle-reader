"""The 27 book-level findings, put to the ink.

`book_spans` says these citations name a book whose Bekker span excludes the page
beside them.  It cannot say WHY, and there are exactly three ways to be here:

    the book letter is misread by us    ->  FIX the letter
    a page digit is misread by us       ->  FIX the page
    Bonitz set it wrong                 ->  PRESERVE, and record in corrigenda

Only the scan decides between them, so this serves the ink and collects one click
per site.  The question the page asks is deliberately not "which of these three"
— it is the question a reader can actually answer while looking at a crop:

    DOES THE INK READ WHAT WE HOLD?

If it does, Bonitz erred and the transcription stands.  If it does not, what he
set is one of the offered readings, and the offer is concrete because a button
that needs typing is a button John cannot use.

    python3 -m bonitz_pipeline.book_review           # write the page
    python3 -m bonitz_pipeline.book_review --serve   # and collect the clicks

⚠ NO "UNSURE" BUTTON.  An unsure click is a defect in the tool, not indecision
in the reader, so everything needed to decide is on the card: the citation in
its line, the same crop widened, and the conflict stated in words.  If a site
still cannot be ruled on, that is a bug to fix here.
"""

from __future__ import annotations
import argparse
import base64
import io
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from bonitz_pipeline.book_spans import OUT as SPANS, check, book_number, series
from bonitz_pipeline.mark_review import crop_word
from bonitz_pipeline.siglum_check import inventory, read, resolve

ROOT = Path(__file__).resolve().parent.parent
RULINGS = ROOT / 'work/sweeps/book-rulings.json'
PAGE = ROOT / 'work/sweeps/book-review.html'

# How many page candidates to offer.  Every one of them is an in-range page a
# single digit away from what we hold; they are ordered by how far they move the
# number, which is a proxy for plausibility and not evidence.  Four is where a
# row of buttons stops being readable at a glance.
MAX_PAGE_CANDIDATES = 4


@dataclass
class Finding:
    col: str
    line: int
    raw: str
    token: str
    stem: str
    book: str
    page: int
    lo: int
    hi: int
    owner: str
    crop: str = ''
    whole: str = ''
    how: str = ''
    pages: list[int] = field(default_factory=list)

    @property
    def sid(self) -> str:
        return f'{self.col}:{self.line}:{self.token}:{self.page}'


def page_candidates(page: int, lo: int, hi: int) -> list[int]:
    """In-range pages one digit away from the one printed."""
    s, out = str(page), set()
    for i in range(len(s)):
        for d in '0123456789':
            if d == s[i]:
                continue
            n = s[:i] + d + s[i + 1:]
            if len(n.lstrip('0')) == len(s) and lo <= int(n) <= hi:
                out.add(int(n))
    return sorted(out, key=lambda n: (abs(n - page), n))[:MAX_PAGE_CANDIDATES]


def _b64(im) -> str:
    """PNG, at full resolution, in sixteen greys.

    Every pixel is kept — John is reading letterforms, and a downscaled crop
    costs exactly the stroke under question.  What is thrown away is colour
    depth the scan never had: these are grey line images, and sixteen levels
    hold them at under half the bytes.  The page carries 27 sites twice over,
    so this is the difference between 20 MB and 7.
    """
    if im is None:
        return ''
    buf = io.BytesIO()
    im.convert('L').quantize(colors=16).save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def findings() -> list[Finding]:
    table = json.loads(SPANS.read_text(encoding='utf-8'))
    cites = read()
    resolve(cites, inventory())
    out = []
    for c, stem, lo, hi, owner in sorted(check(cites, table),
                                         key=lambda t: (t[0].col, t[0].line)):
        f = Finding(c.col, c.line, c.raw, c.token, stem, c.book, c.page,
                    lo, hi, owner)
        # The citation anchored on its token, opened wide enough to carry the
        # page digits too — both are on trial and a crop that shows only the
        # letter cannot settle a digit.
        im, _, how = crop_word(c.col, c.line, c.token, scale=3.0, spread=8)
        f.crop, f.how = _b64(im), how
        f.whole = _b64(crop_word(c.col, c.line, c.token, scale=1.6, whole=True)[0])
        f.pages = page_candidates(c.page, lo, hi)
        out.append(f)
    return out


CSS = """
:root{--paper:#f7f6f2;--ink:#1a1d20;--rule:#d2d0c8;--muted:#6b6963;
      --keep:#8a6516;--fix:#12595f;--plate:#fff;--warn:#9b2226}
@media(prefers-color-scheme:dark){:root{--paper:#15181b;--ink:#e6e4de;
      --rule:#2c3136;--muted:#918e86;--keep:#d3a64a;--fix:#63b8bc;
      --plate:#1a1e22;--warn:#e07a5f}}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);margin:0;
     font:16px/1.55 Charter,"Iowan Old Style",Georgia,serif}
header{position:sticky;top:0;background:var(--paper);border-bottom:1px solid var(--rule);
       padding:.8rem 1.2rem;display:flex;gap:1rem;align-items:baseline;z-index:5}
h1{font:600 1.05rem/1.2 Superclarendon,Rockwell,Georgia,serif;margin:0}
#count{font:.8rem "SF Mono",Menlo,monospace;color:var(--muted)}
main{max-width:62rem;margin:0 auto;padding:1.2rem}
.card{background:var(--plate);border:1px solid var(--rule);border-radius:2px;
      padding:1rem 1.1rem;margin:0 0 1.4rem}
.card.done{opacity:.42}
.loc{font:.72rem "SF Mono",Menlo,monospace;color:var(--muted);letter-spacing:.06em;
     text-transform:uppercase}
.said{font:1.05rem/1.5 "New Athena Unicode","Palatino Linotype",Palatino,serif;
      margin:.35rem 0 .1rem}
.said b{color:var(--warn)}
.why{color:var(--muted);font-size:.9rem;margin:0 0 .8rem}
img{display:block;max-width:100%;border:1px solid var(--rule);background:#fff;
    border-radius:2px;image-rendering:-webkit-optimize-contrast}
.crops{display:flex;flex-direction:column;gap:.5rem;margin:0 0 .9rem}
details summary{font:.75rem "SF Mono",Menlo,monospace;color:var(--muted);
      cursor:pointer;padding:.25rem 0}
.row{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center}
button{font:.82rem/1 Charter,Georgia,serif;padding:.55rem .8rem;cursor:pointer;
       border:1px solid var(--rule);background:transparent;color:var(--ink);
       border-radius:2px}
button:hover{border-color:var(--fix)}
button.keep{border-color:var(--keep);color:var(--keep)}
button.keep:hover{background:var(--keep);color:var(--plate)}
button.fix{border-color:var(--fix);color:var(--fix)}
button.fix:hover{background:var(--fix);color:var(--plate)}
button[aria-pressed=true]{background:var(--fix);border-color:var(--fix);color:var(--plate)}
button.keep[aria-pressed=true]{background:var(--keep);border-color:var(--keep);color:var(--plate)}
button:focus-visible{outline:2px solid var(--fix);outline-offset:2px}
.gk{font-family:"New Athena Unicode","Palatino Linotype",Palatino,serif}
.lbl{font:.7rem "SF Mono",Menlo,monospace;color:var(--muted);
     text-transform:uppercase;letter-spacing:.08em;width:100%;margin:.35rem 0 0}
.warnflag{color:var(--warn);font-size:.8rem}
/* Ruled from an iPad, every target is a fingertip. Buttons grow, the crop gets
   the full width it can have, and the card stops wasting margin on chrome. */
@media(pointer:coarse){
  body{font-size:17px}
  main{padding:.7rem}
  .card{padding:.9rem .8rem}
  button{padding:.85rem 1rem;font-size:.95rem;min-height:44px}
  .row{gap:.55rem}
  details summary{padding:.6rem 0}
}
@media(max-width:640px){
  header{padding:.7rem .8rem;flex-wrap:wrap;gap:.3rem}
  h1{font-size:.95rem}
}
"""

JS = """
// ⚠ OPENED AS A FILE, NOTHING IS SAVED.  The POST fails silently on file://, so
// 27 rulings could be made and lost — the same way two finished Grok reviews
// were lost to a reboot. Say so before the first click, not after the last.
if(location.protocol==='file:'){
  const b=document.createElement('div');
  b.style.cssText='background:var(--warn);color:#fff;padding:.7rem 1.2rem;font:14px Charter,Georgia,serif';
  b.textContent='Not being saved — this page was opened as a file. Run '
    +'python3 -m bonitz_pipeline.book_review --serve and use localhost:8791.';
  document.body.prepend(b);
}
const done={};
async function rule(sid,verdict,detail,btn){
  const card=btn.closest('.card');
  card.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));
  btn.setAttribute('aria-pressed','true');
  card.classList.add('done'); done[sid]={verdict,detail};
  document.getElementById('count').textContent=
    Object.keys(done).length+' / '+document.querySelectorAll('.card').length+' ruled';
  try{ await fetch('/ruling',{method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({id:sid,verdict,detail})}); }
  catch(e){ /* written to disk only when served; the page still works standalone */ }
}
"""


def html(fs: list[Finding], out: Path = PAGE) -> Path:
    cards = []
    for f in fs:
        n = book_number(f.stem, f.book)
        warn = ('<div class="warnflag">⚠ this crop was placed by geometry, not by '
                'matching the line text — check it against the printed line below'
                '</div>') if f.how != 'text' else ''
        pages = ''.join(
            f'<button class="fix" onclick="rule({f.sid!r},\'fix-page\',{p},this)">'
            f'{p}</button>' for p in f.pages)
        pages = (f'<div class="lbl">or a page digit is ours, and the ink reads</div>'
                 f'<div class="row">{pages}</div>') if f.pages else ''
        cards.append(f"""
<div class="card" id="{f.sid}">
  <div class="loc">{f.col} · line {f.line}</div>
  <div class="said gk">{f.raw}</div>
  <div class="why">{f.stem}{f.book} is book {n} at {f.lo}–{f.hi}.
      {f.page} is in book <b class="gk">{f.owner}</b>.</div>
  {warn}
  <div class="crops">
    <img src="data:image/png;base64,{f.crop}" alt="the citation in the scan">
    <details><summary>the whole printed line</summary>
      <img src="data:image/png;base64,{f.whole}" alt="the whole line"></details>
  </div>
  <div class="lbl">the ink reads what we hold — Bonitz set it wrong</div>
  <div class="row">
    <button class="keep" onclick="rule({f.sid!r},'preserve','',this)">
      preserve <span class="gk">{f.token}</span> · corrigenda</button>
  </div>
  <div class="lbl">the book letter is ours, and the ink reads</div>
  <div class="row">
    <button class="fix" onclick="rule({f.sid!r},'fix-letter',{f.owner!r},this)">
      <span class="gk">{f.stem}{f.owner}</span></button>
  </div>
  {pages}
</div>""")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        f'<!doctype html><meta charset="utf-8"><title>Book-level findings</title>'
        f'<style>{CSS}</style>'
        f'<header><h1>Which is wrong — the letter, the page, or Bonitz?</h1>'
        f'<span id="count">0 / {len(fs)} ruled</span></header>'
        f'<main>{"".join(cards)}</main><script>{JS}</script>',
        encoding='utf-8')
    return out


def lan_address() -> str:
    """This machine's address on the WiFi, for ruling from the iPad."""
    import subprocess
    for dev in ('en0', 'en1'):
        try:
            ip = subprocess.run(['ipconfig', 'getifaddr', dev],
                                capture_output=True, text=True, timeout=2).stdout.strip()
            if ip:
                return ip
        except (OSError, subprocess.SubprocessError):
            pass
    return '127.0.0.1'


def serve(fs, port: int = 8791, host: str = '127.0.0.1',
          page: Path = None, store: Path = None, verdicts: tuple = (
              'preserve', 'fix-letter', 'fix-page')) -> None:
    """⚠ `--wifi` BINDS TO EVERY INTERFACE, so anything on the network can read
    the page and post rulings. There is no authentication and none is wanted —
    it is a scan of a book printed in 1870 and a JSON file of letter choices —
    but it is open while it runs, so stop it when the queue is done.
    """
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    # `page` and `store` are parameters so the work-level queue can reuse this
    # server without a second copy of it. Defaults keep the book-level caller
    # unchanged.
    page = page or PAGE
    store = store or RULINGS
    body = page.read_bytes()

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            # ⚠ SO A RELOAD SHOWS WHERE HE LEFT OFF. The done-marks lived only
            # in the tab, so every reload — and there have been several today,
            # some of them mine — wiped 300 cards back to unruled and left him
            # scrolling to find his place. The rulings were on disk the whole
            # time; nothing ever handed them back to the page.
            if self.path.rstrip('/') == '/rulings':
                return self.do_GET_rulings()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET_rulings(self):
            have = (store.read_bytes() if store and store.exists() else b'{}')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(have)))
            self.end_headers()
            self.wfile.write(have)

        def do_POST(self):
            n = int(self.headers.get('Content-Length', 0))
            try:
                d = json.loads(self.rfile.read(n) or b'{}')
            except json.JSONDecodeError:
                self.send_response(400); self.end_headers(); return
            sid, verdict = d.get('id'), d.get('verdict')
            valid = {s.sid for s in fs}
            if sid not in valid or verdict not in verdicts:
                # A malformed id used to be written straight to the store, so a
                # typo in the page silently produced a ruling on nothing.
                self.send_response(400); self.end_headers(); return
            have = (json.loads(store.read_text(encoding='utf-8'))
                    if store.exists() else {})
            have[sid] = {'verdict': verdict, 'detail': d.get('detail', '')}
            store.parent.mkdir(parents=True, exist_ok=True)
            store.write_text(json.dumps(have, ensure_ascii=False, indent=1),
                             encoding='utf-8')
            self.send_response(204); self.end_headers()

    if host == '0.0.0.0':
        print(f'http://{lan_address()}:{port}   (open on the WiFi)')
    print(f'http://localhost:{port}  ->  {store}')
    # ⚠ ONE THREAD CANNOT SERVE AN 80MB PAGE AND TAKE A RULING AT THE SAME
    # TIME. John, 2026-08-10, on his phone: NOT SAVED across the top while the
    # server sat there listening. It was listening — and blocked, still pushing
    # the page body down the wire, so every POST queued behind the download and
    # timed out. The banner was telling the truth; the diagnosis "server is
    # down" was wrong. Threading it costs nothing here: one reader, a handful
    # of requests, no shared state but a JSON file rewritten whole.
    ThreadingHTTPServer((host, port), H).serve_forever()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--serve', action='store_true')
    p.add_argument('--wifi', action='store_true',
                   help='bind to every interface, to rule from another device')
    p.add_argument('--port', type=int, default=8791)
    a = p.parse_args(argv)

    fs = findings()
    html(fs)
    weak = [f.sid for f in fs if f.how != 'text']
    print(f'{len(fs)} findings -> {PAGE}')
    if weak:
        print(f'{len(weak)} crops placed by geometry rather than text match:')
        for s in weak:
            print(f'   {s}')
    if a.serve or a.wifi:
        serve(fs, a.port, '0.0.0.0' if a.wifi else '127.0.0.1')
    return 0


if __name__ == '__main__':
    sys.exit(main())
