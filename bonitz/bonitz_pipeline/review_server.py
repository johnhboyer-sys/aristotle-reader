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
try:
    from . import john_rulings
except ImportError:
    from bonitz_pipeline import john_rulings

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
.whole{margin-top:10px;padding-top:8px;border-top:1px dashed #ccc;
       font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em}
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
 ink.innerHTML='<img src="/img/'+i+'.png" alt="">'+
   '<div class="whole">the whole printed line<br>'+
   '<img src="/line/'+i+'.png" alt=""></div>';
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
 // A ruling that cannot be SAVED must not advance: advancing would lose it
 // silently, and a silent loss is the one failure this whole apparatus
 // exists to prevent. John hit this when the server had been stopped under
 // an open page — the fetch rejected, the handler died, and the click
 // "did nothing" with no way to tell why.
 const s=S[i];
 try{
  const r=await fetch('/verdict',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:s.id,form:form,label:label})});
  if(!r.ok) throw new Error('HTTP '+r.status);
 }catch(err){
  warn.innerHTML='<span id="guard">⛔ NOT SAVED — the collector is not '+
   'running, so this click was lost. Restart it and click again; '+
   'nothing before this point is affected.</span>';
  return;
 }
 s.ruled=true; i++; show();
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


def build(classes: list[str], real: bool, redo: bool = False):
    """Sites, their crops and their candidate readings, ready to serve.

    `redo` serves ONLY the sites John marked unsure.  He explained what an
    unsure means — *"either because you didn't give me the correct option or
    because the crop wasn't making the case visible"* — so it is a defect
    report against this tool, and the answer is to fix the options and put the
    same site back in front of him, not to leave it in a backlog.
    """
    ruled = _load_rulings()['rulings']
    unsure = {k for k, v in ruled.items() if v.get('form') == '?'}
    out, imgs, lines = [], [], []
    for s in load():
        sid0 = f'{s.col}:{s.line}:{s.corpus}'
        if redo and sid0 not in unsure:
            continue
        if not redo:
            if classes and s.cls not in classes:
                continue
            if real and (s.guard or s.shape):
                continue
            if s.verdict:                 # already decided and acted on
                continue
        im, score = crop_word(s.col, s.line, s.corpus, scale=5.0)
        ln, _ = crop_word(s.col, s.line, s.corpus, scale=2.0, whole=True)
        sid = f'{s.col}:{s.line}:{s.corpus}'
        for target, pic in ((imgs, im), (lines, ln)):
            buf = io.BytesIO()
            if pic:
                pic.save(buf, format='PNG')
            target.append(buf.getvalue())
        out.append({'id': sid, 'col': s.col, 'line': s.line,
                    'corpus': s.corpus, 'llama': s.llama, 'cls': s.cls,
                    'context': s.context, 'score': score,
                    'guard': s.guard or s.shape,
                    'cands': candidates(s.corpus, s.llama) + [['?', 'unsure']],
                    'ruled': sid in ruled and ruled[sid].get('form') != '?'})
    return out, imgs, lines


def handler(sites, imgs, lines):
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
            elif self.path.startswith(('/img/', '/line/')):
                pool = imgs if self.path.startswith('/img/') else lines
                try:
                    n = int(self.path.rsplit('/', 1)[1].split('.')[0])
                    self._send(pool[n], 'image/png')
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
            # …and into the one ledger that holds every ruling he has made,
            # so it is current the moment he clicks rather than after a
            # migration someone has to remember to run.  John asked for this
            # directly: "can't we have a comprehensive john_rulings.py that
            # gets updated whenever i rule?"  An unsure is NOT a ruling — it
            # is a defect report against the buttons — so it is not recorded
            # as one.
            col, line, corpus = d['id'].rsplit(':', 2)
            if d.get('form') != '?':
                john_rulings.add(
                    'keep' if d['form'] == corpus else 'text',
                    col=col, line=int(line), form=d['form'],
                    ruled=d.get('label', ''), source='review server',
                    applied=False,
                    note='recorded on the click; applied separately and '
                         'verified against the suite')
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
    p.add_argument('--redo', action='store_true',
                   help='serve only the sites John marked unsure')
    p.add_argument('--port', type=int, default=8787)
    a = p.parse_args(argv)
    sites, imgs, lines = build(a.cls or [], a.real, a.redo)
    if not sites:
        sys.exit('nothing to rule')
    print(f'{len(sites)} sites  ->  http://127.0.0.1:{a.port}/', flush=True)
    HTTPServer(('127.0.0.1', a.port),
               handler(sites, imgs, lines)).serve_forever()
    return 0


if __name__ == '__main__':
    sys.exit(main())
