"""Automatic settlement of word-level OCR disputes — fires, refuses, counts.

The recurring bug this project keeps finding: a lookup that silently stops
matching looks exactly like a cautious refusal. So these tests assert that
settlement FIRES on known cases, REFUSES where two readings are both real
Greek, and COUNTS every refusal rather than letting it vanish.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from bonitz_pipeline.settle import (
    AUTH_AGREE,
    AUTH_MORPHEUS_DECIDE,
    AUTH_MORPHEUS_MEMBER,
    AUTH_REFUSE,
    AUTH_SIGLUM,
    ALL_READERS,
    STRONG_READERS,
    Settlement,
    SettleReport,
    boundary_glue_suspect,
    by_accent_positional,
    by_morpheus_membership,
    by_siglum_holds,
    final_accent_mark,
    is_real_greek,
    looks_like_citation,
    select_readings,
    settle_one,
    settle_path,
    settle_words,
)
from bonitz_pipeline.word_flags import WordFlag

ROOT = Path(__file__).resolve().parent.parent
FLAGS5 = ROOT / 'work' / 'flags5-053-062.jsonl'
OPUS = ROOT / 'raw' / 'opus'

ACUTE, GRAVE = '́', '̀'


def _wf(kind: str, readers: dict[str, str],
        page: int = 53, col: str = 'L', word_off: int = 0) -> WordFlag:
    return WordFlag(page=page, col=col, word_off=word_off,
                    readers=readers, kind=kind, n_sites=1, spine_off=word_off)


# --- pure helpers -----------------------------------------------------------

def test_boundary_glue_suspect_catches_edge_letter_not_midword():
    """χ+οὕτω is glue (longer wins by absorption); the clean shorter is not."""
    assert boundary_glue_suspect('χοὕτω', {'οὕτω'})
    # Shorter clean reading against a longer rival is preferred, not suspect.
    assert not boundary_glue_suspect('οὕτω', {'χοὕτω'})
    assert not boundary_glue_suspect('ἁμῶς', {'ἁμιῶς'})
    assert not boundary_glue_suspect('ἁμιῶς', {'ἁμῶς'})
    assert not boundary_glue_suspect('λόγος', {'νόμος'})


def test_is_real_greek_fires_on_known_forms():
    """⚠ ASSERT IT FIRES. Silence is the normal answer; a dead index would
    look exactly like a cautious one."""
    assert is_real_greek('ἁμῶς')
    assert not is_real_greek('ἁμιῶς')
    assert is_real_greek('ἄρξηται')
    assert is_real_greek('λόγος')


def test_morpheus_membership_settles_hamws_and_refuses_two_real():
    got = by_morpheus_membership({'ἁμῶς', 'ἁμιῶς'})
    assert got is not None and got[0] == 'ἁμῶς'

    # Both real → silence (rule 2).
    assert by_morpheus_membership({'λόγος', 'νόμος'}) is None

    # Neither real → silence.
    assert by_morpheus_membership({'ξξξξ', 'ψψψψ'}) is None


def test_morpheus_membership_refuses_boundary_glue_winner():
    """Rule 1: a sole real form that only wins by absorbing an edge letter."""
    longer = 'χοὔτω'   # Morpheus crasis (χ + οὔτω glued)
    shorter = 'οὔτϙ'   # not a Greek form; edge-related skeleton to longer
    # χοὔτω skeleton χουτω; make shorter = ουτω by using οὔτω — but οὔτω is
    # itself real, which is multi-real silence. Use a non-form that still
    # edge-matches after strip: construct via known real + junk edge.
    # λ + ὄγος is not how glue works in practice; use χοὔτω vs a stripped
    # non-word that matches the edge pattern on skeletons.
    from bonitz_pipeline.word_flags import skeleton as sk
    assert sk('χοὔτω').startswith('χ')
    body = sk('χοὔτω')[1:]  # ουτω
    # Find any non-real spelling whose skeleton is body — o+marks only.
    shorter = 'οὐτω'  # wrong marks; skeleton ουτω
    assert sk(shorter) == body
    assert boundary_glue_suspect(longer, {shorter})
    if is_real_greek(longer) and not is_real_greek(shorter):
        assert by_morpheus_membership({longer, shorter}) is None
    else:
        # If shorter is also real, multi-real already silences — still safe.
        assert by_morpheus_membership({longer, shorter}) is None

    # Clean shorter form against glued longer garbage: ACCEPT the shorter.
    assert is_real_greek('λόγος')
    if not is_real_greek('χλόγος'):
        got = by_morpheus_membership({'λόγος', 'χλόγος'})
        assert got is not None and got[0] == 'λόγος'


def test_looks_like_citation_for_bare_sigla_not_words():
    assert looks_like_citation({'Πα', 'Πι'})
    assert looks_like_citation({'Ζγβ', 'Ζηβ'})
    assert not looks_like_citation({'ἁμῶς', 'ἁμιῶς'})
    assert not looks_like_citation({'κἂν', 'κᾶν'})  # diacritics → not a siglum


def test_siglum_holds_settles_by_bekker_page():
    """Ζγ (GA) holds 748; Ζη is a different work — page decides."""
    got = by_siglum_holds({'Ζγβ', 'Ζηβ'}, 748)
    assert got is not None and got[0] == 'Ζγβ'
    # Both hold or neither → silence.
    assert by_siglum_holds({'Ζγβ', 'Ζηβ'}, None) is None


def test_accent_positional_smyth_154():
    """Final acute → grave before a following Greek word; acute before stop."""
    forms = {'ἰσχύν', 'ἰσχὺν'}
    got = by_accent_positional(forms, 'π')  # following Greek
    assert got is not None and got[0] == 'ἰσχὺν'
    got = by_accent_positional(forms, '.')
    assert got is not None and got[0] == 'ἰσχύν'
    # Latin / unknown next char → refuse.
    assert by_accent_positional(forms, 's') is None
    # Circumflex fight → refuse.
    assert by_accent_positional({'τιμῆς', 'τιμής'}, 'π') is None


def test_final_accent_mark():
    assert final_accent_mark('ἰσχύν') == ACUTE
    assert final_accent_mark('ἰσχὺν') == GRAVE
    assert final_accent_mark('λόγος') in (ACUTE, None) or final_accent_mark('λόγος') == ACUTE


# --- settle_one on synthetic WordFlags --------------------------------------

def test_settle_one_fires_on_letter_dispute_hamws():
    w = _wf('letters', {'opus': 'ἁμῶς', 'kraken': 'ἁμιῶς', 'codex': 'ἁμῶς'})
    s = settle_one(w, STRONG_READERS)
    assert s.settled
    assert s.winner == 'ἁμῶς'
    assert s.authority == AUTH_MORPHEUS_MEMBER
    assert s.reason


def test_settle_one_refuses_two_real_letter_forms():
    w = _wf('letters', {'opus': 'λόγος', 'kraken': 'νόμος', 'codex': 'λόγος'})
    s = settle_one(w, STRONG_READERS)
    assert not s.settled
    assert s.winner is None
    assert s.authority == AUTH_REFUSE
    assert s.reason == 'morpheus:multiple_real_forms'


def test_settle_one_breathing_morpheus_decide():
    """Only ἁλουργός is Greek; smooth is a reader's error."""
    w = _wf('breathing-only', {
        'opus': 'ἁλουργός', 'kraken': 'ἀλουργός', 'codex': 'ἁλουργός',
    })
    s = settle_one(w, STRONG_READERS)
    assert s.settled
    assert s.winner == 'ἁλουργός'
    assert s.authority in (AUTH_MORPHEUS_DECIDE, 'breathing_oracle.arbitrate',
                           'breathing_oracle.decide')
    assert breathing_of_winner(s)


