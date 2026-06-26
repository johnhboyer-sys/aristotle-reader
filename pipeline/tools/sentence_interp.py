"""Sentence-interpolation aligner — iteration harness on Categories.

READ-ONLY. Writes nothing under build/dist, sources/, or the app; optional scratch
JSON under build/align/_sentence_interp/. The aligner/eval make no per-run model
calls (the full-sentence glosses are a one-time asset under build/align/sent_glosses/).

Goal: improve Greek-sentence ↔ English-sentence bead pairing for a parallel edition,
measured against REAL hand-curated gold (the anchors.yaml phrases), via an ABLATION
that isolates which knob helps. Categories (Cat) is the testbed: 15 short chapters,
three hand-anchored translations (Edghill 236 / Taylor 236 / Ackrill 93 anchors).

Improvements vs the spike's bead aligner (lexical + tick-window gloss + gloss-length):
  - matcher:  lexical TF-IDF  ->  semantic embeddings (mpnet "quality")
  - gloss:    sparse tick-window  ->  one full gloss per Greek sentence
  - length:   gloss-len vs eng-len  ->  Gale-Church (Greek chars vs English chars)
  - names:    +bonus when a gloss proper-name appears in the English bead

Gold: for each anchor {bekker, phrase}, bekker -> Greek line -> Greek sentence S_g;
phrase.find in the translation -> English sentence S_e. Pair (S_g, S_e). Metric =
% of gold anchors whose aligner bead for S_g covers S_e ("bead-pairing accuracy").

Usage (from pipeline/, after `uv sync --extra align` + stage1 --work Cat):
  uv run python tools/sentence_interp.py --work Cat --trans edghill,taylor,ackrill --ablate
"""

from __future__ import annotations

import argparse
import bisect
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import yaml

from aristotle_pipeline.align import similarity
from aristotle_pipeline.align.aligner import _PROPER, split_sentences
from aristotle_pipeline.align.glossing import chapter_lines
from aristotle_pipeline.config import SOURCES_DIR, BUILD_DIR, Manifest
from aristotle_pipeline.stage1_ross import parse_translation

# reuse the spike's Greek sentence segmentation (geometry only)
from sentence_spike import GSent, segment_greek, _line_n  # noqa: E402

DEL = 0.25          # insertion/deletion penalty in the bead DP
OPS = [(1, 1), (1, 2), (2, 1), (2, 2), (1, 0), (0, 1)]


# ---------------------------------------------------------------------------
# translations + anchor gold
# ---------------------------------------------------------------------------
def load_translation(work_id: str, slot: str):
    """(vid, prose{(1,ch):text}, anchors[{bekker,at}]) for one english slot."""
    cfg = Manifest.for_work(work_id).data["english"][slot]
    marker = cfg.get("chapter_marker") or cfg.get("marker", "number")
    prose = parse_translation(SOURCES_DIR / cfg["dir"], cfg["books"], marker)
    apath = SOURCES_DIR / cfg["dir"] / "anchors.yaml"
    anchors = yaml.safe_load(apath.read_text(encoding="utf-8")) if apath.exists() else []
    return cfg["id"], prose, anchors


# Edition English split: break on ; : · too (the English ';' is the counterpart of
# the Greek ano teleia '·'). Symmetric with soft Greek segmentation — without it the
# English unit straddles a Greek clause boundary and beads over-merge.
_EDITION_SPLIT = re.compile(r'[^.!?;:·]*[.!?;:·]+(?:["\')\]]+)?\s*')


def eng_sentences(prose: str, fine: bool = False):
    if fine:
        sents, pos = [], 0
        for m in _EDITION_SPLIT.finditer(prose):
            if m.group().strip():
                sents.append((m.start(), m.group().strip()))
        sents = sents or [(0, prose)]
    else:
        sents = split_sentences(prose)
    starts = [s for s, _ in sents]
    return sents, starts


def eng_sent_index(starts: list[int], off: int) -> int:
    """Index of the English sentence whose span contains char offset `off`."""
    return max(0, bisect.bisect_right(starts, off) - 1)


# ---------------------------------------------------------------------------
# Greek side: segment once (geometry), attach fingerprints per config
# ---------------------------------------------------------------------------
def greek_chapters(soft: bool = False):
    """{chapter -> (lines, gsents, line2sent, cum_before)} for the current work.
    soft=True splits Greek on the ano teleia (·) too — the right grain for an
    EDITION whose English is finely split (opposite of the Bekker default)."""
    out = {}
    for ch in chapter_lines():
        gsents, line_start, line2sent = segment_greek(ch.lines, {}, soft=soft)
        cum = {}
        w = 0
        for ln in ch.lines:
            cum[ln.citation] = w
            w += len(ln.text.split())
        out[ch.chapter] = (ch.lines, gsents, line2sent, cum)
    return out


def line_to_chapter():
    m = {}
    for ch in chapter_lines():
        for ln in ch.lines:
            m[ln.citation] = ch.chapter
    return m


