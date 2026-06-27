"""Interactive bead editor for the INTERPOLATION edition (local web app).

Reads the task units (build/align/interp_tasks/<WORK>/1-<ch>.json) and the
machine beads (interp_out/...), and lets you fix the alignment by nudging bead
boundaries. Human fixes are written as an OVERLAY to
build/align/interp_corrections/<WORK>/ — interp_out is never touched; render and
score prefer the overlay when present.

Every fix is a boundary move: a Greek (or English) unit slides into the adjacent
bead. Plus merge / split for the rare n:m cases. Suspect rows are pre-flagged:
non-1:1 cardinality, and (where the work has anchors) anchor-mismatched rows in
red (off-by>=2) / amber (off-by-1).

Usage (from pipeline/):
  uv run python tools/edit_interp.py --work Cat --trans edghill [--port 8000]
then open the printed http://localhost:PORT/ URL.

READ-ONLY w.r.t. machine output; only writes interp_corrections/.
"""

from __future__ import annotations

import argparse
import json
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import sentence_interp as si
from aristotle_pipeline.config import BUILD_DIR

ALIGN = BUILD_DIR / "align"
TASKS, OUT, COR = ALIGN / "interp_tasks", ALIGN / "interp_out", ALIGN / "interp_corrections"

WORK = "Cat"
TRANS = "edghill"
_GOLD = None   # {chap: [(sg, se)]}, {chap: n_greek_units}


# --------------------------------------------------------------------------- data
def chapters():
    return sorted(int(p.stem.split("-")[1]) for p in (TASKS / WORK).glob("1-*.json"))


def units(chap):
    t = json.loads((TASKS / WORK / f"1-{chap}.json").read_text("utf-8"))
    return t["greek"], t["english"]


def load_beads(chap):
    cp = COR / WORK / f"1-{chap}.json"
    if cp.exists():
        d = json.loads(cp.read_text("utf-8"))
        return d["beads"], d.get("reviewed", []), "human"
    op = OUT / WORK / f"1-{chap}.json"
    if op.exists():
        return json.loads(op.read_text("utf-8")).get("beads", []), [], "machine"
    return [], [], "none"


def _build_gold(examples):
    """Anchor gold {chap:[(sg,se)]} + greek-unit counts {chap:n}, at the given
    Greek grain (English is fine-grain regardless). sg indexes the greek units of
    that grain, so callers can pick the grain whose count matches the task file."""
    from sentence_spike import segment_greek
    from aristotle_pipeline.align.glossing import chapter_lines
    l2c = si.line_to_chapter()
    man = si.Manifest.for_work(WORK).data["english"]
    slot_of = {man[s]["id"]: s for s in ("primary", "secondary", "third") if man.get(s)}
    slot = slot_of.get(TRANS)
    chinfo = {}                          # chap -> (line2sent, n_greek)
    for ch in chapter_lines():
        gs, _ls, l2s = segment_greek(ch.lines, {}, soft=True, examples=examples)
        chinfo[ch.chapter] = (l2s, len(gs))
    g, counts = {}, {c: chinfo[c][1] for c in chinfo}
    if slot:
        _id, prose, anchors = si.load_translation(WORK, slot)
        esent = {c: si.eng_sentences(prose[(1, c)], fine=True) for c in chinfo if (1, c) in prose}
        for a in anchors:
            chap = l2c.get(a["bekker"])
            if chap is None or (1, chap) not in prose:
                continue
            sg = chinfo[chap][0].get(a["bekker"])
            off = prose[(1, chap)].find(a["at"])
            if sg is None or off < 0:
                continue
            se = si.eng_sent_index(esent[chap][1], off)
            g.setdefault(chap, []).append((sg, se))
    return g, counts


def gold():
    """Lazy: gold at BOTH Greek grains (soft / soft+examples), so anchor flags
    work whatever grain a chapter's tasks were emitted at."""
    global _GOLD
    if _GOLD is None:
        try:
            _GOLD = {False: _build_gold(False), True: _build_gold(True)}
        except Exception as e:           # best-effort; never block editing
            print(f"[gold] anchor flags unavailable: {e}")
            _GOLD = {False: ({}, {}), True: ({}, {})}
    return _GOLD


def anchors_for(chap, n_greek):
    """Pick the grain whose greek-unit count matches the chapter's task file."""
    g = gold()
    for ex in (True, False):
        golds, counts = g[ex]
        if counts.get(chap) == n_greek:
            return golds.get(chap, [])
    return []                            # no grain matches -> no reliable anchors


