# Grok adversarial review — audit/export session 2026-08-12

sessionId: 019ff904-06e2-7f01-a921-2a5ca1ebcc2d

---

I'll do an adversarial read-only review of this session's new pipeline code. First I'll load the review skill and the files under review so I can hunt for concrete failure paths, not style notes.The review skill wants a subagent-authored write-up; this is a high-stakes holdout/rulings review, so I’ll read the files myself and launch two independent reviewers in parallel.I have the source. Next I’ll read the tests and the holdout/ruling helpers those modules actually call.I have a previous round-4 holdout review to match. Next I’ll confirm the likely breakages with concrete inputs and check how the neighboring modules actually behave.I’ll confirm the likely breaks with small read-only probes: HTML `data-d` parsing, holdout hash tricks, empty-train audit, and real citation shapes.The worst break is in the new review server: **John cannot save a keep or fix**. On the built page, 643/643 keep buttons and 709/710 fix buttons throw in the browser before POST. Only `none` works. After that, the traveling Colab check can still be made to say OK TO TRAIN on a contaminated `train.arrow`, and `--migrate` can still destroy ruling substance even though it can no longer drop an unknown id.

All of this is from reading the listed files, the tests, and small read-only probes against the built audit page, `work/reconciled`, and the live TLG corpus.

---

## CONFIRMED — ranked by severity

### 1. Critical — `audit_review` keep/fix buttons do not save

`build_page` writes an unquoted `data-d` attribute whose value is `html.escape(json.dumps(text))`. Any reading with a space (almost every line) is cut at the first space by the HTML parser. The click handler then does `JSON.parse(b.dataset.d)` *before* `fetch`. That throw is not inside the `.catch`, so the bar never says `NOT SAVED`. The button does nothing.

```212:214:bonitz_pipeline/audit_review.py
            detail = html_mod.escape(json.dumps(text, ensure_ascii=False))
            buttons.append(
                f'<button class="opt" data-v="{verdict}" data-d={detail}>'
```

The `none` button is quoted (`data-d="&quot;&quot;"`). That is why it alone works.

Probed on the built `work/audit/audit-review.html` (643 cards):

| button | JSON.parse OK | broken |
|---|---:|---:|
| keep | 0 | 643 |
| fix | 1 | 709 |
| none | 643 | 0 |

The one working fix payload is `σ973a12.` — no space. `work/audit/audit-rulings.json` does not exist. No ruling has ever been stored.

**Input:** any real card, press 1 (keep) or 2 (fix).  
**Consequence:** nothing is written. John can only click `none`. The queue looks live and is not.

`tests/test_audit_review.py` never builds the page and never POSTs. Delete the write, delete the validation, or ship this HTML unchanged: every test still passes.

---

### 2. High — a reload is safe; a concurrent POST is not; a crash mid-write wipes the store

`serve` uses `ThreadingHTTPServer` (so a crop GET cannot block a ruling — the book_review lesson) and then does unlocked read-modify-write of the whole JSON:

```361:366:bonitz_pipeline/audit_review.py
            have = (json.loads(RULINGS.read_text(encoding='utf-8'))
                    if RULINGS.exists() else {})
            have[sid] = {'verdict': verdict, 'detail': d.get('detail', '')}
            RULINGS.parent.mkdir(parents=True, exist_ok=True)
            RULINGS.write_text(json.dumps(have, ensure_ascii=False, indent=1),
                               encoding='utf-8')
```

**Reload:** GET `/rulings` reads disk. Done-marks come back. That part holds.

**Concurrent POST (two cards, two threads):**

1. Thread A reads `{}`.
2. Thread B reads `{}`.
3. A writes `{card1: none}`.
4. B writes `{card2: none}`.
5. card1 is gone.

`--wifi` binds `0.0.0.0` and the comment invites the iPad. Two `none` clicks — the only clicks that currently work — are enough. After finding 1 is fixed, every keep/fix pair has the same hole.

**Crash during `write_text`:** the file is opened with `'w'` and truncated first. A kill in that window leaves `audit-rulings.json` empty or half-JSON. The next POST does `json.loads` with no `try` and 500s. GET `/rulings` then serves the broken bytes to the page, so even the done-marks vanish.

