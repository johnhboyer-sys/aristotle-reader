# Bonitz handoff — 2026-09-01

Rewritten each session. Read this first.

## State

**118–281 is adjudicated where adjudication pays, and the paying class is
finished.** 620 answers, **251 sites corrected**. Sitting 6 is live, unfinished.

    margin (gutter numbers)   76 cards    76 sites
    kai ligature ϗ            62 cards   769 sites
    stigma ϛ                  37 cards    61 sites
    ou ligature ȣ            190 cards  1013 sites
    spine-alone (rest)       151 cards   135 sites   ← where the corrections are
    spine-alone (ou)         115 cards    31 sites
    Δ/ν letter shapes         76 cards     0 sites   ← the sitting that taught us
    2-2 split                 76 cards   in progress

## THE FIFTH READER IS A SORTER, NOT A VOTER — settled 2026-09-01

Paddle read all 328 columns of 118-281 (19,978 lines; ȣ 8113 · ϗ 3039 · ϛ 99).
Trained to 98.95% char / 68.4% exact lines, `best_epoch 182/200` — still
improving when the schedule ended, so DATA is its ceiling, not the model.

It PASSED the rule registered at f8ada13 before any result was seen: false
alarms 7% against calamari's 7%, backs a wrong spine 2% against calamari's 3%.
And it should still NOT be seated. Measured greek-only on both sides, so
paddle is the only variable:

    disputed sites   8561 -> 7755    -806
    cards to rule    3681 -> 4204    +523

A fifth reading fragments the form-sets that bundle many sites onto one card.
John rules cards. Removing 806 disputes while adding 523 cards is a trade he
takes explicitly or not at all. The built panel is parked, carried and
unadopted, in `work/kraken15-102/paddle-panel/` (and `latin/` inside it for the
wider-scope variant, which is NOT comparable to the greek-only queues).

⚠ **THE RANKING WAS TESTED ON 2026-09-02 AND IT FAILED. DO NOT REUSE IT.**
150 dissent cards served in predicted-yield order came back INVERTED:

    band              predicted   actual
    different-word      77.5%     17.1%   (41 ruled ·  7 accepts)
    dropped-letter      52.0%      7.7%   (78 ruled ·  6 accepts)
    backs-a-form        28.0%     39.3%   (28 ruled · 11 accepts)
    overall                       16.3%

The band served FIRST did worst; the band served LAST did best, so the
order was inverted. Cause: the figures below were
measured over cards John had ALREADY ruled, and those were selected by
earlier sittings that took the spine-alone and bloc-split classes first.
Paddle's dissent scored high there because it CO-OCCURRED with a lone
spine; in the unruled remainder that company is gone. See
`holdout-spent-by-selection` and the calamari note further down — a
feature is not a predictor, a feature in a configuration is.

⚠ **AND DO NOT CALL 16.3% BAD — THERE IS NO CONTROL.** John, 2026-09-02:
"wait, you calculated paddle against what i just ruled?" The out-of-sample
test is sound; the comparison I drew from it was not. I read 16.3%
against the ~35% base rate of his EARLIER rulings, but those cards were
hand-picked by earlier sittings for the richest classes. Whether ranking
beats no ranking cannot be answered without an UNRANKED random sample of
the same unruled pile, and nobody has ruled one. What is established is
only that these three bands came out in the opposite order to the
prediction.

Everything below is retained as the ORIGINAL measurement, not as advice:

⚠ **WHAT IT WAS THOUGHT TO BE FOR.** Over John's own 591 rulings paddle
measured as the strongest predictor this project had seen:

    paddle DISSENTS from the spine   160 ruled · 132 accepts · 82.5%
    paddle agrees on LETTERS only     72 ruled ·  29 accepts · 40.3%
    paddle AGREES with the spine     346 ruled ·  11 accepts ·  3.2%

