#!/usr/bin/env python3
"""Independent check that our English De Plantis matches the printed page.

Does not read or import pipeline/tools/build_plant_forster.py. Prose is the
text inside <p> in sources/plant-forster/book-01.html and book-02.html.
Scan A is build/plant-ocr/forster/works0006aris_hocr.html pages 83–120.
Scan B is worksofaristotle06arisuoft_hocr.html pages 78–115 (B page = A − 5).

Layout uses position and type size only, never the words. hOCR sometimes glues
the running head into the body and sometimes splits an opening quote off its
word, so words are regrouped into visual lines by their top edge. Each page is
a running head, one column, then footnotes in smaller type. The head is what
sits more than about 1.28 line-gaps above the first long line; one gap is
normal spacing, so a short opening line stays. A long line has at least six
words and about 70% of the page's typical width. Body edges are least squares
x = a + b*y on those lines, because the page is skewed. A margin word parted
by a wide gap is not an edge point, and a word wholly outside an edge by a
few pixels is margin. Footnotes are x_fsize at or under 0.92 times the body
median, walked up from the bottom, including a one-word note so it cannot hide
the notes above it. A small-caps first line stays body.

Footnote figures (digits, * ° ® ©, straight double quotes, stray Greek) are
stripped. A lone trailing ? stays a stop; a stop-only token glues onto the
previous word. A hyphen at the end of a line joins the next line. Comparison
is lower-case letters only, so gum-arabic still matches. A split-off opening
‘ glues onto the next word. SequenceMatcher (autojunk off) aligns our prose
with each scan. Where the scans agree and ours does not, that is a flag.
EXCEPTIONS lists the flags settled on the page images (2026-11-06). Exit 1 on any unexcused flag, or if nothing was
examined. --selftest plants five defects and requires each flagged at its place.
"""

import html
import re
import statistics
import sys
from difflib import SequenceMatcher
from pathlib import Path

