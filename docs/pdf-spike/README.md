# PDF spike: parallel Greek↔English facing-page test

A throwaway experiment to de-risk the **desktop (Tauri) PDF tier** before we
build anything around it. It answers the two highest-value unknowns at once:

1. Does **Tectonic** (the embeddable Rust/XeTeX engine we'd bundle in Tauri)
   compile **reledmac + reledpar** cleanly end-to-end?
2. Does **polytonic Greek** render correctly in *both* columns and the
   apparatus — no fallback-to-Latin-font diacritic breakage?

If `parallel-greek-english.pdf` comes out right, the desktop plan is settled:
**reledmac + reledpar under Tectonic = facing-page, line-locked, clean Greek.**

## Run it

```sh
# Preferred: the engine we'd actually ship
brew install tectonic            # or: cargo install tectonic
cd docs/pdf-spike
tectonic parallel-greek-english.tex

# Fallback if Tectonic chokes (proves the .tex itself is sound):
xelatex parallel-greek-english.tex   # run twice — reledpar needs 2 passes
```

First Tectonic run downloads reledmac/reledpar/polyglossia/fontspec from
TeXLive on demand; later runs are cached.

## What to check in the output

- [ ] **It compiled at all** under Tectonic (the unverified risk — Tectonic's
      repo makes no claim of reledmac support).
- [ ] Greek (verso) and English (recto) sit on **facing pages, aligned**.
- [ ] **Line numbers march in sync** down both sides.
- [ ] Polytonic diacritics — breathings, accents, **iota subscript** (ᾳ ῃ ῳ) —
      are intact, not boxes/tofu or Latin-font fallback.
- [ ] The Bekker side-note (`1094a`) lands in the margin.

## Known traps (from the research)

- **Fonts:** the `.tex` bundles `GFS Didot` via `fontspec`. Swap for whatever
  redistribution-friendly polytonic face we settle on (Cardo / New Athena /
  Brill). Relying on *system* fonts is the #1 cause of broken Greek — always
  bundle the OTF. If GFS Didot isn't installed, that line is what to change.
- **reledpar Greek-in-notes bug** ([maieul/ledmac#854](https://github.com/maieul/ledmac/issues/854)):
  in older polyglossia, Greek in critical *notes* silently fell back to the
  Latin font — parallel mode only. May be patched; if apparatus Greek looks
  wrong, this is the suspect.
- Sync grain is chunk-level (`\pstart..\pend`), not every physical line — the
  right grain for Bekker anchoring, but model it explicitly.

## Context

Full toolchain research (Paged.js static-web tier, Typst state, font
licensing, the HTML-lineage vs TeX-lineage framing) lives in the deep-research
report. Short version: **static web → Paged.js (loose parallel only, no true
line-lock); desktop → this stack.**
