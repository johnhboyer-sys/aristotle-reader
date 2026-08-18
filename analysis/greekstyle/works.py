"""The work registry: which TEI file holds each work, and what we think of it.

`status` records the scholarly consensus on authorship, and is used ONLY to
score the analysis after the fact -- never as an input to clustering. The
labels follow the standard handbooks (Ross, Barnes' Revised Oxford Translation
introduction, Flashar's Ueberweg):

  core      -- undisputed Aristotle
  disputed  -- authenticity seriously argued on both sides
  spurious  -- consensus against Aristotle's authorship

`editor` is the modern editor of the printed text, which is the main
confounding variable in the whole exercise.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Work:
    wid: str
    title: str
    xml: str
    status: str        # core | disputed | spurious
    editor: str
    group: str
    select: tuple = () # (subtype, value) div filter; () means the whole file


WORKS: list[Work] = [
    # --- logic (Organon).  tlg001 holds both Analytics, split by <div book=>. ---
    Work("APr",  "Prior Analytics",         "tlg0086.tlg001.1st1K-grc1.xml",   "core", "Bekker1837", "logic", ("book", "priora")),
    Work("APo",  "Posterior Analytics",     "tlg0086.tlg001.1st1K-grc1.xml",   "core", "Bekker1837", "logic", ("book", "posteriora")),
    Work("Top",  "Topics",                  "tlg0086.tlg044.1st1K-grc1.xml",   "core", "Bekker1837", "logic"),
    Work("SE",   "Sophistical Refutations", "tlg0086.tlg040.1st1K-grc1.xml",   "core", "Bekker1837", "logic"),
    # --- natural philosophy ---
    Work("Phys", "Physics",                 "tlg0086.tlg031.1st1K-grc1.xml",   "core", "Ross1960",   "physics"),
    Work("Cael", "On the Heavens",          "tlg0086.tlg005.1st1K-grc1.xml",   "core", "Prantl1881", "physics"),
    Work("GC",   "Generation & Corruption", "tlg0086.tlg013.1st1K-grc1.xml",   "core", "Forster",    "physics"),
    Work("Mete", "Meteorology",             "tlg0086.tlg026.1st1K-grc1.xml",   "core", "Bekker1837", "physics"),
    Work("DM",   "De Mundo",                "tlg0086.tlg028.perseus-grc2.xml", "spurious", "Bekker1837", "spuria"),
    # --- psychology and the Parva Naturalia ---
    Work("DA",   "De Anima",                "tlg0086.tlg002.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("Sens", "Sense and Sensibilia",    "tlg0086.tlg041.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("Mem",  "On Memory",               "tlg0086.tlg024.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("Somn", "On Sleep",                "tlg0086.tlg042.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("Insomn","On Dreams",              "tlg0086.tlg016.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("DivSomn","Divination in Sleep",   "tlg0086.tlg008.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("Long", "Length of Life",          "tlg0086.tlg020.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("Juv",  "Youth, Life, Respiration","tlg0086.tlg918.1st1K-grc1.xml",   "core", "Bekker1837", "psych"),
    Work("Spir", "De Spiritu",              "tlg0086.tlg043.1st1K-grc1.xml",   "spurious", "Jaeger1913", "spuria"),
    # --- biology ---
    Work("HA",   "History of Animals",      "tlg0086.tlg014.1st1K-grc1.xml",   "core", "Bekker1837", "bio"),
    Work("PA",   "Parts of Animals",        "tlg0086.tlg030.1st1K-grc1.xml",   "core", "Langkavel1868", "bio"),
    Work("MA",   "Movement of Animals",     "tlg0086.tlg021.1st1K-grc1.xml",   "disputed", "Jaeger1913", "bio"),
    Work("IA",   "Progression of Animals",  "tlg0086.tlg015.1st1K-grc1.xml",   "core", "Jaeger1913", "bio"),
    Work("GA",   "Generation of Animals",   "tlg0086.tlg012.1st1K-grc1.xml",   "core", "Bekker1837", "bio"),
    # --- the pseudo-Aristotelian minor works ---
    Work("Col",  "On Colours",              "tlg0086.tlg007.1st1K-grc1.xml",   "spurious", "Bekker1837", "spuria"),
    Work("Aud",  "De Audibilibus",          "tlg0086.tlg004.1st1K-grc1.xml",   "spurious", "Bekker1837", "spuria"),
    Work("Phgn", "Physiognomonics",         "tlg0086.tlg032.1st1K-grc1.xml",   "spurious", "Bekker1837", "spuria"),
    Work("Mirab","De Mirabilibus",          "tlg0086.tlg027.1st1K-grc1.xml",   "spurious", "Bekker1837", "spuria"),
    Work("Mech", "Mechanica",               "tlg0086.tlg023.1st1K-grc1.xml",   "spurious", "Bekker1837", "spuria"),
    Work("Lin",  "On Indivisible Lines",    "tlg0086.tlg019.1st1K-grc1.xml",   "spurious", "Bekker1837", "spuria"),
    Work("Vent", "Situations of Winds",     "tlg0086.tlg046.1st1K-grc1.xml",   "spurious", "Bekker1837", "spuria"),
    Work("MXG",  "Melissus Xenophanes Gorgias","tlg0086.tlg047.1st1K-grc1.xml","spurious", "Bekker1837", "spuria"),
    # --- metaphysics ---
    Work("Meta", "Metaphysics",             "tlg0086.tlg025.perseus-grc2.xml", "core", "Ross1924", "meta"),
    # --- ethics, politics, rhetoric ---
    Work("EN",   "Nicomachean Ethics",      "tlg0086.tlg010.perseus-grc2.xml", "core", "Bywater1894", "ethics"),
    Work("EE",   "Eudemian Ethics",         "tlg0086.tlg009.perseus-grc2.xml", "core", "Susemihl1884", "ethics"),
    Work("VV",   "Virtues and Vices",       "tlg0086.tlg045.perseus-grc2.xml", "spurious", "Bekker1831", "spuria"),
    Work("Pol",  "Politics",                "tlg0086.tlg035.perseus-grc2.xml", "core", "Ross1957", "ethics"),
    Work("Oec",  "Oeconomica",              "tlg0086.tlg029.perseus-grc2.xml", "spurious", "Armstrong", "spuria"),
    Work("Rhet", "Rhetoric",                "tlg0086.tlg038.perseus-grc2.xml", "core", "Ross1959", "rhet"),
    Work("Poet", "Poetics",                 "tlg0086.tlg034.perseus-grc2.xml", "core", "Kassel1965", "rhet"),
]

BY_ID = {w.wid: w for w in WORKS}

# The Ethics common books: EN V-VII == EE IV-VI. Every modern editor prints them
# in the Nicomachean Ethics, so in this corpus they sit inside Bywater's EN file
# and can be sliced out by Bekker column -- which is exactly what makes the
# comparison against the rest of the EN free of any edition confound.
COMMON_BOOKS = ("1129a", "1154b")
COMMON_BOOK_NUMS = ("5", "6", "7")


def load_work(w: "Work"):
    """Token stream for one work, applying its div selector."""
    from .corpus import load_tokens, SOURCES
    toks = load_tokens(SOURCES / w.xml)
    if w.select:
        sub, val = w.select
        toks = [t for t in toks if t.get(sub) == val]
    return toks
