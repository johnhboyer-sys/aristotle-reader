<!-- Recovered 2026-07-03 from the Phase 1 session transcript (the original
     untracked copy was lost with the blissful-rubin worktree cleanup).
     Canonical build spec as John wrote it - verbatim below. -->

> You're the lead. Delegate reasoning to deep-reasoner, grunt work to fast-worker (or codex if very
> specifically defined task with no ambiguity), and delegate fresh-perspective problems to Codex.
> Show me your plan first, then execute.
# Build spec: Classical Translation Workbench
You are building a desktop application for a professional classicist translating Aristotle
(initially) and, in later phases, Aquinas and other Latin authors. This replaces a Scrivener-based
workflow: two side-by-side documents (Greek, English), verse-mode formatting so one text line =
one Bekker line, Bekker numbers tabbed to the right, manually kept in sync by hand. The app's job
is to make that correspondence automatic, precise, and pleasant to work in for hours at a time.
**This is a real professional tool for daily, sustained use — not a prototype or demo.** The visual
design must be a genuinely polished, considered piece of software: think a well-made writing app
(Ulysses, Scrivener itself, a good native Mac text editor) crossed with a digital critical edition
(a Loeb Classical Library volume). Generic component-library defaults, unstyled form elements, or
anything that reads as a scaffolded admin panel is a failure condition. Take real typographic and
layout care — this is explicitly a document about *reading and writing Greek and English side by
side*, so type, spacing, and rhythm matter more here than in an ordinary app.
## Design principle: it has to just work for a non-technical user
The person building this will use it comfortably; their collaborator will not troubleshoot,
configure, or work around anything — he doesn't use LLMs at all and isn't inclined to poke at
software that's misbehaving. Every feature with a "requires setup" path (AI-assist, Drive-folder
sync, onboarding a new work's corpus) must degrade invisibly and gracefully for someone who never
touches that setup: no blocking dialogs, no technical error text, nothing that half-works and
leaves a confusing trace. If a dependency (Claude Code, Diogenes, Pandoc) is missing, the feature
that needs it should simply be unavailable with a plain one-line explanation, never a stack trace
or a "command not found" message. Assume the collaborator's entire interaction with the app is:
open it, pick a chapter, translate, close it — everything else should either be invisible to him or
something the person sets up once on his behalf (e.g. walking him through pointing the app at his
synced Drive folder one time).
## Orchestration model — how you should work
You are the orchestrator, not the sole implementer. Keep your own context lean: don't read every
file yourself, don't grind through boilerplate yourself, don't run long exploratory sessions in
your own context when a subagent can do it and return a summary. Reserve your own reasoning for
planning, integration, resolving disagreements, and the judgment calls that are specifically yours
to make. Three kinds of help are available:
**deep-reasoner** (Opus 4.8) — a Claude Code subagent for reasoning-heavy work: architecture
decisions, complex debugging, algorithm design, evaluating tradeoffs between approaches. Give it a
well-scoped problem and enough context to think it through properly; it should think thoroughly and
return a concise, actionable conclusion — a decision plus the reasoning behind it, not a transcript.
Set this up as `.claude/agents/deep-reasoner.md`:
```yaml
---
name: deep-reasoner
description: Use PROACTIVELY for reasoning-heavy work — architecture decisions, complex debugging, algorithm design, evaluating tradeoffs between approaches. Think thoroughly; return a concise, actionable conclusion, not a transcript of the reasoning.
model: claude-opus-4-8
tools: Read, Grep, Glob, Bash
---
You are the deep-reasoning specialist for this project. You're handed a well-scoped problem — an
architecture decision, a hard bug, an algorithm to design — plus enough context to think it through
properly. Think thoroughly. Return a concise conclusion the orchestrator can act on directly: a
decision plus the reasoning that supports it, not a stream of consciousness. If the problem is
underspecified, say so plainly and state what you'd need to know, rather than guessing.
```
**fast-worker** (Sonnet 5) — a Claude Code subagent for mechanical, unambiguous work: boilerplate,
tests, formatting, simple edits, scaffolding, anything where the design decision is already made
and only needs executing. Set this up as `.claude/agents/fast-worker.md`:
```yaml
---
name: fast-worker
description: Use for mechanical, unambiguous tasks — boilerplate, tests, formatting, simple edits, scaffolding — where the design decision has already been made and only needs to be executed. Execute efficiently; don't re-litigate decisions handed to you.
model: claude-sonnet-5
tools: Read, Edit, Write, Bash, Glob, Grep
---
You execute well-defined, unambiguous tasks quickly and correctly. The design decision behind what
you're building has already been made — your job is implementation, not re-evaluation. If a task
turns out to be more ambiguous than it looked — a real judgment call, not just typing — stop and
say so rather than quietly making the harder decision yourself.
```
**Codex** (headless, via the person's existing `/codex:rescue --background` tooling) — treat as a
peer, not a subordinate reviewer: a second, differently-built engineer working the problem from a
different angle, on par with deep-reasoner rather than beneath it. Use it two ways:
- For a genuinely well-defined, unambiguous coding task where no process judgment is needed, just
  correct execution — an alternative to fast-worker when you want that different perspective, or
  when Codex is simply the better-suited tool for the specific task.
- For **high-stakes decisions** — ones where getting it wrong is expensive to unwind, e.g. the
  row-lock height-sync algorithm, the continuous-across-work footnote numbering computation, the
  Scrivener-import spine-alignment approach, verifying Pandoc actually produces native Word
  footnotes, the citation-scheme abstraction's shape — dispatch the same problem to **both
  deep-reasoner and Codex in parallel, independently**. Neither sees the other's answer while
  working. You then synthesize the strongest elements of both into the actual decision yourself —
  that synthesis is your job specifically, not something to delegate further.
**Before executing anything** — at the very start, and again at the top of each phase — show the
person your plan: what you're building, in what order, and which pieces you intend to route to
deep-reasoner, fast-worker, or Codex. Wait for their go-ahead before executing.
## 0. Build order — read this first
This spec describes the full intended system across three phases. **Build Phase 1 completely and
correctly. Do not start Phase 2 or Phase 3 features.** Stop when Phase 1 is done, working, and
tested against real content, and report status. The person will review and greenlight the next
phase as a separate session (they're aware this may take multiple sessions/model switches — that's
expected and fine). Where later-phase concerns affect Phase 1's data model or architecture (they
often do — see each section), build Phase 1 to accommodate them even though the features
themselves aren't implemented yet. Don't build speculative UI for unimplemented features; a clean
data model that won't need migration is enough.
**Phase 1 (build now):**
- Tauri + Svelte shell, application chrome, three-pane layout
- Work/chapter data model, corpus onboarding for one work (Posterior Analytics or Metaphysics,
  whichever has TLG files ready — ask if unclear) using bundled TLG
