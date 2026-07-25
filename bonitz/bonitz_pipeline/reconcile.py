"""
Apply adjudicated verdicts to the Opus spine and emit reconciled per-column
text files.

Inputs per column:
  - raw/opus/page-NNN-C.txt        (immutable raw read)
  - work/flags-by-col/page-NNN-C.json   (flagged regions, spine offsets)
  - work/adjudicated/page-NNN-C.json    (verdicts, same order)

The spine offsets in the flags are GLOBAL (whole 10-column pilot stream);
build_spine() segments convert them to column-local canonical positions, and
canonical()'s offset map converts those to positions in the cleaned column
text, where the verdict replaces the disputed span. Edits apply right-to-left
so earlier offsets stay valid.

Output: work/reconciled/page-NNN-C.txt plus a human-queue markdown listing
every verdict that was not high-confidence.
"""

from __future__ import annotations
import json
import unicodedata
from pathlib import Path

from .normalize import canonical, clean_opus
from .compare3 import build_spine


def _splice(removed: str, verdict: str) -> str:
    """
    Replace the non-whitespace of `removed` with `verdict`, preserving the
    span's whitespace (spaces, printed line breaks, hyphen-newline joins) in
    place. The verdict is canonical (whitespace-free), so a bare replacement
    would glue words and lines together whenever a disputed span crosses a
    boundary.
    """
    out: list[str] = []
    vi = 0
    i, n = 0, len(removed)
    while i < n:
        c = removed[i]
        if c.isspace() or (c == '-' and i + 1 < n and removed[i + 1] == '\n'):
            out.append(c)          # not part of the canonical stream — keep
        elif vi < len(verdict):
            out.append(verdict[vi])
            vi += 1
        i += 1
    if vi < len(verdict):          # verdict longer: insert before trailing ws
        k = len(out)
        while k > 0 and out[k - 1].isspace():
            k -= 1
        out[k:k] = verdict[vi:]
    return ''.join(out)


def match_verdicts(flags: list[dict], verdicts: list[dict]) -> list[tuple[dict, dict | None]]:
    """Pair each flag with the verdict that answers it.

    Adjudicators are asked to preserve input order but sometimes reorder, and
    they quote a ctx window that may be shifted a few characters from the
    flag's. Position is the stronger signal: where two flags fall inside one
    overlapping window, a ctx search cannot tell them apart and a greedy one
    silently swaps them. So take the verdict at the same index whenever its
    ctx is consistent with that flag, and only search for the rest.
    """
    def overlaps(fl: dict, vd: dict) -> bool:
        """Loose: the two windows describe the same stretch of text."""
        key = vd['ctx'][:20]
        return bool(key) and (key in fl['ctx'] or fl['ctx'][:20] in vd['ctx'])

    def anchors(fl: dict, vd: dict) -> bool:
        """Strict: the verdict quotes this flag's window from its start.

        Search needs a test that can REJECT. Overlap cannot — where two flags
        share a window each one contains the other's key, so a greedy search
        on overlap binds the first candidate it meets, right or wrong.
        """
        return fl['ctx'].startswith(vd['ctx'][:20])

    # Order preserved and every pair on the same stretch of text: trust it
    # wholesale. Deciding position pair-by-pair would let a genuinely
    # reordered set bind a wrong verdict wherever two windows overlap, so
    # this is all or nothing.
    if len(flags) == len(verdicts) and all(
            overlaps(fl, vd) for fl, vd in zip(flags, verdicts)):
        return list(zip(flags, verdicts))

    matched: list[tuple[dict, dict | None]] = [(fl, None) for fl in flags]
    unused = list(range(len(verdicts)))
    for i, (fl, vd) in enumerate(matched):
        if vd is not None:
            continue
        for k in unused:
            if anchors(fl, verdicts[k]):
                matched[i] = (fl, verdicts[k])
                unused.remove(k)
                break
    # adjudicators occasionally re-quote a ctx snippet that matches nothing —
    # pair whatever is left in order
    leftovers = [i for i, (_, vd) in enumerate(matched) if vd is None]
    for i, k in zip(leftovers, unused):
        matched[i] = (matched[i][0], verdicts[k])
    return matched


