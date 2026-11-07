# HANDOFF — Athenian Constitution (Ath. Pol.)

Track: add the Athenian Constitution, the first work cited by chapter.section.
Plan: [`docs/ath-pol-plan.md`](docs/ath-pol-plan.md). Branch `claude/ath-pol-plan-ccd05b`.

## State (2026-11-06)

- Plan written and committed, with the Codex review (18 findings, all held) folded in (plan section 8). **Nothing is built.**
- John answered on 2026-11-06 (plan section 6):
  - **Q1:** Greek from TLG (Oppermann 1928). The costs are recorded under P1.
  - **Q3:** footnotes kept. **Q5:** `AthPol`, shown as "Ath. Pol.". **Q6:** "10.7" left unlinked. **Q7:** palette in v1 (R6). **Q8:** parked.
- **Still open:**
  - Q2, placement and label. The literature summary is in plan section 9; the recommendation is `dubious`, in the appendix beside MM, with the appendix possibly retitled.
  - Q4: the answer to his "why" is in plan section 10. The fragments stay out unless he says otherwise.
  - Building waits on his go-ahead.
- English: Kenyon, Oxford *Works* vol. X (1921), archive.org `worksofaristotle0010wdro_x8m2`, `/page/n370`–`n448`. Public domain, with chapter and section numbers in the margin. Footnotes kept as notes.
- Greek: TLG 0086.003 (Oppermann). It has 298 sections against Kenyon's 299, because Kenyon's 49.5 sits inside Oppermann's 49.4 (one declared merge). Section starts inside a chapter fall early by a median 4 words.
- Design: a third `citation.scheme`, `chapter-section`, on the Isagoge's synthetic-column road (chapter N = column "Na", section = line).

## Decided, and why

- No Bekker numbers will be invented. Section numbers come from Kenyon's printed margins, all read from the page images (299 marks; 298 anchors, since 49.5 has no Greek line).
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