Against calamari's 58.1% / 0.8%. On the unruled pile that isolates 150 dissent
cards holding ~124 corrections and 289 letters-only cards holding ~116 — 14% of
the pile carrying ~73% of what is left. Serve sittings from
`work/kraken15-102/queue-118-281-ranked.json`, which is the existing four-reader
pile in that order. **The tail is not empty**: 2,750 agree-cards still hold an
estimated 88 corrections, so this orders the work and does not licence stopping.

⚠ **AND IT MUST NEVER ARBITRATE A BREATHING.** 24% of John's corrections paddle
had right in LETTERS and wrong in marks (`δεσποζειν` for `δεσπόζειν`). Strong
letter witness, weak mark witness.

⚠ **THE BLOC SCARE IS CLOSED — do not re-raise it.** kraken and calamari are
Greek-trained, genie and LlamaParse the Latin pair; on 664 sites the blocs
disagree, a 2-2 that always flags, and paddle joins the Greek bloc on 414 of
them. That looked like losing 414 cards. Of the 88 such splits John has ruled,
the Greek bloc was right 80 times and the Latin pair ZERO. Those cards are the
noise the fifth reader was hired to remove.

## THE LEXICON ORDERS THE QUEUE — measured 2026-09-02, and it TRANSFERRED

The one signal tested this session that survived out-of-sample. `lexcheck`
already holds 56,053 Aristotle wordforms; `bare()` matches accent-blind. For
each card, count how many of its form-set members are attested:

    band                     ruled  accepts   rate     on 150 fresh cards
    CONTRADICTS the spine      382     190   49.7%  ->  54.5%
    several attested           240      86   35.8%  ->   6.2%  (n=16)
    no form attested           348      86   24.7%  ->  14.5%
    BACKS the spine            165       3    1.8%  ->   2.5%

The two extremes held within a few points on cards ruled after the bands were
fitted. That is the opposite of what happened to the paddle ranking the same
day, and the difference is that the lexicon is EVIDENCE ABOUT THE WORD rather
than a fifth opinion about the pixels.

⚠ **IT CAN NEVER DECIDE A CARD, AND JOHN NAMED WHY.** 2026-09-02: "that of
course doesn't help with misprints." A lexicon disagreement is ambiguous
between the reader misreading and Bonitz misprinting, and only the ink
separates those. Asking the lexicon which form is RIGHT scores 59% — a coin
flip — because it answers what SHOULD be printed while John rules what IS.
Compare on the ligature-EXPANDED form or the number is 48%: the lexicon knows
`ἀκολουθεῖ`, the page prints `ἀκολȣθεῖ`, and the ruling keeps the ligature.

The unruled pile, 3,035 cards:

    CONTRADICTS the spine      577 cards   ~300 corrections
    no form attested         1,410 cards   ~268   (largely Latin, sigla,
    several attested           451 cards   ~ 90    citation fragments — the
    BACKS the spine            597 cards   ~ 12    lexicon is simply mute)

Serve CONTRADICTS first: a fifth of the pile holding nearly half of what is
left. Do NOT drop the tail — see the recompile section above for why those
597 cards are worth 601 gold lines.

## FOUR SECTION HEADERS ARE WRONG — found 2026-09-01, not yet carded

The index's own skeleton. Each is proved by the alphabet of the entries around
it, and three of the four are misread by EVERY reader:

    144-R:7   spine `̀`   calamari B   paddle B    ἄψυχα -> βάθος       = Β
    156-R:38  spine `4`   calamari —   paddle 1.   βῶξ -> γάλα          = Γ
    176-R:17  spine `Λ`   calamari Ζ   paddle Α.   γωνιοειδής -> δαίνυσθαι = Δ
    223-L:28  spine `X)`  calamari I   paddle ?.   δωδεκάεδρον -> ἐάν   = Ε

They are the four NARROWEST crops in the tranche (33-51px against a model
trained on 1024px), which is why every engine failed them. Propose, do not
apply: rough in the ink is a transcription error, but Bonitz misprinting banks
as a corrigendum.

