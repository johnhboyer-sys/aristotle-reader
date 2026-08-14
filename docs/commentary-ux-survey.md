# Digital commentary UX — prior-art survey

*Researched 2026-08-07 by a Grok agent (live fetches via Browserbase; docs/reviews where sites were bot-blocked; unverified claims marked as such in the body). Feeds the commentary-layer plan's design passes and unknowns item 16. The report's final section was truncated mid-item by the agent; the visible cut is noted at the end.*

# Commentary UX survey for bilingual Aristotle reader

Sources: live fetches where reachable; docs/reviews where bot-blocked (Digital Dante Anubis; some Sefaria help). Unverified claims marked.

---

## 1. Sefaria  
https://www.sefaria.org · https://deepwiki.com/Sefaria/Sefaria-Project/3-reader-interface · https://developers.sefaria.org/docs/commentaries

| | |
|---|---|
| **Layout** | Desktop: main text column + right `ConnectionsPanel` (Resources / About / Lexicon / Translations). Multi-panel desktop; single-panel mobile (architecture docs). Bilingual source/translation stacked or side-by-side. |
| **Anchoring** | Segment-keyed (verse/segment refs). Click segment → related links load in sidebar. URL can pin a source (`with=Rashi`). Discovery: open Resources / click any segment (not sparse gutter dots). |
| **Sync** | Sidebar content follows selected segment; text infinite-scrolls independently. |
| **Multiple** | Many links per ref, grouped by category (commentaries, midrash, etc.); filter by work. |
| **As book** | Yes — commentaries are first-class texts (`Rashi on Genesis`, `dependence: Commentary`, `many_to_one` / `one_to_one` auto-links). Open commentary as primary; base ref remains the link key. |
| **Well** | Dual citizenship of commentary (link *and* book) + dense connection graph. Closest model to your poles. |
| **Badly** | Sidebar floods with every link type; little progressive disclosure of “one active commentary.” |

---

## 2. Dickinson College Commentaries  
https://dcc.dickinson.edu/caesar/book-1/chapter-1-1

| | |
|---|---|
| **Layout** | Single scroll: continuous Latin, then `notes` block, vocab/maps/media nearby. Mobile = same stack. |
| **Anchoring** | Notes headed by bold lemmas from the text; text itself is plain (no live highlights in fetched HTML). Discover notes by reading the list below, not by scanning the text. |
| **Sync** | None — static chapter page. |
| **Multiple** | One compiled school commentary (sources credited). |
| **As book** | The *edition* is the book; text and notes are co-equal sections of one chapter. |
| **Well** | Lemma-headed notes + grammar cross-refs + maps — dense, learnable. |
| **Badly** | No in-text “this word has a note” cue; long note lists bury discovery. |

---

## 3. Digital Dante (Columbia)  
Live site bot-blocked (Anubis). From review: https://crln.acrl.org/index.php/crlnews/article/view/26518/34430

| | |
|---|---|
| **Layout** | Per-canto page: Petrocchi Italian + Longfellow/Mandelbaum, Barolini *Commento*, course video, illustrations. |
| **Anchoring** | Canto-level scholarly essay interlinked with text (line-level UI not re-verified here). |
| **Sync** | Same-page multimedia tabs/sections (review); scroll sync not verified. |
| **Multiple** | One primary modern commentary (+ translations); not a multi-commentator stack. |
| **As book** | Commentary is continuous prose *about* the canto; poem remains co-present. |
| **Well** | Canto as unit of study; commentary + media co-located. |
| **Badly** | Single-voice; harder to compare historical commentators (DDP’s strength). |

---

## 4. Dartmouth Dante Project (+ Dante Lab)  
https://dante.dartmouth.edu/help.php · Dante Lab: http://dantelab.dartmouth.edu

| | |
|---|---|
| **Layout** | Classic DDP: search form → hit list → full commentary record. Not a continuous dual-pane reader. Dante Lab is the “next gen reader” (not fully re-fetched). |
| **Anchoring** | Cantica / canto / **line** (ranges include a queried line). Hits show commentary name + locus. |
| **Sync** | None in classic UI — query → result. |
| **Multiple** | 70+ commentaries; multi-select, chronological results, language filter. |
| **As book** | Commentary *is* the document; poem line is a citation key only. |
| **Well** | Best multi-commentary *comparison by locus* in this survey. |
| **Badly** | Reading the poem and reading commentary are separate tasks (classic DDP). |

---