def flag_counts(chap):
    beads, reviewed, _ = load_beads(chap)
    rev = set(reviewed)
    ng, _ne = units(chap)
    anc = anchors_for(chap, len(ng))
    g2b = {}
    for bi, b in enumerate(beads):
        for gi in b["g"]:
            g2b[gi] = bi

    def is_rev(bi):
        g = beads[bi]["g"]
        return len(g) > 0 and all(x in rev for x in g)

    red = amber = 0
    for sg, se in anc:
        bi = g2b.get(sg)
        if bi is None or is_rev(bi):     # reviewed-ok rows drop out of the tally
            continue
        es = beads[bi]["e"]
        d = min((abs(e - se) for e in es), default=99)
        if d >= 2:
            red += 1
        elif d == 1:
            amber += 1
    card = sum(1 for bi, b in enumerate(beads)
               if (len(b["g"]) != 1 or len(b["e"]) != 1) and not is_rev(bi))
    nrev = sum(1 for bi in range(len(beads)) if is_rev(bi))
    return dict(nbeads=len(beads), red=red, amber=amber, card=card, reviewed=nrev)


# ----------------------------------------------------------------------- validate
def validate(beads, ng, ne):
    gseq, eseq = [], []
    for b in beads:
        if not b["g"] and not b["e"]:
            return "a bead has neither Greek nor English"
        gseq += b["g"]
        eseq += b["e"]
    if gseq != list(range(ng)):
        return f"Greek indices not a clean 0..{ng-1} cover (got {gseq[:6]}…)"
    if eseq != list(range(ne)):
        return f"English indices not a clean 0..{ne-1} cover (got {eseq[:6]}…)"
    return None


def save(chap, beads, reviewed):
    ng, ne = (len(x) for x in units(chap))
    err = validate(beads, ng, ne)
    if err:
        return err
    d = COR / WORK
    d.mkdir(parents=True, exist_ok=True)
    (d / f"1-{chap}.json").write_text(
        json.dumps({"beads": beads, "reviewed": sorted(set(reviewed)),
                    "source": "human", "base": "interp_out"},
                   ensure_ascii=False, indent=1), "utf-8")
    return None


# --------------------------------------------------------------------------- HTTP
class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        b = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *a):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/":
            return self._send(200, PAGE.replace("__WORK__", WORK).replace("__TRANS__", TRANS),
                              "text/html; charset=utf-8")
        if u.path == "/api/init":
            chs = [dict(n=c, **flag_counts(c)) for c in chapters()]
            return self._send(200, json.dumps(dict(work=WORK, trans=TRANS, chapters=chs)))
        if u.path == "/api/chapter":
            c = int(parse_qs(u.query)["n"][0])
            g, e = units(c)
            beads, reviewed, src = load_beads(c)
            return self._send(200, json.dumps(dict(
                n=c, greek=g, english=e, beads=beads, source=src,
                reviewed=reviewed, anchors=anchors_for(c, len(g)))))
        return self._send(404, "{}")

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/api/chapter":
            c = int(parse_qs(u.query)["n"][0])
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}")
            err = save(c, data.get("beads", []), data.get("reviewed", []))
            if err:
                return self._send(400, json.dumps(dict(ok=False, error=err)))
            return self._send(200, json.dumps(dict(ok=True, flags=flag_counts(c))))
        return self._send(404, "{}")


