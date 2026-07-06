# Implementation notes — ambiguities & conservative readings

- pages.ts: doubled form feeds preserved as empty pages (flag-friendly), not merged.

## gutter.ts (Phase 1 gutter-tic scan)

- bare-tic 1–99 with layered defense (A2): empirical — 40/45 common, Physics 7 to 70+.
- verso fragment-skip symmetric (A5): interpretive commitment to "begins on the line".
- recto gate relative (A3): absolute floors rejected the Lennox col-78 fixture.
- Cross-page band EWMA smoothing constant (§7's band-outlier check fixes the 12-col
  threshold but not the smoothing rate): picked alpha=0.3 as a conservative default —
  no test exercises the exact value, only the >12 threshold behavior.
- Header "cadence-consistent in-band tic" guard (§4's strip guard): implemented as a
  best-effort check (does removing header-exclusion yield a candidate whose delta from
  ctx.lastTic is 4 or 5?) since the spec doesn't fully specify the side-agnostic grammar
  to use at a point in the pipeline before side is decided. No fixture exercises this
  path (real running heads never coincide with a genuine tic position); documented here
  rather than silently guessed.
- Collapse-driven display-nulling (§11) is cosmetic only: a bare tic on a collapsed page
  gets `column`/`line` nulled in the OUTPUT Tic (plus `position-unresolved:collapsed`),
  but internally `ctx.lastTic`/monotonic-chain continuity uses the real resolved
  numbers regardless of collapse, so cross-page cadence tracking never loses its place
  just because one page's geometry was too irregular to trust at face value. Spec is
  silent on this; conservative reading favors never discarding real chain data.
- Real-slice honesty run (ne-slice.txt, NE 1094a-1181b + Magna Moralia's opening page,
  176 pages) surfaced three genuine anomalies the scanner correctly caught rather than
  silently absorbing — see the integration test report for full characterization:
  (1) a truly missing printed mark (`dropped-line:1119b20`, page 50) where a chapter
  heading block appears to have displaced the routine gutter mark; (2) a single
  corrupted full-form (`non-monotonic:1029a1`, page 67 — should almost certainly be
  1129a1, the well-known Bekker page NE Book 5 opens on) that the monotonic guard
  correctly refused to trust, costing 6 subsequent bare tics their position until a
  valid `1129b1` re-synced the chain two pages later; (3) a genuine work-boundary
  anomaly (`non-monotonic:1181a25`, page 175) — Magna Moralia's real, historically
  attested Bekker opening mark, which is NOT monotonically after Nicomachean Ethics'
  own ending mark on the previous page. (3) is a real scope limit of the single
  continuous-DocContext design: concatenating multiple works through one DocContext
  will flag a false non-monotonic at every work seam. Not fixed here (out of spec
  scope) — callers should start a fresh `createDocContext()` per work.
