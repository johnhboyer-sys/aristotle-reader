# Topic search: how scholars gather passages, and how we could

2026-11-05. Phase 1 of the topic-search track: research only, nothing built.
Working notes behind each section are in `research/`:

| Note | What it holds |
|---|---|
| `sorabji-method.md` | *Necessity, Cause and Blame*: method, 69-locus table in John's buckets, 12 machine steps |
| `owens-method.md` | *Doctrine of Being*: method, 78-locus table, 10 machine steps, homonymy rules |
| `bonitz-as-answer-key.md` | State of ἀγαθός, ἀναγκαῖος, ἀνάγκη, οὐσία in bonitz-text |
| `library-answer-keys.md` | 13 other books in the Papers Library ranked as answer keys |
| `methods-survey.md` | Embedding models, DH precedents, lexical methods, LLM tagging, hosting, with sources |

All five were written by Claude agents (Opus for the two books, Sonnet for the
rest). None has had a second reader. The locus tables rest on each book's
citations and section headings more than on reading every page of argument;
each note says which chapters were read in full.

---

## 1. What the two scholars actually do

They work in opposite directions, and neither starts from a word search.

**Sorabji starts from problems.** His book has five parts, each a problem where
necessity is at stake (cause, time and truth, purpose, essence, blame). Each
chapter title names its anchor texts: Meta VI 3; Int 9; GC II 11, PA I 1, Phys II
9; EN III 1–5. From each anchor he moves outward by five routes:

1. doublets and parallels (Meta VI 2–3 with XI 8 and V 30; the EE and EN
   accounts of the voluntary side by side);
2. the chapters next door (affirmations of necessity sit beside the denials:
   Phys II 7–8 before II 9);
3. **tension pairs**: places where Aristotle denies necessity set against places
   where he affirms it;
4. one claim, every instance: a footnote gathers all the places a claim recurs
   ("we do not deliberate about what is necessary");
5. the problem itself pulls in passages that lack the word (Phys VIII's
   self-movers for responsibility).

