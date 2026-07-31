"""Score UGARIT's Ancient-Greek word aligner against a work's Bekker anchors.

`UGARIT/grc-alignment` (Yousef et al., CC-BY-4.0) is an XLM-RoBERTa model
fine-tuned for grc↔eng word alignment. This tool asks whether it can place the
Bekker line-ticks that `sources/<dir>/anchors.yaml` currently gets from the
Sonnet-gloss + Opus-verify pipeline, by predicting each tick's offset in the
English prose and scoring against the anchors file.

Method — monotone chunked alignment. Chapter frames come from the dist data's
`chapterStarts` (structural, from the Greek TEI); nothing else is taken from the
anchors file except the answer key. A Greek window slides over the chapter,
paired with a proportionally-positioned English window plus a margin; the word
links vote on a Greek-index → English-word map, and an isotonic fit makes it
monotone. Tick offsets are read off that map.

Finding (2026-07-31, see docs/ugarit-aligner-spike.md): it beats proportional
interpolation 2-4x, but accuracy degrades sharply as --margin widens, i.e. it
refines a position the proportional estimate supplies rather than locating the
passage itself. Below the gloss pipeline; well above the interpolated fallback.

Usage (from pipeline/, needs the ML extra: `uv sync --extra align`):
    uv run python tools/ugarit_align.py Poet poet-fyfe 1
    uv run python tools/ugarit_align.py DA da-smith 3 --margin 60

The aligner is the ~50 lines of SimAlign (Jalili Sabet et al. 2020) this needs —
IterMax over a cosine similarity matrix of layer-N subword embeddings — rather
than the archived `simalign` package.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
MODEL = "UGARIT/grc-alignment"

# Tuned on DA/Smith, checked against Poet/Fyfe and HA Book 1. Layer 9 matters:
# SimAlign's default layer 8 scored worse than interpolation on this model.
DEFAULTS = {"layer": 9, "margin": 15, "window": 80, "step": 20}


# ---------------------------------------------------------------- corpus data

def load_anchors(anchor_dir: str) -> list[dict]:
    text = (REPO / "sources" / anchor_dir / "anchors.yaml").read_text()
    out = []
    for bekker, at in re.findall(r'- bekker: "([^"]+)"\n  at: "(.*)"', text):
        m = re.match(r"^(\d+[ab])(\d+)$", bekker)
        if m:
            out.append({"bekker": bekker, "column": m.group(1),
                        "line": int(m.group(2)), "at": at})
    return out


def load_chapters(work: str, books: int) -> list[dict]:
    """Split the column stream into chapters at chapterStarts boundaries."""
    dist = REPO / "build/dist" / work
    segments = []
    for b in range(1, books + 1):
        doc = json.loads((dist / f"book-{b:02d}.json").read_text())
        for seg in doc["segments"]:
            seg["book"] = b
            segments.append(seg)

    chapters: list[dict] = []
    cur = None
    for seg in segments:
        starts = sorted(seg.get("chapterStarts", []), key=lambda c: c["beforeLine"])
        eng, greek = seg.get("english", {}).get("text", ""), seg.get("greek", [])
        cuts = [(c["beforeLine"], c["engOffset"], c["chapter"]) for c in starts]
        bounds = cuts if (cuts and cuts[0][0] <= 1 and cuts[0][1] == 0) \
            else [(0, 0, None)] + cuts
        for i, (before_line, eng_offset, chapter) in enumerate(bounds):
            nxt = bounds[i + 1] if i + 1 < len(bounds) else None
            lines = [ln for ln in greek
                     if ln["n"] >= before_line and (nxt is None or ln["n"] < nxt[0])]
            piece = eng[eng_offset:(nxt[1] if nxt else len(eng))]
            if chapter is not None:
                cur = {"key": f"{seg['book']}.{chapter}", "greek": [],
                       "english": "", "anchors": []}
                chapters.append(cur)
            if cur is None:
                continue
            cur["greek"].append((seg["column"], lines))
            cur["english"] += piece
    return chapters


def attach_anchors(chapters: list[dict], anchors: list[dict]) -> int:
    """Resolve each anchor's ground-truth character offset inside its chapter."""
    placed = 0
    for a in anchors:
        home = next((c for c in chapters
                     for col, lines in c["greek"]
                     if col == a["column"] and any(ln["n"] == a["line"] for ln in lines)),
                    None)
        if home is None:
            continue
        # Snippets were keyed against flattened prose, so one spanning a
        # paragraph break carries a space where the text has a newline.
        pattern = r"\s+".join(re.escape(w) for w in a["at"].split())
        hits = [m.start() for m in re.finditer(pattern, home["english"])]
        if hits:
            home["anchors"].append({**a, "offset": hits[0]})
            placed += 1
    return placed


