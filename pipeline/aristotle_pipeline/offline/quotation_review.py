"""Self-contained quotation review page (plain HTML+JS, works from file://).

One row per matcher candidate: Aristotle span, source passage, pre-filled
citation + URL (click opens a new tab — the only window the curator needs
for the happy path). Buttons: Accept / Reject / Accept-with-corrected-URL.
The third reveals a URL field; that is the only typing. Per-row − / +
steppers trim lo/hi (click, no typing); a wrong author is a Reject.
Decisions persist in localStorage under the work id. Export downloads
pipeline/data/quotations/<work>.json in the shipped shape
[{column, lo, hi, cite, author, url}]. Corrected URLs must be absolute
https; invalid ones are marked and blocked from export.
"""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from urllib.parse import urlparse

from ..config import BUILD_DIR
from .quotation_matching import CANDIDATES_DIR

REVIEW_PATH = BUILD_DIR / "offline"
SHIPPED_KEYS = ("column", "lo", "hi", "cite", "author", "url")
STORE_PREFIX = "quotation-review:"


def decisions_storage_key(work: str) -> str:
    return f"{STORE_PREFIX}{work}"


def is_absolute_https(url: str | None) -> bool:
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    return parsed.scheme == "https" and bool(parsed.netloc)


def bound_span(orig_lo: int, orig_hi: int, lo: int, hi: int) -> tuple[int, int]:
    lo = min(max(int(lo), orig_lo), orig_hi)
    hi = min(max(int(hi), orig_lo), orig_hi)
    if lo > hi:
        lo, hi = hi, lo
    return lo, hi


def trimmed_record(candidate: dict, lo: int, hi: int, url: str | None = None) -> dict:
    """Bound lo/hi to the candidate span and emit a shipped-shape row.

    Author is unchanged (a wrong author is a Reject, not an edit). Cite
    stays the source citation; the Aristotle Bekker label is column+lo–hi
    and follows the trimmed span.
    """
    orig_lo, orig_hi = int(candidate["lo"]), int(candidate["hi"])
    lo, hi = bound_span(orig_lo, orig_hi, lo, hi)
    return {
        "column": candidate["column"],
        "lo": lo,
        "hi": hi,
        "cite": candidate["cite"],
        "author": candidate.get("source_author") or candidate.get("author"),
        "url": candidate.get("url") if url is None else url,
    }


def export_curation(
    candidates: list[dict], decisions: list[dict],
) -> tuple[list[dict], int]:
    """Map decisions to shipped rows. Returns (records, blocked_invalid_url).

    Each decision: {index, action: accept|reject|accept_corrected, url?,
    lo?, hi?}. Rejects are dropped. accept_corrected requires an absolute
    https url; invalid corrected URLs are omitted and counted. Optional
    lo/hi trim the Aristotle span within the candidate's original range.
    """
    out: list[dict] = []
    blocked = 0
    for decision in decisions:
        action = decision.get("action")
        if action == "reject":
            continue
        if action not in {"accept", "accept_corrected"}:
            raise ValueError(f"unknown decision action: {action!r}")
        try:
            row = candidates[int(decision["index"])]
        except (KeyError, IndexError, TypeError, ValueError) as err:
            raise ValueError(f"bad decision index: {decision!r}") from err
        url = decision.get("url") if action == "accept_corrected" else row.get("url")
        if action == "accept_corrected" and not url:
            raise ValueError("accept_corrected requires a url")
        if action == "accept_corrected" and not is_absolute_https(url):
            blocked += 1
            continue
        lo = decision["lo"] if "lo" in decision else row["lo"]
        hi = decision["hi"] if "hi" in decision else row["hi"]
        out.append(trimmed_record(row, lo, hi, url=url))
    return out, blocked


def curated_records(candidates: list[dict], decisions: list[dict]) -> list[dict]:
    records, _blocked = export_curation(candidates, decisions)
    return records


def curated_json(candidates: list[dict], decisions: list[dict]) -> str:
    return json.dumps(curated_records(candidates, decisions), ensure_ascii=False, indent=1) + "\n"