- Row-locked parallel Greek/English editor with auto Bekker numbering
- WYSIWYG formatting (bold/italic/underline) + inline Greek-insertion in English text
- Footnotes (sidebar authoring, token-anchored, superscript rendering)
- Click-to-parse morphology/LSJ panel (bottom drawer)
- Per-chapter self-contained Markdown save format
- Basic single-chapter export (Pandoc → docx, footnotes intact)
**Phase 2:**
- Copy-as-citation clipboard format
- Scrivener import (canonical format, see §9)
- Whole-work compile export
- Google Drive folder sync wiring + conflict-safety conventions
- Citation-scheme abstraction exercised for a second scheme (prep for Aquinas)
**Phase 3:**
- AI-assist (local Claude Code CLI shell-out, API-key fallback)
- Reference-translation panel (import + display, not PDF rendering)
- Latin support: Aquinas citation schemes, Latin morphological parser
---
## 1. Reused infrastructure — do not rebuild these
The person has an existing project, **The Aristotle Reader** (Astro/Svelte web app + Python
pipeline), which already solves several of the hardest problems here. Ask the person for access to
that repository before starting, and port the relevant logic rather than reinventing it:
- **Bekker reference parsing/formatting** — `pipeline/aristotle_pipeline/refs.py`. Reuse the
  parsing and comparison logic (column/line ordering, page-a/b transitions) for the new app's
  citation math.
- **TLG → Bekker-lineated spine** — `pipeline/aristotle_pipeline/stage1_greek.py`. This drives
  Diogenes' `xml-export.pl` in verse mode against the person's local TLG files and produces a
  clean `{column, line_no, text}` spine, handling hyphenation rejoining. Port this logic to
  TypeScript (see §2 — no Python dependency in the shipped app).
- **Chapter-boundary detection** — `pipeline/aristotle_pipeline/stage1_chapters.py`. Where a
  Perseus English TEI has inline Bekker milestones, chapter starts come from those; where it
  doesn't, this module does a monotonic, diacritic-normalized text alignment of a First1KGreek
  TEI's chapter `<div>`s onto the TLG spine. Port both paths. This is not a guess — it's already
  validated against known anchors for works like *De Anima*.