No test touches `do_POST`.

---

### 3. High — contamination can pass `check_before_training.py` via a stale/forged manifest

NFC/NFD is closed. Empty held-only is refused at export. Byte-hash of the arrows is checked. The hole is what the traveling script *trusts*.

`held_only_line_sha256` is computed once on the export machine from the GT XML lists, stored in the manifest, and never recomputed. The script never opens `kraken-holdout.json`. It never hashes `holdout.arrow` texts. It only asks: are these manifest hashes inside `train.arrow`?

```160:166:bonitz_pipeline/kraken_export.py
    train_hashes = {
        hashlib.sha256(unicodedata.normalize(norm, t).encode('utf-8'))
        .hexdigest() for t in texts['train.arrow']}
    leaked = train_hashes & held
```

**Input that passes:**

1. Export a clean tree.
2. Append every holdout line to `train.arrow`.
3. Set `manifest['arrows']['train.arrow']` sha256 and `lines` to the new file.
4. Replace `held_only_line_sha256` with `[sha256("x")]`.

The script prints `VERDICT: OK TO TRAIN`. The ruling file in the zip can stay John's twelve; nothing reads it.

That is the standing question: the check can answer “nothing leaked” without having looked at the holdout. It looked at a hash list the operator can choose.

What *is* pinned:

- NFC vs NFD of a real held line → refuse (`test_the_check_normalizes_before_hashing`).
- Arrow bytes changed, manifest not updated → refuse.
- Manifest missing / arrow missing → refuse.
- Export of a holdout with no unique line → refuse (`test_an_export_with_nothing_unique_to_the_holdout_is_refused`).

What is not pinned: the traveling `if not held: fail(...)`. Export already refuses that case, so the Colab-side copy of the guard can be deleted and no test fails.

Residual hash tricks that also pass (exact-text check, not NFC): put the held line in train with a ZWSP or a homoglyph. Different digest, same ink. Lower than the dummy-hash bypass because it takes a per-line edit; the dummy-hash bypass takes two manifest fields.

On the *current* `work/kraken400` tree the Counter-vs-set choice does not fire (0 shared lines with holdout count > train count). The logic is still wrong: a line that is also in train, just fewer times, is treated as held-only, and a clean export would then fail the traveling check. Not a leak; a false stop. Not live on this corpus.

---

### 4. High — `--migrate` can still lose a ruling

The new guard stops the 2026-08-12 shape: an `add()`-only id, not in any source store, refuses and writes nothing. Those tests would fail if the guard body were `lost = []` or if `save()` moved above the check. That part holds.

Three holes remain.

**A. Id-only compare. Same id, different ruling → store wins, John's later entry dies.**

```287:289:bonitz_pipeline/john_rulings.py
    rebuilt = {canon(r['id']) for r in out}
    lost = [r for r in existing if canon(r['id']) not in rebuilt]
```

**Input:**

1. Ledger has `page-032-L:1:αλλα` with `kind=keep`, note from a later `add()`.
2. The July fixture still has that site as `applied` / `text`.
3. `--migrate`.

The id is in `rebuilt`. Guard is silent. `save(d)` writes the fixture row. The keep, the note, `reversed_by`, the date — gone. `test_superset_migrate_keeps_every_old_entry` and `test_a_reencoded_circumflex_is_not_reported_lost` only assert ids.

**B. Two ledger ids that `canon` to one rebuilt id.** Both are “found.” One row is written. The extra encoding is dropped. The circumflex test *creates* this shape and then treats success as “not lost.”

**C. `save` is not atomic.** `LEDGER.write_text(...)` truncates first. A non-lossy migrate that dies mid-write leaves `work/rulings/john.json` unreadable. Next `load()` throws. The ledger is gone. Same defect as finding 2, on the store the last incident was about.

`add()` ids a policy as `policy:{ruled[:40]}`. `put()` ids it as `:0:{ruled}`. A policy John `add()`s that also sits in the hardcoded list makes migrate *refuse* (fail-safe, not a loss). Different problem: the two writers do not agree what an id is.