## What predicts a correction — measured over 538 ruled cards

⚠ **THIS IS THE FINDING OF THE WEEK AND IT SHOULD DRIVE EVERY FUTURE SITTING.**

    calamari DISSENTS from the spine   260 ruled · 151 accepts · 58.1%
    calamari is SILENT                  18 ruled ·  14 accepts · 77.8%
    calamari AGREES with the spine     260 ruled ·   2 accepts ·  0.8%

    genie+llama agree against spine    160 ruled · 123 accepts · 76.9%
    the spine stands alone             270 ruled · 165 accepts · 61.1%

John, 2026-08-31, before any of this was measured: "the cases where the spine
was wrong were typically cases where both genie and llama agreed... or cases
where calamari and kraken disagreed." Both halves hold.

⚠ **BUT THE SAME FEATURE MEANS OPPOSITE THINGS IN DIFFERENT COMPANY.**
"calamari differs" scored 58% because there it coincided with the spine
standing alone. In the UNRULED remainder the configuration is inverted —
kraken, genie and llama agree and calamari is the lone outlier (`Ἰλιὰς /
Ἰλιὰς / Πλιὰς / Ἰλιὰς`). Those 172 cards predict PRESERVE. A feature is not a
predictor; a feature in a configuration is.

## What is left, and why it is probably not worth clicking

**3,261 cards · 4,667 sites unruled**, and NO spine-alone card among them.

    calamari agrees with the spine   3,063 cards   ~24 corrections projected
    calamari is the lone outlier       172 cards   predicts preserve
    calamari silent                      1 card

Sitting 6 tests the one live question: 265 cards where genie and llama agree
against the spine AND calamari backs it — John's strongest signal against the
strongest exoneration. **At 25 answers it was 25 preserves.** If that holds the
exoneration wins, and the remaining ~3,000 can be left with the spine standing,
which is what a `preserve` writes anyway.

## ⚠ THE PANEL CANNOT REACH ZERO ERRORS, AND THIS IS WHY

The panel questioned **6,887 of 166,440 words — 4.1%.** The other **159,553
were unanimous across all four readers and never became a card.** Every sitting
ever run operates inside that 4.1%. At one error per thousand unanimous words
that is ~160 errors this process is structurally blind to — six times the ~24
left in the flagged population.

John, 2026-08-31: "i want zero errors if possible in corpus" and "i also don't
want this to take years." Both are answerable, but not by more sittings.

## Next: the fifth reader — DECIDED, not started

John, 2026-08-31: "basically, we do gpu training", Paddle first then Tesseract.

⚠ **THE TRAINING SET WAS NEVER LOST.** `work/kraken400/train.arrow` (204 MB)
and `holdout.arrow` (32 MB) hold the cropped line PNGs WITH their ground truth
and do not depend on the deleted `alto-r5`. Verified 2026-08-31:

    train.arrow    4741 lines from 83 columns ✓
    holdout.arrow   722 lines from 12 columns ✓
    no held-out line image or text in train ✓

    uv run --with pyarrow --with pillow python3 -m bonitz_pipeline.calamari_export \
        --work work/kraken400 --out work/calamari-export

One export feeds both engines; the charset (with `ȣ ϗ ϛ`) comes from the GT and
is shared. `bonitz_pipeline/pylaia_export.py` ALREADY implements the
tokenisation experiment that matters here — `ȣ̓` as one CTC class against a base
glyph plus a combining-mark frame — and is gated on John's holdout ruling.

⚠ **QWEN — TESTED 2026-09-02 FOR A DOLLAR, AND THE FAILURE IS A THIRD SHAPE.**
Tested on chat.qwen.ai (Qwen3-Max, the hosted flagship) against
`page-278-L_060`, whose printed line is

    ȣ̓́τε τȣ̀ς ὄγκȣς ἐχόντων ἴσȣς ȣ̓́τε τοιȣ́τῳ τάχει φερομένων

    cold prompt    ligature recall 0/6
    primed prompt  ligature recall 1/6, and that one with the wrong accent
                   (`τοιȣ̀τῳ` for `τοιȣ́τῳ`)
    exact words    3/9 — every one of the three ligature-free

