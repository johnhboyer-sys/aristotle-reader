"""Offline quotation matcher: lemma-stream n-grams against external authors.

Matching is on dictionary lemmata, never on surface forms and never on
accent-stripped folds. Stage 6/8 fold streams (build/ngrams/<work>.json)
collapse ἀλλά/ἄλλα; they are not used as match keys.

Aristotle side: build/<work>/lemma_stream.json if present, else
build/dist/<work>/book-*.json tokens joined to analyses.json (token key →
first lemma). Each item keeps (work, column, line, position).

External side: the same Diogenes export as stage1_greek.run_export (via
word_distinctiveness.export_author), tokenized with stage3, elision
normalized first, lemmatized by a single streaming pass over
greek-analyses.txt.

Score = 3 × content-lemma count (stage8 fold_lemma spots closed-class
words). Four content lemmata score 12 and clear the default floor of 10;
function-heavy runs do not.

Ambiguous analyses take the first lemma on both the Aristotle and
external streams, so a given surface key resolves identically in both
corpora. That biases toward false matches rather than misses; the review
pass absorbs the false ones.
"""

from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Iterable, NamedTuple

from ..beta import lookup_variants, to_beta_key
from ..config import BUILD_DIR, Manifest
from ..stage3_tokenize import tokenize
from ..stage4_morphology import parse_analysis_line
from ..stage6_search import fold_lemma
from .quotation_readers import guess_reader
from .tlg_canon import is_testimonia, parse_work_titles
from .word_distinctiveness import EXPORT_DIR, export_author

# Verify every id against DOCCAN2 before a disc run. Some of these may be
# wrong; an id whose export is empty fails the run.
PILOT_AUTHORS = {
    "0012": "Homer",
    "0020": "Hesiod",
    "0059": "Plato",
    "1342": "Empedocles",
    "1562": "Parmenides",
    "0626": "Heraclitus",  # of Ephesus, 6-5 B.C. (1413/1414/1784 are later Heracliti)
    "0267": "Xenophanes",  # 1252 is the Certamen Homeri et Hesiodi, not Xenophanes
    "0033": "Pindar",
    "0006": "Euripides",
    "0011": "Sophocles",
    "0085": "Aeschylus",
}

DEFAULT_N = 4
N_MIN, N_MAX = 3, 6
SOURCE_TEXT_MAX = 200
CANDIDATES_DIR = BUILD_DIR / "offline" / "quotation_candidates"

# Parent survey's elision marks. U+1FBF and U+1FFD are the ones
# to_beta_key misses (beta.py rejects them, so tokens lose keys).
ELISION_MARKS = ("\u02bc", "\u2019", "\u0027", "\u1fbd", "\u1fbf", "\u1ffd")

# fold_lemma of closed-class words. Used only for scoring, never for matching.
FUNCTION_FOLDS = {
    "o", "h", "to", "kai", "de", "men", "te", "en", "eis", "es", "ek", "ec",
    "gar", "oun", "alla", "ou", "mh", "ge", "dh", "an", "ei", "ws", "oti",
    "pros", "dia", "epi", "apo", "kata", "meta", "peri", "upo", "uper",
    "sun", "cun", "nun", "per", "ara", "au",
    "egw", "eme", "emou", "moi", "me",
    "su", "se", "sou", "soi",
    "hmeis", "hmas", "hmin", "hmewn",
    "umeis", "umas", "umin", "umwn",
    "autos", "auth", "auto",
    "outos", "touto", "tauta",
    "ode", "hde", "tode",
    "ekeinos",
    "tis", "ti",
    "oios", "toios", "toioutos",
    "osos", "tosos", "tosoutos",
    "os", "ostis",
    "oudeis", "mhdeis",
}

_WORK_FILE = re.compile(r"^tlg(\d{4})(\d{3})\.xml$")
_DIGIT_N = re.compile(r"^\d+$")


class Token(NamedTuple):
    lemma: str
    work: str
    column: str
    line: int
    position: int
    text: str
    loc: str = ""
    author_id: str = ""
    author_name: str = ""
    work_tlg: str = ""


def normalize_elision(text: str) -> str:
    """Map every elision mark onto ASCII apostrophe before beta-keying."""
    for mark in ELISION_MARKS:
        text = text.replace(mark, "'")
    return text


def surface_key(token: str) -> str:
    """Beta-code key after elision normalization. Same mark → same key."""
    return to_beta_key(normalize_elision(token))