OURS = [Path("sources/plant-forster/book-01.html"), Path("sources/plant-forster/book-02.html")]
SCAN_A = Path("build/plant-ocr/forster/works0006aris_hocr.html")
SCAN_B = Path("build/plant-ocr/forster/worksofaristotle06arisuoft_hocr.html")
A_RANGE, B_RANGE = (83, 120), (78, 115)  # book II opens at A 101 / B 96
EXCEPTIONS = [  # (kind, our_context_substring, reason); each read off A's page image
    ('CHANGED', 'Life is found in animals and plants; but',
     'small-capital opening LIFE (A reads lire)'),
    ('PUNCTUATION', 'Now Anaxagoras and Empedocles say that they are',
     'p83: a raised note figure after Empedocles read as ?'),
    ('CHANGED', 'of the sexes or not. But the great',
     'p83: "or not." with a word space; the scans run it together'),
    ('INVENTED', 'the sexes or not. But the great diversity',
     'p83: "or not." with a word space; the scans run it together'),
    ('PUNCTUATION', 'and Democritus and Empedocles declared that they possessed',
     'p84: a raised note figure after Empedocles read as ?'),
    ('PUNCTUATION', 'We know that sea-shells are animals which lack',
     'p85: a raised note figure after sea-shells read as ?'),
    ('PUNCTUATION', 'that animals should have some common characteristic perfect',
     'p86: a raised note figure after have read as ?'),
    ('PUNCTUATION', 'it possesses in itself. Some one might say',
     'p86: itself. with a stop; both scans miss it'),
    ('PUNCTUATION', 'which is given forth by them. A plant',
     'p87: a raised note figure after forth read as ?'),
    ('CHANGED', 'generates it generates in another, and when the',
     'p87: "in"; both scans read m'),
    ('PUNCTUATION', 'plant resembles the embryo in animals, being a',
     'p88: a raised note figure after embryo read as ?'),
    ('PUNCTUATION', 'plant and many others. Empedocles said that plants',
     'p90: others. with a stop; the scans read a comma'),
    ('PUNCTUATION', 'is that the moisture which is found in',
     'p93: a raised note figure after moisture read as ?'),
    ('PUNCTUATION', 'the leaves and knots are not separated; in',
     'p94: a raised note figure after knots read as ?'),
    ('PUNCTUATION', 'roots, like the thorn-tree and bramble. Vegetables are',
     'p95: a raised note figure after thorn-tree read as ?'),
    ('CHANGED', 'of them have a number of superfluous stems',
     'p95: "a number" with a word space'),
    ('INVENTED', 'them have a number of superfluous stems growing',
     'p95: "a number" with a word space'),
    ('CHANGED', 'sea, others in rivers. Plants which grow in',
     'p96: rivers. (scans otivers, tivers)'),
    ('PUNCTUATION', 'which is called Ziara, and increase there better',
     'p96: a raised note figure after Ziara, read as ?'),
    ('PUNCTUATION', 'for example, the mediannus. Some plants have joints,',
     'p96: a raised note figure after mediannus. read as ?'),
    ('PUNCTUATION', 'several husks, a cuticle and a shell, walnuts',
     'p97: a raised note figure after cuticle read as ?'),
    ('PUNCTUATION', 'example, on wild plane, olive-trees on terebinth, mulberries',
     'p98: a raised note figure after plane, read as ?'),
    ('PUNCTUATION', 'the process of concoction which takes place in',
     'p101: a raised note figure after concoction read as ?'),
    ('PUNCTUATION', 'of the earthly element which attracts moisture; in',
     'p102: a raised note figure after element read as ?'),
    ('PUNCTUATION', 'no rarity in them, and it is the',
     'p103: a raised note figure after them, read as ?'),
    ('PUNCTUATION', 'the ground were rare, the vapour would make',
     'p103: a raised note figure after rare, read as ?'),
    ('PUNCTUATION', 'We will now give the reason of this.',
     'p104: a raised note figure after give read as ?'),
    ('PUNCTUATION', 'brain, and all foods also rise; so too',
     'p107: a raised note figure after foods read as ?'),
    ('PUNCTUATION', 'the snow which causes this to be so;',
     'p108: a raised note figure after causes read as ?'),
    ('CHANGED', 'to one another. Plants which grow on the',
     'small-capital opening PLANTS (puants, prants)'),
    ('PUNCTUATION', 'because the heat assimilates the water in the',
     'p109: a raised note figure after assimilates read as ?'),
    ('PUNCTUATION', 'brimstone, it will recoil back again, and the',
     'p110: a raised note figure after recoil read as ?'),
    ('PUNCTUATION', 'already seen, is found where there is fresh',
     'p110: a raised note figure after found read as ?'),
    ('PUNCTUATION', 'it faces the east, it will grow quickly,',
     'p111: a raised note figure after east, read as ?'),
    ('PUNCTUATION', 'the wind will invade the spot and the',
     'p112: a raised note figure after invade read as ?'),
    ('CHANGED', 'have already said. The same theory applies to',
     'p114: "The same" with a word space'),
    ('INVENTED', 'already said. The same theory applies to olives,',
     'p114: "The same" with a word space'),
    ('PUNCTUATION', 'their appearance fully matured and are distributed through',
     'p115: a raised note figure after matured read as ?'),
    ('CHANGED', 'have already said. The shedding of leaves from',
     'small-capital opening THE (tue)'),
    ('PUNCTUATION', 'to a harsh flavour. Next, the sun with',
     'p120: flavour. with a stop; the scans read a comma'),
    ('LOST', 'will become bitter.',
     'p120: "Here ends the book on Plants." is Forster\'s closing line from the Latin, not text'),
]

_WORD = re.compile(r'<span class="ocrx_word"[^>]*title="([^"]*)"[^>]*>(.*?)</span>', re.S)
_TAG = re.compile(r"<[^>]+>")
_PAGE = re.compile(r'<div class="ocr_page" id="(page_\d+)"')
_NOISE = set("0123456789*°®©¹²³⁴⁵⁶⁷⁸⁹⁰†‡§\"“”„«»+<>{}|\\/^~`´!")
_STOPS, _ALLOWED = set(".,;:?"), set(".,;:?!‘’()—–-[]⟨⟩")
_PEEL = set(".,;:?’”—–-)] ")