## 5. Perseus Scaife Viewer  
https://scaife.perseus.org · https://sites.tufts.edu/perseusupdates/2026/04/27/updates-to-the-scaife-viewer-dictionaries-commentaries-and-a-preliminary-interface-redesign/ · https://classicalstudies.org/scs-blog/stephensansom/review-perseus-digital-library-scaife-viewer

| | |
|---|---|
| **Layout** | 3-pane: left nav/meta, center CTS passage, right study tools (morph, dictionary, commentary widget, settings). |
| **Anchoring** | Passage window (e.g. lines 1–30). Commentary widget lists notes for that section; expand to scroll full text. Word tools need Highlight mode. |
| **Sync** | Tools track current passage load; not line-by-line auto-scroll of a full book commentary. |
| **Multiple** | Widget-based (CHS Homer notes, Jebb Sophocles, etc.); coverage uneven. |
| **As book** | Limited — commentary is a side widget over a passage, not its own TOC. |
| **Well** | Clean right-rail “study stack” (dict + morph + commentary). |
| **Badly** | Widget overload / incomplete coverage / lag (SCS review); translation alignment can drift. |

---

## 6. Chinese Text Project  
https://ctext.org/analects/xue-er · https://ctext.org/discuss.pl?if=en&thread=3791477

| | |
|---|---|
| **Layout** | Numbered sections; Chinese + English often stacked. Compact/desktop toggle. |
| **Anchoring** | Per-paragraph node: Dictionary / Parallel / **Show commentary** / Meta. Interleaved classical notes appear in some editions (users report 注 mixed into 原文 with wrong weight). |
| **Sync** | Section-local expand; no dual-scroll book pair. |
| **Multiple** | Commentary sources per corpus; not a polished multi-toggle. |
| **As book** | Commentaries also live as library texts; interleaving can blur “base vs note.” |
| **Well** | Section toolkit (dict + parallels + commentary) at every node. |
| **Badly** | Interleaved notes without clear visual hierarchy confuse base text. |

---

## 7. Folger-sourced digital Shakespeare (CoLab; Folger texts)  
https://shakespearecolab.org/texts/navigating-digital-texts/ · Folger textual notes often separate pages, e.g. https://www.folger.edu/explore/shakespeares-works/the-taming-of-the-shrew/textual-notes/

| | |
|---|---|
| **Layout** | Reading text with colored hyperlinked words/phrases; popovers for notes/media. |
| **Anchoring** | Span highlights (red/blue). Hover/click → pop-up; **click outside to close**. |
| **Sync** | Ephemeral popover only. |
| **Multiple** | Per-edition notes, not multi-commentator switch. |
| **As book** | No — glosses, not commentary books. |
| **Well** | Span cue + click-off-close matches your ephemeral peek. |
| **Badly** | Pop-ups can feel fragile; deep commentary needs another product. |

---

## 8. Genius.com  
Secondary UX: https://tomcritchlow.com/2019/02/12/annotations/

| | |
|---|---|
| **Layout** | Lyrics center; annotation layer often **hidden until engaged**. Desktop panel; mobile bottom/overlay. |
| **Anchoring** | Span highlight on annotated text → click opens that annotation. Dense texts become “highlighted forests.” |
| **Sync** | Panel follows selected span; not continuous dual-scroll of two books. |
| **Multiple** | Community annotations; “canonical” annotation often promoted. |
| **As book** | Annotations are not sequential books. |
| **Well** | Span discoverability + clean open/close (vs always-on chrome). |
| **Badly** | Highlight density can destroy continuous reading; social noise. |

---

## 9. Hypothes.is  
https://web.hypothes.is/blog/fuzzy-anchoring/ · UX critique: https://tomcritchlow.com/2019/02/12/annotations/

| | |
|---|---|
| **Layout** | Host page + right annotation drawer (often default-on). |
| **Anchoring** | Robust: quote + prefix/suffix, DOM↔string map, fuzzy match (`diff-match-patch`) when text shifts. Highlights mark annotated spans. |
| **Sync** | Sidebar list ↔ highlight; drawer can fight host layout, esp. mobile. |
| **Multiple** | Public / private / groups — social layers, not scholarly corpora. |
| **As book** | No. |
| **Well** | Anchoring model for mutable or multi-edition base text. |
| **Badly** | Default chrome steals attention; not lemma/Bekker-native. |

---

## 10. STEP Bible  
https://stepbibleguide.blogspot.com/p/comm.html · …/display.html · …/opening.html

