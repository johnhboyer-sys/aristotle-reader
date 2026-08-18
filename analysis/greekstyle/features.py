"""Feature vocabularies for Greek stylometry.

Two deliberately different vocabularies:

FUNCTION_WORDS -- particles, connectives, prepositions, negatives, the article
    and the common pronouns. These are the authorship signal. They are chosen
    because they are (a) indeclinable or nearly so, (b) enormously frequent,
    (c) semantically near-empty, so their rate tracks how a writer builds
    sentences rather than what the sentences are about. This is the class
    Anthony Kenny used on the Ethics in 1978, for the same reasons.

EDITION_SENSITIVE -- features that a modern EDITOR chooses rather than an
    ancient author: whether to print movable nu, whether to elide, which of two
    spellings of the same word to standardise on. These are not used as
    authorship evidence. They are measured separately, so the size of the
    edition confound can be reported instead of hoped away.
"""

from __future__ import annotations

# --- the authorship vocabulary --------------------------------------------
# Written accentless because corpus.normalise() strips diacritics.

PARTICLES = """
μεν δε γαρ ουν τε γε δη μεντοι τοινυν καιτοι αρα μην ατε δηπου
""".split()

CONNECTIVES = """
και αλλα ουδε ουτε μηδε μητε ητοι ειτε η ωστε διο διοπερ επει επειδη
οτι ωσ ωσπερ καθαπερ οταν εαν ει ινα οπωσ εωσ πριν ομοιωσ ετι
""".split()

PREPOSITIONS = """
εν εισ εκ εξ απο δια κατα μετα περι προσ επι υπο υπερ παρα ανα αντι
συν προ αμφι ενεκα χωρισ ανευ
""".split()

NEGATIVES = "ου ουκ ουχ μη ουδεν μηδεν ουδεισ μηδεισ ουδαμωσ".split()

MODAL = "αν".split()

ARTICLE = """
ο η το του τησ τω τη τον την οι αι τα των τοισ ταισ τουσ τασ
""".split()

PRONOUNS = """
αυτοσ αυτο αυτου αυτων αυτη αυτον αυτω αυτησ αυτοισ αυτην αυτα
ουτοσ τουτο τουτου τουτων ταυτα ταυτησ τουτω τουτοισ ταυτην αυτη
εκεινοσ εκεινο εκεινου εκεινων τισ τι τινοσ τινα τινι
οσ ο οσα οσον οσων ων οισ ην οστισ
εκαστον εκαστου εκαστω αλλο αλλου αλλων αλλοισ αλλα
παν παντα παντων πασι πασα πασαν πολλα
""".split()

ADVERBIAL = """
ουτω ουτωσ μαλλον μαλιστα αει αμα νυν παλιν μονον πρωτον προτερον
υστερον σχεδον ισωσ πωσ που ποτε τοτε ηδη οθεν ενθα ουτωσ
""".split()

FUNCTION_WORDS: list[str] = sorted(set(
    PARTICLES + CONNECTIVES + PREPOSITIONS + NEGATIVES + MODAL
    + ARTICLE + PRONOUNS + ADVERBIAL
))

# --- the editor's fingerprint ---------------------------------------------
# Each entry is (name, variant_a, variant_b). The RATIO a/(a+b) is an editorial
# house style, not an authorial habit, and is expected to track `Work.editor`.
EDITION_SENSITIVE = [
    ("movable_nu_esti", "εστιν", "εστι"),
    ("movable_nu_houto", "ουτωσ", "ουτω"),
]

# Words whose corpus-wide rate is driven by subject matter. Never in the
# authorship vocabulary; used only to show what topic-driven clustering does.
CONTENT_PROBES = """
ψυχη ζωον φυσισ κινησισ αρετη πολισ ουσια αιτιον σωμα λογοσ
""".split()


def sanity_check(counter) -> list[str]:
    """Return function words absent from a corpus counter (typo guard)."""
    return [w for w in FUNCTION_WORDS if counter.get(w, 0) == 0]