⚠ **IT DOES NOT EXPAND `ȣ` TO ου. IT READS IT AS α.** `τȣ̀ς -> τὰς`,
`ὄγκȣς -> ὄγκας`, `ἴσȣς -> ἴσας`. That is WORSE than DeepSeek's failure,
because ου is recoverable by rule and `τὰς` is a perfectly good Greek
article — the error passes any check that asks "is this a word". It kept the
GRAVE while changing the base letter, so it resolves diacritics and
misidentifies the glyph under them.

⚠ **BUT IT IS NOT TESSERACT-SHAPED EITHER, AND THAT IS THE POINT OF THIS
ENTRY.** Its own reasoning said: "I suspect the apparent 'α' may be a
ligature resembling ȣ". It CAN resolve the glyph and overrides itself five
times in six. That is a PRIOR problem, which fine-tuning fixes, not a
structurally unreachable class like Tesseract's recoder. So Qwen is
"unproven and expensive to prove", not "impossible".

Two things settle it anyway. The fine-tune would teach a model to do the one
thing kraken already does at 100% recall — the ligature is the EASY part of
this book for a CTC recogniser. And the accents were worse than paddle's: it
reasoned its way OUT of the correct acute ("though the acute accent might
seem plausible...") and flipped smooth to rough twice.

⚠ **AND WATCH THE REASONING, NOT ONLY THE OUTPUT.** Mid-run it began
"mentally cross-referencing Aristotle's works". A reader that reconstructs
from the canonical corpus is disqualified even when it is RIGHT: it is
accurate in proportion to fame rather than legibility, it silently repairs
Bonitz so the corrigenda register goes empty and looks clean, and it breaks
no unanimity in the 4.1% blind spot because it fails the same way genie and
llama already do. That is the DeepSeek rejection restated.

⚠ **THE TEST COST NOTHING AND SHOULD BE THE FIRST STEP FOR ANY VLM.** Four
ligature-rich line crops with known spine text, hardest first
(`page-278-L_060`, `page-168-R_057`, `page-249-R_031`, `page-138-R_007`),
run COLD then PRIMED. The gap between the two runs is the diagnosis: cold
fail + primed pass means a fixable prior; both fail means blindness. Score
by machine against the spine, never by impression. A hosted flagship is a
DISQUALIFIER only — passing there says little about the small open weights
you could actually fine-tune on a T4.

⚠ **TESSERACT IS A DEAD END AND ITS FILES ARE DELETED (2026-08-31).** The
fine-tune from `grc` trained fine — BCER 100% -> 11.97%, many holdout lines
character-perfect — and **cannot emit `ȣ`, `ϗ` or `ϛ` AT ALL**: 0/40, 0/12, 0/1
on holdout, and it fails on lines it TRAINED ON. The substitutions are scattered
(`b`, `θ`, `a`, `ς`, `ἕ`), which is a class with no stable representation, not a
learned confusion. Ruled out in order: the charset HAS all three (305 entries in
the packed model), the box files DO carry them, there are 1,770 `ȣ` instances,
and two learning rates (1e-4, 2e-3) and two sampling regimes (flat, and
oversampled x3/x4/x12) all give exactly zero. That points at Tesseract's
RECODER, inherited from `grc` when fine-tuning with `--continue_from`:
extending the unicharset does not make the new classes reachable.

That makes it worse than a weak reader — it would agree with everyone on easy
words and produce noise on exactly the hard ones. Real routes if ever wanted:
train from scratch with `--net_spec` against our unicharset (needs far more
than 4,741 lines), or start from a base whose recoder already covers these
sorts. Both are bigger than a tuning tweak.

**Why these two, in this order.** Paddle's SVTR is a different architecture
family from kraken and calamari, so it fails differently — that is what can see
an error the two of them made together. Tesseract is LSTM+CTC like both, so it
fails similarly, and that is the control: if Paddle flags a site and Tesseract
sides with kraken, Paddle is noisy there; if Tesseract also breaks ranks the
site is genuinely suspect. Tesseract fine-tunes on CPU and can train while
Paddle has the GPU.

⚠ **OFF THE SHELF, NONE OF THEM CAN READ THIS BOOK.** No stock model has `ȣ`,
`ϗ` or `ϛ` in its charset; it will read `ȣ` as ου and disagree systematically on
the commonest token class in the index. That is why DeepSeek was rejected. Any
fifth reader must be fine-tuned with the ligature charset.

⚠ **NEITHER ENGINE BECOMES A FIFTH VOTE.** A model fine-tuned on 4,741 lines
will not beat kraken r6's 0.33% CER, so as a voter it only adds noise — which
is the complaint that started this: "llama and genie are too error prone such
that they are surfacing too many cards that aren't wrong." Two jobs only: break
the 2-2 splits, and flag sites where all four agreed and it does not.

⚠ **THE HOLDOUT MUST NOT CHOOSE BETWEEN THE ENGINES.** Scoring both on the 722
lines and keeping the winner spends it. Ask the structural question instead:
does the model emit the ligatures at all, or has it silently learned to spell
`ȣ` as ου?

## The Paddle run — set up, not yet successful (2026-08-31)

Dataset `johnhboyer/bonitz-paddle-rec` is uploaded and ready; kernel
`johnhboyer/bonitz-paddle-train`; notebook committed at `kaggle/`.

⚠ **THE RUN MUST BE STARTED FROM THE KAGGLE UI** with Accelerator = GPU T4 x2.
A CLI push resets it to P100 and the `accelerator` metadata field is ignored.

Five faults found by running it, in order, each fixed in the committed
notebook:

    eval_batch_step [0, 500]   ran a full eval at step ZERO: GPU memory
                               allocated, GPU 0%, nothing printed for 22 min
    capture_output=True        caught the exit code and buffered every byte,
                               so the hang was invisible. Popen + `python -u`
                               streams AND checks the return code
    the reader, not the GPU    decoding a 1307px PNG per step: reader was 0.85s
                               of a 0.96s batch. Pre-resize once -> 210 samples/s
    image_shape [3, 48, 320]   ~40 CTC timesteps against lines averaging 50.5
                               characters — the right answer was unreachable
                               for 89% of the training set. Now 1024
    NO pretrained_model        training from RANDOM WEIGHTS on 4,266 lines.
                               Loss 546 -> 214 by step 400, then 214 -> 185 over
                               1,700 more, eval edit distance flat at 0.09,
                               accuracy zero. Now fine-tunes from PP-OCRv3 en.

⚠ **THE LAST ONE IS THE LESSON.** Calamari was never trained from scratch — it
started from a model that already knew letterforms and only had to learn this
book. Asking a recogniser to learn what letters ARE from 4,266 lines is not a
tuning problem, it is the wrong experiment.

## RECOMPILE THE ARROWS WITH 107–117 — a fifth, and the fifth is real

⚠ **A ~4x FIGURE STOOD HERE FOR THREE HOURS ON 2026-09-02 AND IT WAS WRONG.**
I counted the 16,332 lines of 118–281 that no unruled card touches and called
them usable ground truth. They are not. A line with no card means only that
the FOUR-READER PANEL RAISED NO QUESTION THERE — and this same file records
that the panel questioned 4.1% of words and left 159,553 unanimous and never
examined, holding an estimated ~160 errors it is structurally blind to. Those
lines are UNEXAMINED, not verified.

John, 2026-09-02: "we are nowhere near being ground truth for 118-281 are we?
We have a bunch of cards left unruled and we haven't done sweeps yet." Both
true. Checked after he said it: every sweep artifact on disk is for 15–62,
63–102 or 107–117. **NOTHING has been swept on 118–281** — not smyth, ngram,
bekker, quotecheck, alphacheck, siglum, accent or diacritic. One panel pass
and nothing else.

⚠ **THE FLOOR ARGUMENT CUTS THE SAME WAY AT SCALE.** kraken r6 is 0.33% CER.
Unswept lines carrying errors near 1 per 1,000 words would pull the next model
TOWARD its own mistakes. Training on unexamined text is not a bigger training
set, it is a worse one.

**What is ready is 107–117, and the old "roughly a fifth" was right.**

    15–102     4,741 lines   already in train.arrow
    107–117    ~1,342 lines  adjudicated AND swept — NOT in the arrows
    118–281    ~16,332       panel pass only, 3,035 cards open, no sweeps

107–117 has 22 columns of corrected text in `work/reconciled/` and 726 rulings
across THIRTEEN stores — cold, carried, followup, ink, homoglyph, accent,
script, latin, margin, space, encoding, impossible, applied. That thirteen is
what ground truth looks like here, and it is the standard 118–281 has not been
held to.

So the recompile is **+28%**, needs no clicks from John, and the corrected text
already exists. Whether 28% moves 0.33% CER is unknown; it is cheap, and it is
the only honest version available.

⚠ **THE HOLDOUT IS STILL JOHN'S CALL.** `stage_split` reads `holdout_columns()`
and RAISES rather than proceed — deliberately, with no override. 107–117 is 22
columns, so holding one or two out is a modest ask. See
`holdout-spent-by-selection`: whatever is named becomes the only honest measure
of whether the bigger model beat the smaller one.

⚠ **PADDLE'S CEILING IS A SCHEDULE QUESTION, NOT A DATA ONE.** `best_epoch
182/200` under a Cosine LR that anneals to ~0 is normal convergence, not
truncation. `bonitz-paddle-long` (500 epochs, same data) tests it for one GPU
session and no adjudication.

**Not yet written:** the Paddle label-file exporter, the tesstrain adapter, and
the Kaggle notebook. Everything upstream of them is on disk and verified.

## The review tool — six defects fixed 2026-08-30/31, all found by John clicking

Each shipped because a check verified the thing being built, not the thing
being broken.

⚠ **A WORD THAT SPELLS A NUMERAL IS NOT ONE.** `νυχος` is ν 50, υ 400, χ 600,
ο 70 + final sigma, so the only `keep as printed` read `νυχοϛ · stigma = 6` —
but 158-L:46 ends `γαμψώ-`. `numeral_card_is_a_word_tail` knew, and was not
consulted.

⚠ **A LINE BOX IS NOT A LINE.** On 231-L the pitch is 56px and the ALTO line
boxes are 82–109px, so consecutive boxes OVERLAP by thirty to fifty pixels.
Every pointer drawn to a line box landed on its neighbour. The tint takes the
WORD's box, inset at each end.

⚠ **SIXTEEN GREYS THREW THE POINTER AWAY.** `_b64` ran `im.convert('L')`.
A fixed grey+washed palette then blotched the paper; an adaptive one lost the
wash entirely. Now: mask from the tint's hue, grey recovered by inverting the
blend, washed pixels moved onto a duplicate half of the palette BY INDEX.

⚠ **EVERY BUTTON ON THIS PAGE IS `width:100%`.** The palette keys inherited it,
so eleven sorts rendered as eleven stacked plates — twice, because
`display:inline-flex` does not help a box that is still 100% wide.

⚠ **ONE BAD ESCAPE KILLS EVERY BUTTON.** A `\'` collapsed to `''`, the script
threw `SyntaxError`, nothing on the page responded. A test now runs
`node --check` on the emitted script; a missing node FAILS rather than skips.

⚠ **THE PAGE TRUSTED ITSELF.** A typed reading for 217-L:54 showed `✓ ruled`
with no entry in the store. The banner was `position:sticky` on a body child of
a 22 MB document. Now fixed to the viewport, and the page re-reads the store on
focus, on waking, and every 30s, turning any card it cannot find red again.

**Two additions John asked for.** A tap-to-insert palette of sorts (`ȣ ϗ ϛ` +
breathings, accents, iota sub, diaeresis, elision), because polytonic Greek is
on no phone keyboard — with a live spell-out beneath it, since two combining
marks over `ȣ` DO NOT RENDER. And the spine's sort offered with another
reader's marks: 151-R:40 and 217-L:54 were both set aside because `ȣ̔̀ς` — οὓς,
what both halves of the panel pointed at — was on no button. Both were answered
with that option the next day.

## The suite

2,400 pass, **15 fail**, 6 skip. The 15 are the fixtures deleted on 2026-08-28
and they FAIL rather than skip on purpose. Diff the failure list before and
after a change rather than counting it.

## ⚠ MANDATORY: never push a Kaggle kernel by hand

    python3 -m bonitz_pipeline.kaggle_preflight work/paddle-kernel --push

On 2026-08-31 nine kernel versions failed in a row and EVERY ONE broke a rule
already written in this file — including one I had rewritten into it that same
morning, hours before breaking it. John: "sounds like you didn't read the
notes. that needs to be part of mandatory process whenever running kaggle from
cli." A note is advice; advice is forgettable. The checks are the notes made
executable, and `--push` refuses on any failure:

    cells compile · no swallowed exit status (`!cmd | tail`) · no hardcoded
    /kaggle/input path · numpy pinned LAST · every pinned wheel exists on PyPI
    · dataset sources ready and no slug collision

Do not delete a check because it has stopped firing. That is what working looks
like.

⚠ **AND THE CLI CANNOT CHOOSE THE CARD.** Kaggle hands out a P100 (compute 6.0)
by default; `paddlepaddle-gpu` 2.6.x is built for arch 61+ and NO cp312 wheel
exists that covers 6.0 — PyPI and Paddle's own cu118 index carry the same three
builds. John set GPU T4 x2 in the UI and v10 ran on a T4; the next CLI push put
it back on a P100, and an `accelerator` field in kernel-metadata.json is
accepted and then ignored. **The paddle run must be STARTED from the Kaggle UI.**
Preflight refuses `--push` on any notebook that needs more than compute 6.0.

## PENDING: page-127-R's spine still carries its running head

`filter_kraken_lines` now drops it (`running_head`, fires once in 328), but
`work/kraken15-102/txt118-281/page-127-R.txt` was NOT regenerated. It still
holds two furniture lines at the top:

    ἀστακός      the guide word
    115          the printed page number

Regenerating is verified to give exactly the old text minus those two, a shift
of 10 canonical characters and 2 line numbers. It is not done because
`word_off` is an offset INTO THE SPINE: the shift strands 22 sites on that
column, 8 of them on cards John has ruled, and moves the line numbering of all
four reader files for it. Spine and readers have to move together, so this
belongs to the next tranche rebuild — do it there, and re-key the 22 sites by
line rather than by offset.

Until then page-127-R is two lines long in the corpus and its line numbers run
two ahead of every other column's.

## Standing constraints

⚠ **No Opus reads of 107+ without John saying so in session.**
⚠ **`space_policy --close-bekker` MUST NOT BE RUN.**
⚠ **`1573a25` is ONE TOKEN.**
⚠ Run tests as `uv run --with pytest pytest tests/ -q`, never piped through
`tail` before a `&&`.
⚠ Reader files are testimony. Corrections go to a queue and reach the text when
the corpus column is built — never into the reader.
⚠ Commits go ONLY to `GIT_DIR=~/Developer/bonitz-text.git`.
⚠ The queues are gitignored. The RULINGS are what is kept.