def tick_gloss(work_id: str, chap: int) -> dict:
    p = BUILD_DIR / "align" / "glosses" / work_id / f"1-{chap}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def sent_gloss(work_id: str, chap: int) -> dict:
    p = BUILD_DIR / "align" / "sent_glosses" / work_id / f"1-{chap}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def fingerprints(gsents: list[GSent], work_id: str, chap: int, mode: str) -> list[str]:
    """One English fingerprint per Greek sentence. mode='tick' concatenates the
    sparse per-line tick glosses; mode='sentence' uses one full gloss per sentence."""
    if mode == "sentence":
        g = sent_gloss(work_id, chap)
        return [g.get(str(i), "").strip() for i in range(len(gsents))]
    g = tick_gloss(work_id, chap)
    return [" ".join(v for c in s.lines if (v := g.get(c, "").strip())) for s in gsents]


# ---------------------------------------------------------------------------
# configurable bead aligner
# ---------------------------------------------------------------------------
def _greek_len(gsents, i, a):
    return sum(len(gsents[i + k].text) for k in range(a)) or 1


def make_scorer(gsents, esents, fps, cfg, c_ratio):
    """Returns score(i,a,j,b). The similarity matrix S[g][e] (one fingerprint vs
    one English sentence) is encoded ONCE here; a multi-sentence bead's similarity
    is the mean of its sub-block (exact for the dominant 1:1 case)."""
    eng_txt = [t for _, t in esents]
    S = similarity.cos_matrix(fps, eng_txt, cfg["matcher"])   # n_g x n_e, encoded once

    def score(i, a, j, b):
        if a == 0 or b == 0:
            return -DEL
        cells = [S[i + p][j + q] for p in range(a) for q in range(b)]
        sim = sum(cells) / len(cells) if cells else 0.0
        gl = " ".join(fps[i + k] for k in range(a)).strip()
        en = " ".join(eng_txt[j + k] for k in range(b)).strip()
        if cfg["length"] == "gale":           # Greek chars predict English chars
            grk = _greek_len(gsents, i, a)
            exp = c_ratio * grk
            lp = 1.0 - min(abs(len(en) - exp) / max(exp, 1), 1.0)
        else:                                  # gloss-len vs english-len (spike default)
            lp = 1.0 - abs(len(gl) - len(en)) / max(len(gl) + len(en), 1)
        bonus = 0.0
        if cfg.get("names") and gl:
            names = set(_PROPER.findall(gl))
            if names and any(n in en for n in names):
                bonus = 0.15
        return cfg["beta"] * sim + cfg["alpha"] * lp + bonus
    return score


def bead_align(n_g, n_e, score) -> list[tuple]:
    from functools import lru_cache

    @lru_cache(maxsize=None)
    def f(i, j):
        if i == n_g and j == n_e:
            return 0.0, None
        best, bestop = -1e9, None
        for a, b in OPS:
            if i + a > n_g or j + b > n_e:
                continue
            if (i == n_g and a) or (j == n_e and b):
                continue
            sc = score(i, a, j, b) + f(i + a, j + b)[0]
            if sc > best:
                best, bestop = sc, (a, b)
        if bestop is None:
            if i < n_g:
                return score(i, 1, j, 0) + f(i + 1, j)[0], (1, 0)
            return score(i, 0, j, 1) + f(i, j + 1)[0], (0, 1)
        return best, bestop

    beads, i, j = [], 0, 0
    while i < n_g or j < n_e:
        _s, op = f(i, j)
        a, b = op
        beads.append((i, a, j, b))
        i, j = i + a, j + b
    return beads


def gsent_to_engspan(beads, n_g):
    """gsent index -> set of english sentence indices in its bead (empty if deleted)."""
    out = {}
    for (i, a, j, b) in beads:
        eng = set(range(j, j + b))
        for k in range(a):
            out[i + k] = eng
    return out


def llm_beads(work_id: str, chap: int):
    """gsent index -> set of english indices, from an LLM aligner's interp_out file
    ({"beads":[{"g":[i...],"e":[j...]}]}). Uses the SAME soft-Greek/fine-English grain
    the task emitter wrote, so indices match the anchor gold. {} if no file."""
    p = BUILD_DIR / "align" / "interp_out" / work_id / f"1-{chap}.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text(encoding="utf-8"))
    out = {}
    for bead in data.get("beads", []):
        eng = set(bead.get("e", []))
        for gi in bead.get("g", []):
            out[gi] = eng
    return out


# ---------------------------------------------------------------------------
# eval driver
# ---------------------------------------------------------------------------
CONFIGS = [
    ("baseline (lexical+tick+gloss-len)", dict(matcher="lexical", gloss="tick", length="gloss", names=False, alpha=0.3, beta=1.0)),
    ("+embeddings",                       dict(matcher="quality", gloss="tick", length="gloss", names=False, alpha=0.3, beta=1.0)),
    ("+full-sentence gloss",              dict(matcher="quality", gloss="sentence", length="gloss", names=False, alpha=0.3, beta=1.0)),
    ("+gale-church length",               dict(matcher="quality", gloss="sentence", length="gale", names=False, alpha=0.3, beta=1.0)),
    ("+name anchors (all)",               dict(matcher="quality", gloss="sentence", length="gale", names=True, alpha=0.3, beta=1.0)),
]