def reconcile(root: Path, pages: list[int]) -> tuple[int, list[dict]]:
    columns = []
    cleaned_by_col = {}
    for p in pages:
        for col in ('L', 'R'):
            cleaned = clean_opus(
                (root / f'raw/opus/page-{p:03d}-{col}.txt').read_text(encoding='utf-8'))
            stream, offs = canonical(cleaned)
            columns.append((p, col, stream))
            cleaned_by_col[(p, col)] = (cleaned, stream, offs)
    _, segs = build_spine(columns)
    seg_by_col = {(s.page, s.col): s for s in segs}

    edits = 0
    queue: list[dict] = []
    outdir = root / 'work/reconciled'
    outdir.mkdir(exist_ok=True)

    for (p, col), (cleaned, stream, offs) in cleaned_by_col.items():
        fpath = root / f'work/flags-by-col/page-{p:03d}-{col}.json'
        apath = root / f'work/adjudicated/page-{p:03d}-{col}.json'
        # canonical()'s offsets index into NFC(cleaned) — edit that text
        text = unicodedata.normalize('NFC', cleaned)
        if fpath.exists() and apath.exists():
            # A verdict file older than its flags predates the last comparator
            # change, so its verdicts answer questions that were since redrawn.
            # Presence is not freshness — refuse rather than ship stale calls.
            if apath.stat().st_mtime < fpath.stat().st_mtime:
                raise SystemExit(
                    f'{apath.name} is older than {fpath.name} — it was '
                    f'adjudicated against a previous version of the flags. '
                    f're-adjudicate this column, or touch the file if you are '
                    f'certain the verdicts still apply.')
            flags = json.loads(fpath.read_text(encoding='utf-8'))
            verdicts = json.loads(apath.read_text(encoding='utf-8'))
            if len(flags) != len(verdicts):
                print(f'{fpath.name}: {len(flags)} flags vs '
                      f'{len(verdicts)} verdicts — unmatched flags go to '
                      f'the human queue unedited')
            seg = seg_by_col[(p, col)]
            matched = match_verdicts(flags, verdicts)
            for i in [i for i, (_, vd) in enumerate(matched) if vd is None]:
                # no verdict at all — keep the opus reading, send to queue
                fl = matched[i][0]
                matched[i] = (fl, {'ctx': fl['ctx'][:30], 'verdict': fl['opus'],
                                   'agrees_with': 'opus',
                                   'confidence': 'unadjudicated', 'note': ''})
            pairs = []
            for fl, vd in matched:
                ls = fl['spine_off'] - seg.start
                le = ls + len(fl['opus'])
                pairs.append((ls, le, fl, vd))
            for ls, le, fl, vd in sorted(pairs, key=lambda t: -t[0]):
                if le > len(offs):
                    # disputed span straddles the column boundary (hyphenated
                    # word continuing into the next column) — cannot edit
                    # mechanically; send to the human queue instead
                    queue.append({'page': p, 'col': col, **vd,
                                  'confidence': 'cross-column',
                                  'opus': fl['opus'], 'genie': fl['genie'],
                                  'llama': fl['llama']})
                    continue
                if vd['confidence'] != 'high':
                    queue.append({'page': p, 'col': col, **vd,
                                  'opus': fl['opus'], 'genie': fl['genie'],
                                  'llama': fl['llama']})
                verdict = vd['verdict']
                if verdict == fl['opus']:
                    continue
                if le > ls:
                    a, b = offs[ls], offs[le - 1] + 1
                else:                      # pure insertion into the spine
                    a = b = offs[ls] if ls < len(offs) else len(text)
                text = text[:a] + _splice(text[a:b], verdict) + text[b:]
                edits += 1
        (outdir / f'page-{p:03d}-{col}.txt').write_text(
            text if text.endswith('\n') else text + '\n', encoding='utf-8')
    return edits, queue