def greek_tokens(chapter: dict) -> list[tuple[str, int, str]]:
    return [(col, ln["n"], tok["t"])
            for col, lines in chapter["greek"] for ln in lines for tok in ln["tokens"]]


# -------------------------------------------------------------- the aligner

class Aligner:
    """IterMax word alignment over UGARIT/grc-alignment subword embeddings."""

    def __init__(self, layer: int, device: str = "cpu"):
        import torch
        from transformers import AutoConfig, AutoModel, AutoTokenizer

        self.torch, self.layer, self.device = torch, layer, device
        config = AutoConfig.from_pretrained(MODEL, output_hidden_states=True)
        self.model = AutoModel.from_pretrained(MODEL, config=config).to(device).eval()
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL)

    def _embed(self, src: list[str], trg: list[str]):
        with self.torch.no_grad():
            inputs = self.tokenizer([src, trg], is_split_into_words=True,
                                    padding=True, truncation=True, return_tensors="pt")
            hidden = self.model(**inputs.to(self.device))["hidden_states"]
            if self.layer >= len(hidden):
                raise ValueError(f"layer {self.layer} > model depth {len(hidden)}")
            return hidden[self.layer][:, 1:-1, :].cpu().numpy()

    @staticmethod
    def _iter_max(sim: np.ndarray, max_count: int = 2) -> np.ndarray:
        """SimAlign's IterMax: repeated argmax intersection over masked residue."""
        alpha, (m, n) = 0.9, sim.shape
        forward = np.eye(n)[sim.argmax(axis=1)]
        backward = np.eye(m)[sim.argmax(axis=0)]
        inter = forward * backward.transpose()
        if min(m, n) <= 2:
            return inter
        count = 1
        while count < max_count:
            mask_x = 1.0 - np.tile(inter.sum(1)[:, None], (1, n)).clip(0.0, 1.0)
            mask_y = 1.0 - np.tile(inter.sum(0)[None, :], (m, 1)).clip(0.0, 1.0)
            mask = ((alpha * mask_x) + (alpha * mask_y)).clip(0.0, 1.0)
            mask_zeros = 1.0 - ((1.0 - mask_x) * (1.0 - mask_y))
            if mask_x.sum() < 1.0 or mask_y.sum() < 1.0:
                mask, mask_zeros = mask * 0.0, mask_zeros * 0.0
            new_sim = sim * mask
            fwd = np.eye(n)[new_sim.argmax(axis=1)] * mask_zeros
            bac = np.eye(m)[new_sim.argmax(axis=0)].transpose() * mask_zeros
            new_inter = fwd * bac
            if np.array_equal(inter + new_inter, inter):
                break
            inter, count = inter + new_inter, count + 1
        return inter

    def word_aligns(self, src: list[str], trg: list[str]) -> list[tuple[int, int]]:
        src_sub = [self.tokenizer.tokenize(w) for w in src]
        trg_sub = [self.tokenizer.tokenize(w) for w in trg]
        src_map = [i for i, subs in enumerate(src_sub) for _ in subs]
        trg_map = [i for i, subs in enumerate(trg_sub) for _ in subs]

        vectors = self._embed(src, trg)
        a = vectors[0][:len(src_map)]
        b = vectors[1][:len(trg_map)]
        if not len(a) or not len(b):
            return []
        a = a / np.linalg.norm(a, axis=1, keepdims=True).clip(1e-9)
        b = b / np.linalg.norm(b, axis=1, keepdims=True).clip(1e-9)
        matrix = self._iter_max(a @ b.T)

        links = {(src_map[i], trg_map[j])
                 for i, j in zip(*np.nonzero(matrix > 0))}
        return sorted(links)


