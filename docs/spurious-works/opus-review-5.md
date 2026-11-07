# Opus 5.5 cross-family review of round 4 (HEAD 4bdf8a3368), 2026-11-06

Reviewer: Claude Opus 5.5 subagent, findings only. Harness and planted-defect sets in `opus-review/` (`mut.py`, `m1.json`–`m6.json`); allowance and geometry notes in `allow.txt`, `geo.txt`. Live claims spot-checked by the orchestrator: all confirmed (grep of the current books, plus the re-spacing code at `build_prob_forster.py:2417-2421`).

Planted defects: 51; 31 caught, 20 missed. About 50 live text defects pass verify; all were already present at 6885509b36.

## Findings

1. **Blocker — re-spacing (d) compares a thing to itself.** Lines 2417–2421 treat the other scan's own re-spacing ranges as "agreement". Missed: "inthe", "fr ont", "creatureis". 60 live sites never judged.
2. **Blocker — ~2,300 words checked against one scan only, silently.** B lacks 10.4–10.12 and 31.13–31.19; A lacks 23.6–23.12; verify's footnote zone drops body lines in 4.31, 26.2, 26.36, 26.46, 19.9, 5.42. Only (b) and (e) can fire there. 2,749 of our words matched in one scan only, 242 in neither; the summary does not say so. Missed: lost words, whole sentences, lost "?", inserted comma in those regions.
3. **(g) accepts a mark one scan has.** `_same_word` keeps the longer ending, importing one scan's specks. Live: 21 stray full stops (1.37 "colour. than", 1.40, 5.13, 5.34, 9.3, 10.62 ×2, 11.15 ×2, 11.32, 18.7, 19.15, 20.12, 23.19, 24.14, 26.45, 29.8, 29.10, 30.1 ×2); 11 "?)" sites (1.24, 7.8, 11.18, 16.1, 19.9, 19.48, 20.25, 23.12, 23.23, 32.2, 35.6); 1.25 "them,?", 13.4 "hot,?", 1.31 "change?;", 25.10 "depth?:", 29.13 "them?.", 1.3 "Dogstar,}", 4.23 "fulcrum.}", 10.11 "greenish,t", 24.13 "in the] shade". Reverse: a "?" lost by one scan is unchecked (11.4).
4. **No check for quote marks ours adds or leaves unclosed.** Live: 9.6 "cold‘),", 26.31 "north‘), and wind,’", 11.7 "‘They … air is’", 10.62 "body ’—", 30.1 "‘the sacred disease" (closing lost) and "mortals.’" (call-out). Build rule at line 473 strips a ‘ only at token end.
5. **Comparison ignores case.** Live: book openings "Wuy" (7, 14, 15, 17), "Whuy" (35); 11.37 "OVer", 33.2 "OWing", 29.13 "SO that".
6. **Doubled words can slip** ("in in" 8.9, "does does" 33): (b) decided by index across two alignments.
7. **Summary counts "0 raised call-outs, 0 glued digits" are dead code.** Call-outs now go by geometry (86 A / 117 B boxes; none a body number), glued digits split by `_lexical_pieces`, ® ° * by `_tok`'s edge strip (character class, not position).
8. **Allowance contexts lock in live defects** (11.32 "in. those", 1.3 "Dogstar,}", 30.1 "disease after").
9. Nits: 26.32 "941 6-23" (print 941ᵇ), 30.1 "Aleian" (print Aleïan), 38.5 "surface,a", 19.9 "y a flute" (the print itself reads "y" — editorial call), 314 (f) reasons are one template with the word filled in (sampled ones correct).

## Clean

PRINT_READS 13/54 image-checked, all correct. VERIFY_ALLOW 45 image-checked across all letters, all agree with the print. Independent full-text alignment of both raw scans: no lost body run of 3+ words. Greek only at 19.20, 19.28, 30.14, matching print. Every digit token matched. No hidden body number among geometry removals.
