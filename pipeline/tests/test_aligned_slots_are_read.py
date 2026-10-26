"""Every gloss-aligned translation must reach the build. A secondary or third
slot reads alignment-results/<vid>/<WORK>_<vid>_gloss_map.json itself; a primary
(the archive path) reads only `anchors:` (sources/<dir>/anchors.yaml, made by
tools/gloss_map_to_anchors.py). Meta-public.yaml promoted Ross to primary
without one, so the public site showed none of Meta's 14 aligned books."""
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]


def aligned_slots():
    for f in sorted((REPO / "manifests").glob("*.yaml")):
        m = yaml.safe_load(f.read_text(encoding="utf-8"))
        work = m["work"]["id"]
        for slot, cfg in (m.get("english") or {}).items():
            if not isinstance(cfg, dict) or not cfg.get("id"):
                continue
            vid = cfg["id"]
            if (REPO / "alignment-results" / vid / f"{work}_{vid}_gloss_map.json").exists():
                yield f.name, slot, cfg


def test_the_check_sees_aligned_works():
    assert len(list(aligned_slots())) >= 20


def test_an_aligned_primary_declares_its_anchors():
    gaps = [f"{name}: {cfg['id']}" for name, slot, cfg in aligned_slots()
            if slot == "primary" and not cfg.get("anchors")]
    assert gaps == []


def test_declared_anchors_exist():
    # gated translations (Ackrill) are gitignored and absent outside John's machine
    present = [(n, c) for n, _, c in aligned_slots() if (REPO / "sources" / c.get("dir", "")).is_dir()]
    missing = [f"{name}: {cfg['anchors']}" for name, cfg in present
               if cfg.get("anchors") and not (REPO / "sources" / cfg["anchors"]).exists()]
    assert missing == []