def is_function_lemma(lemma: str) -> bool:
    return fold_lemma(lemma) in FUNCTION_FOLDS


def allowed_errors(length: int) -> int:
    """1 gap/substitution per 6 lemmata."""
    return length // 6


def score_run(lemmata: Iterable[str]) -> int:
    """3 × content-lemma count. All-function runs score 0."""
    content = sum(1 for lem in lemmata if not is_function_lemma(lem))
    return 3 * content


def _in_range(seq: list[str], idx: int) -> bool:
    return 0 <= idx < len(seq)


def _walk(ari: list[str], ext: list[str], i: int, j: int, step: int) -> list[tuple[int, int, int]]:
    points = [(i, j, 0)]
    errors = 0
    while True:
        ni, nj = i + step, j + step
        ari_ok, ext_ok = _in_range(ari, ni), _in_range(ext, nj)
        if ari_ok and ext_ok and ari[ni] == ext[nj]:
            i, j = ni, nj
            points.append((i, j, errors))
            continue
        ni2, nj1 = i + 2 * step, j + step
        if _in_range(ari, ni2) and _in_range(ext, nj1) and ari[ni2] == ext[nj1]:
            errors += 1
            i, j = ni2, nj1
            points.append((i, j, errors))
            continue
        ni1, nj2 = i + step, j + 2 * step
        if _in_range(ari, ni1) and _in_range(ext, nj2) and ari[ni1] == ext[nj2]:
            errors += 1
            i, j = ni1, nj2
            points.append((i, j, errors))
            continue
        if ari_ok and ext_ok:
            # Substitution: consume it as an internal error, never an endpoint.
            errors += 1
            i, j = ni, nj
            length = abs(i - points[0][0]) + 1
            if errors > allowed_errors(length) + 1:
                break
            continue
        if ari_ok or ext_ok:
            # Legal gap at a stream boundary — join the leftover token.
            errors += 1
            if ari_ok:
                i = ni
            else:
                j = nj
            length = abs(i - points[0][0]) + 1
            if errors > allowed_errors(length) + 1:
                break
            points.append((i, j, errors))
            continue
        break
    return points


def _trim_terminal_errors(
    ari: list[str], ext: list[str], a_lo: int, a_hi: int, e_lo: int, e_hi: int,
) -> tuple[int, int, int, int]:
    """Drop leading/trailing substitutions so a span ends on exact matches.

    Only equal-length tails are substitutions. A length mismatch is a gap
    (the leftover token at a stream boundary) and stays.
    """
    while a_hi - a_lo == e_hi - e_lo and a_lo < a_hi:
        if ari[a_lo] != ext[e_lo]:
            a_lo += 1
            e_lo += 1
            continue
        if ari[a_hi - 1] != ext[e_hi - 1]:
            a_hi -= 1
            e_hi -= 1
            continue
        break
    return a_lo, a_hi, e_lo, e_hi


def _extend(ari: list[str], i0: int, ext: list[str], j0: int, n: int) -> tuple[int, int, int, int] | None:
    left = _walk(ari, ext, i0, j0, -1)
    right = _walk(ari, ext, i0, j0, 1)
    best: tuple[int, int, int, int] | None = None
    best_len = 0
    for al, el, e_left in left:
        for ar, er, e_right in right:
            if al <= ar:
                a_lo, a_hi, e_lo, e_hi = al, ar, el, er
            else:
                a_lo, a_hi, e_lo, e_hi = ar, al, er, el
            a_lo, a_hi_ex, e_lo, e_hi_ex = _trim_terminal_errors(
                ari, ext, a_lo, a_hi + 1, e_lo, e_hi + 1,
            )
            length = a_hi_ex - a_lo
            if length < n or e_left + e_right > allowed_errors(length):
                continue
            if length > best_len:
                best_len = length
                best = (a_lo, a_hi_ex, e_lo, e_hi_ex)
    return best