def breathing_of_winner(s: Settlement) -> bool:
    from bonitz_pipeline.breathing_oracle import breathing
    return breathing(s.winner) == 'rough'


def test_settle_one_refuses_ex_hex_both_real():
    """Aristotle writes both ἐξ and ἕξ — only the ink decides."""
    w = _wf('breathing-only', {'opus': 'ἐξ', 'kraken': 'ἕξ', 'codex': 'ἐξ'})
    s = settle_one(w, STRONG_READERS)
    assert not s.settled
    assert s.authority == AUTH_REFUSE
    assert s.reason  # non-empty; not a vanished lookup


def test_settle_one_citation_uses_siglum_not_morpheus():
    """`πα` is a Morpheus form; citation disputes must not crown it that way."""
    w = _wf('letters', {
        'opus': 'Ζγβ', 'kraken': 'Ζηβ', 'codex': 'Ζγβ',
    }, page=53, col='R', word_off=0)
    # Provide a stream with a Bekker page after the token.
    stream = 'Ζγβ748a16.rest'
    s = settle_one(w, STRONG_READERS, stream=stream)
    assert s.settled
    assert s.winner == 'Ζγβ'
    assert s.authority == AUTH_SIGLUM


def test_settle_one_agree_when_strong_collapse():
    """Genie noise alone must not keep a dispute alive under STRONG."""
    w = _wf('letters', {
        'opus': 'ἁμῶς', 'genie': 'ἁμιῶς', 'kraken': 'ἁμῶς', 'codex': 'ἁμῶς',
    })
    s = settle_one(w, STRONG_READERS)
    assert s.settled
    assert s.authority == AUTH_AGREE
    assert s.winner == 'ἁμῶς'


def test_settle_one_accent_positional_with_stream():
    w = _wf('accent-only', {
        'opus': 'ἰσχὺν', 'kraken': 'ἰσχύν', 'codex': 'ἰσχὺν',
    })
    stream = 'ἰσχὺνπρὸς'
    s = settle_one(w, STRONG_READERS, stream=stream,
                   allow_accent_positional=True)
    assert s.settled
    assert s.winner == 'ἰσχὺν'
    assert s.authority == 'accent.positional'


