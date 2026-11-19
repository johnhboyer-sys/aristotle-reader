"""Alignment prompt v2: John's rulings on NE I.2 (2026-11-18) written as rules.

Changes from v1 (test-i2/run.py): units instead of single tokens; Literal and
Loose returned separately; every Greek token must appear in exactly one unit.
The worked examples are John's own I.2 rulings, so I.2 cannot test this prompt
on those words; I.3 is the held-out test.
"""

INSTRUCTIONS = """You are aligning Aristotle's Greek with one English translation, for a bilingual reader. When a reader points at a Greek word, the page shows how this translator rendered it: the English words that translate it, and the English the translator built around it to carry it.

Every Greek token has an id (column, Bekker line, token number). Every English word has a number.

WORK IN UNITS. A unit is usually one Greek token. Two kinds of unit join tokens:
1. An article with the noun, adjective or participle it goes with: τῶν πρακτῶν, τὸ ἄριστον, ἡ … μέθοδος. Words standing between them (particles, a genitive) stay units of their own.
2. A pair whose meaning belongs to the pair, such as concessive εἰ … καί "although" (Smyth 2369, 2375).
Put every Greek token in exactly one unit, including tokens the translation does not render (give those empty lists). Do not stop before the last token.

FOR EACH UNIT give two lists of English word numbers:
- "lit" (Literal): English words that themselves mean what the Greek means, word for word.
- "loose" (Loose): English words that render the unit only as part of a construction or frame the translator built around it.

RULES
1. Article as possessive: when the translator renders the article as "our", "its" and so on, that word is Literal for the unit (τῶν πρακτῶν → "our actions").
2. A verb's person ending: an English pronoun subject is Literal for the verb (βουλόμεθα → "we will"). When the translator names the implied subject instead of using a pronoun, the named subject is Loose for the verb (ἐστιν → Literal "is", Loose "the Good" in "the Good is the same").
3. An English infinitive's "to" belongs to the Greek infinitive (εἶναι → "to exist").
4. Words the Greek leaves understood: where the English spells out or repeats something the Greek states only once or leaves unstated, that English is Loose for the Greek word it restates, or for the predicate whose unstated subject it is.
5. A Greek word the translator renders only through an English construction, with no word of its own, gets Loose only and an empty Literal. Example: χρεὼν ("it is needful") in "which of the sciences are to exist … what … the citizens are to learn" → Loose "are" … "are"; "to exist" belongs to εἶναι and "to learn" to μανθάνειν.
6. A Greek word with no counterpart in the English (often μέν, δέ, γάρ, τε, οὖν, δή) gets two empty lists.
7. Do not link English the translator added that restates nothing in the Greek.
8. Follow meaning, not position: translators reorder freely, and may turn a main verb into a phrase or a participle into a main verb.
9. An English word may appear in more than one unit only when it really renders both.

WORKED EXAMPLES (NE I.2, Rackham, as ruled by the editor; for illustration):
- "If therefore among the ends at which our actions aim …": τέλος → lit "ends", loose "among the … at which … aim"; τῶν πρακτῶν → lit "our actions".
- "for it is this that ordains": αὕτη → lit "this", loose "it is … that"; διατάσσει → lit "ordains".
- "For even though it be the case that the Good is the same": εἰ … καί (one unit) → lit "even though", loose "it be the case that"; γὰρ → lit "For"; ἐστιν → lit "is", loose "the Good".
- "This then being its aim, our investigation is in a sense the study of Politics" (ἡ μὲν οὖν μέθοδος τούτων ἐφίεται, πολιτική τις οὖσα): ἡ … μέθοδος → lit "our investigation"; μὲν → nothing; οὖν → lit "then"; τούτων → lit "This"; ἐφίεται → lit "aim", loose "being its"; οὖσα → lit "is"; τις → lit "in a sense"; πολιτική → lit "Politics", loose "the study of".

Return JSON: {"units": [{"g": ["<greek id>", ...], "lit": [<english word numbers>], "loose": [<english word numbers>]}]}, one entry per unit, every Greek token in exactly one entry."""

SCHEMA = {
    "type": "object",
    "properties": {
        "units": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "g": {"type": "array", "items": {"type": "string"}},
                    "lit": {"type": "array", "items": {"type": "integer"}},
                    "loose": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["g", "lit", "loose"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["units"],
    "additionalProperties": False,
}


def prompt(d, title):
    greek_text = "\n".join(f"{k}: {v}" for k, v in d["lines"].items())
    toks = "\n".join(f"{gid} {form}" for gid, form in d["greek"])
    words = " ".join(f"{i}:{w}" for i, w in enumerate(d["words"]))
    return (f"{INSTRUCTIONS}\n\n<greek_lines>\n{greek_text}\n</greek_lines>\n\n"
            f"Align these Greek tokens ({title}); there are {len(d['greek'])}, and every one must appear in a unit:\n"
            f"<greek_tokens>\n{toks}\n</greek_tokens>\n\n"
            f"<english_text>\n{d['english']}\n</english_text>\n\n"
            f"<english_words>\n{words}\n</english_words>")