def render_html(work: str, candidates: list[dict]) -> str:
    payload = json.dumps(candidates, ensure_ascii=False).replace("</", "<\\/")
    rows = []
    for i, row in enumerate(candidates):
        cite = html.escape(str(row.get("cite") or ""))
        badge = '<span class="dk">DK-attested</span> ' if row.get("dk") else ""
        url = html.escape(str(row.get("url") or ""), quote=True)
        author = html.escape(str(row.get("source_author") or ""))
        loc = html.escape(str(row.get("source_loc") or ""))
        lo = int(row.get("lo") or 0)
        hi = int(row.get("hi") or 0)
        bekker = html.escape(f"{row.get('column', '')}{lo}–{hi}")
        score = html.escape(str(row.get("score", "")))
        ari = html.escape(str(row.get("aristotle_text") or ""))
        src = html.escape(str(row.get("source_text") or ""))
        work_id = html.escape(str(row.get("source_work") or ""))
        rows.append(
            f'<tr class="row" data-i="{i}" data-lo="{lo}" data-hi="{hi}">'
            f'<td class="rate">'
            f'<button type="button" class="acc" data-act="accept">Accept</button>'
            f'<button type="button" class="rej" data-act="reject">Reject</button>'
            f'<button type="button" class="fix" data-act="accept_corrected">Accept with corrected URL</button>'
            f'<label class="urlbox hidden">URL '
            f'<input type="url" value="{url}" spellcheck="false">'
            f'<span class="urlwarn hidden">Invalid URL — must be absolute https. This row will not export.</span>'
            f'</label>'
            f'</td>'
            f'<td class="cit"><b class="bek">{bekker}</b><br><span class="score">score {score}</span>'
            f'<div class="trim">lo '
            f'<button type="button" class="step" data-span="lo" data-dir="-1">−</button>'
            f'<span class="vlo">{lo}</span>'
            f'<button type="button" class="step" data-span="lo" data-dir="1">+</button>'
            f' hi '
            f'<button type="button" class="step" data-span="hi" data-dir="-1">−</button>'
            f'<span class="vhi">{hi}</span>'
            f'<button type="button" class="step" data-span="hi" data-dir="1">+</button>'
            f'</div></td>'
            f'<td class="ari">{ari}</td>'
            f'<td class="src"><div class="meta">{author} {work_id} {loc}</div>'
            f'{src}<div class="link">{badge}<a href="{url}" target="_blank" rel="noopener">{cite}</a></div></td>'
            f'</tr>'
        )
    body = "\n".join(rows) if rows else '<tr><td colspan="4">No candidates.</td></tr>'
    # JSON payload contains braces — do not str.format the whole page.
    return (
        _TEMPLATE
        .replace("__WORK_ESC__", html.escape(work))
        .replace("__STORE_KEY__", decisions_storage_key(work))
        .replace("__WORK__", work)
        .replace("__ROWS__", body)
        .replace("__PAYLOAD__", payload)
    )


def write_review(work: str, candidates: list[dict] | None = None) -> Path:
    if candidates is None:
        src = CANDIDATES_DIR / f"{work}.json"
        if not src.is_file():
            raise FileNotFoundError(src)
        candidates = json.loads(src.read_text(encoding="utf-8"))
    for row in candidates:
        # A DK attestation (stamped by dk_answer_key.annotate_candidates) is
        # the citation scholars want; it replaces the guess in display AND in
        # the exported cite.
        if row.get("dk"):
            row["cite"] = row["dk"]
    REVIEW_PATH.mkdir(parents=True, exist_ok=True)
    out = REVIEW_PATH / f"quotation_review_{work}.html"
    out.write_text(render_html(work, candidates), encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True, help="work slug (e.g. Meta)")
    parser.add_argument("--candidates", type=Path, help="override candidates JSON")
    args = parser.parse_args(argv)
    candidates = None
    if args.candidates:
        candidates = json.loads(args.candidates.read_text(encoding="utf-8"))
    path = write_review(args.work, candidates)
    print(path)


