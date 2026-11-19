"""Alignment prompt v3: prompt v2 plus a literal crib (2026-11-19).

The crib (crib/crib-<ch>.json) is an Opus subagent's word-for-word rendering of
the Greek, written blind to every translation and to John's rulings. Everything
else is v2 word for word, so a change in score is the crib's doing.
"""
from prompt_v2 import INSTRUCTIONS as V2, SCHEMA  # noqa: F401  (SCHEMA re-exported)

CRIB = """LITERAL CRIB. Each Greek token below comes with a crib: the English a word-for-word rendering would use for it here, most literal first, with near synonyms. Use it as the yardstick for Literal: an English word in the translation that renders the unit with the meaning the crib gives (the crib's word, one of its synonyms, or another form of one) is Literal. English that carries the unit only through a construction or frame the crib does not contain is Loose. The crib is a guide, not the answer: the translator may choose a synonym the crib lacks, which is still Literal, and rules 1-3 still decide possessive articles, named subjects and the infinitive's "to". A crib entry marked "with <id>" belongs to a two-token construction; put the two in one unit. A word-for-word rendering of the whole passage follows the tokens."""

INSTRUCTIONS = V2.replace("\n\nReturn JSON:", "\n\n" + CRIB + "\n\nReturn JSON:")
assert INSTRUCTIONS != V2


ARTICLES = {"ὁ", "ἡ", "τό", "τὸ", "οἱ", "αἱ", "τά", "τὰ", "τοῦ", "τῆς", "τῷ", "τῇ", "τῶν", "τοῖς", "ταῖς", "τόν", "τὸν", "τήν", "τὴν", "τούς", "τοὺς", "τάς", "τὰς"}


def unit_pair(form, other):
    """Show the crib's pair only where John's unit rules make one: an article
    with its noun, or εἰ … καί. The crib also paired ἄν with its optative and
    μὲν with οὖν, which John keeps as separate units."""
    return bool({form, other} & ARTICLES) or {form, other} == {"εἰ", "καὶ"}


def prompt(d, title, crib):
    form_of = dict(d["greek"])
    greek_text = "\n".join(f"{k}: {v}" for k, v in d["lines"].items())
    def line(gid, form):
        c = crib["tokens"][gid]
        g = " / ".join(c["gloss"]) if c["gloss"] else "(no English word)"
        pair = c.get("pair") if c.get("pair") in form_of and unit_pair(form, form_of[c["pair"]]) else None
        return f"{gid} {form}  — crib: {g}" + (f" (with {pair})" if pair else "")
    toks = "\n".join(line(gid, form) for gid, form in d["greek"])
    words = " ".join(f"{i}:{w}" for i, w in enumerate(d["words"]))
    return (f"{INSTRUCTIONS}\n\n<greek_lines>\n{greek_text}\n</greek_lines>\n\n"
            f"Align these Greek tokens ({title}); there are {len(d['greek'])}, and every one must appear in a unit:\n"
            f"<greek_tokens>\n{toks}\n</greek_tokens>\n\n"
            f"<literal_crib>\n{crib['literal']}\n</literal_crib>\n\n"
            f"<english_text>\n{d['english']}\n</english_text>\n\n"
            f"<english_words>\n{words}\n</english_words>")