| | |
|---|---|
| **Layout** | Multi-panel: Bibles and commentaries as peer “versions.” Separate panel, same-panel columns, or **interleaved** with verses. |
| **Anchoring** | Verse-keyed. Commentaries chosen like Bibles from one menu. |
| **Sync** | Shared reference navigation; chapters/verses follow the first (bold) version when comparing. Versification mismatches documented. |
| **Multiple** | 20+ public-domain commentaries; multi-select. |
| **As book** | Yes — open commentary alone as a panel/version. |
| **Well** | Explicit display modes (column / interleaved / multi-panel) = your pole choice as a setting. |
| **Badly** | Power-user UI; easy to over-open panels. |

---

## 11. BibleHub  
https://biblehub.com/commentaries/genesis/1-1.htm

| | |
|---|---|
| **Layout** | One verse → stacked full commentaries (vertical dump). |
| **Anchoring** | Verse URL; prev/next verse. No continuous chapter reading with side notes. |
| **Sync** | Navigate verse-by-verse only. |
| **Multiple** | Extremely multi-source by default. |
| **As book** | Each commentary also has book-shaped paths, but hub is verse-centric. |
| **Well** | Instant multi-commentator comparison at one locus. |
| **Badly** | Destroys continuous reading; wall-of-prose. |

---

## Synthesis

### (a) Strongest borrowable ideas → your architecture

1. **Sefaria dual citizenship** — commentary as link *and* as primary text with own structure (`many_to_one` lemmas/segments). Improves **both poles** and the switch between them.  
2. **Gutter/span cues + ephemeral peek + click-off-close** (Genius density discipline + Folger/CoLab close pattern). Improves **text-primary** peek state; avoid Genius over-highlight.  
3. **Persistent rail tracking selected locus** (Sefaria Connections; Scaife right study stack; STEP side panel). Improves **text-primary** persistent rail.  
4. **One active commentary** with optional “see also” (counter-pattern to Sefaria/BibleHub flood). Improves **text-primary** and multi-source switching.  
5. **Commentary TOC + base span peek** (Sefaria open-as-book; DDP locus keys; STEP open commentary as version). Improves **commentary-primary**.  
6. **Display-mode control**: text-only / peek / rail / interleaved / commentary-primary (STEP’s explicit modes). Improves mode discovery and mobile.  
7. **Lemma-headed note list as backup index** (DCC) even when anchors are Bekker lines — for offline mental model and “notes for this section” lists.  
8. **Stable locus IDs over fuzzy DOM** (Bekker line ≈ Sefaria ref / DDP line / STEP verse). Use Hypothes.is-style fuzzy only if editions drift; don’t make it the primary model.

### (b) Anti-patterns

| Pattern | Seen in |
|--------|---------|
| Open every available commentary at once | BibleHub; Sefaria Resources overload |
| Notes only below text, no in-text discovery | DCC |
| Search-only, no reading surface | Classic DDP |
| Widget kitchen sink | Scaife (improving, still crowded) |
| Interleave notes into base without hierarchy | ctext user reports |
| Always-on annotation chrome fighting the page | default Hypothes.is |
| Highlight every span until the primary vanishes | Genius at high density |
| Passage-bucket notes only (no line lemma) when you need line precision | Scaife section widgets |

### (c) Gaps your architecture may still miss

- **Section-level “divisio” / tree of the commentary** as navigation (Aquinas lectiones) — closer to Digital Dante’s canto unit + Sefaria complex schemas than to pure Bekker peeks; worth a first-class TOC type, not only span peeks.  
- **Locus comparison view** (DDP/BibleHub): “all notes on 1094a1” without leaving one active-commentary default — optional tertiary mode.  
- **Deep link + share of (work, Bekker, commentary, mode)** like Sefaria URLs (`with=…`).  
- **Versification / edition mismatch messaging** (STEP) when Greek text and commentary editions disagree on lineation.  
- **Progressive disclosure of connection types** (grammar vs philosophical lemma vs parallel) so the rail isn’t one undifferentiated stream.  
- **Mobile: bottom sheet swipe across notes at one locus** (Google Docs pattern via Critchlow) rather than desktop rail only.  
- **Empty-state honesty** (Scaife uneven coverage): show which Bekker ranges a commentary actually covers.

---

**Closest overall analogues:** Sefaria (model + poles), STEP (mode switching), DDP (multi-commentary by line), Genius/Folger (span peek UX), DCC (lemma pedagogy). Your two-pole design already avoids the worst of BibleHub, classic DDP, and always-on Hypothes.is chrome; the main risk is sliding into Sefaria-style connection flood or Genius-style highlight saturation.

*[Report truncated by the agent mid-item. The cut item, reconstructable from its DDP section: a **locus comparison view** — several commentators side by side at one Bekker line, Dartmouth-Dante-style — as a possible later feature; currently in the plan's non-goals as "multi-commentary compare views."]*