_TEMPLATE = """<!doctype html>
<meta charset=utf-8>
<title>Quotation review — __WORK_ESC__</title>
<style>
 body{font:15px/1.45 Georgia,serif;max-width:1280px;margin:1.5rem auto;padding:0 1rem;color:#222}
 h1{font-size:1.35rem;margin:0 0 .4rem}
 .lede{color:#555;font-size:.92rem;margin:0 0 1rem}
 .bar{position:sticky;top:0;z-index:5;background:#fff;padding:.5rem 0;border-bottom:1px solid #ddd;
   font:13px sans-serif;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
 .bar button{font:13px sans-serif;padding:.4rem .75rem;cursor:pointer}
 table{border-collapse:collapse;width:100%;margin:1rem 0 3rem}
 td,th{vertical-align:top;border-bottom:1px solid #eee;padding:.55rem .6rem;text-align:left}
 th{font:12px sans-serif;color:#666;border-bottom:1px solid #ccc}
 .cit{width:8.5rem;font:12px sans-serif} .score{color:#888}
 .ari,.src{width:34%} .src{background:#fcfbf7}
 .meta{font:11px sans-serif;color:#666;margin-bottom:.25rem}
 .link{margin-top:.4rem} .link a{font:13px sans-serif}
 .dk{font:11px sans-serif;color:#15803d;border:1px solid #15803d;border-radius:4px;padding:1px 5px;vertical-align:1px}
 .rate{width:11rem} .rate button{display:block;width:100%;margin:0 0 6px;font:14px sans-serif;
   padding:11px 0;cursor:pointer;border:1px solid #bbb;background:#f3f3f3;border-radius:6px}
 .rate .acc{color:#15803d} .rate .rej{color:#b91c1c} .rate .fix{color:#1d4ed8}
 .urlbox{display:block;margin-top:.4rem;font:12px sans-serif}
 .urlbox input{width:100%;box-sizing:border-box;margin-top:.2rem;padding:.35rem}
 .urlwarn{color:#b91c1c;margin-top:.3rem}
 .hidden{display:none}
 .trim{margin-top:.4rem;font:12px sans-serif;color:#444}
 .trim button{font:13px sans-serif;width:1.6rem;padding:.15rem 0;cursor:pointer}
 .trim .vlo,.trim .vhi{display:inline-block;min-width:1.4rem;text-align:center}
 tr.row.accept td{background:#9be88f} tr.row.reject td{background:#ff7a7a}
 tr.row.correct td{background:#93c5fd}
 tr.row.accept .acc,tr.row.reject .rej,tr.row.correct .fix{font-weight:bold;color:#fff}
 tr.row.accept .acc{background:#1f9d57;border-color:#147a41}
 tr.row.reject .rej{background:#d62828;border-color:#a81f1f}
 tr.row.correct .fix{background:#1d4ed8;border-color:#1e40af}
 tr.row.badurl .urlbox input{outline:2px solid #b91c1c;background:#fee2e2}
</style>
<h1>Quotation review — __WORK_ESC__</h1>
<p class=lede>Each row is a matcher guess, not a citation. Read the two passages.
The link is a <b>guess</b> — click it (new tab) to check the landing page.
Accept / Reject for the normal path. Use <b>Accept with corrected URL</b> only
when the landing page is wrong; that is the only typing. Trim the Aristotle
span with − / + (bounded to the candidate's lines). A wrong author is a Reject.</p>
<div class=bar>
 <span>rated <b id=cN>0</b>/<b id=tN>0</b>
   · <span style=color:#15803d>accept <b id=aN>0</b></span>
   · <span style=color:#b91c1c>reject <b id=rN>0</b></span>
   · <span style=color:#1d4ed8>corrected <b id=xN>0</b></span></span>
 <button type=button id=exp>Export quotations.json</button>
 <button type=button id=clr>Clear decisions</button>
 <span id=sum></span>
</div>
<noscript><p>JavaScript is required. Open this file in a browser.</p></noscript>
<table>
<tr><th>decision</th><th>Bekker</th><th>Aristotle</th><th>Source (link is a guess)</th></tr>
__ROWS__
</table>
<script type="application/json" id="cands">__PAYLOAD__</script>
<script>
const CANDS = JSON.parse(document.getElementById("cands").textContent);
const WORK = "__WORK__";
const STORE_KEY = "__STORE_KEY__";
const decisions = {};
const trims = {};
const rows = [...document.querySelectorAll("tr.row")];
document.getElementById("tN").textContent = String(rows.length);

function cls(action) {
  return action === "accept_corrected" ? "correct" : action;
}
function validHttps(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch (e) {
    return false;
  }
}
function origSpan(tr) {
  return {lo: Number(tr.getAttribute("data-lo")), hi: Number(tr.getAttribute("data-hi"))};
}
function getTrim(i, tr) {
  if (!trims[i]) {
    const o = origSpan(tr);
    trims[i] = {lo: o.lo, hi: o.hi};
  }
  return trims[i];
}
function bekkerLabel(c, lo, hi) {
  return String(c.column) + String(lo) + "–" + String(hi);
}
function paintTrim(tr, i) {
  const t = getTrim(i, tr);
  const c = CANDS[Number(i)];
  tr.querySelector(".vlo").textContent = String(t.lo);
  tr.querySelector(".vhi").textContent = String(t.hi);
  tr.querySelector(".bek").textContent = bekkerLabel(c, t.lo, t.hi);
}
function markUrl(tr, action, url) {
  const warn = tr.querySelector(".urlwarn");
  const bad = action === "accept_corrected" && !validHttps(url);
  tr.classList.toggle("badurl", bad);
  if (warn) warn.classList.toggle("hidden", !bad);
  return bad;
}
function counts() {
  let a=0,r=0,x=0;
  for (const d of Object.values(decisions)) {
    if (d.action === "accept") a++;
    else if (d.action === "reject") r++;
    else if (d.action === "accept_corrected") x++;
  }
  document.getElementById("cN").textContent = String(a+r+x);
  document.getElementById("aN").textContent = String(a);
  document.getElementById("rN").textContent = String(r);
  document.getElementById("xN").textContent = String(x);
}
function paint(tr, action) {
  tr.classList.remove("accept","reject","correct");
  if (action) tr.classList.add(cls(action));
  const box = tr.querySelector(".urlbox");
  if (action === "accept_corrected") box.classList.remove("hidden");
  else box.classList.add("hidden");
  const input = tr.querySelector("input");
  markUrl(tr, action, input ? input.value : "");
}
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({decisions, trims}));
  } catch (e) {}
}
function restore() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch (e) {
    return;
  }
  if (!saved) return;
  const savedDec = saved.decisions || saved;
  const savedTrim = saved.trims || {};
  for (const tr of rows) {
    const i = tr.getAttribute("data-i");
    if (savedTrim[i]) trims[i] = {
      lo: Number(savedTrim[i].lo),
      hi: Number(savedTrim[i].hi),
    };
    paintTrim(tr, i);
    const d = savedDec[i];
    if (!d || !d.action) continue;
    decisions[i] = {action: d.action, url: d.url || ""};
    const input = tr.querySelector("input");
    if (input && d.url) input.value = d.url;
    paint(tr, d.action);
  }
  counts();
}
function clearDecisions() {
  for (const key of Object.keys(decisions)) delete decisions[key];
  for (const key of Object.keys(trims)) delete trims[key];
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  for (const tr of rows) {
    const i = tr.getAttribute("data-i");
    const input = tr.querySelector("input");
    const c = CANDS[Number(i)];
    if (input) input.value = c.url || "";
    paint(tr, null);
    paintTrim(tr, i);
  }
  document.getElementById("sum").textContent = "";
  counts();
}
document.querySelector("table").addEventListener("click", (ev) => {
  const step = ev.target.closest("button[data-span]");
  if (step) {
    const tr = step.closest("tr.row");
    const i = tr.getAttribute("data-i");
    const which = step.getAttribute("data-span");
    const dir = Number(step.getAttribute("data-dir"));
    const o = origSpan(tr);
    const t = getTrim(i, tr);
    if (which === "lo") t.lo = Math.min(Math.max(t.lo + dir, o.lo), t.hi);
    else t.hi = Math.min(Math.max(t.hi + dir, t.lo), o.hi);
    paintTrim(tr, i);
    persist();
    return;
  }
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const tr = btn.closest("tr.row");
  const i = tr.getAttribute("data-i");
  const action = btn.getAttribute("data-act");
  const input = tr.querySelector("input");
  decisions[i] = {action, url: input.value};
  paint(tr, action);
  if (action === "accept_corrected") input.focus();
  counts();
  persist();
});
document.querySelector("table").addEventListener("input", (ev) => {
  const input = ev.target.closest("input");
  if (!input) return;
  const tr = input.closest("tr.row");
  const i = tr.getAttribute("data-i");
  if (decisions[i]) decisions[i].url = input.value;
  markUrl(tr, decisions[i] && decisions[i].action, input.value);
  persist();
});
document.getElementById("exp").addEventListener("click", () => {
  const out = [];
  let blocked = 0;
  for (const tr of rows) {
    const i = tr.getAttribute("data-i");
    const d = decisions[i];
    if (!d || d.action === "reject") continue;
    const c = CANDS[Number(i)];
    const t = getTrim(i, tr);
    const url = d.action === "accept_corrected" ? d.url : c.url;
    if (d.action === "accept_corrected" && !validHttps(url)) {
      blocked += 1;
      markUrl(tr, d.action, url);
      continue;
    }
    out.push({
      column: c.column,
      lo: t.lo,
      hi: t.hi,
      cite: c.cite,
      author: c.source_author || c.author,
      url: url,
    });
  }
  const sum = document.getElementById("sum");
  sum.textContent = "exported " + out.length + " · blocked " + blocked + " invalid URL";
  if (!out.length && blocked) return;
  const blob = new Blob([JSON.stringify(out, null, 1) + "\\n"], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "__WORK__.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById("clr").addEventListener("click", clearDecisions);
restore();
</script>
"""


if __name__ == "__main__":
    main()