def test_settle_one_accent_refuses_without_positional():
    w = _wf('accent-only', {
        'opus': 'ἰσχὺν', 'kraken': 'ἰσχύν', 'codex': 'ἰσχὺν',
    })
    s = settle_one(w, STRONG_READERS, stream=None,
                   allow_accent_positional=False)
    assert not s.settled
    assert s.reason == 'accent-only:lexicon_cannot_settle'


# --- report completeness: refusals counted ----------------------------------

def test_report_counts_refusals_nothing_vanishes():
    word_list = [
        _wf('letters', {'opus': 'ἁμῶς', 'kraken': 'ἁμιῶς', 'codex': 'ἁμῶς'}),
        _wf('letters', {'opus': 'λόγος', 'kraken': 'νόμος', 'codex': 'λόγος'}),
        _wf('breathing-only', {'opus': 'ἐξ', 'kraken': 'ἕξ', 'codex': 'ἐξ'}),
        _wf('accent-only', {'opus': 'τιμή', 'kraken': 'τιμὴ', 'codex': 'τιμή'}),
    ]
    # No streams needed for these pure cases (accent will refuse).
    rep = SettleReport(settlements=[
        settle_one(w, STRONG_READERS, stream=None,
                   allow_accent_positional=False)
        for w in word_list
    ], reader_set=STRONG_READERS)
    rep.assert_complete()
    assert len(rep.settlements) == 4
    assert len(rep.settled) + len(rep.refused) == 4
    assert len(rep.refused) >= 2  # λόγος/νόμος and ἐξ/ἕξ and accent
    assert all(s.reason for s in rep.refused)
    assert sum(rep.refuse_reasons.values()) == len(rep.refused)
    # The known settlement fired.
    assert any(s.winner == 'ἁμῶς' for s in rep.settled)


def test_select_readings_filters_to_reader_set():
    w = _wf('letters', {
        'opus': 'a', 'genie': 'b', 'llama': 'c', 'kraken': 'a', 'codex': 'a',
    })
    assert select_readings(w, STRONG_READERS) == {
        'opus': 'a', 'kraken': 'a', 'codex': 'a',
    }
    assert set(select_readings(w, ALL_READERS)) == set(ALL_READERS)


# --- real flags5 batch ------------------------------------------------------

@pytest.mark.skipif(not FLAGS5.exists() or not OPUS.exists(),
                    reason='flags5 / raw opus not present')
def test_flags5_settlement_fires_and_counts_at_scale():
    """On 53-62: some letter disputes settle; every row is accounted for."""
    rep = settle_path(FLAGS5, STRONG_READERS)
    rep.assert_complete()
    assert len(rep.settlements) >= 800
    # Membership or siglum must fire on real letter disputes — silent zero
    # is the bug class.
    letter_auto = [s for s in rep.settled
                   if s.kind == 'letters' and s.authority != AUTH_AGREE]
    assert len(letter_auto) >= 30, (
        f'only {len(letter_auto)} letter auto-settlements; membership looks dead')
    assert AUTH_MORPHEUS_MEMBER in rep.by_authority or AUTH_SIGLUM in rep.by_authority
    # Refusals are counted, not dropped.
    assert len(rep.refused) >= 1
    assert sum(rep.refuse_reasons.values()) == len(rep.refused)
    # Multiple-real refusals must be visible (rule 2 in action).
    assert rep.refuse_reasons.get('morpheus:multiple_real_forms', 0) >= 1


@pytest.mark.skipif(not FLAGS5.exists() or not OPUS.exists(),
                    reason='flags5 / raw opus not present')
def test_flags5_hamws_settles_to_opus():
    from bonitz_pipeline.word_flags import words as load_words
    word_list = load_words(FLAGS5)
    first = next(w for w in word_list
                 if w.page == 53 and w.col == 'L' and w.word_off == 0)
    assert first.readers['opus'] == 'ἁμῶς'
    s = settle_one(first, STRONG_READERS)
    assert s.settled and s.winner == 'ἁμῶς'
    assert s.authority == AUTH_MORPHEUS_MEMBER


@pytest.mark.skipif(not FLAGS5.exists() or not OPUS.exists(),
                    reason='flags5 / raw opus not present')
def test_weak_readers_poison_breathing_settlement():
    """Rule 3: report both ways — all-five must not beat strong by drowning
    the signal. Measured earlier: strong breathing settlement ≥ all-five."""
    from bonitz_pipeline.word_flags import words as load_words
    word_list = load_words(FLAGS5)
    strong = settle_words(word_list, STRONG_READERS)
    all5 = settle_words(word_list, ALL_READERS)
    s_b = sum(1 for s in strong.settled
              if s.kind == 'breathing-only' and s.authority != AUTH_AGREE)
    a_b = sum(1 for s in all5.settled
              if s.kind == 'breathing-only' and s.authority != AUTH_AGREE)
    # The poison measurement: weak readers must not *increase* breathing
    # settlement by inventing consensus. They typically decrease it.
    assert s_b >= a_b, (
        f'strong breathing settlements {s_b} < all-five {a_b}; '
        f'weak-reader poison check inverted')
    assert s_b >= 10, f'breathing settlement looks dead ({s_b})'