def predict_offsets(aligner: Aligner, chapter: dict, cfg: dict):
    """Monotone Greek-index → English-character map for one chapter."""
    from sklearn.isotonic import IsotonicRegression

    tokens = [t[2] for t in greek_tokens(chapter)]
    words = [(m.group(0), m.start()) for m in re.finditer(r"\S+", chapter["english"])]
    if not tokens or not words:
        return None
    ratio = len(words) / len(tokens)

    votes: dict[int, list[int]] = {}
    for g0 in range(0, len(tokens), cfg["step"]):
        g1 = min(g0 + cfg["window"], len(tokens))
        if g1 - g0 < 5:
            break
        e0 = max(0, int(g0 * ratio) - cfg["margin"])
        e1 = min(len(words), int(g1 * ratio) + cfg["margin"])
        try:
            links = aligner.word_aligns(tokens[g0:g1], [w for w, _ in words[e0:e1]])
        except Exception as exc:
            print(f"    window {g0}-{g1}: {exc}", file=sys.stderr)
            continue
        for i, j in links:
            votes.setdefault(g0 + i, []).append(e0 + j)
        if g1 == len(tokens):
            break
    if not votes:
        return None

    xs = sorted(votes)
    ys = [float(np.median(votes[x])) for x in xs]
    iso = IsotonicRegression(increasing=True, out_of_bounds="clip").fit(xs, ys)

    def at(greek_index: int) -> int:
        j = int(round(float(iso.predict([greek_index])[0])))
        return words[max(0, min(len(words) - 1, j))][1]

    return at


# ------------------------------------------------------------------ scoring

def report(rows: list[dict]) -> None:
    ugarit = np.abs([r["err"] for r in rows])
    interp = np.abs([r["lin_err"] for r in rows])
    print(f"\n=== {len(rows)} ticks ===")
    print(f"{'':22} {'UGARIT':>9} {'interp':>9}")
    print(f"{'median |err|':22} {np.median(ugarit):8.0f}c {np.median(interp):8.0f}c")
    print(f"{'mean |err|':22} {ugarit.mean():8.0f}c {interp.mean():8.0f}c")
    print(f"{'90th pct':22} {np.percentile(ugarit,90):8.0f}c {np.percentile(interp,90):8.0f}c")
    for t in (15, 30, 60, 120, 250):
        print(f"{'within ' + str(t) + ' chars':22} {100*(ugarit<=t).mean():8.1f}% "
              f"{100*(interp<=t).mean():8.1f}%")
    print(f"beats interpolation on {100*(ugarit<interp).mean():.1f}% of ticks")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("work", help="corpus id, e.g. Poet")
    ap.add_argument("anchor_dir", help="sources/ subdir, e.g. poet-fyfe")
    ap.add_argument("books", type=int)
    ap.add_argument("--layer", type=int, default=DEFAULTS["layer"])
    ap.add_argument("--margin", type=int, default=DEFAULTS["margin"],
                    help="English search slack in words; widening it degrades accuracy")
    ap.add_argument("--window", type=int, default=DEFAULTS["window"])
    ap.add_argument("--step", type=int, default=DEFAULTS["step"])
    ap.add_argument("--book", type=int, help="restrict to one book")
    ap.add_argument("--device", default="cpu", help="cpu | mps | cuda")
    ap.add_argument("--out", type=Path, help="write per-tick predictions as JSON")
    args = ap.parse_args()

    chapters = load_chapters(args.work, args.books)
    placed = attach_anchors(chapters, load_anchors(args.anchor_dir))
    if args.book:
        chapters = [c for c in chapters if c["key"].startswith(f"{args.book}.")]
    print(f"{args.work}: {len(chapters)} chapters, {placed} anchors resolved")

    cfg = {k: getattr(args, k) for k in ("layer", "margin", "window", "step")}
    aligner = Aligner(layer=args.layer, device=args.device)

    rows, t0 = [], time.time()
    for chapter in chapters:
        if not chapter["anchors"]:
            continue
        at = predict_offsets(aligner, chapter, cfg)
        if at is None:
            continue
        tokens = greek_tokens(chapter)
        first: dict[tuple[str, int], int] = {}
        for i, (col, line, _) in enumerate(tokens):
            first.setdefault((col, line), i)
        for a in chapter["anchors"]:
            gi = first.get((a["column"], a["line"]))
            if gi is None:
                continue
            # Control: the interpolated gutter this would replace.
            linear = int(gi / max(1, len(tokens)) * len(chapter["english"]))
            rows.append({"chapter": chapter["key"], "bekker": a["bekker"],
                         "true": a["offset"], "pred": at(gi),
                         "err": at(gi) - a["offset"],
                         "lin_err": linear - a["offset"]})
    print(f"aligned in {time.time() - t0:.1f}s")
    report(rows)
    if args.out:
        args.out.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