He tracks the concept in English, not Greek terms, and leans hard on lists
other scholars had already made (Balme's biology cases, Hintikka's
natural-tendency passages, Ross's "fresh starts").

**Owens starts from the text.** He reads the Metaphysics book by book, in an
order he fixes from its own cross-references, chapter by chapter and often line
by line. Other works come in only for a set job: Cat 1 and Top I 15 to settle how
"said in many ways" is read; Phys I–II and APo II for principles the central books
assume; DA II 4, GC II 10, Cael I 9 where the Metaphysics is silent. His rule for
homonymy decides by the thing the word refers to: chance homonyms drop; πρὸς ἕν
and analogical uses stay, sorted by primary and secondary instance.

**What they share**, and what a machine should copy:

- **Anchors first, occurrences second.** Both begin from a handful of texts the
  field already treats as central, then reach outward by stated routes.
- **Prior scholarship is the main finding aid.** Commentators and earlier
  scholars hand them passages and the readings to test. Bonitz is a dictionary
  for both (to fix how a word is used), not a source of passages.
- **What makes a passage central:** it is the only place making a claim; it
  names the kind or sense at issue; it conflicts with another passage; a named
  interpreter has built a thesis on it; it states a doctrine "expressly".
- **What keeps one peripheral:** one more instance of a pattern already shown;
  the speaker is an opponent, not Aristotle.

## 2. Where your four buckets fit, and what they lack

The buckets describe both scholars' passages well. Sorabji's top-level sort is
your bucket 3 (nearby problems); Owens's spine is your bucket 1. Gaps both
studies expose:

| Gap | Example | Proposed fix |
|---|---|---|
| **Which sense or kind** | Sorabji lists ten kinds of necessity (hypothetical, natural, essential, force, the fixed past…); Owens sorts by which instance of being | a per-topic sense tag on every bucket-1 and 2 locus |
| **Voice** | Phys II 8's rain "of necessity" is the opponents' view | speaker tag: Aristotle / opponent / *endoxa* / aporia |
| **Links between loci** | tension pairs (Sorabji); doublets (Κ vs Β Γ Ε) and aporia → solution (Β 4 → Ζ 16) (Owens) | a "pairs with" field naming the other locus and why |
| 2 vs 4 blurs | "horns are shed of necessity" is bucket 4 alone, but evidence about necessity in Sorabji's hands | allow a second bucket; John settles disputes |
| Method texts | Cat 1, Top I 15: about homonymy itself, and govern how every later use is read | optional fifth kind |

Also seen, and left out unless you want them: rival doctrines, wording
parallels cited to construe a formula, passages included in order to be ruled
out, Owens's reading order.

## 3. The answer keys we have

| Key | Topic | Size | State |
|---|---|---|---|
| Sorabji | necessity | 863 distinct citations; 69 loci tabled; ~30 core (8+ pages each) | built by an agent from the text (the book has no index locorum). Thesis-driven, thin on modal logic; Fine says it underweights Phys II 4–6 |
| Bonitz ἀναγκαῖος + ἀνάγκη | necessity | 170 citations, sense heads 1–4 | text machine-adjudicated, citations parse; usable now as a recall check. Bonitz samples (*al.*, *sqq.*), so not complete |
| Bonitz ἀγαθός | good | 152 citations | same as above |
| Owens | being, οὐσία | ~1,710 citations, 268 chapter units, 78 loci tabled | good inside the Metaphysics, thin outside; leans to his thesis |
| Bonitz οὐσία | being | ~280 citations | **not ready**: raw OCR, pages 556–557 not adjudicated |
| Irwin, *First Principles* | broad | ~2,200 loci, ~600 starred as "more important" | a built-in ranking; not yet extracted |
| Bechler, Johansen, Charles, Wedin, Leunissen, Gotthelf, Ward, Shields | actuality, soul's powers, essence, substance, teleology, homonymy | 190–1,050 loci each | indexes of discussed passages; not yet extracted |
| Your αἰτία study | four causes | 52 passages | machine-coded, unchecked |

No book in the library lists every occurrence without ranking, which was the
worry. The library is thin on ethics and politics.

**Caution from past work** (`holdout-spent-by-selection`): if we tune the
method against every key, the keys stop measuring anything. Hold one out.

## 4. Technical options

Everything below is a stage in one pipeline. The choice is how far to go.

**A. Topic map (judgment, once per topic, you review).** Seed lemmas and
phrases; the sense/kind list; nearby problems, each with its own vocabulary;
anchor texts named by the scholars. For necessity, most of this comes straight
out of Sorabji plus your four contexts. *This is the step that carries the
thesis*: a map drawn from one scholar finds that scholar's book, so build it
from two or three sources.

**B. Candidate passages (deterministic, free, from data we already have).**
- lemma density per paragraph, scaled by length (so short Meta VI 3 isn't
  swamped by the Analytics' "necessarily follows");
- co-occurrence with each nearby problem's vocabulary, whether or not the core
  word appears (Sorabji's route 5);
- the chapters on either side of each anchor (route 2);
- doublets by English-text similarity (route 1);
- cross-reference formulae (εἴρηται, διώρισται, ἐν τοῖς φυσικοῖς …) resolved
  to targets (Owens);
- citations harvested from Bonitz and scholars' indexes.

The corpus already supports this: 41 works, 2,651 Bekker-column segments; Greek
lines lemmatized; public English with paragraph and Bekker anchors; lemma and
n-gram indexes in `build/dist`. Tesserae, the nearest precedent, found 55% of
known parallels by lemma alone and 68% with synonyms added.

**C. Embeddings (optional recall booster, free on the Mac).** No model has a
published Ancient Greek retrieval score. The one Greek↔English test found only
~70% of the right passages in its top ten and its authors call it poor. Our
July test of UGARIT (a BERT-type Greek word aligner) failed at the same task:
finding the passage among many. The English side is the stronger bet: a general
model (multilingual-e5-large, BGE-M3) on the English text. Worth one
afternoon's test against the answer keys before it gets any weight.

**D. LLM sort (subscription).** Give each candidate paragraph, Greek and
English, to a model with the rubric; it returns bucket, sense tag, voice, the
Greek line that decides it, and a one-line reason. Adjacent paragraphs with the
same tags merge into one locus, snapped to Bekker lines. Rough size per topic
(agent's arithmetic, to measure on 20 real segments first):

| Mode | Input tokens per topic |
|---|---|
| candidates only (~300 paragraphs) | ~0.3–0.9M |
| English filter, then Greek + English for survivors | ~2.5–3M |
| every segment, Greek + English | ~5.5–8M |

Candidates-only fits subscription use. A paid batch run would be priced and
brought to you before it ran.

**E. Check.** Recall against the answer keys (with one held out); you judge a
sample for bucket accuracy; a second reader from another model family (Grok or
Codex) rechecks the LLM's buckets. Raw outputs, prompts and rubric committed, so
every assignment traces to a prompt and date.

**F. Publish.** One static JSON per topic, built with the site; a topic page
lists loci by bucket, each expandable to Greek and English in place. No server,
no live LLM. Cloudflare matters only for the later search box: Vectorize's free
tier holds ~5,000 vectors at 1024 dimensions, too few; a static int8 index of
~20,000 passages is 10–20 MB and could ship as a file instead.

## 5. Proposed proof of concept

**Topic: necessity.** It has the best keys: Sorabji's core, Bonitz's ἀνάγκη
entries (ready now), and Fine's critique to mark Sorabji's blind spots.

1. Draft the necessity topic map from Sorabji's kinds, your four contexts, and
   Bonitz's sense heads. You review it.
2. Have a second reader (Grok) check the Sorabji locus table against the book,
   so the key is not a Claude reading checked by Claude.
3. Build stage B for necessity. Measure recall against Sorabji's ~30 core loci,
   with Bonitz ἀνάγκη held out until the end.
4. Test one English embedding model as a recall booster; keep it only if it
   finds core loci stage B missed.
5. LLM sort of the candidates (subscription). You judge a sample of ~40 loci;
   Grok rechecks the buckets.
6. A mock topic page with expandable passages, for you to judge the look.

Success bar, set before running: stage B + C finds every one of Sorabji's core
loci, or names why it missed each; your bucket-accuracy judgment on the sample.

## Decisions for you

1. Necessity as the first topic, or ἀγαθός (Bonitz ready, no monograph key)?
2. Which extra fields to carry beyond the four buckets: sense tag, voice, links
   (recommended), method texts (optional)?
3. Will you label a gold sample (~40 loci) yourself? Every precedent in the
   survey pairs a machine generator with an expert's judgment of a sample; none
   lets the model be the final word.