def _clean(raw):
    return html.unescape(_TAG.sub("", raw)).replace("\xa0", " ").strip()


def _norm(token):
    """(kind, key, stop, lead_quote) or None. kind is word, quote, or stop."""
    greek = lambda ch: 0x0370 <= ord(ch) <= 0x03FF or 0x1F00 <= ord(ch) <= 0x1FFF
    s = "".join(ch for ch in token if ch not in _NOISE and not greek(ch)).strip()
    if not s:
        return None
    if not any(ch.isalpha() for ch in s):
        if "‘" in s and "’" not in s:
            return ("quote", "", "", False)
        for ch in s:
            if ch in _STOPS:
                return ("stop", "", ch, False)
        return None
    lead, core, stop = s[0] == "‘", s.lstrip("‘’"), ""
    while core and core[-1] in _PEEL:
        ch, core = core[-1], core[:-1]
        if ch in _STOPS and not stop:
            stop = ch
    key = "".join(ch.lower() for ch in core if ch.isalpha())
    return ("word", key, stop, lead) if key else (("stop", "", stop, False) if stop else None)


def _read_pages(path, start, end):
    if not path.is_file():
        return {}
    text = path.read_text(errors="replace")
    marks = [(m.group(1), m.start()) for m in _PAGE.finditer(text)]
    idx = {pid: i for i, (pid, _) in enumerate(marks)}
    out = {}
    for n in range(start, end + 1):
        pid = f"page_{n:06d}"
        if pid not in idx:
            continue
        i = idx[pid]
        a = marks[i][1]
        b = marks[i + 1][1] if i + 1 < len(marks) else len(text)
        out[n] = text[a:b]
    return out


def _visual_lines(chunk):
    words = []
    for m in _WORD.finditer(chunk):
        bb = re.search(r"bbox\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)", m.group(1))
        fs = re.search(r"x_fsize\s+([\d.]+)", m.group(1))
        t = _clean(m.group(2))
        if not bb or not t:
            continue
        x0, y0, x1, y1 = (int(v) for v in bb.groups())
        words.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1,
                       "fs": float(fs.group(1)) if fs else 0.0, "t": t})
    words.sort(key=lambda w: w["y0"])
    lines, cur = [], []
    for w in words:
        if cur:
            band = statistics.median(x["y0"] for x in cur)
            height = statistics.median(max(8, x["y1"] - x["y0"]) for x in cur)
            if w["y0"] > band + 0.55 * height:
                lines.append(cur)
                cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    out = []
    for i, ws in enumerate(lines):
        ws.sort(key=lambda w: w["x0"])
        out.append({"words": ws, "y": min(w["y0"] for w in ws), "x0": ws[0]["x0"],
                    "x1": ws[-1]["x1"], "fs": statistics.median(w["fs"] for w in ws), "n": i + 1})
    return out


def _ls(pts):
    n = len(pts)
    my, mx = sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n
    var = sum((p[0] - my) ** 2 for p in pts) or 1.0
    slope = sum((p[0] - my) * (p[1] - mx) for p in pts) / var
    return mx - slope * my, slope


