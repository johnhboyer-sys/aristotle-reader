"""Unicode Greek -> Beta Code lookup keys (lowercase, no '*').

Capitals map straight to lowercase base letters with their marks following
the letter, which sidesteps Diogenes' `*`-shuffling fallbacks entirely.
Output normalization mirrors Diogenes Perseus.pm do_parse:
  - barytone: grave becomes acute ('\\' -> '/')
  - final koronis / curly apostrophe becomes ASCII "'"
  - a second accent thrown back from an enclitic is dropped
Diaereses ('+') are KEPT here; stage 4 expands lookup variants from them.
"""

from __future__ import annotations

import re
import unicodedata

_BASE = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "h",
    "θ": "q", "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "c",
    "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "u",
    "φ": "f", "χ": "x", "ψ": "y", "ω": "w", "ϝ": "v",
}

_MARKS = {
    "̓": ")",   # smooth breathing / koronis
    "̔": "(",   # rough breathing
    "́": "/",   # acute
    "̀": "\\",  # grave
    "͂": "=",   # circumflex (perispomeni)
    "ͅ": "|",   # iota subscript
    "̈": "+",   # diaeresis
    "̄": "",    # macron: not in analyses keys
    "̆": "",    # breve: not in analyses keys
}

_APOSTROPHES = "'’᾽ʼ"  # ', ’, ᾽ (koronis), ʼ

_TWO_ACCENTS = re.compile(r"^(.*[/=].*)[/=]")


def to_beta_key(token: str) -> str:
    """Beta Code lookup key for a surface token (Greek letters plus an
    optional trailing elision apostrophe)."""
    out = []
    for ch in unicodedata.normalize("NFD", token):
        if ch in _APOSTROPHES:
            out.append("'")
            continue
        low = ch.lower()
        if low in _BASE:
            out.append(_BASE[low])
            continue
        if ch in _MARKS:
            out.append(_MARKS[ch])
            continue
        raise ValueError(f"cannot transliterate {ch!r} (U+{ord(ch):04X}) in {token!r}")
    key = "".join(out)
    key = key.replace("\\", "/")  # barytone -> oxytone
    # Drop the second accent when an enclitic threw its accent back
    # (a)/nqrwpo/s tis -> a)/nqrwpos).
    key = _TWO_ACCENTS.sub(r"\1", key)
    return key


_INITIAL = re.compile(r"^([a-z])([()/\\=|+]*)")


def capital_key(key: str) -> str:
    """Beta Code capital form: '*' prefix with the initial letter's marks
    moved before the letter (h(ra/kleitos -> *(hra/kleitos)."""
    m = _INITIAL.match(key)
    if not m:
        return "*" + key
    letter, marks = m.groups()
    return "*" + marks + letter + key[m.end():]


def lookup_variants(key: str, capitalized: bool = False) -> list[str]:
    """Candidate analyses keys to try, in order. Words printed with a
    diaeresis are keyed under the underlying breathing in greek-analyses.txt
    (pro+i/ento is keyed proi(/ento), so expand '+' accordingly. Proper
    names exist only under their '*'-prefixed capital keys."""
    variants = [key]
    if "+" in key:
        variants.append(key.replace("+", ""))
        variants.append(key.replace("+", "("))
        variants.append(key.replace("+", ")"))
    if capitalized:
        variants.extend(capital_key(v) for v in list(variants))
    return variants
