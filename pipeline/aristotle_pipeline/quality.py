"""Text checks that report likely source corruption."""

from __future__ import annotations

import unicodedata


# Flipped 2026-08-18 after the baseline pass: 848k tokens, 7 flagged (all
# classified crasis / rho-breathing), 0 unexpected — the one genuine hit
# (PA 689a12) was root-caused and fixed in PR #83.
HARD_GATE = True

BREATHINGS = {'̓', '̔'}          # smooth, rough
VOWELS = set('αειηιουωΑΕΗΙΟΥΩ')


def illegal_breathing(surface: str) -> bool:
    """True if a breathing sits past the opening vowel cluster.

    Lifted unchanged from ``analysis/studies/text_quality.py`` on
    ``origin/claude/greek-statistical-analysis-tihpcs``.
    """
    vowel_seen = 0
    for ch in unicodedata.normalize('NFD', surface):
        if unicodedata.combining(ch):
            if ch in BREATHINGS and vowel_seen > 2:
                return True
        elif ch.lower() in VOWELS:
            vowel_seen += 1
        elif ch.isalpha() and vowel_seen:
            vowel_seen += 99                # a consonant closes the opening cluster
    return False


_CRASIS_PREFIXES_NFD = tuple(
    unicodedata.normalize("NFD", prefix)
    for prefix in (
        "ἐγᾠ",  # ἐγώ + οἶδα/οἶμαι, without an accent on the fused vowel
        "ἐγᾦ",  # ἐγώ + οἶδα/οἶμαι, with the contracted circumflex
        "μεντἀ",  # μέντοι + ἄν
        "καλοκἀ",  # καλὸς καὶ ἀγαθός fused inside the compound (καλοκἀγαθία)
    )
)


def _is_crasis(surface: str) -> bool:
    normalized = unicodedata.normalize("NFD", surface)
    return normalized.startswith(_CRASIS_PREFIXES_NFD)


def _is_rho_breathing(surface: str) -> bool:
    """True if every breathing past the opening cluster sits on a rho.

    Medial ῤῥ is orthodox (ἐῤῥήθη, πυῤῥῷ) and this spine writes the rho
    breathing the detector otherwise flags; a breathing on a vowel is the
    corruption signature, one on rho never is.
    """
    vowel_seen = 0
    base = ""
    hits = 0
    for ch in unicodedata.normalize("NFD", surface):
        if unicodedata.combining(ch):
            if ch in BREATHINGS and vowel_seen > 2:
                if base not in ("ρ", "Ρ"):
                    return False
                hits += 1
        else:
            base = ch
            if ch.lower() in VOWELS:
                vowel_seen += 1
            elif ch.isalpha() and vowel_seen:
                vowel_seen += 99
    return hits > 0


def check_breathing(tokens, allowlist) -> dict:
    """Check ``{ref, surface}`` tokens and classify allowed detector hits."""
    allowed_pairs = {(entry["ref"], entry["surface"]) for entry in allowlist}
    flagged = []
    unexpected = []
    tokens_checked = 0

    for token in tokens:
        tokens_checked += 1
        ref = token["ref"]
        surface = token["surface"]
        if not illegal_breathing(surface):
            continue

        entry = {"ref": ref, "surface": surface, "allowed": False}
        if _is_crasis(surface):
            entry.update({"allowed": True, "reason": "crasis"})
        elif _is_rho_breathing(surface):
            entry.update({"allowed": True, "reason": "rho-breathing"})
        elif (ref, surface) in allowed_pairs:
            entry.update({"allowed": True, "reason": "allowlist"})
        else:
            unexpected.append({"ref": ref, "surface": surface})
        flagged.append(entry)

    check = {
        "tokens_checked": tokens_checked,
        "flagged": flagged,
        "unexpected": unexpected,
        "per_10k": 10000.0 * len(flagged) / tokens_checked if tokens_checked else 0.0,
        "ok": not unexpected,
    }
    report = {"checks": {"breathing_position": check}}
    report["ok"] = all(c.get("ok") for c in report["checks"].values())
    return report
