"""One-off driver: gloss-align Edghill's Categories (the PRIMARY translation)
against the Greek spine, for review only.

`aristotle_pipeline.align`'s `default_target("Cat")` returns Taylor (the
manifest's `english.secondary`); we want Edghill (`english.primary`), so we
parse Edghill's prose ourselves and pass it as `target_prose`. Writes
`build/align/Cat_edghill_gloss_map.json` (+ _review.json). Touches nothing in
sources/.
"""

from aristotle_pipeline.align.aligner import align
from aristotle_pipeline.config import SOURCES_DIR, Manifest
from aristotle_pipeline.stage1_ross import parse_translation


def main():
    man = Manifest.for_work("Cat")
    primary = man.data["english"]["primary"]
    prose = parse_translation(
        SOURCES_DIR / primary["dir"],
        primary["books"],
        primary.get("chapter_marker", "number"),
    )
    summary = align(
        "Cat",
        version_id=primary["id"],          # "edghill"
        target_prose=prose,
        backend="lexical",
        books=[1],
        provider="gloss",
    )
    print(summary)


if __name__ == "__main__":
    main()
