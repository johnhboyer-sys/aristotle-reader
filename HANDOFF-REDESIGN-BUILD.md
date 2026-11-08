# HANDOFF: redesign build (direction B)

Written 8 Nov 2026 by the mockup track. You are the build session. You build
direction B ("Poster") into the live site, then make the new share images.
Rewrite this file (don't append) when you hand off.

## Start here

1. Read `CLAUDE.md` at the repo root, then **`docs/redesign-build-brief.md`
   in full**. The brief is the spec. It has 48 requirements, each with a check,
   and nothing in it is left open for John. If the brief doesn't settle
   something, that's a defect in the brief: stop and ask John. Don't pick.
2. The brief's "Safeguards" section binds you:
   - Work on your own branch, cut from `origin/main`.
   - Nothing merges to `main` and nothing deploys until John has seen the
     side-by-side screenshots and said yes.
   - The scratch kit (`~/Developer/aristotle-plates-scratch/kit/`), the
     mockup and `docs/redesign-kit/` are read-only for you.
   - Build in stages: home; work page and credits; reader; search; lexicon.
     A stage passes its screenshot gate (brief §6) before the next starts.
   - A screenshot gate counts only after you've shown it failing against the
     current live design.
   - A model family other than yours judges every screenshot gate.
3. Reference mockup: round eight, v59,
   https://claude.ai/artifact/7Rf66bAjGSuMDrTLZwjbQL. The kit files are the
   source of truth, not the artifact.
4. Effort: run at high. If the reader stage fails its screenshot gate twice,
   raise that stage to xhigh, not the whole build.
5. Routing: follow the session's budget board. On 8 Nov it said
   implementation → Codex (`--model gpt-6.1-sol --effort medium`),
   verification → Claude. Load the `delegate` skill before your first spawn.
   Every agent you spawn gets `model:` set explicitly. Implementation and
   verification are never the same model family.

## Report to John

He reads on a phone over Remote Control. Ping him (push notification) at:

- the end of each stage, with the side-by-side screenshots;
- any question the brief doesn't settle;
- the end, with everything below.

Plain, short, active writing. Use the pronoun given, without comment.

## After the build: the share images (John, 8 Nov, 17:07)

Do these last, after John has approved the built site on your branch. Each
image shows the new design: a plate with the title in B's red capitals, B's
fonts and colours, never the old look. Show John every image before it ships
anywhere. Each one also gets a check: its size in pixels, its file size, and
a look at it at the size people will see (a phone feed, a link preview).

1. **A new card for John's homepage (johnhboyer.com).**
   - The source is `~/personal-website/`. It is **not a git repo**,
     so copy any file to a dated backup before you change it.
   - The Aristotle card is the `<a class="record" href="https://aristotle.johnhboyer.com/">`
     block in `index.html`. Its picture is `assets/aristotle-shot.png`,
     1280×860, a screenshot of the reader.
   - Make a new screenshot of the built site at 1280×860, in the same frame
     as the other cards' `*-shot.png`, and replace that file.
   - Check that the card's list ("Complete works", "Greek and English", …)
     is still true; change the words only if they're wrong.
   - Hosting is a Cloudflare Worker (`wrangler.jsonc`, Worker `johnhboyer`).
     It serves `dist/`, not the root, so copy changed files into `dist/`.
     **Deploy (`npx wrangler deploy` from that folder) only on John's yes.**
2. **New OG cards for the site.**
   - `app/public/og-default.png` is used by every page (Landing,
     ReaderShell, LemmaPage, 404, glossary, advanced, attribution, home).
     It is 1200×630.
   - `app/public/og-support.png` is the Support page's card. It is
     2400×1260, the same 1.91:1 shape at 2×.
   - Keep the file names, the sizes and the `og:image:width`/`height` tags,
     so no page code changes.
   - Check the text at 600×315 and that the support card has no gated
     translation prose (the deploy leak check covers `app/public`).
   - These ship with the site deploy, so they wait for John's yes like the
     rest of the build.
3. **A new image for the Stripe payment page.**
   - The Support link is the Stripe Payment Link `SUPPORT_URL` in
     `app/src/lib/support.ts`.
   - Make the image file only. Look up Stripe's current size and format rules
     for a Payment Link's product image in Stripe's own docs, and meet them.
     Don't guess them.
   - **John uploads it in the Stripe dashboard himself.** Changing account
     settings is his. Hand him the file with its path, and say where in the
     dashboard it goes.

## Where things are

| What | Where |
|---|---|
| The spec | `docs/redesign-build-brief.md` |
| Design history and every ruling | `HANDOFF-REDESIGN.md` (top section wins) |
| B's code (read-only) | `~/Developer/aristotle-plates-scratch/kit/dirs/b/`; copies in `docs/redesign-kit/dirs/b/` |
| Reader-column fixes (read-only) | `~/Developer/aristotle-plates-scratch/colw/` |
| Plates and manifest | `kit/dirs/b/img/plates/{desk,phone}/`, `work/final-plates-2026-11-08.json` |
| Deploy recipe | `DEPLOY-STATUS.md`; deploy only with John's yes |
| Homepage source | `~/personal-website/` (not git; Worker `johnhboyer`) |

## Done means

- All five stages pass their gates and screenshot gates.
- John has seen every side-by-side and said yes.
- The PR is open.
- The three share-image tasks are done and shown to John:
  - the homepage card is staged in `dist/`, deployed only if he said so;
  - the OG cards are in the PR;
  - the Stripe image is handed to him.
- This file is rewritten with the state.
