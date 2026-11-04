# Desktop TODO

Known, reproduced defects in the desktop app that no other document owns. Not a
handoff (there is no desktop track handoff) and not a wishlist — every item here
was traced to a line of source by a review, and each says what breaks and for
whom. Delete an item when it is fixed, with the commit that fixed it.

Deploy state and site-wide history live in `DEPLOY-STATUS.md` at the root.

## Lettered Bekker lines

Items 1–4 (annotation capture, scroll tracker, copy formatters, palette
parser) were fixed in `794a2cdcd` on 2026-09-23.

**Still unchanged, deliberately:** the snap-to-nearest ignores a wrapped
continuation line, whose only id ends `-c`. It did so before the 2026-09-09 work
too, so this is a known limit rather than a regression.

## Annotations on a wrapped continuation line

7. **A highlight made on a `-c` line comes back on the main line.**
   `desktop/src/lib/annotations.ts` — `lineIdOf` drops the `-c`, so the target
   stores only column, line and word index, and `greekRange` looks up
   `L<col>-<n>` before `L<col>-<n>-c`. *Effect:* select words on the
   continuation of a line split at a chapter boundary (e.g. `L1276a-6-c`), and
   after a reload the mark paints on the same word index of the main line.
   Found by GPT-6-Sol reviewing `794a2cdcd`; source-traced, not reproduced.
   Not a regression: the lookup order predates that commit.

## Storage and concurrency

5. **`TauriStorage.write` is truncate-and-write in the Workbench.**
   A crash mid-save leaves a file the parser refuses. The desktop's stores were
   converted to write-then-rename on the catch-up branch and its capability
   grant added; the Workbench was not, and needs `fs:allow-rename` in its
   capabilities. The Workbench half belongs to `workbench/phase-3-session-handoff.md`
   item 0, which owns it; noted here because the two stores are the same code.

Item 6 (concurrent annotation changes, and the shared `.tmp` name) was fixed
in `794a2cdcd` on 2026-09-23.

9. **Quitting from outside the menu can still drop a queued annotation save.**
   ⌘Q and the menu's Quit now wait for the queue (`quitAfter` in
   `desktop/src/lib/runtime.ts`, the Quit item in `src-tauri/src/lib.rs`), but
   Dock › Quit, an AppleScript `quit` and logout go straight to
   `NSApplication terminate:`. Tauri's macOS layer (tao 0.35.3,
   `platform_impl/macos/app_delegate.rs`) hooks only `applicationWillTerminate:`,
   which cannot delay the exit, and gives the page no event. *Effect:* as item
   8 was, by a rarer path. Moerbeke has the same gap. Source-traced, not
   reproduced.

10. **Neither save-queue wait has been tried in the built app.** Closing the
    window (#183) and ⌘Q (#184) should both hold until a queued annotation
    save is written, but only unit tests check that: no one has saved a note
    while an earlier save was still on disk, closed or quit at once, and
    looked for the note after a relaunch. Do that once in a packaged build,
    then delete this item.

## Provenance

Items 1–4 and 6 (now fixed) came from adversarial reviews run on 2026-09-08/09 against the
catch-up branch (Codex on PR #110 and on the lettered-line fix). Item 5 comes
from that branch's own handoff, which was deleted on 2026-09-09 once the branch
merged and its remaining items were moved to the files that own them — the
Workbench's Rust trust boundary and the four unfixed Rust findings to
`workbench-design/security-review-2026-09-07.md` and
`workbench/phase-3-session-handoff.md` item 0a, the commentary layer's open questions to
`docs/commentary-layer-decisions.md` §7, and six items here. Item 7 came later.

Every item is CONFIRMED by source trace and UNVERIFIED at runtime — reproduce
before fixing, and write the failing test first.