- **Morphology + LSJ data** — the Reader's `analyses.json` (Morpheus-derived, ~99.9% token
  coverage) and its extracted LSJ HTML. Bundle these datasets into this app rather than
  reprocessing; reuse the matching logic from `WordPopup.svelte` as the basis for the click-to-parse
  panel (though the UI container is different here — see §6).
- **CSS design tokens** — the Reader's custom properties (`--text`, `--accent`, `--border`,
  `--font-english`, `--font-greek`, the Cardo/EB Garamond/parchment palette, dark mode). Start from
  these rather than inventing a new visual language; extend as needed for editor-specific UI
  (toolbars, panels) but keep the same restrained, print-informed aesthetic. This app should look
  like a sibling of the Reader, not an unrelated product.
## 2. Tech stack
- **Tauri**, Rust backend, Svelte frontend — matches the stack already planned for the Reader's own
  desktop build, and both intended users (the person and their collaborator) are on macOS, but
  cross-platform costs nothing extra with this choice.
- **No Python dependency in the shipped app.** All corpus-processing logic ported to TypeScript,
  running inside the Tauri app. The collaborator is not technically inclined; the app cannot require
  him to install a Python toolchain, Diogenes, or run pipeline scripts by hand. (He will still need
  Diogenes.app installed locally purely because it's the TLG export tool the Rust/TS side shells
  out to — that's unavoidable and fine, it's a one-time install, not an ongoing dependency.)
- **Editor engine: TipTap** (ProseMirror wrapper), one instance per Bekker-line row, with a
  deliberately restricted schema: bold, italic, underline marks; an atomic inline "footnote marker"
  node; an atomic inline "Greek insertion" node (see §5). Do not use a generic full-document
  ContentEditable — the row-lock layout (§4) requires per-line editor instances whose rendered
  height can be measured and used to drive spacer height on the Greek side.
- **Pandoc**, invoked as a subprocess, for all Markdown → Word conversion (§8). Verify Pandoc is
  present at first export attempt; if missing, prompt to install rather than failing silently.
## 3. Data model
### Work manifest (one per work, e.g. Metaphysics, Posterior Analytics, later Summa Theologiae)
```yaml
id: metaphysics
title: "Metaphysics"
author: "Aristotle"
original_language: greek       # greek | latin
citation_scheme: bekker-metaphysics   # see scheme table below
tlg_author: "0086"
tlg_work: "025"                # example, verify actual id
books:
  - { n: 1, label: "Α" }
  - { n: 2, label: "α" }   # "little alpha" — a later insertion, a distinct book from Α, not a typo
  - { n: 3, label: "Β" }
  # ... through 14 / Ν
```
Citation schemes are pluggable, keyed by `citation_scheme` id:
| scheme id | book label | example rendered citation |
|---|---|---|
| `bekker-standard` | Roman numeral | *Posterior Analytics* II.19, 100a3–b5 |
| `bekker-metaphysics` | literal Greek letter | *Metaphysics* Ζ.17, 1041a6–b3 |
| `aquinas-tbd` | stub only, Phase 3 | — |
Do not hardcode the Metaphysics exception into general logic — implement it as a second scheme
definition, so a third scheme (Aquinas, Phase 3) is a config addition, not a code change.
### Chapter file (the actual saved/synced unit — one per chapter)
Self-contained: carries its own copy of the source-language text, not a live reference into the
corpus. This is deliberate — it keeps the file openable with zero external dependency (matters once
Aquinas/Albertus texts with no bundled corpus enter the picture), and it's the natural unit for
Drive-folder sync (small, chapter-scoped, rarely edited by two people simultaneously).
```markdown
---
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
bekker_start: 1041a6
bekker_end: 1041b33
---
[GREEK]
Τί δὲ χρή λέγειν καὶ ὁποῖόν τι τὴν οὐσίαν, πάλιν
ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν...
[ENGLISH]
What, then, should we say substance is, and what
kind of thing is it? Let us again begin...
[FOOTNOTES]
1: Reading τὸ τί ἦν εἶναι here as "the what-it-was-to-be," following...
```
One line per Bekker line in `[GREEK]` and `[ENGLISH]`, strictly positional (line *n* of English
corresponds to line *n* of Greek) — this is the on-disk mirror of the row-lock editor, and it's
what makes the file diffable and human-readable even outside the app. Footnote markers live inline
in the `[ENGLISH]` block as `[^1]`-style tokens at the anchor position; `[FOOTNOTES]` holds the
definitions. This format is also what feeds Pandoc for export (§8) with minimal transformation.
**Footnote numbering is continuous across the whole work** — not restarting per chapter or per
book, matching ordinary Word/manuscript convention. The ids in `[FOOTNOTES]` (`1`, `2`...) are
*local* to the file — chapter-scoped creation order, used only to anchor `[^n]` markers within that
chapter — they are not the numbers a reader sees. The *displayed* number for a given footnote is
computed at render time: sum the footnote counts of every chapter that precedes this one in the
work's book/chapter order (per the work manifest), then add this footnote's position within the
current chapter. This keeps chapter files independently editable and Drive-sync-safe — no shared
global counter that two people's local copies could desync — while still producing correct,
continuous numbers in both the live editor and every export. Maintain a lightweight per-work index
of footnote counts per chapter (recomputed whenever a chapter's footnote count changes) so this
lookup doesn't mean re-reading every chapter file on every keystroke.
## 4. Row-lock editor
Core mechanic, and the part most worth getting right:
- Each Bekker line is a **row**. A row has a Greek cell (read-only, rendered from the bundled
  corpus) and an English cell (the TipTap editor instance).
- The Bekker line number renders in a narrow gutter on the English side, auto-derived from row
  position — **never directly editable**. It cannot be deleted or fat-fingered, unlike the manual
  tab-numbers in the old Scrivener workflow.
- Row height = max(Greek cell height, English cell rendered height incl. wraps). Use a
  `ResizeObserver` on each English TipTap instance; when its content wraps to multiple visual
  lines, grow the row and insert matching blank vertical space under the Greek cell so the *next*
  row's Greek line and English line still start at the same y-position. This does not need to be
  pixel-perfect while actively typing (a little jitter during editing is fine); it does need to
  settle to a clean, aligned state on blur/idle, matching the reference screenshots' look (dense,
  numbered, both columns starting each Bekker line at the same vertical position).
