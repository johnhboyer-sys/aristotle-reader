# HANDOFF — Athenian Constitution (Ath. Pol.)

Track: add the Athenian Constitution, the first work cited by chapter.section.
Plan: [`docs/ath-pol-plan.md`](docs/ath-pol-plan.md). Branch `claude/ath-pol-plan-ccd05b`.

## State (2026-11-06)

- Plan written and committed; Codex review (18 findings, all held) folded in, see the plan's section 8. **Nothing is built.** John approves the plan, and answers Q1–Q8 in it, before any code.
- Recommended English: Kenyon, Oxford *Works* vol. X (1921), archive.org `worksofaristotle0010wdro_x8m2`, text on `/page/n370`–`n448`. It is public domain (1921) and prints chapter and section numbers in the margin.
- Recommended Greek: Perseus `tlg0086.tlg003.perseus-grc2.xml` (Kenyon OCT 1920, CC BY-SA 4.0), not TLG 0086.003 (Oppermann 1928), because TLG's section breaks are only line-exact and it lacks 49.5. This is John's call (Q1).
- Design: a third `citation.scheme`, `chapter-section`, on the Isagoge's synthetic-column road (chapter N = column "Na", section = line).

## Decided, and why

- No Bekker numbers will be invented. Section numbers come from Kenyon's printed margins, all 299 read from the page images.
- The URL hash stays `#49a3` and only the displayed labels read "49.3". Changing the hash format would touch every work's scroll spy and saved positions.

## Facts a builder needs

- `/page/nN` on archive.org = hOCR page index N+1 in `_hocr.html`.
- LSJ: 527 citations as `tlg,0086,003:C:S` (516 with a section, 11 chapter-only). One, δίδραχμον "10.7", has no such section; the word is in 10.2.
- The LSJ shared merge is last-writer-wins, so the G2 byte-compare needs a full rebuild.
- This worktree has no `build/`. The TLG export lives in `.claude/worktrees/nice-dubinsky-1ea5fd/build/export` (see memory note on worktree builds).
- Scratch copies of the TEIs, vol. X hOCR and Gutenberg #26095 were in this session's scratchpad. They are not kept; refetch them (URLs in the plan).

## Not done

- No source files, manifest or code.
- Bell, Poste and Rackham OCR not sampled.
- Rackham's US status not settled (it doesn't change the pick).
