"""Alignment prompt v4: v2 with three rule changes from the I.2 repeat errors
(repeat_errors.py), 2026-11-19. No crib (v3's crib did not help).

1. Grammar is Literal (John: "Spelling out grammar is literal yes"): English
   that spells out the Greek word's own grammar is Literal for it.
2. Shared frames: a word the translator supplies for several Greek words is
   Loose for each (John's I.2 rulings: "achievement", "to secure the good").
   Replaces v2's rule 9, which pushed the other way.
3. Loose covers only English that carries the unit, not the clause it governs.

New examples are invented Greek, so no I.2 unit gets its answer from them.
Not yet a rule: a noun the Greek implies ("science" for πολιτική), awaiting John.
"""
from prompt_v2 import INSTRUCTIONS as V2, SCHEMA, prompt as _p2  # noqa: F401

OLD2 = """2. A verb's person ending: an English pronoun subject is Literal for the verb (βουλόμεθα → "we will"). When the translator names the implied subject instead of using a pronoun, the named subject is Loose for the verb (ἐστιν → Literal "is", Loose "the Good" in "the Good is the same")."""
NEW2 = OLD2 + """
2a. Grammar is Literal. English that spells out the Greek word's own grammar is Literal for that word, together with the word itself: auxiliaries for tense, mood and voice ("will", "would", "shall", "may", "do not", "is being"); the modal that renders ἄν ("would", "must", "will"), which is Literal for ἄν; "we must" or "one ought to" for a verbal adjective in -τέος/-τέον; "it is" with an impersonal adjective or verb; a preposition or "of" that renders a case ending; and the conjunction a translator uses to turn a participle into a clause ("as", "since", "while", "inasmuch as"), with the auxiliaries of that clause. Examples (invented): πρακτέον "we must act" → all Literal; φανερόν "it is evident" → all Literal; ἂν γένοιτο "would come about" → ἄν Literal "would", γένοιτο Literal "come about"; χρώμενοι "since they use" → all Literal; τοῦ σώματος "of the body" → Literal "of the body"."""
OLD4 = """4. Words the Greek leaves understood: where the English spells out or repeats something the Greek states only once or leaves unstated, that English is Loose for the Greek word it restates, or for the predicate whose unstated subject it is."""
NEW4 = """4. Words the Greek leaves understood: where the English spells out or repeats something the Greek states only once or leaves unstated (a noun, a subject, a phrase carried over from the previous clause), that English is Loose for the Greek word it restates, or for the predicate whose unstated subject it is. This is about content, not grammar: rule 2a still makes auxiliaries, "it is" and the like Literal."""
OLD9 = """9. An English word may appear in more than one unit only when it really renders both."""
NEW9 = """9. Shared frames: when the translator supplies or repeats one piece of English for several Greek words, it is Loose for each of them. Examples (invented): καλὸν καὶ ἡδύ "a fine and pleasant thing" → "thing" is Loose for καλὸν and for ἡδύ; φίλῳ καὶ πολίτῃ "to help a friend and a citizen", where "to help" is carried over from an earlier verb → "to help" is Loose for φίλῳ and for πολίτῃ; γράφειν καὶ ἀναγιγνώσκειν "men write and read", with "men" supplied → "men" is Loose for both infinitives. Literal words are shared only when one English word really renders two Greek words.
10. Keep Loose to the unit itself. Loose is English that carries this unit, not the clause it governs or sits in: for "he says that the soul is immortal", φησί gets Literal "he says" and nothing of the "that" clause; a noun does not take the verb of its clause; a main verb does not take its object clause. When unsure whether framing English belongs to a unit, leave it out."""
INSTRUCTIONS = V2
for old, new in ((OLD2, NEW2), (OLD4, NEW4), (OLD9, NEW9)):
    assert old in INSTRUCTIONS, old[:40]
    INSTRUCTIONS = INSTRUCTIONS.replace(old, new)


def prompt(d, title):
    return _p2(d, title).replace(V2, INSTRUCTIONS, 1)