- No feature to merge two Bekker lines into one translation row. The person deliberately keeps
  strict 1:1 correspondence even when English word order forces an awkward mid-clause break — this
  is a hard design constraint they've asked for explicitly, not an oversight to fix.
- Reference screenshots of the target density/format are provided separately — match that visual
  rhythm (tight line spacing, small right-aligned line numbers, Times-like serif for both
  languages in the working view — the polished Cardo/Garamond treatment is for *export*, the
  live-editing view can be plainer and denser, optimized for throughput not beauty, per the
  person's note that this pane doesn't need to be as nicely formatted while working).
## 5. WYSIWYG formatting + inline Greek
Minimal toolbar: **Bold**, *Italic*, <u>Underline</u>. Keyboard shortcuts (Cmd-B etc.) required, not
just toolbar buttons — this will be used constantly.
Inline Greek insertion: translators routinely embed a Greek term mid-sentence in the English prose
itself (e.g. "the *what-it-was-to-be* (τὸ τί ἦν εἶναι)"), not just in footnotes. Provide a quick
toggle (toolbar button + shortcut) that switches the active typing span to the Greek polytonic font
and, ideally, a Beta-Code-to-Unicode input transform (typing `to\ ti/ h)=n ei)=nai` should render
as τὸ τί ἦν εἶναι — Aristotle's own technical term for essence, "the what-it-was-to-be," and a good
test case precisely because it exercises a proclitic article, an acute, a breathing-plus-circumflex
on ἦν, and a breathing-plus-circumflex on the diphthong in εἶναι in one short phrase)
so the person isn't switching system keyboards mid-sentence. If a full Beta Code input transform is
too large for Phase 1, ship the font-toggle alone and flag Beta Code input as a fast-follow.
## 6. Click-to-parse panel
Bottom drawer, not a popup or overlay that covers the line being worked on. It should push the
editing viewport up / shrink it, not float over it — standard bottom-panel pattern (think an IDE's
integrated terminal). Resizable, dismissible, reopens at last size. Clicking any Greek token shows
its morphological analysis and LSJ entry in this panel, reusing the Reader's existing lookup logic
against the bundled `analyses.json`/LSJ data (§1). Latin parsing (Whitaker's Words or equivalent) is
explicitly Phase 3 — the panel's data source should be abstracted by language so adding a Latin
backend later doesn't touch the UI.
## 7. Footnotes
- Anchor: attaches to a specific word or phrase (a TipTap text selection), stored as a token-range
  reference in the chapter file's alignment metadata.
- Render: superscript marker at the **end** of the annotated phrase (not inline mid-phrase),
  matching the Scrivener convention already in use. The anchored phrase itself gets a subtle
  highlight/underline while the footnote sidebar is open, for the author's own orientation — this
  highlight is an editing aid, not part of any export.
- Authoring: opening a footnote (via toolbar button or shortcut on a selection) opens a right-side
  panel with a rich-text field (bold/italic minimum) for the note body. The panel can be left open
  while continuing to work, or closed — it's not modal.
- Numbering: **continuous across the whole work**, never restarting per chapter or per book — this
  is how it would behave in Word. See §3 for how the displayed number is computed from each
  footnote's local, chapter-scoped id rather than a stored global counter.
## 8. Save format and export
- **Save**: the chapter Markdown format in §3, written on every meaningful change (debounced
  autosave, not manual save-only — this is a Scrivener replacement and Scrivener autosaves).
- **Single-chapter export**: transform the chapter file into Pandoc-flavored Markdown — inline
  Bekker numbers get stamped into the body at this step (they're absent from the working file,
  present in the export, per spec), footnote tokens become Pandoc `[^n]` syntax feeding Pandoc's
  native footnote handling, then `pandoc -o chapter.docx`. Verify the resulting docx has real
  Word footnotes (bottom-of-page, native Word footnote objects) — this is the specific failure mode
  the person hit exporting Scrivener directly (it produced in-page HTML-style endnote links, not
  real Word footnotes). If Pandoc's default output doesn't satisfy this, use a Pandoc reference
  docx template with footnote styling to force correct behavior; test against actual Word, not just
  visual inspection of the docx XML.
- **Whole-work compile** (Phase 2): concatenate all chapters of a work in book/chapter order into
  one Pandoc-flavored Markdown document, renumbering footnotes to be continuous across the whole
  compiled document regardless of per-chapter numbering in the source files (a display-time
  renumbering, not a mutation of the stored files), then Pandoc to a single docx. This is the
  document meant for actually sending to a publisher or to the collaborator for review, so it needs
  to look finished: consistent heading levels for book/chapter breaks, running Bekker references
  somewhere sane (running header or per-chapter inline), no Greek column (English-only manuscript
  format — confirm with the person if a bilingual export is also wanted; default to English-only).
## 9. Scrivener import (Phase 2)
The person will pre-convert their existing Scrivener chapters into a canonical intermediate format
before import. A separate conversion aid (`scrivener-import-guide.md` and
`scrivener_to_canonical.py`, delivered alongside this spec) handles the mechanical part —
stripping Scrivener's inconsistently-formatted trailing line numbers and reassembling matched
Greek/English line pairs.
**Do not trust any Bekker numbers carried over from Scrivener, even where present.** The person's
own tab-numbers are inconsistently formatted across years of files (parenthesized vs. bare, full
references vs. bare offsets), so the canonical format's `bekker_start` is a *hint*, not ground
truth. The reliable path: text-align the imported Greek lines against this work's authoritative
bundled TLG spine — the same monotonic, diacritic-normalized alignment already used for
chapter-boundary detection (§1) — and recover each line's real Bekker reference from the content
match itself. `bekker_start`, when present, only narrows the search window (useful since some
phrases recur elsewhere in a work); it never overrides what the alignment finds. If a line can't be
matched confidently (garbled paste, an OCR artifact, a passage revised enough in Scrivener that it
no longer matches the source), flag it for manual confirmation rather than guessing — the same
audit-by-exception principle used throughout the rest of this project.
Canonical format:
```
---
work: metaphysics
book: 7
chapter: 17
bekker_start: 1041a6   # optional hint, not authoritative — see above
---
[GREEK]
...one line per Bekker line...
[ENGLISH]
...one line per Bekker line, same count as GREEK...
```
Import parses this into the chapter-file data model (§3), aligns `[GREEK]` against the bundled
spine to assign each line's real Bekker reference, then positionally carries `[ENGLISH]` line *n*
onto whatever reference Greek line *n* resolved to. Validate line counts match between blocks
before attempting alignment, and surface a clear error (with line numbers) if they don't.
## 10. Copy-as-citation (Phase 2)
Copying a selection of English translation text should place a formatted string on the clipboard
(plain text is sufficient — this needs to work pasting into arbitrary apps, not just this one):
```
{english text}. ({work title} {book label}{chapter}, {bekker range}: {greek text})
```
`{bekker range}` formatting — en dash throughout, and this applies everywhere a range is displayed
(this citation string, the chapter library browser, export headers), so implement it as one shared
utility rather than reformatting per call site:
| case | rule | example |
|---|---|---|
| same page, same column | omit repeated page+column on the close | `1041a5–20` |
| same page, column changes (a→b) | omit repeated page number, keep column letter on the close | `1041a31–b5` |
| different page | full reference on both ends | `1041b25–1042a5` |
Concretely, for a Metaphysics selection:
> Man is a rational animal. (*Metaphysics* Ζ.17, 1041a6–10: ἄνθρωπός ἐστι ζῷον λογικόν)
For non-Metaphysics works, book label is a Roman numeral per the citation scheme (§3):
> ...( *Posterior Analytics* II.19, 100a3–8: ...)
The Greek span is the exact corresponding range for the selected English rows (row-lock makes this
a direct lookup, not alignment guesswork). If the selection spans many lines, include the full
Greek span — no truncation in Phase 2; revisit only if this proves unwieldy in practice.
Aquinas citation format is explicitly out of scope until Phase 3 — the person will specify the
correct convention (they've indicated it should follow Corpus Thomisticum's convention for the
given work-type, which varies by work) when that phase starts.
## 11. Cloud sync (Phase 2)
No Drive API, no OAuth, no backend. The app operates on a plain local folder; the person points it
at a folder that Google Drive for Desktop (or Dropbox, or any folder-sync client) is already
syncing. Ordinary file reads/writes only.
To keep this safe with two people editing:
- One file per chapter (already the storage unit, §3) — collisions are rare because you and the
  collaborator are usually working different chapters.
- On app launch/focus, if a chapter file's on-disk mtime/hash has changed since it was last read by
  this app instance, reload before allowing edits, and warn if there are unsaved local changes that
  would be overwritten — don't silently clobber.
- If Drive produces a `filename (Conflicted copy...)` file, surface it in the app's file browser
  as a flagged item needing manual resolution, rather than ignoring it.
- Document (in-app help text is fine) the turn-taking convention: work in different books/chapters
  at a time to avoid collisions in the first place. This is a workflow discipline, not something
  the software needs to enforce.
## 12. AI-assist (Phase 3)
Primary path: shell out to the local `claude` CLI in headless/print mode (`claude -p "..."`) for a
"suggest a translation for this line" action, drawing on whatever Claude Code auth is already active
on the machine (subscription-based, no separate API billing). If the CLI isn't found or isn't
authenticated, fail gracefully to a simple "copy this line + context to clipboard" action rather
than a broken feature. Provide a settings toggle for a direct Anthropic API key as an alternative
path (useful only if this app is ever shared beyond the person and their collaborator, each of whom
has their own subscription) — not the default, and clearly labeled as pay-per-use if enabled.
In practice this feature is for the person, not the collaborator, who doesn't use LLMs at all. The
control should be present and functional for whoever has Claude Code set up, and simply unremarkable
for whoever doesn't — not a greyed-out control demanding attention, not an onboarding nag, no
unprompted setup instructions. Someone who never touches it should experience the app as if the
feature isn't there.
## 13. Reference-translation panel (Phase 3)
Scaffold the panel/layout slot now if it's cheap to do so once the three-pane structure exists;
don't build the feature itself in Phase 1. When built (Phase 3): **not** a PDF viewer — skip that
complexity entirely. Instead, an "import reference translation" action that accepts plain
text/Markdown (the person will OCR their personally-held copies of copyrighted reference
translations for private study use, and hand the app the resulting text — this raises no licensing
question since nothing is bundled or redistributed, only imported for the importing user's own
local use) and displays it in the panel, ideally line-matched to the Bekker range currently in
view using the same alignment approach as the Reader's third-party-translation alignment
(TF-IDF + monotonic DP) if a precise match is wanted, or just chapter-level display if that's
simpler to ship first.
---
**Questions to ask the person before or during the build, rather than guessing:**
- Confirm exact TLG work-id for whichever work is used for the Phase 1 corpus onboarding test.
- Confirm whether whole-work export (Phase 2) should offer a bilingual mode in addition to
  English-only manuscript mode.