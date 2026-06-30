"""Safety gate for the shared (de-duplicated) LSJ dictionary.

After the per-work emit (stage 7) merges every work's LSJ entries into the
corpus-wide build/dist/lsj/<letter>.json, this checks the property the reader
relies on: EVERY LSJ key referenced by EVERY work's analyses.json resolves in
the shared shards. If any key is missing, a word popup would silently show no
dictionary entry — so this exits non-zero and names the gaps, and the deploy
must not proceed.

The letter-bucketing here mirrors the FRONT-END rule (app/src/lib/data.ts
`lsjShard`: skip a leading '*' capital marker, take the first ASCII [a-z], else
'_'), because that is the rule the reader uses to pick which shard file to fetch.

Run: uv run python -m aristotle_pipeline.verify_shared_lsj
"""

from __future__ import annotations

import json
import sys

from .config import BUILD_DIR


def front_end_shard(key: str) -> str:
    """Replicate app/src/lib/data.ts `lsjShard` exactly."""
    for ch in key:
        if ch == "*":
            continue
        if "a" <= ch <= "z":
            return ch
    return "_"


def main() -> int:
    dist = BUILD_DIR / "dist"
    shared = dist / "lsj"
    if not shared.is_dir():
        print(f"FAIL: shared LSJ dir missing: {shared}", file=sys.stderr)
        return 1

    # Load each shared shard once.
    shard_cache: dict[str, dict] = {}

    def shard_for(letter: str) -> dict:
        if letter not in shard_cache:
            f = shared / f"{letter}.json"
            shard_cache[letter] = (
                json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
            )
        return shard_cache[letter]

    analyses_files = sorted(
        p for p in dist.glob("*/analyses.json") if p.parent.name != "lsj"
    )
    if not analyses_files:
        print("FAIL: no <work>/analyses.json found under build/dist", file=sys.stderr)
        return 1

    total_keys = 0
    missing: dict[str, set[str]] = {}  # work -> missing keys
    for af in analyses_files:
        work = af.parent.name
        analyses = json.loads(af.read_text(encoding="utf-8"))
        seen: set[str] = set()
        for parses in analyses.values():
            for parse in parses:
                for key in parse.get("lsj", []):
                    if key in seen:
                        continue
                    seen.add(key)
                    total_keys += 1
                    if key not in shard_for(front_end_shard(key)):
                        missing.setdefault(work, set()).add(key)

    n_entries = sum(
        len(shard_for(f.stem)) for f in shared.glob("*.json")
    )
    print(
        f"Shared LSJ: {n_entries} entries across {len(list(shared.glob('*.json')))} "
        f"shards; checked {total_keys} referenced keys across {len(analyses_files)} works."
    )
    if missing:
        for work, keys in sorted(missing.items()):
            sample = ", ".join(sorted(keys)[:8])
            print(f"  MISSING in shared LSJ — {work}: {len(keys)} keys (e.g. {sample})",
                  file=sys.stderr)
        print(f"FAIL: {sum(len(k) for k in missing.values())} referenced LSJ keys "
              f"are not in the shared dictionary.", file=sys.stderr)
        return 1

    print("OK: every referenced LSJ key resolves in the shared dictionary.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
