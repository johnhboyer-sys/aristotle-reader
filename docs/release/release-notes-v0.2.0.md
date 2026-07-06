# The Aristotle Reader (macOS) v0.2.0

The Aristotle Reader is a free, offline parallel Greek–English edition of Aristotle's complete works, with click-to-parse morphology, a built-in dictionary, and exact Bekker citation. This is the desktop app's first public release: a macOS reader that carries the whole public-domain corpus with it, works with no network connection, and keeps everything — your imports, your highlights, your notes — on your own machine. It's built for classicists, philosophy students and teachers, and anyone who wants to read Aristotle closely without a browser tab or a login.

## Highlights

**Reading**
- The full public corpus bundled with the app — Greek text and public-domain English translations, aligned line-for-line to the Bekker edition, for offline reading.
- A library rail with collapse, category filtering, and live tracking of the chapter you're currently reading.
- Copy Citation — grab a properly formatted citation (work, Bekker line, translator) for whatever you're reading, in one click.

**Search & Lexicon**
- ⌘K search across the whole corpus, with an accent-exact toggle for when diacritics matter.
- A Lexicon overlay (LSJ) for looking up any Greek word without leaving your place in the text.

**Your own translations**
- Import your own translation files and the app will align them to the Bekker spine automatically, using the same aligner that aligned the built-in corpus.
- Chapter tags are all that's required; Bekker column and line tags are used when your source has them. Anything the alignment fills in is always labelled as an estimate, never presented as fact.
- Personal copies of copyrighted translations stay private to your computer by default.

*Preparing a file — pitfalls we've hit ourselves.* Most import problems come from the source file, not the app, and OCR'd texts are the usual culprits:
- **Chapter tags must match the standard chaptering by content, not by count.** Older editions merge or split chapters freely — verify each `{book.chapter}` tag actually sits where the standard division begins, or alignment will silently smear text across the wrong Bekker range. A missing tag degrades gracefully into an estimate; a *wrong* tag corrupts the chapter.
- **Join paragraph breaks the page made, not the author.** OCR inserts a blank line at every page turn; mid-sentence ones are easy to catch, but a page break that falls *between* sentences leaves a false paragraph only the printed page can disprove.
- **Watch hyphenated words split around tags** — `de- {20} terioration` should be `{20} deterioration`. The importer's dehyphenation review catches most splits, but tag-interrupted ones are worth a search.
- **Strip page furniture**: running heads, page numbers, and endnote markers that OCR drops into the text flow.
- **Tag only what the edition prints.** If your source shows line numbers every fifth line, tag those; don't invent per-line tags or compute your own numbers.

**Annotations**
- Highlight and annotate as you read; notes and highlights are stored as plain local JSON files — yours to read, back up, or move, with no proprietary format.
- Export your annotations and imported translations as a single file whenever you want a copy.

## Install

1. Download `The-Aristotle-Reader.dmg` below.
2. Open the disk image and drag **The Aristotle Reader** into your Applications folder.
3. **First launch:** this build isn't signed with an Apple Developer certificate, so Gatekeeper will refuse a normal double-click the first time. Instead, right-click (or Control-click) the app in Applications and choose **Open**, then confirm **Open** in the dialog that appears. You only need to do this once — after that it opens normally.

**Download:** [The-Aristotle-Reader.dmg](DOWNLOAD_URL_TBD)

## Known limitations

- **Unsigned build.** No Apple Developer certificate yet, hence the right-click-to-open step above. The app is open source if you'd like to build it yourself instead.
- **Auto-update is not yet enabled.** Future versions will be announced on the site — for now, updating means downloading the new release yourself.
- **Annotation capture isn't available in the side-by-side compare view.** Highlight and note from the regular reading view instead.
- **macOS only, for now.**

The corpus is the same public-domain corpus you'll find on [the website](https://johnhboyer-sys.github.io/aristotle-reader/) — same texts, same alignment, same citations. Anything you import yourself stays on your machine; nothing you add or annotate is ever sent anywhere.
