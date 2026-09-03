# The ou-ligature has lost its breathing in 167 places

**Status: measured and crop-verified, not yet ruled or repaired.** 2026-08-11.

## What was found

Every word in the corpus beginning with the ou-ligature `ȣ`:

| | count |
|---|---|
| carries a **breathing** | 280 |
| carries an accent and **no** breathing | 10 |
| **bare** | 167 |

The bare ones are `ȣκ ȣχ ȣδὲν ȣδὲ ȣσίαν ȣδεὶς ȣδέν ȣσία ȣτ'` — οὐκ, οὐχ,
οὐδέν, οὐδέ, οὐσίαν, οὐδείς, οὐσία, οὐτ'. Every one takes a smooth breathing
in Greek.

## The ink says the breathing is there

Three sites sampled from three different pages at 400 dpi. In all three the
page plainly carries the smooth breathing over the ligature; the corpus does
not:

| site | corpus | ink |
|---|---|---|
| `040-R:42` | `ȣκ` | `ȣ̓κ` |
| `017-R:38` | `ȣκ` | `ȣ̓κ` |
| `019-L:47` | `ȣκ` | `ȣ̓κ` |

`040-R` is the decisive one: it holds a marked `ȣ̓κ` at line 1 and a bare
`ȣκ` at line 42, and **the two are identical on the page**. The distinction
exists only in the transcription.

So this is reader loss, not Bonitz's inconsistency. It agrees with John's own
earlier ruling, which KEPT the breathing at `ȣ̓κ` across 19 sites.

## Why nothing ever flagged it

Three independent layers, each hiding the same thing:

1. **`smyth_sweep`'s label guard** called any short unmarked run a siglum —
   fixed 2026-08-11, the guard now checks the real siglum inventory.
2. **`VOWELS = 'αεηιουω'`** omits `ȣ`, so the vowel rules never see it.
3. **`smyth_sweep.c1` abstains on any ligature-initial word**, on the stated
   ground that "the ou-ligature routinely carries an accent and no
   breathing". The corpus contradicts that 28 to 1 (280 breathings against 10
   accents-without-breathing). **Still in place.**

## What has NOT been done

Nothing has been corrected. 167 sites is far beyond a sample, and repairing a
diplomatic transcription from a pattern is exactly the move this project
refuses — three crops are evidence about three crops.

The open question is whether to lift the `c1` exemption and rule the 167 as
one sitting, or to sample more widely first.
