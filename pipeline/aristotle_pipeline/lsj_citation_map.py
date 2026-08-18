"""Map LSJ's Aristotle work numbers to reader work IDs."""

from __future__ import annotations

from .refs import column_key


# Keys are LSJ's Perseus-canon work numbers, not manifest ``tlg_work`` values.
CITATION_WORKS: dict[str, str | list[tuple[str, str, str]]] = {
    "001": [  # verified against LSJ 2026-08-18
        ("APr", "24a", "70b"),
        ("APo", "71a", "100b"),
    ],
    "002": "DA",  # verified against LSJ 2026-08-18
    "004": "Aud",  # verified against LSJ 2026-08-18
    "005": "Cael",  # verified against LSJ 2026-08-18
    "006": "Cat",  # verified against LSJ 2026-08-18
    "007": "Col",  # verified against LSJ 2026-08-18
    "008": "DivSomn",  # verified against LSJ 2026-08-18
    "009": "EE",  # verified against LSJ 2026-08-18
    "010": "EN",  # verified against LSJ 2026-08-18
    "012": "GA",  # verified against LSJ 2026-08-18
    "013": "GC",  # verified against LSJ 2026-08-18
    "014": "HA",  # verified against LSJ 2026-08-18
    "015": "IA",  # verified against LSJ 2026-08-18
    "016": "Insomn",  # verified against LSJ 2026-08-18
    "017": "Int",  # verified against LSJ 2026-08-18
    "018": "Juv",  # verified against LSJ 2026-08-18
    "019": "Lin",  # verified against LSJ 2026-08-18
    "020": "Long",  # verified against LSJ 2026-08-18
    "021": "MA",  # verified against LSJ 2026-08-18
    "023": "Mech",  # verified against LSJ 2026-08-18
    "024": "Mem",  # verified against LSJ 2026-08-18
    "025": "Meta",  # verified against LSJ 2026-08-18
    "026": "Mete",  # verified against LSJ 2026-08-18
    "027": "Mirab",  # verified against LSJ 2026-08-18
    "028": "DM",  # verified against LSJ 2026-08-18
    "029": "Oec",  # verified against LSJ 2026-08-18
    "030": "PA",  # verified against LSJ 2026-08-18
    "031": "Phys",  # verified against LSJ 2026-08-18
    "032": "Phgn",  # verified against LSJ 2026-08-18
    "034": "Poet",  # verified against LSJ 2026-08-18
    "035": "Pol",  # verified against LSJ 2026-08-18
    "038": "Rhet",  # verified against LSJ 2026-08-18
    "039": "SE",  # verified against LSJ 2026-08-18
    "041": "Sens",  # verified against LSJ 2026-08-18
    "042": "Somn",  # verified against LSJ 2026-08-18
    "044": "Top",  # verified against LSJ 2026-08-18
    "045": "VV",  # verified against LSJ 2026-08-18
    "046": "Vent",  # verified against LSJ 2026-08-18
    "047": "MXG",  # verified against LSJ 2026-08-18
}


def resolve_citation(tlg_work: str, column: str) -> str | None:
    target = CITATION_WORKS.get(tlg_work)
    if isinstance(target, str):
        return target
    if target is None:
        return None

    try:
        key = column_key(column)
    except ValueError:
        return None
    for work_id, first, last in target:
        if column_key(first) <= key <= column_key(last):
            return work_id
    return None
