# Calamari round 2 — retrained on 15–102, scored 2026-08-25

Trained on Kaggle (T4 ×2, five folds, two in parallel) on the **same 161
columns / 9,185 lines kraken round 6 saw**, against ensemble5's 83 columns.
Notebook: `~/Developer/bonitz-calamari-run/calamari-round2-kaggle.ipynb`.
Models: `work/calamari/ensemble5-15-102/best_models/` (untracked — `work/*`).

All five folds are real members, not stubs — last epochs **44, 36, 50, 41, 61**,
best within-fold val_CER 0.51–0.69%.

## The holdout, scored through `calamari_score` — same 722 lines, same harness

| class | ensemble5 (83 cols) | **round 2 (161 cols)** | kraken r6 |
|---|---|---|---|
| **CER** | 1.012% (380 edits) | **0.458% (172)** | **0.330% (124)** |
| `ȣ` ou-ligature | 303/305 | 304/305 | **305/305** |
| `ϗ` kai | 108/108 | 108/108 | 108/108 |
| combining grave | 122/128 | 127/128 | **128/128** |
| combining acute | 15/22 | 16/22 | **20/22** |
| combining perispomeni | 80/99 | 96/99 | **97/99** |
| **combining smooth** | 53/54 | **54/54** | 53/54 |
| combining rough | 5/7 | 6/7 | 6/7 |

⚠ acute and rough are under 30 instances — indicative, not precise.

**CER more than halved and every class improved.** The 78 extra columns were
the whole story, which is what the 2026-08-22 audit predicted when it killed
"do not retrain": ensemble5 trained on half the data, and the per-class table
that had justified keeping it was measured on NFD-decomposed text.

**The rough hole is closed** — 56.76% (measured NFC on the cold read) was the
number that made calamari look unusable on the marks this project exists to
record. And **smooth is the first class where calamari genuinely beats kraken
on equal footing**, 54/54 against 53/54.

Kraken stays the model of record: better CER, and 20/22 on acute against 16/22.
But calamari is now a real second engine rather than a weaker reader whose
votes add noise — which is what the 107–112 panel needs.

## ⚠ THE LINE IMAGES MUST COME FROM THE COMPILED ARROWS

A first attempt to read 107–112 was thrown away. `ketos compile` crops each
training line **to its polygon**; naive full-width rectangles cut from the
column PNG are a different image distribution. Calamari reported 68.85% mean
confidence against 99.63% on the holdout, and the text degenerated into noise
after the first line of each column:

    kraken r6 : 'Ζπ4. 706a18, 22. θερμότερα τὰ δεξιὰ τȣ͂ σώματος τῶν'
    calamari  : 'σέν , εξν ηεόόγοι ξιήροε τιν'

The confidence number is what caught it. **This is the second time this exact
mistake has been made** — 2026-08-22 fed it three-line-tall review-card crops
and reported 37.8% CER as a completed run. Any calamari read of a new tranche
must dump its images the way `calamari_export` does: from a compiled arrow,
never re-cropped.