---

### 5. Medium — B2 as shipped cannot catch the error it was sold on

Design (`docs/sweep-validators-next.md` §B2):

> `Ζιε13. 544a32` asserts Bekker page 544, column a, line 32. If the corpus's column 544a ends at line 30, the citation is impossible.

Implementation, pinned by test:

```54:58:tests/test_linecheck.py
def test_cited_line_within_the_fuzz_passes():
    # 32 - FUZZ = 30 exists: editions drift a line or two
    rows, c = check('Ζιε13. 544a32.', 'page-001-L', COLS, set())
    assert c['checked'] == 1 and c['finding'] == 0
```

Non-seam columns in `load_corpus` are contiguous, so “no such line anywhere in ±2” cannot happen in the interior. The only findings B2 can emit on a normal column are cites `< min-2` or `> max+2`.

Probed on all 96 reconciled columns against the live corpus:

```
7367 parsed / 6195 checked / 1172 skipped
3 findings
7 checked cites in the forgiven max+1 / max+2 band
```

The seven that pass are the motivating case:

| site | cite | column holds |
|---|---|---|
| page-018-R | `Ηι5. 1166b36` | 1–35 |
| page-020-R | `Ζγε7. 787b34` | 1–33 |
| page-027-L | `Ρβ6. 1384 a36` | 1–35 |
| page-031-L | `γ2. 426a33` | 1–31 |
| page-033-R | `ψβ5. 417 b32` | 1–31 |
| page-043-R | `Ρβ14. 1390 a34` | 1–33 |
| page-052-R | `2. 662 a36` | 1–35 |

The three findings are the far misses (`506b37` vs 1–33, `633b20` vs 1–8, `1270b89` vs 1–40). A one- or two-line slip at the column tail — the digit error the design named — is not a finding.

The design also said “Start strict-report, measure the false-positive rate, tighten after.” The tests pin the loose bound.

---

### 6. Medium — one real citation is dropped and mis-tiered

`CITE_RE` requires the line digits to sit on the column letter (`([ab])(\d{1,3})`). A wrap *between* page and column works (`426\na33` is checked). A wrap *between* column and line does not.

**Input, `work/reconciled/page-051-L.txt`:**

```
θ20. 832 a
1. eorum amaritu
```

`CITE_RE` misses it. `PAGE_CITE` takes `832 a`, counts `unparseable` (page cite, no line), and never looks at line 1. That is the only `unparseable` in 7367 parsed cites, and it is a lie: the line number is on the next line.

Empty reconciled glob still raises. `parsed == checked + skipped` still holds. Volume is not silent. The one wrapped cite is.

---

### 7. Medium — `gt_audit.main` can report a clean audit without opening a column

```169:185:bonitz_pipeline/gt_audit.py
    cols = (a.cols.split(',') if a.cols else
            (work / 'train.txt').read_text().split())
    rows, stale = [], []
    ...
    for col in cols:
        r = audit_column(col, work, evaldir)
```

**Input:** `train.txt` present and empty (or whitespace).  
**Output:** header-only `gt-audit-train.tsv` and `…-stale-gt.tsv`, `columns audited: 0`, exit 0.

A missing pred, a missing reconciled file, a line-count mismatch — those raise. An empty column list does not. Header-only is defined as “ran, found none.” Here it means “never looked.”

`tests/test_gt_audit.py` never calls `main()`. Neutering every refusal in `main` leaves the tests green.

Related, smaller: stale-gt is a separate TSV (3 real rows: the orphan-mark shape `πȣ ͂…`, `ȣ̓ ̓γίγνεται`, `τȣ ͂Ἄμμωνος`). `load_cards` never reads it. Those lines do not become cards.

---

### 8. Medium — `pylaia_export` isolates the directory named `holdout/`, not John's ruling

`te.txt` is only the `holdout/` split. `tr.txt` / `va.txt` never get a `holdout-` id. Those tests would fail if the split were swapped.

What they do not pin: `export()` never calls `holdout_columns()`, `stage_verify()`, or `refuse_holdout_in_training`. It trusts `--export`.

