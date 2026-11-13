# HANDOFF: reader page design rounds

Started 13 Nov 2026. Branch `claude/redesign-build` (unpushed), this worktree. The coordinator for UI work is the
session `aristotle-reader-62`: report to it, and it pings John for decisions. John rules on design; you don't.

## The question John asked (13 Nov, 16:22)

"the look of the plato reader's reader pages is very easy on the eyes. aristotle reader pages? i'm not so sure it's
cut out for long sessions." Then: hill-climb the reader page.

## First step: find out why, with facts

Plato's reader pages are live at https://plato.johnhboyer.com (source `~/Developer/plato-reader`, `app/`). Aristotle's
redesigned reader is on this branch (`app/`, preview on 127.0.0.1:4331 serves `app/dist`). Compare a reader page from
each, same width, same theme, both themes, upright phone, sideways phone (390px tall), 1152 desktop:
- the computed values that set reading comfort: page and text colours (and their contrast), font family, size,
  weight, line height, measure (characters per line), paragraph and line spacing, margins, how much furniture
  (bars, rules, labels, red) sits in the reading field, and anything that moves while reading;
- screenshots side by side.
Report the differences as a table with the numbers, then say which ones plausibly cause "easy on the eyes".

## Then rounds

Show options as pictures, one change per option, on a flip page with tab groups (Desktop, Phone, Sideways),
each option against Now and against Plato. John won't rule from text. The 12 Nov proposal was one review page of every
reader state with a note box under each, then rounds; use it if it fits.
Hill climb: fresh reviewer agents that never built the mock, one Opus round and one Codex round
(`gpt-6.1-sol`, effort medium). Grok is benched.

## What already happened on the reader (12 Nov, from HANDOFF-REDESIGN-BUILD.md)

- Red ruled 12 Nov: the book title and top-bar chapter are ink; chapter numerals, column labels, and footnote markers
  stay red (gate R-R17).
- Fixed 12 Nov night: fonts (Literata/Gentium/Cardo Greek, Literata/EB Garamond English, Literata at 300), no paragraph
  gap in Both view, split-line indent, line numbers 15px and level, footnote box anchored, clipped italic descender in
  the top bar.

## Standing rules

- A vision-impaired reader uses the site on a phone held sideways. Cut furniture, never type size or tap targets.
- No explainer text in the reader: labels, refs, numbers, and the texts only.
- Don't change `--red`. Don't write into `build/dist`. Never git-add `.redesign-shots/` or the root `node_modules/`.
- The design bar is greek-plays' Vase: elegant, stunning, and functional. No stock LLM look.
- John's mid-round ideas are hypotheses to test; say when one doesn't work.
- Pass `model:` on every agent spawn and label it with its model. Implementation and review are never the same model
  family. Codex briefs say "Do not launch a browser or run browser gates".
- Browser runs: tell `aristotle-reader-62` before a full gate run. The search session `aristotle-reader-9c` runs
  them too, and two at once must not happen. Waiters match `^node .*(check-redesign|search-shots|search-counts)\.mjs`.
- Mock-ups and options only until John rules. No commits to app code, no gates, no pushes. Rewrite (don't append) this
  file when you hand off.
