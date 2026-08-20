# HANDOFF: the LSJ sense hierarchy, deployed

Generated: 2026-08-19 night · Session focus: redeploy the site, which turned into fixing how every dictionary entry renders

## 1. Goal

John asked for a redeploy. Live turned out to be byte-identical to `gh-pages` `f1e0c735` with nothing deploy-relevant merged since — but an unmerged PR (#92) held a fix he had wanted since launch: LSJ entries rendered as one wall of prose because the sanitizer dropped every sense wrapper. Shipping that correctly took the rest of the session.

## 2. Current State

**DEPLOYED and LIVE:** gh-pages `f1e0c735` → `101aba86`, from `origin/main` `3a561b34f`. Full record in `DEPLOY-STATUS.md` — read it before the next deploy, especially the `data/reports` trap.

- **#92** (merged) got the sense wrappers (`div`, `data-level`) past `sanitizeHtml` and put LSJ rendering behind one shared call, `renderLsjEntry`.
- **#93** (merged) made the hierarchy correct for every entry, put each quotation on its own line, and fixed two accessibility breaches #92 had introduced.

## 3. Key Decisions (and why)

- **Depth is relative to the entry, not to the dictionary.** `data-level` is absolute and 759 entries never use level 1 (λόγος opens at 2). `renderLsjEntry` stamps `data-depth` — the ranks THAT entry uses, compressed onto 1..n — and the stylesheet reads depth. **`data-level` deliberately stays in the markup**, which is why `workbench/src/components/LexiconDrawer.svelte:376` and the older tests kept working with no change.
- **Compression, not subtraction.** 1,836 entries skip a rank (1,621 run 1 → 3); subtracting the shallowest left those a step too deep.
- **Level 0 is not a rank.** ὅς and ποιέω use it for a note above the entry; ranking it pushed their real A/B/C down a level.
- **A jump list must be the entry's own division:** two numbered sections sharing one real parent, covering the entry rather than one branch, numbers never repeating. A populated depth that fails any of those ENDS the search — descending past it published one branch's sub-senses as the entry's main senses (εὔσημος).
- **Space, never punctuation.** Quotations are separated by a rendered line break inserted before the citation. Printing a comma LSJ did not set would put a mark in the dictionary its editors never wrote.
- **A wrong list is worse than no list.** 92 → 1,628 entries, and every one of the ~740 candidates dropped along the way was dropped because it misrepresented the entry.

## 4. Traps (new this session)

- **An app-only build DELETES `data/reports`.** The 82 quality reports are pipeline output, untracked, and only 12 survive locally; `rsync --delete` staged 76 live files for deletion. Restore with `git checkout HEAD -- data/reports` in the gh-pages clone before committing. This will recur on every app-only deploy.
- **`grep --include=*.html` under zsh fails to glob and the command never runs** — it prints an error and your loop records a clean `0`. Every "nothing found" check needs a positive control. This nearly passed a dangling-reference check that had not looked at anything.
- **The Agent tool pins a subagent's cwd**, so a brief saying "cd to the review worktree" is ignored and Codex reviews an EMPTY diff from a tree sitting on `main`. Drive `codex-companion.mjs` directly from the target directory, or pass `grok --cwd`. Both reviewers fell into this; both had to be relaunched.
- **The minifier writes `:before` with one colon.** Grepping shipped CSS for `::before` finds nothing and looks like the rule failed to ship.
- **The in-app browser pane can report a 0×0 viewport**, which makes every geometry measurement meaningless while looking like real overflow. Playwright (`mcp__plugin_playwright_playwright__*`) gave real numbers and real screenshots.
- **Verify a test bites.** Restoring the old rule must fail the test that names it — two of the first tests written passed either way.

## 5. Open Work

- **Sense numbers stop at 4 levels of colour grading** but the corpus only reaches depth 4 (plus 2 entries at level 0), so depth 5 rules are unused forward-compat.
- **`.lsj-bibl` is `0.82em` and was left alone** — it predates all of this and is how the printed dictionary sets a reference. Changing it is John's call, and it is the one remaining place in the LSJ block smaller than the entry text.
- **404 entries have no sense divisions at all** (τεός is one gloss and a citation list). Verified NOT a pipeline loss: corpus-wide there are 0 entries carrying a sense number without a sense div.
- **3 entries whose jump list sits under a single ancestor chain** (ἀνακάμπτω: 1:- 2:II 3:2 4:b/c/d) list b/c/d. Honest but arguably not worth a list.
- Older items unchanged: Ostwald ticks outside Book I, Owen note 44, footnote paragraph structure, desktop v0.2.0 draft release, `/bonitz` XSS fix, and the two offline corpus features (#88–#91) still awaiting their reader wiring.

---
## Prompt for the Fresh Agent

Read this file, then `DEPLOY-STATUS.md`. The site is live and current as of 2026-08-19 night; nothing is held. If you deploy, the `data/reports` trap above will bite you unless you handle it.