**Input:** a directory whose `train/*.gt.txt` are the twelve held-out columns (or a calamari export assembled by hand, or one made before a ruling change).  
**Consequence:** those lines land in `tr.txt` / `va.txt`. PyLaia trains on the holdout. The print warning is the only gate.

`calamari_export` itself is gated. This new path is not. The project invariant is “no path,” not “no path that remembered to call verify.”

Combining-mark tokenisation: clusters over `ȣ` / `ϗ` are one symbol; a mark after a space stands alone (`toks[-1] != SPACE`). Round-trip holds for the synthetic lines. There is no test for the known orphan-mark shape `τȣ ͂λόγȣ`. Delete the space guard and every current test still passes; that line would train as the token `<space>͂`.

---

### 9. Medium — the new ruling surface is not the ledger

`audit_review` writes `work/audit/audit-rulings.json`. That file is not one of `migrate()`'s five stores and is not appended to `work/rulings/john.json`. Even after findings 1–2 are fixed, John's ink rulings live in a sixth store. A later `--migrate` will not see them. This is the 2026-08-12 loss, ready to happen again, just not yet inside `john.json`.

---

## Also confirmed, lower

- **`_mark_diffs` on keep uses only `next(iter(c.readings.values()))`.** On a neither-right card (two engines) the corpus button highlights the calamari dispute only. The test file's first sentence is “a card whose highlight marks the wrong characters sends John's eye to the wrong place,” and the tests only call `_mark_diffs` in isolation.
- **`cut_crop` returns if the PNG exists.** A later recrop leaves the old strip. John sees yesterday's polygon.
- **`calamari_score.compare` / `write_tsv` are correct as functions** (partition, header-only, tab smash). `main()`'s write of the agree-wrong dump is unwired from the tests. Delete those three lines in `main`: suite still green. Predictions are NFC'd; kraken XML / GT are not; an NFC/NFD pair can miss `agree_wrong`.
- **`load_corpus` still `continue`s on a broken book JSON.** linecheck then reports those columns `no-corpus`. Absence from an index that skipped a file is not absence from the world. Inherited, not new, but B2 claims that inventory as authority.

---

## Design claims worth contradicting

| Claim | What is true |
|---|---|
| B2 motivating example (`544a32` vs max 30) is an impossible citation | Implemented and tested as a pass |
| “Start strict-report, measure, then tighten” | Shipped with ±2 and tests that freeze it |
| “Nothing checks this” (B2) | `linecheck.py` now does; the claim is stale |
| “A citation-shaped reference without a line number (`544a.`, `1305 b,`)” | The one live `unparseable` *has* a line number, on the next line |
| Colab re-check “re-proves … against John's ruling” | It re-proves the manifest. The ruling file is copied and never opened |
| Audit “rulings are recorded, never applied” | They are not recorded either, except `none` |
| PyLaia “holdout lines go to te.txt only” | True of the named split, not of the ruling |

---

## Tests that cannot fail under the mutations that matter

A test “cannot fail” here means: delete the guard call, or replace the guard body with `return` / `lost = []` / `pass`, and the suite stays green.

| Mutation | Tests that fire | Tests that stay green |
|---|---|---|
| Unquote already the default; quote `data-d` never asserted | none | all of `test_audit_review` |
| Delete `do_POST` validation or the `write_text` | none | all of `test_audit_review` |
| Delete `if not held: fail` in `CHECK_SCRIPT` | none | all of `test_kraken_export` (export-side empty-held still tested) |
| Replace `held_only_line_sha256` with dummies after contaminating train | none | the contamination test updates hashes and still expects a fail on the *real* hashes |
| `lost = []` in `migrate` | `test_lossy_migrate_*` **fail** (good) | |
| `save()` before the lost check | `test_lossy_migrate_refuses_…_writes_nothing` **fails** (good) | |
| Compare only ids, clobber body | none | `test_superset_*`, `test_a_reencoded_circumflex_*` |
| Delete `write_tsv(aw, …)` in `calamari_score.main` | none | all of `test_calamari_score` |
| Empty `train.txt` → `main()` exit 0 | none | all of `test_gt_audit` |
| Point `pylaia_export` at a dir whose `train/` is the holdout | none | `test_no_holdout_id_*` still sees prefix `train-` |
| Delete `toks[-1] != SPACE` in `cluster_tokens` | none | all of `test_pylaia_export` |
| Accept `832 a\n1` as unparseable | none | `test_page_cite_without_a_line_number` uses `cf 544a. et` |
| Change FUZZ so `544a32` vs max 30 becomes a finding | `test_cited_line_within_the_fuzz_passes` **fails** (the test is locking in the hole) | |