def _edge(pts, side):
    """Least squares x = a + b*y, dropping margin outliers and deep indents."""
    pts = list(pts)
    lo, hi = (-18, 14) if side == "L" else (-14, 18)
    for _ in range(4):
        if len(pts) < 6:
            break
        a, b = _ls(pts)
        res = [x - (a + b * y) for y, x in pts]
        med = statistics.median(res)
        keep = [p for p, r in zip(pts, res) if med + lo <= r <= med + hi]
        if len(keep) < max(6, len(pts) // 2) or len(keep) == len(pts):
            pts = keep or pts
            break
        pts = keep
    return _ls(pts)


def _column_x(ln, side):
    """Body edge of a line, skipping a margin word parted by a wide gap."""
    w = ln["words"]
    if side == "L":
        return w[1]["x0"] if len(w) >= 2 and w[1]["x0"] - w[0]["x1"] > 42 else w[0]["x0"]
    return w[-2]["x1"] if len(w) >= 2 and w[-1]["x0"] - w[-2]["x1"] > 42 else w[-1]["x1"]


def _extract(pages, book_split):
    """Body stream and words left out. book_split is the last page of book I."""
    rows, stats = [], {"head": 0, "margin": 0, "note": 0, "pages": 0, "body": [0, 0]}
    for n in sorted(pages):
        lines = _visual_lines(pages[n])
        if len(lines) < 4:
            continue
        stats["pages"] += 1
        gaps = [b["y"] - a["y"] for a, b in zip(lines, lines[1:]) if 15 < b["y"] - a["y"] < 180]
        gap = statistics.median(gaps) if gaps else 60
        wide = [ln["x1"] - ln["x0"] for ln in lines if len(ln["words"]) >= 6]
        typical = statistics.median(wide) if wide else 800
        y0, y1 = lines[0]["y"], lines[-1]["y"]
        span = y1 - y0 or 1
        mid = [ln["fs"] for ln in lines if y0 + 0.15 * span < ln["y"] < y0 + 0.60 * span
               and len(ln["words"]) >= 6 and ln["x1"] - ln["x0"] >= 0.70 * typical]
        body_fs = statistics.median(mid or [10])
        small = 0.92 * body_fs
        notes = set()
        for i in range(len(lines) - 1, -1, -1):
            ln, width = lines[i], lines[i]["x1"] - lines[i]["x0"]
            if ln["fs"] <= small and width >= 40:
                notes.add(i)
            elif width < 40 or ln["fs"] <= 0.72 * body_fs:
                if notes:
                    notes.add(i)
            else:
                break
        long = [i for i, ln in enumerate(lines) if i not in notes and len(ln["words"]) >= 6
                and ln["x1"] - ln["x0"] >= 0.70 * typical]
        head = set()
        if long:
            cut = lines[long[0]]["y"] - 1.28 * gap
            head = {i for i, ln in enumerate(lines) if i not in notes and ln["y"] < cut}
        edge = [lines[i] for i in long if i not in head]
        if len(edge) >= 6:
            a_l, b_l = _edge([(ln["y"], _column_x(ln, "L")) for ln in edge], "L")
            a_r, b_r = _edge([(ln["y"], _column_x(ln, "R")) for ln in edge], "R")
        else:
            a_l, b_l, a_r, b_r = 0.0, 0.0, 1e9, 0.0
        book = 0 if n <= book_split else 1
        for i, ln in enumerate(lines):
            role = "head" if i in head else "note" if i in notes else "body"
            e_l, e_r = a_l + b_l * ln["y"], a_r + b_r * ln["y"]
            kept = []
            for w in ln["words"]:
                if role != "body":
                    stats[role] += 1
                elif w["fs"] <= 0.72 * body_fs:
                    stats["note"] += 1
                elif w["x1"] < e_l - 6 or w["x0"] > e_r + 6:
                    stats["margin"] += 1
                else:
                    kept.append(w["t"])
            if kept:
                rows.append((n, ln["n"], book, kept))
    flat = [(p, ln, bk, t, j == len(toks) - 1) for p, ln, bk, toks in rows for j, t in enumerate(toks)]
    merged, i = [], 0
    while i < len(flat):
        page, lineno, book, tok, eol = flat[i]
        if eol and tok.endswith("-") and i + 1 < len(flat):
            tok, i = tok[:-1] + flat[i + 1][3], i + 2
        else:
            i += 1
        merged.append((page, lineno, book, tok))
    stream, pending = [], False
    for page, lineno, book, tok in merged:
        got = _norm(tok)
        if not got:
            continue
        kind, key, stop, lead = got
        if kind == "quote":
            pending = True
        elif kind == "stop":
            if stream and not stream[-1]["stop"]:
                stream[-1]["stop"] = stop
        else:
            if pending:
                lead, pending = True, False
            stream.append({"page": page, "line": lineno, "book": book, "key": key, "stop": stop, "lead": lead})
            stats["body"][book] += 1
    return stream, stats


def _parse_ours(html1, html2):
    words = []
    for book, raw in ((1, html1), (2, html2)):
        part = None
        for piece in re.split(r"(?m)^(Part \d+)\s*$", raw):
            m = re.fullmatch(r"Part (\d+)", piece.strip())
            if m:
                part = int(m.group(1))
                continue
            if part is None:
                continue
            for para in re.findall(r"<p>(.*?)</p>", piece, re.S):
                start = len(words)
                for tok in html.unescape(para).split():
                    got = _norm(tok)
                    if not got or got[0] != "word":
                        continue
                    words.append({"book": book, "part": part, "key": got[1], "stop": got[2],
                                   "lead": got[3], "raw": tok, "para": start, "i": len(words)})
    return words


def _align(our_keys, scan_keys):
    """Pair keys. One inner pass on each replace; a second replace is zipped."""
    match, inserts = [None] * len(our_keys), [[] for _ in range(len(our_keys) + 1)]

    def take(keys_o, keys_s, io, jo, inner):
        for tag, i1, i2, j1, j2 in SequenceMatcher(None, keys_o, keys_s, autojunk=False).get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    match[io + i1 + k] = jo + j1 + k
            elif tag == "insert":
                inserts[io + i1].extend(range(jo + j1, jo + j2))
            elif tag == "replace" and not inner:
                take(keys_o[i1:i2], keys_s[j1:j2], io + i1, jo + j1, True)
            elif tag == "replace":
                n = min(i2 - i1, j2 - j1)
                for k in range(n):
                    match[io + i1 + k] = jo + j1 + k
                if j2 - j1 > n:
                    inserts[io + i2].extend(range(jo + j1 + n, jo + j2))

    take(our_keys, scan_keys, 0, 0, False)
    return match, inserts


def _flag(kind, words, i, detail, where, keys):
    anchor = words[min(i, len(words) - 1)]
    lo = max(0, min(i, len(words)) - 3)
    ctx = " ".join(w["raw"] for w in words[lo:lo + 8])
    return {"kind": kind, "lo": i, "hi": i, "book": anchor["book"], "part": anchor["part"],
            "context": ctx, "detail": detail, "where": where, "keys": keys}


def compare(words, scan_a, scan_b):
    ok = [w["key"] for w in words]
    ma, ia = _align(ok, [w["key"] for w in scan_a])
    mb, ib = _align(ok, [w["key"] for w in scan_b])
    at = lambda scan, j: f"p{scan[j]['page']} L{scan[j]['line']}"
    flags = []
    for i in range(len(words) + 1):
        ak = [scan_a[j]["key"] for j in ia[i]]
        bk = [scan_b[j]["key"] for j in ib[i]]
        if not ak or not bk:
            continue
        for tag, a1, a2, b1, b2 in SequenceMatcher(None, ak, bk, autojunk=False).get_opcodes():
            if tag == "equal" and a2 > a1:
                keys = ak[a1:a2]
                shown = " ".join(keys[:16]) + (" …" if len(keys) > 16 else "")
                where = f"A {at(scan_a, ia[i][a1])} / B {at(scan_b, ib[i][b1])}"
                flags.append(_flag("LOST", words, i, shown, where, keys))
    for i, w in enumerate(words):
        a, b = ma[i], mb[i]
        ak = scan_a[a]["key"] if a is not None else None
        bk = scan_b[b]["key"] if b is not None else None
        where = " / ".join(s for s in (f"A {at(scan_a, a)}" if a is not None else "",
                                        f"B {at(scan_b, b)}" if b is not None else "") if s)
        if a is None and b is None:
            flags.append(_flag("INVENTED", words, i, w["raw"], "no scan word", [w["key"]]))
        elif ak is not None and ak == bk and ak != w["key"]:
            flags.append(_flag("CHANGED", words, i, f"ours {w['raw']} / scans {ak}", where, [w["key"], ak]))
        elif ak != bk and w["key"] not in (ak, bk):
            flags.append(_flag("CHANGED", words, i, f"ours {w['raw']} / A {ak} B {bk}", where, [w["key"]]))
        elif ak == bk == w["key"]:
            if scan_a[a]["stop"] == scan_b[b]["stop"] != w["stop"]:
                detail = f"ours {w['stop'] or 'none'} / scans {scan_a[a]['stop'] or 'none'} on {w['raw']}"
                flags.append(_flag("PUNCTUATION", words, i, detail, where, [w["key"]]))
            if scan_a[a]["lead"] and scan_b[b]["lead"] and not w["lead"]:
                flags.append(_flag("LOST QUOTE", words, i, f"opening ‘ missing on {w['raw']}", where, [w["key"]]))
    by_para = {}
    for w in words:
        by_para.setdefault(w["para"], []).append(w)
    for group in by_para.values():
        opens = []
        for w in group:
            for ch in w["raw"]:
                if ch == "‘":
                    opens.append(w["i"])
                elif ch == "’" and opens:
                    opens.pop()
        for i in opens:
            flags.append(_flag("LOST QUOTE", words, i, "no closing ’ in the paragraph", "our text", ["‘"]))
    for w in words:
        bad = [ch for ch in w["raw"] if not (ch.isalpha() or ch in _ALLOWED)]
        if bad:
            flags.append(_flag("STRAY MARK", words, w["i"], f"{''.join(bad)!r} in {w['raw']}", "our text", [w["key"]]))
    flags.sort(key=lambda f: (f["lo"], f["kind"]))
    return flags


def _report(words, stats_a, stats_b, flags):
    n = lambda ws, book: sum(1 for w in ws if w["book"] == book)
    print(f"examined: our words {len(words)} (book 1 {n(words, 1)}, book 2 {n(words, 2)}); "
          f"A body words book 1 {stats_a['body'][0]}, book 2 {stats_a['body'][1]}; "
          f"B body words book 1 {stats_b['body'][0]}, book 2 {stats_b['body'][1]}; "
          f"pages A {stats_a['pages']} ({A_RANGE[0]}-{A_RANGE[1]}), "
          f"B {stats_b['pages']} ({B_RANGE[0]}-{B_RANGE[1]})")
    print(f"left out: A head {stats_a['head']}, margin {stats_a['margin']}, notes {stats_a['note']}; "
          f"B head {stats_b['head']}, margin {stats_b['margin']}, notes {stats_b['note']}")
    shown = 0
    for flag in flags:
        if any(flag["kind"] == kind and sub in flag["context"] for kind, sub, _why in EXCEPTIONS):
            continue
        print(f"{flag['kind']} book {flag['book']} part {flag['part']} "
              f"@ {flag['context']} | {flag['detail']} | {flag['where']}")
        shown += 1
    print(f"summary: {len(flags)} flags, {len(flags) - shown} excused, {shown} unexcused")
    return shown


def _sub_token(text, token, repl, nth):
    pat, seen = re.compile(r"(?<!\S)" + re.escape(token) + r"(?!\S)"), 0

    def repl_at(m):
        nonlocal seen
        seen += 1
        return repl if seen == nth else m.group(0)

    new = pat.sub(repl_at, text)
    return new if seen >= nth else None


def selftest(html1, html2, scan_a, scan_b):
    base = _parse_ours(html1, html2)
    sig = lambda fs: [(f["kind"], f["lo"], f["context"], f["detail"]) for f in fs]
    if sig(compare(_parse_ours(html1, html2), scan_a, scan_b)) != sig(compare(base, scan_a, scan_b)):
        print("FAIL unplanted text produced new flags")
        return 1
    ma, _ = _align([w["key"] for w in base], [w["key"] for w in scan_a])
    mb, _ = _align([w["key"] for w in base], [w["key"] for w in scan_b])

    def clean(i):
        a, b = ma[i], mb[i]
        return a is not None and b is not None and scan_a[a]["key"] == scan_b[b]["key"] == base[i]["key"]

    plants = {}
    for i, w in enumerate(base):
        if w["book"] == 1 and w["part"] >= 2 and clean(i) and len(w["key"]) >= 7 and w["raw"].isalpha() \
                and html1.count(w["raw"]) == 1:
            plants["(a) delete-word"] = ("LOST", i, w["key"], _sub_token(html1, w["raw"], "", 1), html2)
            break
    for i, w in enumerate(base):
        if not (w["raw"].endswith(".") and w["book"] == 1 and clean(i)):
            continue
        start = i
        while start and base[start - 1]["para"] == w["para"] and not base[start - 1]["raw"].endswith("."):
            start -= 1
        if not (8 <= i - start + 1 <= 18 and all(clean(k) for k in range(start, i + 1))):
            continue
        run = base[start:i + 1]
        m = re.compile(r"\s+".join(re.escape(x["raw"]) for x in run)).search(html1)
        if m:
            plants["(b) delete-sentence"] = ("LOST", start, run[0]["key"],
                                              html1[:m.start()] + " " + html1[m.end():], html2)
            break
    for i, w in enumerate(base):
        if w["key"] != "two" or not clean(i):
            continue
        nth = sum(1 for j in range(i + 1) if base[j]["raw"] == w["raw"] and base[j]["book"] == w["book"])
        src = html1 if w["book"] == 1 else html2
        changed = _sub_token(src, w["raw"], w["raw"].replace("two", "three", 1), nth)
        if changed:
            pair = (changed, html2) if w["book"] == 1 else (html1, changed)
            plants["(c) change-number"] = ("CHANGED", i, "three", pair[0], pair[1])
            break
    m = re.search(r"(?<!\S)plants,", html1)
    if m:
        idx = next(i for i, w in enumerate(base) if w["raw"] == "plants," and w["book"] == 1)
        plants["(d) stray-mark"] = ("STRAY MARK", idx, base[idx]["key"],
                                     html1[:m.start()] + "plants,*" + html1[m.end():], html2)
    g = next((i for i, w in enumerate(base) if w["key"] == "goatberry"), None)
    if g is not None and "‘goatberry’" in html1:
        plants["(e) lost-quote"] = ("LOST QUOTE", g, "goatberry",
                                     html1.replace("‘goatberry’", "goatberry’", 1), html2)
    failed = 0
    for name in ("(a) delete-word", "(b) delete-sentence", "(c) change-number",
                 "(d) stray-mark", "(e) lost-quote"):
        if name not in plants or plants[name][3] is None:
            print(f"FAIL {name} (could not plant)")
            failed += 1
            continue
        kind, index, key, h1, h2 = plants[name]
        hit = any(f["kind"] == kind and f["lo"] <= index <= f["hi"] and key in f["keys"]
                  for f in compare(_parse_ours(h1, h2), scan_a, scan_b))
        print(f"{'PASS' if hit else 'FAIL'} {name}" + ("" if hit else f" not flagged at {index}"))
        failed += not hit
    return 1 if failed else 0


def main(argv):
    pages_a, pages_b = _read_pages(SCAN_A, *A_RANGE), _read_pages(SCAN_B, *B_RANGE)
    scan_a, stats_a = _extract(pages_a, 100)
    scan_b, stats_b = _extract(pages_b, 95)
    if not OURS[0].is_file() or not OURS[1].is_file():
        print("examined nothing: our text files are missing")
        return 1
    html1, html2 = OURS[0].read_text(), OURS[1].read_text()
    words = _parse_ours(html1, html2)
    if stats_a["pages"] == 0 or stats_b["pages"] == 0 or not words or not scan_a or not scan_b:
        print("examined nothing: no pages or no words "
              f"(A pages {stats_a['pages']}, B pages {stats_b['pages']}, "
              f"our words {len(words)}, A body {len(scan_a)}, B body {len(scan_b)})")
        return 1
    if "--selftest" in argv:
        return selftest(html1, html2, scan_a, scan_b)
    return 1 if _report(words, stats_a, stats_b, compare(words, scan_a, scan_b)) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