PAGE = r"""<!doctype html><meta charset=utf-8><title>interp editor — __WORK__/__TRANS__</title>
<style>
 body{font:15px/1.5 Georgia,serif;margin:0;color:#222;display:flex;height:100vh}
 #side{width:150px;border-right:1px solid #ddd;overflow:auto;padding:.4rem;background:#fafaf7}
 #side h2{font-size:.8rem;color:#888;margin:.4rem .2rem}
 .ch{padding:.3rem .4rem;cursor:pointer;border-radius:4px;font-size:.85rem;display:flex;justify-content:space-between}
 .ch:hover{background:#eee}.ch.sel{background:#e3e0d4;font-weight:bold}
 .ch .b{color:#b22;font-size:.72rem}.ch .a{color:#c80;font-size:.72rem}
 #main{flex:1;overflow:auto;padding:.6rem 1rem}
 #bar{position:sticky;top:0;background:#fff;padding:.3rem 0;border-bottom:1px solid #eee;z-index:2}
 #bar button{font:inherit;font-size:.8rem;margin-right:.25rem;padding:.15rem .5rem;cursor:pointer}
 #status{margin-left:.5rem;font-size:.82rem}
 .leg{font-size:.74rem;color:#777;margin-left:.5rem}
 table{border-collapse:collapse;width:100%;margin-top:.4rem}
 tr{border-bottom:1px solid #eee}tr.sel{outline:2px solid #38c;outline-offset:-2px}
 td{vertical-align:top;padding:.4rem .6rem}
 .g{width:47%;font-family:'GFS Didot',Georgia,serif;color:#1a1a2e}
 .e{width:45%;color:#333}.n{width:8%;color:#aaa;font-size:.74rem;text-align:right;white-space:nowrap}
 tr.red{background:#fdecec}tr.amber{background:#fff6e5}tr.card .n{color:#b22;font-weight:bold}
 tr.ok{background:#eef7ee}tr.ok .g{color:#8a9}tr.ok .e{color:#9aa}tr.ok .n{color:#7a9;font-weight:normal}
 .u{display:block;padding:1px 0;border-left:2px solid transparent;padding-left:5px}
 .u.first{border-left-color:#bbb}
</style>
<div id=side><h2>__WORK__ / __TRANS__</h2><div id=chs></div></div>
<div id=main>
 <div id=bar>
  <button data-op=gd>G&darr;</button><button data-op=gu>G&uarr;</button>
  <button data-op=ed>E&darr;</button><button data-op=eu>E&uarr;</button>
  <button data-op=merge>merge&darr;</button><button data-op=split>split</button>
  <button id=ok>✓ ok (o)</button>
  <button id=undo>undo</button><button id=save>save (⌘S)</button>
  <span id=status></span><span id=rem class=leg></span>
  <span class=leg>keys: j/k row · g/G greek · e/E english · m merge · s split · o ok · u undo</span>
 </div>
 <table><tbody id=rows></tbody></table>
</div>
<script>
let CH=null, beads=[], greek=[], english=[], anchors=[], reviewed=new Set(), sel=0, hist=[], dirty=false;

async function init(){
 const d=await (await fetch('/api/init')).json();
 const c=document.getElementById('chs');
 c.innerHTML='';
 d.chapters.forEach(ch=>{
  const el=document.createElement('div'); el.className='ch'; el.dataset.n=ch.n;
  el.innerHTML=`<span>ch ${ch.n}</span><span>`+
    (ch.red?`<span class=b>${ch.red}</span> `:'')+(ch.amber?`<span class=a>${ch.amber}</span>`:'')+`</span>`;
  el.onclick=()=>load(ch.n); c.appendChild(el);
 });
 load(d.chapters[0].n);
}
async function load(n){
 if(dirty && !confirm('Discard unsaved changes?')) return;
 const d=await (await fetch('/api/chapter?n='+n)).json();
 CH=n; greek=d.greek; english=d.english; anchors=d.anchors||[]; reviewed=new Set(d.reviewed||[]);
 beads=d.beads.map(b=>({g:b.g.slice(),e:b.e.slice()}));
 sel=0; hist=[]; dirty=false;
 document.querySelectorAll('.ch').forEach(e=>e.classList.toggle('sel',+e.dataset.n===n));
 render(); status(d.source==='human'?'loaded (your corrected version)':'loaded (machine)');
}
function gtext(i){return (greek.find(x=>x.i===i)||{}).text||'';}
function etext(j){return (english.find(x=>x.j===j)||{}).text||'';}
function isRev(b){return b.g.length>0 && b.g.every(g=>reviewed.has(g));}
function computeFlags(){
 const g2b={}; beads.forEach((b,bi)=>b.g.forEach(g=>g2b[g]=bi));
 const f=beads.map(b=>({card:b.g.length!==1||b.e.length!==1,level:null,ok:isRev(b)}));
 anchors.forEach(([sg,se])=>{const bi=g2b[sg]; if(bi==null)return;
  const es=beads[bi].e; const d=es.length?Math.min(...es.map(e=>Math.abs(e-se))):99;
  if(d>=2)f[bi].level='red'; else if(d===1&&f[bi].level!=='red')f[bi].level='amber';});
 return f;
}
function remaining(f){let r=0,a=0;f.forEach(x=>{if(x.ok)return;if(x.level==='red')r++;else if(x.level==='amber')a++;});return r+' red · '+a+' amber left';}
function render(){
 const f=computeFlags(); const tb=document.getElementById('rows'); tb.innerHTML='';
 beads.forEach((b,bi)=>{
  const tr=document.createElement('tr');
  const cls=f[bi].ok?'ok':((f[bi].level||'')+(f[bi].card?' card':''));
  tr.className=cls+(bi===sel?' sel':'');
  const G=b.g.map((g,k)=>`<span class="u${k===0?' first':''}">${esc(gtext(g))}</span>`).join('')||'<i style=color:#bbb>—</i>';
  const E=b.e.map((e,k)=>`<span class="u${k===0?' first':''}">${esc(etext(e))}</span>`).join('')||'<i style=color:#bbb>—</i>';
  tr.innerHTML=`<td class=g>${G}</td><td class=e>${E}</td><td class=n>${f[bi].ok?'✓ ':''}${b.g.length}:${b.e.length}</td>`;
  tr.onclick=()=>{sel=bi;render();}; tb.appendChild(tr);
 });
 const rem=document.getElementById('rem'); if(rem)rem.textContent=remaining(f);
 const r=tb.children[sel]; if(r)r.scrollIntoView({block:'nearest'});
}
function esc(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function push(){hist.push(JSON.stringify(beads)); if(hist.length>50)hist.shift(); dirty=true;}
function clean(){beads=beads.filter(b=>b.g.length||b.e.length); if(sel>=beads.length)sel=beads.length-1;}
function op(o){
 const k=sel;
 if((o==='gd'||o==='ed'||o==='merge')&&k>=beads.length-1)return;
 push();
 if(o==='gd'&&beads[k].g.length)beads[k+1].g.unshift(beads[k].g.pop());
 else if(o==='gu'&&beads[k+1]&&beads[k+1].g.length)beads[k].g.push(beads[k+1].g.shift());
 else if(o==='ed'&&beads[k].e.length)beads[k+1].e.unshift(beads[k].e.pop());
 else if(o==='eu'&&beads[k+1]&&beads[k+1].e.length)beads[k].e.push(beads[k+1].e.shift());
 else if(o==='merge'){beads[k].g=beads[k].g.concat(beads[k+1].g);beads[k].e=beads[k].e.concat(beads[k+1].e);beads.splice(k+1,1);}
 else if(o==='split'){const b=beads[k];if(b.g.length+b.e.length<2){hist.pop();return;}
  const gi=Math.ceil(b.g.length/2),ei=Math.ceil(b.e.length/2);
  beads.splice(k,1,{g:b.g.slice(0,gi),e:b.e.slice(0,ei)},{g:b.g.slice(gi),e:b.e.slice(ei)});}
 else {hist.pop();return;}
 clean(); render(); status('edited (unsaved)');
}
function undo(){if(!hist.length)return; beads=JSON.parse(hist.pop()); clean(); render(); status('undid');}
async function doSave(){
 const r=await fetch('/api/chapter?n='+CH,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({beads,reviewed:[...reviewed]})});
 const d=await r.json();
 if(d.ok){dirty=false; status('saved ✓'); const c=document.querySelector('.ch[data-n="'+CH+'"]');
  if(c)c.querySelector('span:last-child').innerHTML=(d.flags.red?`<span class=b>${d.flags.red}</span> `:'')+(d.flags.amber?`<span class=a>${d.flags.amber}</span>`:'');}
 else status('NOT saved — '+d.error);
}
function status(s){document.getElementById('status').textContent=s;}
function toggleOk(){const b=beads[sel]; if(!b||!b.g.length)return;
 const all=b.g.every(g=>reviewed.has(g));
 b.g.forEach(g=>all?reviewed.delete(g):reviewed.add(g));
 dirty=true; render(); status(all?'unmarked (save to keep)':'marked ok (save to keep)');}
document.querySelectorAll('#bar button[data-op]').forEach(b=>b.onclick=()=>op(b.dataset.op));
document.getElementById('ok').onclick=toggleOk;
document.getElementById('save').onclick=doSave;
document.getElementById('undo').onclick=undo;
addEventListener('keydown',ev=>{
 if((ev.metaKey||ev.ctrlKey)&&ev.key==='s'){ev.preventDefault();return doSave();}
 if(ev.metaKey||ev.ctrlKey)return;
 const m={'j':()=>{sel=Math.min(sel+1,beads.length-1);render();},
  'k':()=>{sel=Math.max(sel-1,0);render();},'ArrowDown':()=>{sel=Math.min(sel+1,beads.length-1);render();},
  'ArrowUp':()=>{sel=Math.max(sel-1,0);render();},
  'g':()=>op('gd'),'G':()=>op('gu'),'e':()=>op('ed'),'E':()=>op('eu'),
  'm':()=>op('merge'),'s':()=>op('split'),'o':()=>toggleOk(),'u':()=>undo()};
 if(m[ev.key]){ev.preventDefault();m[ev.key]();}
});
init();
</script>"""


def main():
    global WORK, TRANS
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="Cat")
    ap.add_argument("--trans", default="edghill")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    WORK, TRANS = a.work, a.trans
    if not (TASKS / WORK).exists():
        sys.exit(f"no interp_tasks for {WORK} at {TASKS/WORK} — run emit_align_tasks first")
    url = f"http://localhost:{a.port}/"
    print(f"interp editor — {WORK}/{TRANS}  →  {url}")
    print("corrections overlay: build/align/interp_corrections/  (interp_out untouched)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    HTTPServer(("127.0.0.1", a.port), H).serve_forever()


if __name__ == "__main__":
    main()