`test_the_three_buckets_partition_the_lines` and the classify tests *do* die if you neuter `compare` / `_kind`. Those guards are real.

`test_a_reencoded_circumflex_is_not_reported_lost` cannot tell “same ruling kept” from “replaced by the store twin.” It only asks that migrate not refuse.

---

## Standing question — can it answer “nothing” without having looked?

| Guard | Verdict |
|---|---|
| `linecheck` empty glob | No. Raises. Tested. |
| `linecheck` on real files with 0 cites | It looked. `parsed=0` is honest. |
| `linecheck` on `832 a\n1` | Says unparseable. Did not look at the line. |
| `gt_audit.main` empty `train.txt` | **Yes.** Header-only, exit 0. |
| `gt_audit.audit_column` missing pred / missing reconciled | No. Raises. Tested. |
| `calamari_score.write_tsv([])` | Header-only means “looked, found none.” Honest *if* `compare` ran. |
| `check_before_training` empty `held_only_line_sha256` | No. Fails. **Untested.** |
| `check_before_training` dummy hashes | **Yes.** Clean on any train that does not contain `"x"`. |
| `kraken_export.held_only_hashes` empty difference | No. Raises. Tested. |
| `pylaia` empty split | No. Raises. |
| `audit_review` empty queues | No. Raises. |
| `audit_review` POST store | Can lose a ruling it *did* look at (race / truncate). |

---

## Verdict table

| # | Claim / area | Verdict | Severity |
|---|---|---|---|
| 1 | audit_review records keep/fix | **CONFIRMED broken.** Unquoted `data-d`; 1352/1353 non-none buttons throw; no file on disk. | Critical |
| 2 | audit_review POST is safe under reload / concurrency | Reload **holds**. Concurrent POST and mid-write crash **lose rulings**. Untested. | High |
| 3 | Traveling check blocks holdout in `train.arrow` | NFC/NFD **holds**. Empty held-only at export **holds**. Dummy/stale manifest hashes **pass contamination**. Ruling file unused. | High |
| 4 | `--migrate` cannot lose a ruling | Id-drop of `add()`-only entries **holds**. Body clobber, canon collapse, non-atomic write **still lose**. | High |
| 5 | B2 flags impossible line numbers | Only `> max+2`. Motivating example is a pass. **7 real cites hidden.** | Medium |
| 6 | B2 does not silently drop | Empty glob **holds**. Wrapped `832 a\n1` **dropped and mis-tiered**. | Medium |
| 7 | gt_audit refuses to run blind | Per-column missing inputs **hold**. Empty column list **reports clean**. | Medium |
| 8 | PyLaia holdout goes to `te` only | Named-split isolation **holds**. Ruling is not consulted. Mark-after-space untested. | Medium |
| 9 | New rulings land in the ledger | **CONFIRMED they do not.** Sixth store, invisible to `--migrate`. | Medium |
| 10 | calamari agree-wrong dump is the audit candidate list | Function **holds**. `main()` wiring **untested**. | Low |
| 11 | Classification / stale-gt tier | Classes **hold** on the tested shapes. Stale-gt (3 real rows) never becomes a card. | Low |
| 12 | Crop bbox is the line's own polygon | Lookup-by-id **holds** (missing id exits). Stale PNG cache can show the wrong ink. | Low |

Nothing in this session puts a held-out *column name* into `train.txt` on the happy path. The live holdout leak is the Colab check that will bless a contaminated arrow if the manifest hashes are edited, and the PyLaia converter that will train on whatever directory you call `train/`. The live rulings leak is the review server that cannot write a keep, and the migrate path that can overwrite one.
