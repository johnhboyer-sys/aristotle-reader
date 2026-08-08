"""
Rule the mark queue one site at a time, in the browser, with two clicks.

John's constraints, 2026-08-08: *"can you redo review B with buttons (big ones)
to click"* and *"i don't want to type and switch windows."*  So: the page is
served from here, every click POSTs back and lands in
`work/sweeps/mark-rulings.json` as it happens, and the next site loads itself.
No copy-paste, no file to save, no scrolling.

⚠ Why this is a server and not one big HTML file.  The first attempt inlined
all 56 crops as base64 — a 17 MB document that the browser would not render at
all.  Crops are served as separate images here and only the current one is
fetched, so the page stays small however long the queue gets.

Nothing is applied.  This records what John SAW.  Applying is a separate step
against `mark-rulings.json`, which is the discipline the 38 bad corrections of
2026-08-08 were missing.

    python3 -m bonitz_pipeline.review_server --class B
    python3 -m bonitz_pipeline.review_server --class C --class D --port 8788

Binds to 127.0.0.1 only.  Re-ruling a site replaces its entry, so John can
change his mind, and reopening the page resumes at the first unruled site.
"""

from __future__ import annotations
import argparse
import io
import json
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

try:
    from .mark_review import CLASSES, candidates, crop_word, load
except ImportError:
    # `.claude/launch.json` starts this by absolute path, not as a module, so
    # the relative import has no package to resolve against.  Put the project
    # root on the path and import the same names absolutely.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from bonitz_pipeline.mark_review import (CLASSES, candidates, crop_word,
                                             load)

ROOT = Path(__file__).resolve().parent.parent
RULINGS = ROOT / 'work/sweeps/mark-rulings.json'

PAGE = '''<!doctype html><meta charset="utf-8">
<title>Bonitz — which marks are on the page?</title>
<style>
body{font:16px/1.5 -apple-system,Segoe UI,sans-serif;margin:0;padding:20px;
     background:#faf9f7;color:#1a1a1a}
#head{display:flex;justify-content:space-between;align-items:baseline;
      margin:0 0 12px;font-size:14px;color:#555}
#where{font-weight:700;font-size:17px;color:#111}
#ink{background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px;
     overflow-x:auto;min-height:120px}
#ink img{display:block;max-width:100%;height:auto}
#ctx{font-family:"GFS Didot",Georgia,serif;font-size:15px;color:#555;
     background:#f1f0ed;padding:8px 10px;border-radius:5px;margin:10px 0}
#btns{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}
button{display:flex;flex-direction:column;align-items:center;gap:3px;
       min-width:120px;padding:18px 22px;border:2px solid #c4c4c4;
       border-radius:12px;background:#fff;cursor:pointer;font:inherit}
button:hover{border-color:#555;background:#f2f2f2}
.g{font-family:"GFS Didot",Georgia,serif;font-size:40px;line-height:1}
.n{font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em}
.keep{border-color:#9bb89b}
.skip{border-style:dashed}
#warn{color:#b00;font-size:14px} #guard{color:#c00;font-weight:700}
#done{font-size:20px;padding:40px;text-align:center}
kbd{background:#eee;border:1px solid #ccc;border-radius:4px;padding:1px 5px;
    font-size:12px}
@media(prefers-color-scheme:dark){
 body{background:#16181c;color:#e6e6e6} #ink{background:#1e2126;border-color:#333}
 #ctx{background:#23262c;color:#bbb} #where{color:#fff}
 button{background:#23262c;border-color:#444;color:#e6e6e6}
 button:hover{background:#2b2f36;border-color:#888}}
</style>
<div id="head"><span id="where">loading…</span><span id="count"></span></div>
<div id="ink"></div>
<div id="ctx"></div>
<div id="warn"></div>
<div id="btns"></div>
<p style="font-size:13px;color:#888">Keys <kbd>1</kbd>–<kbd>9</kbd> pick a
button, <kbd>←</kbd> goes back. Every click is saved the moment you make it.</p>
<script>
let S=[],i=0;
async function boot(){
 S=await (await fetch('/api/sites')).json();
 i=S.findIndex(s=>!s.ruled); if(i<0) i=0;
 show();
}
function show(){
 if(i>=S.length){document.body.innerHTML='<div id="done">All '+S.length+
   ' sites ruled. Nothing was applied — the rulings are in '+
   'work/sweeps/mark-rulings.json.</div>';return;}
 const s=S[i];
 where.textContent=s.col+' : line '+s.line;
 count.textContent=(i+1)+' of '+S.length+'  ·  '+S.filter(x=>x.ruled).length+' ruled';
 ink.innerHTML='<img src="/img/'+i+'.png" alt="">';
 ctx.textContent=s.context;
 warn.innerHTML=(s.guard?'<span id="guard">⛔ '+s.guard+'</span><br>':'')+
   (s.score<0.6?'⚠ line match '+s.score.toFixed(2)+
    ' — the crop may not be this line':'');
 btns.innerHTML='';
 s.cands.forEach((c,k)=>{
  const b=document.createElement('button');
  b.className=c[1]==='keep'?'keep':(c[0]==='?'?'skip':'');
  b.innerHTML='<span class="g">'+c[0]+'</span><span class="n">'+(k+1)+'. '+c[1]+'</span>';
  b.onclick=()=>pick(c[0],c[1]);
  btns.appendChild(b);
 });
}
async function pick(form,label){
 const s=S[i]; s.ruled=true;
 await fetch('/verdict',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:s.id,form:form,label:label})});
 i++; show();
}
addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'&&i>0){i--;show();return;}
 const k=parseInt(e.key,10);
 if(k>=1&&k<=9&&S[i]&&S[i].cands[k-1]){const c=S[i].cands[k-1];pick(c[0],c[1]);}
});
boot();
</script>'''