def _maximal(runs: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    ordered = sorted(runs, key=lambda r: (r[1] - r[0], r[3] - r[2]), reverse=True)
    kept: list[tuple[int, int, int, int]] = []
    for run in ordered:
        a_lo, a_hi, e_lo, e_hi = run
        if any(a_lo >= k[0] and a_hi <= k[1] and e_lo >= k[2] and e_hi <= k[3] for k in kept):
            continue
        kept.append(run)
    return kept


def find_runs(ari: list[str], ext: list[str], n: int = DEFAULT_N) -> list[tuple[int, int, int, int]]:
    """Maximal lemma runs. Returns (a_lo, a_hi, e_lo, e_hi) exclusive.

    A run is >= n consecutive Aristotle lemmata aligned to an external run,
    allowing 1 gap or substitution per 6 lemmata. Seeds are content-word
    equalities plus exact n-grams (so a run of articles is still found, then
    down-weighted).
    """
    if not N_MIN <= n <= N_MAX:
        raise ValueError(f"n must be {N_MIN}-{N_MAX}, got {n}")
    if len(ari) < n or len(ext) < n:
        return []

    seeds: list[tuple[int, int]] = []
    index: dict[str, list[int]] = defaultdict(list)
    for j, lem in enumerate(ext):
        if not is_function_lemma(lem):
            index[lem].append(j)
    for i, lem in enumerate(ari):
        if is_function_lemma(lem):
            continue
        for j in index.get(lem, ()):
            seeds.append((i, j))

    grams: dict[tuple[str, ...], list[int]] = defaultdict(list)
    for j in range(len(ext) - n + 1):
        grams[tuple(ext[j:j + n])].append(j)
    for i in range(len(ari) - n + 1):
        gram = tuple(ari[i:i + n])
        for j in grams.get(gram, ()):
            seeds.append((i, j))

    seen: set[tuple[int, int, int, int]] = set()
    runs: list[tuple[int, int, int, int]] = []
    for i, j in seeds:
        run = _extend(ari, i, ext, j, n)
        if run and run not in seen:
            seen.add(run)
            runs.append(run)
    return _maximal(runs)


def find_candidates(
    aristotle: list[Token],
    external: list[Token],
    n: int = DEFAULT_N,
) -> list[dict]:
    """Score and serialize maximal runs between two token streams."""
    if not aristotle or not external:
        return []
    ari_lemmas = [t.lemma for t in aristotle]
    ext_lemmas = [t.lemma for t in external]
    out = []
    for a_lo, a_hi, e_lo, e_hi in find_runs(ari_lemmas, ext_lemmas, n):
        a_span = aristotle[a_lo:a_hi]
        e_span = external[e_lo:e_hi]
        lemmata = [t.lemma for t in a_span]
        first, last = a_span[0], a_span[-1]
        src = e_span[0]
        guess = guess_reader(src.author_id, src.author_name, src.work_tlg, src.loc)
        source_text = " ".join(t.text for t in e_span)
        if len(source_text) > SOURCE_TEXT_MAX:
            source_text = source_text[: SOURCE_TEXT_MAX - 1] + "…"
        out.append({
            "column": first.column,
            "lo": first.line,
            "hi": last.line,
            "matched_lemmata": lemmata,
            "aristotle_text": " ".join(t.text for t in a_span),
            "source_author": src.author_name,
            "source_work": src.work,
            "source_loc": src.loc,
            "source_text": source_text,
            "score": score_run(lemmata),
            "cite": guess["cite"],
            "url": guess["url"],
        })
    out.sort(key=lambda row: (-row["score"], row["column"], row["lo"], row["source_loc"]))
    return out


def _load_custom_stream(path: Path, work: str) -> list[Token]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    stream = []
    for row in rows:
        lemma = row.get("lemma") or ""
        if not lemma:
            continue
        stream.append(Token(
            lemma=lemma,
            work=work,
            column=str(row["column"]),
            line=int(row["line"]),
            position=int(row.get("position") or 0),
            text=row.get("text") or "",
        ))
    if not stream:
        raise ValueError(f"empty lemma stream in {path}")
    return stream


def load_aristotle_stream(work: str) -> list[Token]:
    """Unfolded first-lemma stream with Bekker coordinates.

    Prefers build/<work>/lemma_stream.json. Does not read build/ngrams/
    (those are stage8 folds). Falls back to dist book tokens + analyses.

    Ambiguous keys take analyses[key][0], the same first-lemma rule
    scan_lemmas uses on the external side. Identical resolution in both
    corpora biases toward false matches rather than misses; review absorbs
    them.
    """
    custom = BUILD_DIR / work / "lemma_stream.json"
    if custom.is_file():
        return _load_custom_stream(custom, work)

    dist = BUILD_DIR / "dist" / work
    analyses_path = dist / "analyses.json"
    if not analyses_path.is_file():
        raise FileNotFoundError(
            f"no per-work analyses for {work}: {analyses_path} — build the work first"
        )
    analyses = json.loads(analyses_path.read_text(encoding="utf-8"))
    books = sorted(dist.glob("book-*.json"))
    if not books:
        raise FileNotFoundError(f"no book-*.json in {dist}")

    stream: list[Token] = []
    for book_path in books:
        book = json.loads(book_path.read_text(encoding="utf-8"))
        for seg in book.get("segments") or []:
            column = seg["column"]
            for line in seg.get("greek") or []:
                n = int(line["n"])
                for pos, tok in enumerate(line.get("tokens") or []):
                    key = tok.get("k")
                    if not key:
                        continue
                    entries = analyses.get(key) or []
                    if not entries:
                        continue
                    lemma = entries[0].get("lemma") or ""
                    if not lemma:
                        continue
                    stream.append(Token(
                        lemma=lemma,
                        work=work,
                        column=column,
                        line=n,
                        position=pos,
                        text=tok.get("t") or "",
                    ))
    if not stream:
        raise FileNotFoundError(f"empty Aristotle lemma stream for {work}")
    return stream


_SKIP_LINE_TAGS = {"note", "bibl"}


def _skip_line_element(elem: ET.Element) -> bool:
    tag = _local(elem.tag)
    if tag in _SKIP_LINE_TAGS:
        return True
    return tag == "hi" and (elem.get("rend") or "").lower() == "small"


def _line_text(el: ET.Element) -> str:
    """Flatten an export <l>, dropping apparatus / testimonia.

    Fragment editions cite Aristotle inside <hi rend="small"> (and
    note/bibl). Those notes must not enter the lemma stream or the
    matcher will match Aristotle against editors' citations of him.
    """
    def collect(elem: ET.Element) -> str:
        if _skip_line_element(elem):
            return ""
        parts = [elem.text or ""]
        for child in elem:
            if _skip_line_element(child):
                parts.append(child.tail or "")
                continue
            parts.append(collect(child))
            parts.append(child.tail or "")
        return "".join(parts)

    text = collect(el)
    return re.sub(r"\s+", " ", text.replace("|", "")).strip()


def _local(tag: str) -> str:
    return tag.split("}", 1)[-1]


def iter_export_lines(path: Path) -> list[dict]:
    """Walk a Diogenes verse-mode export, keeping book/page/fragment loc."""
    tree = ET.parse(str(path))
    lines: list[dict] = []

    def walk(elem: ET.Element, book: str, page: str, section: str, fragment: str) -> None:
        tag = _local(elem.tag)
        if tag == "div":
            typ = elem.get("type") or ""
            n = elem.get("n") or ""
            if typ == "Book":
                book = n
            elif typ == "Stephanus-page":
                page = n
            elif typ == "section":
                section = n
            elif typ == "Fragment":
                fragment = n
        elif tag == "l":
            n = elem.get("n") or ""
            if _DIGIT_N.fullmatch(n):
                if page and section:
                    loc = f"{page}{section}"
                elif book:
                    loc = f"{book}.{n}"
                elif fragment:
                    loc = fragment
                else:
                    loc = n
                lines.append({"n": int(n), "text": _line_text(elem), "loc": loc})
        for child in elem:
            walk(child, book, page, section, fragment)

    walk(tree.getroot(), "", "", "", "")
    return lines


def tokenize_export(path: Path, work_id: str) -> tuple[dict, list[str]]:
    """Stage3-tokenize an export after elision normalization. Returns tokens + locs."""
    raw = iter_export_lines(path)
    if not raw:
        raise ValueError(f"no line elements in {path}")
    locs: list[str] = []
    spine_lines = []
    for row in raw:
        text = normalize_elision(row["text"])
        spine_lines.append({"n": row["n"], "text": text})
        locs.append(row["loc"])
    spine = {
        "work": work_id,
        "segments": [{
            "id": work_id,
            "book": 1,
            "column": work_id,
            "lines": spine_lines,
        }],
    }
    tokens, _, _ = tokenize(spine)
    return tokens, locs


def _collect_form_keys(tokens_doc: dict) -> tuple[set[str], dict[str, bool]]:
    needed: set[str] = set()
    capitalized: dict[str, bool] = {}
    for seg in tokens_doc["segments"]:
        for line in seg["lines"]:
            for tok in line["tokens"]:
                key = tok.get("k")
                if not key:
                    continue
                cap = tok["t"][:1].isupper()
                capitalized[key] = capitalized.get(key, False) or cap
                needed.update(lookup_variants(key, cap))
    return needed, capitalized


def scan_lemmas(path: Path, needed: set[str]) -> dict[str, str]:
    """Streaming greek-analyses.txt pass: key → first lemma.

    Ambiguous keys (multiple analyses) take the first lemma, matching
    load_aristotle_stream's analyses[key][0] rule. Both corpora therefore
    resolve a given key identically, which biases toward false matches
    rather than misses; the review pass absorbs those.
    """
    found: dict[str, str] = {}
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            key, tab, value = line.partition("\t")
            if tab and key in needed and key not in found:
                entries = parse_analysis_line(value)
                if entries and entries[0].get("lemma"):
                    found[key] = entries[0]["lemma"]
    return found


def resolve_lemma(key: str, capitalized: bool, found: dict[str, str]) -> str | None:
    for variant in lookup_variants(key, capitalized):
        if variant in found:
            return found[variant]
    return None


def tokens_to_stream(
    tokens_doc: dict,
    locs: list[str],
    found: dict[str, str],
    capitalized: dict[str, bool],
    author_id: str,
    author_name: str,
    work_tlg: str,
    work_label: str,
) -> list[Token]:
    stream: list[Token] = []
    lines = tokens_doc["segments"][0]["lines"]
    if len(lines) != len(locs):
        raise ValueError(
            f"{work_label}: tokenized line count {len(lines)} != loc count {len(locs)}"
        )
    for line, loc in zip(lines, locs):
        for pos, tok in enumerate(line["tokens"]):
            key = tok.get("k")
            if not key:
                continue
            lemma = resolve_lemma(key, capitalized.get(key, False), found)
            if not lemma:
                continue
            stream.append(Token(
                lemma=lemma,
                work=work_label,
                column=loc,
                line=int(line["n"]),
                position=pos,
                text=tok.get("t") or "",
                loc=loc,
                author_id=author_id,
                author_name=author_name,
                work_tlg=work_tlg,
            ))
    return stream


def load_external_streams(manifest: Manifest, authors: dict[str, str] | None = None) -> dict[str, list[Token]]:
    authors = authors or PILOT_AUTHORS
    tlg_dir = manifest.tlg_dir()
    server = manifest.diogenes_server()
    analyses_path = manifest.diogenes_data() / "greek-analyses.txt"
    if not tlg_dir.is_dir():
        raise FileNotFoundError(f"TLG disc not found: {tlg_dir}")
    if not (server / "xml-export.pl").is_file():
        raise FileNotFoundError(f"Diogenes exporter missing: {server / 'xml-export.pl'}")
    if not analyses_path.is_file():
        raise FileNotFoundError(f"greek-analyses.txt missing: {analyses_path}")

    canon_path = tlg_dir / "DOCCAN2.TXT"
    if not canon_path.is_file():
        raise FileNotFoundError(f"TLG canon missing: {canon_path}")
    work_titles = parse_work_titles(canon_path.read_bytes())

    pending: list[tuple[str, str, str, str, Path, dict, list[str]]] = []
    needed: set[str] = set()
    cap_all: dict[str, bool] = {}
    skipped_testimonia: list[str] = []
    for author_id, author_name in authors.items():
        paths = export_author(author_id, EXPORT_DIR, server, tlg_dir)
        if not paths:
            raise FileNotFoundError(
                f"TLG {author_id} ({author_name}): export produced no XML — "
                "verify this id against DOCCAN2 before running"
            )
        for path in paths:
            match = _WORK_FILE.match(path.name)
            if not match:
                continue
            work_tlg = match.group(2)
            title = work_titles.get((author_id, work_tlg), "")
            if is_testimonia(title):
                skipped_testimonia.append(f"{author_id}.{work_tlg} ({title})")
                continue
            work_label = f"{author_id}.{work_tlg}"
            tokens_doc, locs = tokenize_export(path, work_label)
            keys, cap = _collect_form_keys(tokens_doc)
            if not keys:
                raise ValueError(
                    f"TLG {author_id} ({author_name}) {path.name}: export is empty — "
                    "verify this id against DOCCAN2 before running"
                )
            needed.update(keys)
            for key, is_cap in cap.items():
                cap_all[key] = cap_all.get(key, False) or is_cap
            pending.append((author_id, author_name, work_tlg, work_label, path, tokens_doc, locs))

    if skipped_testimonia:
        # No silent caps: name what was dropped and why.
        print(f"skipped testimonia works (doxography, not source text): {', '.join(skipped_testimonia)}")

    found = scan_lemmas(analyses_path, needed)
    streams: dict[str, list[Token]] = {}
    for author_id, author_name, work_tlg, work_label, path, tokens_doc, locs in pending:
        stream = tokens_to_stream(
            tokens_doc, locs, found, cap_all,
            author_id, author_name, work_tlg, work_label,
        )
        if not stream:
            raise ValueError(
                f"TLG {author_id} ({author_name}) {path.name}: no lemmatized tokens — "
                "verify this id against DOCCAN2 before running"
            )
        streams[work_label] = stream
    return streams


def dist_works(dist_dir: Path | None = None) -> list[str]:
    root = dist_dir or (BUILD_DIR / "dist")
    works = []
    if not root.is_dir():
        raise FileNotFoundError(f"no dist dir: {root}")
    for path in sorted(root.iterdir()):
        if path.is_dir() and (path / "analyses.json").is_file() and any(path.glob("book-*.json")):
            works.append(path.name)
    if not works:
        raise FileNotFoundError(f"no built works in {root}")
    return works


def _pick_best(cluster: list[dict]) -> dict:
    return max(cluster, key=lambda row: (row["score"], row["hi"] - row["lo"]))


def dedup_clusters(rows: list[dict], min_score: int) -> list[dict]:
    """Collapse overlapping match windows to one candidate per site.

    find_candidates emits every qualifying window, so one quotation surfaces
    as a fan of shifted spans. Cluster only windows that share column,
    source author, source work, AND overlapping Aristotle lo/hi ranges.
    Distinct non-overlapping spans in the same column each survive. Keep
    each cluster's best-scoring window, tie-broken by the widest span.
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        if row["score"] < min_score:
            continue
        key = (row["column"], row["source_author"], row["source_work"])
        groups[key].append(row)

    kept: list[dict] = []
    for group in groups.values():
        ordered = sorted(group, key=lambda row: (row["lo"], row["hi"]))
        cluster: list[dict] = []
        cluster_hi = None
        for row in ordered:
            if cluster and row["lo"] <= cluster_hi:
                cluster.append(row)
                cluster_hi = max(cluster_hi, row["hi"])
            else:
                if cluster:
                    kept.append(_pick_best(cluster))
                cluster = [row]
                cluster_hi = row["hi"]
        if cluster:
            kept.append(_pick_best(cluster))
    return kept


def run(
    works: list[str] | None = None,
    n: int = DEFAULT_N,
    manifest: Manifest | None = None,
    authors: dict[str, str] | None = None,
    min_score: int = 10,
) -> list[Path]:
    if not N_MIN <= n <= N_MAX:
        raise ValueError(f"n must be {N_MIN}-{N_MAX}, got {n}")
    manifest = manifest or Manifest.load()
    works = works or dist_works()
    external = load_external_streams(manifest, authors)
    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for work in works:
        aristotle = load_aristotle_stream(work)
        rows: list[dict] = []
        for stream in external.values():
            rows.extend(find_candidates(aristotle, stream, n))
        rows = dedup_clusters(rows, min_score)
        rows.sort(key=lambda row: (-row["score"], row["column"], row["lo"], row["source_loc"]))
        out = CANDIDATES_DIR / f"{work}.json"
        out.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        written.append(out)
        print(f"{work}: {len(rows)} candidates → {out}")
    return written


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--works", nargs="+", default=None,
        help="Aristotle work slugs (default: every built work in build/dist)",
    )
    parser.add_argument("--n", type=int, default=DEFAULT_N, help="n-gram length (3-6, default 4)")
    parser.add_argument("--manifest", type=Path, help="manifest for Diogenes / TLG paths")
    parser.add_argument(
        "--min-score", type=int, default=10,
        help="drop candidate sites scoring below this (default 10)",
    )
    args = parser.parse_args(argv)
    if not N_MIN <= args.n <= N_MAX:
        parser.error(f"--n must be {N_MIN}-{N_MAX}")
    manifest = Manifest.load(args.manifest) if args.manifest else Manifest.load()
    for path in run(args.works, args.n, manifest, min_score=args.min_score):
        print(path)


if __name__ == "__main__":
    main()