# LLM bead aligner (stage 2): beads come from interp_out/ files, not the DP. Same
# soft-Greek/fine-English grain as the DP edition run, so the rows are comparable.
LLM_CONFIGS = [
    ("DP (soft, lexical+sentence+gale)", dict(matcher="lexical", gloss="sentence", length="gale", names=False, alpha=0.3, beta=1.0)),
    ("LLM beads (per-chapter aligner)",  dict(llm=True)),
]


def run(work_id: str, trans: list[str], configs, dump: bool, soft: bool = False):
    gch = greek_chapters(soft)
    l2c = line_to_chapter()
    slot_of = {}
    man = Manifest.for_work(work_id).data["english"]
    for slot in ("primary", "secondary", "third"):
        if man.get(slot):
            slot_of[man[slot]["id"]] = slot

    # build per-translation gold once: list of (chap, S_g, S_e)
    tdata = {}
    for vid in trans:
        slot = slot_of.get(vid)
        if not slot:
            continue
        _id, prose, anchors = load_translation(work_id, slot)
        esent = {ch: eng_sentences(prose[(1, ch)], fine=soft) for ch in gch if (1, ch) in prose}
        gold = []
        for a in anchors:
            bek, phr = a["bekker"], a["at"]
            chap = l2c.get(bek)
            if chap is None or (1, chap) not in prose:
                continue
            _lines, _gs, line2sent, _cum = gch[chap]
            sg = line2sent.get(bek)
            off = prose[(1, chap)].find(phr)
            if sg is None or off < 0:
                continue
            _sents, starts = esent[chap]
            se = eng_sent_index(starts, off)
            gold.append((chap, sg, se))
        # corpus Greek->English char ratio for Gale-Church
        tot_e = sum(len(prose[(1, ch)]) for ch in gch if (1, ch) in prose)
        tot_g = sum(len(ln.text) for ch in gch for ln in gch[ch][0])
        tdata[vid] = (prose, esent, gold, tot_e / max(tot_g, 1))

    pol = "soft(·)" if soft else "hard(.;)"
    print(f"\n=== sentence-interp ablation — {work_id} | seg={pol} | {', '.join(trans)} ===")
    print(f"  cells = exact% / off-by-≤1% (anchor in bead's sentence / within 1 sentence)")
    print(f"{'config':34s} " + " ".join(f"{v:>11}" for v in trans))
    results = {}
    for label, cfg in configs:
        cells = []
        for vid in trans:
            if vid not in tdata:
                cells.append("   -   ")
                continue
            prose, esent, gold, c_ratio = tdata[vid]
            ok = ok1 = tot = 0
            for chap in sorted({g[0] for g in gold}):
                _lines, gsents, _l2s, _cum = gch[chap]
                sents, starts = esent[chap]
                if cfg.get("llm"):
                    g2e = llm_beads(work_id, chap)
                    if g2e is None:        # no LLM file for this chapter -> skip its anchors
                        continue
                else:
                    fps = fingerprints(gsents, work_id, chap, cfg["gloss"])
                    score = make_scorer(gsents, sents, fps, cfg, c_ratio)
                    beads = bead_align(len(gsents), len(sents), score)
                    g2e = gsent_to_engspan(beads, len(gsents))
                for (gc, sg, se) in gold:
                    if gc != chap:
                        continue
                    tot += 1
                    d = min((abs(e - se) for e in g2e.get(sg, set())), default=99)
                    ok += d == 0
                    ok1 += d <= 1
            exact = 100 * ok / tot if tot else 0
            off1 = 100 * ok1 / tot if tot else 0
            cells.append(f"{exact:4.1f}/{off1:4.1f}")
            results.setdefault(label, {})[vid] = {"exact": round(exact, 1), "off1": round(off1, 1), "n": tot}
        print(f"{label:34s} " + " ".join(f"{c:>11}" for c in cells))

    if dump:
        out = BUILD_DIR / "align" / "_sentence_interp"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{work_id}_ablation.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n[dump] {out / f'{work_id}_ablation.json'}")
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="Cat")
    ap.add_argument("--trans", default="edghill,taylor,ackrill")
    ap.add_argument("--ablate", action="store_true")
    ap.add_argument("--llm", action="store_true", help="compare DP vs LLM beads (forces soft grain)")
    ap.add_argument("--soft", action="store_true", help="split Greek on · too (edition grain)")
    ap.add_argument("--dump", action="store_true")
    a = ap.parse_args()
    if a.llm:
        run(a.work, a.trans.split(","), LLM_CONFIGS, a.dump, soft=True)
    else:
        cfgs = CONFIGS if a.ablate else CONFIGS[:1]
        run(a.work, a.trans.split(","), cfgs, a.dump, a.soft)