def _load_rulings() -> dict:
    if RULINGS.exists():
        return json.loads(RULINGS.read_text(encoding='utf-8'))
    return {'_': 'Rulings clicked by John on the review page. Recorded, not '
                 'applied — see work/sweeps/mark-verdicts.json for what was '
                 'acted on.', 'rulings': {}}


def build(classes: list[str], real: bool):
    """Sites, their crops and their candidate readings, ready to serve."""
    ruled = _load_rulings()['rulings']
    out, imgs = [], []
    for s in load():
        if classes and s.cls not in classes:
            continue
        if real and (s.guard or s.shape):
            continue
        if s.verdict:                     # already decided and acted on
            continue
        im, score = crop_word(s.col, s.line, s.corpus, scale=5.0)
        sid = f'{s.col}:{s.line}:{s.corpus}'
        buf = io.BytesIO()
        if im:
            im.save(buf, format='PNG')
        imgs.append(buf.getvalue())
        out.append({'id': sid, 'col': s.col, 'line': s.line,
                    'corpus': s.corpus, 'llama': s.llama, 'cls': s.cls,
                    'context': s.context, 'score': score,
                    'guard': s.guard or s.shape,
                    'cands': candidates(s.corpus, s.llama) + [['?', 'unsure']],
                    'ruled': sid in ruled})
    return out, imgs


def handler(sites, imgs):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, body: bytes, ctype: str):
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ('/', '/index.html'):
                self._send(PAGE.encode(), 'text/html; charset=utf-8')
            elif self.path == '/api/sites':
                self._send(json.dumps(sites, ensure_ascii=False).encode(),
                           'application/json; charset=utf-8')
            elif self.path.startswith('/img/'):
                try:
                    n = int(self.path[5:].split('.')[0])
                    self._send(imgs[n], 'image/png')
                except (ValueError, IndexError):
                    self.send_error(404)
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path != '/verdict':
                return self.send_error(404)
            n = int(self.headers.get('Content-Length', 0))
            try:
                d = json.loads(self.rfile.read(n))
            except Exception:
                return self.send_error(400)
            store = _load_rulings()
            store['rulings'][d['id']] = {
                'form': d.get('form', ''), 'label': d.get('label', ''),
                'at': datetime.now(timezone.utc).isoformat(timespec='seconds')}
            RULINGS.parent.mkdir(parents=True, exist_ok=True)
            RULINGS.write_text(json.dumps(store, ensure_ascii=False, indent=1),
                               encoding='utf-8')
            print(f'  {d["id"]}  ->  {d.get("form")}  ({d.get("label")})',
                  flush=True)
            self.send_response(204)
            self.end_headers()
    return H


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--class', dest='cls', action='append', choices=list(CLASSES))
    p.add_argument('--real', action='store_true', default=True)
    p.add_argument('--all', dest='real', action='store_false',
                   help='include the rows a guard already answers')
    p.add_argument('--port', type=int, default=8787)
    a = p.parse_args(argv)
    sites, imgs = build(a.cls or [], a.real)
    if not sites:
        sys.exit('nothing to rule')
    print(f'{len(sites)} sites  ->  http://127.0.0.1:{a.port}/', flush=True)
    HTTPServer(('127.0.0.1', a.port), handler(sites, imgs)).serve_forever()
    return 0


if __name__ == '__main__':
    sys.exit(main())
