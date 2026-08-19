"""Author → reader URL table for quotation review.

Unshipped. The client never sees these routes — curation writes an absolute
URL into pipeline/data/quotations/<work>.json.

Every builder below is a GUESS. The curator verifies by clicking the link in
the review tool and uses Accept-with-corrected-URL when the landing page is
wrong. Sibling routing was checked on this machine (2026-08-18) but is not
in this repo; re-check homer-reader / plato-reader before treating a guess
as settled.
"""

from __future__ import annotations

import re

HOMER_READER = "https://johnhboyer-sys.github.io/homer-reader"
PLATO_READER = "https://johnhboyer-sys.github.io/plato-reader"
PERSEUS_ABO = (
    "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:abo:tlg,{author},{work}:{loc}"
)

# TLG work number → homer-reader work id (iliad=001, odyssey=002).
HOMER_WORKS = {"001": "iliad", "002": "odyssey"}
HOMER_CITE = {"iliad": "Il.", "odyssey": "Od."}

# Major dialogues. Work ids are capitalized titles as the plato-reader
# serves them. Curator verifies — this table is a guess compiled from the
# sibling manifests on this machine (2026-08-18), not a live contract.
PLATO_WORKS = {
    "001": "Euthyphro",
    "002": "Apology",
    "003": "Crito",
    "004": "Phaedo",
    "005": "Cratylus",
    "006": "Theaetetus",
    "007": "Sophist",
    "008": "Statesman",
    "009": "Parmenides",
    "010": "Philebus",
    "011": "Symposium",
    "012": "Phaedrus",
    "013": "Alcibiades1",
    "014": "Alcibiades2",
    "018": "Charmides",
    "019": "Laches",
    "020": "Lysis",
    "021": "Euthydemus",
    "022": "Protagoras",
    "023": "Gorgias",
    "024": "Meno",
    "025": "HippiasMajor",
    "026": "HippiasMinor",
    "027": "Ion",
    "028": "Menexenus",
    "030": "Republic",
    "031": "Timaeus",
    "032": "Critias",
    "034": "Laws",
}
PLATO_CITE = {
    "Apology": "Ap.",
    "Crito": "Cri.",
    "Euthyphro": "Euthphr.",
    "Gorgias": "Grg.",
    "HippiasMajor": "Hp. mai.",
    "HippiasMinor": "Hp. mi.",
    "Laws": "Laws",
    "Meno": "Men.",
    "Parmenides": "Prm.",
    "Phaedo": "Phd.",
    "Phaedrus": "Phdr.",
    "Philebus": "Phlb.",
    "Protagoras": "Prt.",
    "Republic": "Rep.",
    "Sophist": "Soph.",
    "Statesman": "Plt.",
    "Symposium": "Symp.",
    "Theaetetus": "Tht.",
    "Timaeus": "Ti.",
}

# Page-initial book starts for the two multi-book dialogues the reader
# splits. Curator verifies. Other dialogues default to book 1.
_PLATO_BOOK_STARTS = {
    "Republic": [
        (1, "327a"),
        (2, "357a"),
        (3, "386a"),
        (4, "419a"),
        (5, "449a"),
        (6, "484a"),
        (7, "514a"),
        (8, "543a"),
        (9, "571a"),
        (10, "595a"),
    ],
    "Laws": [
        (1, "624a"),
        (2, "652a"),
        (3, "676a"),
        (4, "704a"),
        (5, "726a"),
        (6, "751a"),
        (7, "788a"),
        (8, "828a"),
        (9, "853a"),
        (10, "884a"),
        (11, "913a"),
        (12, "941a"),
    ],
}

_STEF = re.compile(r"^(\d+)([a-e])$", re.I)
_HOMER_LOC = re.compile(r"^(\d+)\.(\d+)$")


def _stef_key(col: str) -> tuple[int, str]:
    m = _STEF.fullmatch(col.strip())
    if not m:
        return (0, "")
    return (int(m.group(1)), m.group(2).lower())


def plato_book(work_id: str, loc: str) -> int:
    """Guess the plato-reader book number for a Stephanus loc. Curator verifies."""
    starts = _PLATO_BOOK_STARTS.get(work_id)
    if not starts:
        return 1
    key = _stef_key(loc)
    book = 1
    for n, start in starts:
        if _stef_key(start) <= key:
            book = n
        else:
            break
    return book


def guess_reader(author_id: str, author_name: str, work_tlg: str, loc: str) -> dict[str, str]:
    """Return {cite, author, url} for a match. URL is a guess for the curator.

    Homer (0012) → homer-reader. Plato (0059) → plato-reader when the work
    is in PLATO_WORKS. Everyone else → Perseus abo:tlg.
    """
    loc = (loc or "").strip()
    work_tlg = (work_tlg or "").zfill(3)

    if author_id == "0012" and work_tlg in HOMER_WORKS:
        slug = HOMER_WORKS[work_tlg]
        abbrev = HOMER_CITE[slug]
        m = _HOMER_LOC.fullmatch(loc)
        if m:
            book, line = m.group(1), m.group(2)
            cite = f"{abbrev} {book}.{line}"
            # homer-reader's loc grammar is "book.line" ("9.366", never
            # column:line) — verified against its shared/lib/search.ts.
            url = f"{HOMER_READER}/{slug}/book/{book}?loc={book}.{line}"
        else:
            cite = f"{abbrev} {loc}".strip()
            url = f"{HOMER_READER}/{slug}"
        return {"cite": cite, "author": author_name, "url": url}

    if author_id == "0059" and work_tlg in PLATO_WORKS:
        work_id = PLATO_WORKS[work_tlg]
        abbrev = PLATO_CITE.get(work_id, work_id)
        cite = f"{abbrev} {loc}".strip()
        book = plato_book(work_id, loc)
        url = f"{PLATO_READER}/{work_id}/book/{book}?loc={loc}"
        return {"cite": cite, "author": author_name, "url": url}

    perseus_loc = loc.replace(".", ":")
    url = PERSEUS_ABO.format(author=author_id, work=work_tlg, loc=perseus_loc)
    cite = f"{author_name} {loc}".strip()
    return {"cite": cite, "author": author_name, "url": url}
