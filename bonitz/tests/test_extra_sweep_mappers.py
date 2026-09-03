"""The five live-counted sweeps map to John's ledger rulings — and ONLY his.

Before `_extra_sweep_findings`, quotecheck, bekker, lexcheck, alphacheck and
the breathing oracle had no adjudication mapper: the dashboard read NOT
MAPPED for all five, forever, however many of their findings John ruled.

The first cut of the mapper passed whole citation tokens through
`adjudicated_by`'s either-way containment, and Grok's adversarial review
(2026-08-20) caught it stealing: a 2-character siglum verdict closed the
035-L:22 quotation finding, and whole-line audit accepts closed citation and
word findings they were never asked about. The theft sites are pinned here
OPEN, next to the rulings that must go on reaching their findings — a mapper
that widens what counts as an answer will fail these before it ships.
"""
from bonitz_pipeline import dashboard
from bonitz_pipeline.adjudication import (Ruled, _address_site, _answers_extra,
                                          split)
from bonitz_pipeline.merge_review import corpus_lines


def test_the_fragment_ruling_reaches_the_bekker_finding():
    """John ruled 077-L:13 (`1595`, keep) on 2026-08-19. The bekker sweep's
    one impossible-page finding on that page must read ADJUDICATED through
    the ledger — before the mapper it read NOT MAPPED, which the dashboard
    rendered identically to work nobody had done."""
    s = split(77, 77)
    assert s['bekker'].total == 1
    assert s['bekker'].adjudicated == 1
    assert s['bekker'].open == 0


def test_the_citation_keep_rulings_reach_their_quotecheck_findings():
    """The 2026-08-20 ledger rulings (039-R:53 `1318a20`, 028-L:12 `688`,
    029-R:3 `529a19`, all kind=keep) anchor inside the printed address and
    answer the zero-overlap quotecheck findings at those sites. The old
    count-based form was abandoned because later rulings at other sites change
    page totals without changing whether these three keeps reach their
    findings."""
    from bonitz_pipeline.adjudication import ruled_sites

    specimens = (
        (39, 'R', 53, 'Πη7. 1318a20', '1318', 'page-039-R:53:1318a20'),
        (28, 'L', 12, 'Ζμγ5. 688', '688', 'page-028-L:12:688'),
        (29, 'R', 3, 'Ζιγ19. 529a19', '529', 'page-029-R:3:529a19'),
    )
    sites = ruled_sites(28, 39)
    for page, col, line, cite, page_digits, sid in specimens:
        addr_line, segment, address = _address_site(cite, line, page_digits)
        text = corpus_lines(page, col)[addr_line - 1]
        cite_at = text.find(segment)
        addr_at = text.find(address, cite_at)
        pd_at = text.find(page_digits, addr_at, addr_at + len(address))
        assert cite_at >= 0 and addr_at >= 0 and pd_at >= 0, (sid, text)
        pd = (addr_line, pd_at, pd_at + len(page_digits))
        addr = (addr_line, addr_at, addr_at + len(address))
        cluster = (addr_line, cite_at, addr[2])
        keep = next(site for site in sites if site.sid == sid)
        assert _answers_extra(page, col, pd, addr, cluster, 'address',
                              [keep]) is keep

def test_a_siglum_card_alone_does_not_answer_a_quotation_finding():
    """035-L:22 `Οβ13. 259a`: two rulings sit on this line. The 2-char `Οβ`
    siglum card ruled two letters and says nothing about the citation — the
    first mapper let it answer (Grok's theft), and it must never again. The
    LEDGER ruling naming the whole citation (John's 2026-08-10 ink read,
    registered as unsettled-which-member) is a recorded disposition of the
    site and legitimately answers. So the split reads adjudicated, and the
    mechanism is pinned by feeding `_answers_extra` the card alone."""
    from bonitz_pipeline.merge_review import corpus_lines
    s = split(35, 35)
    assert (s['quotecheck'].open, s['quotecheck'].adjudicated) == (0, 1)
    assert any(':Οβ13. 259a' in sid for sid in s['quotecheck'].sids), (
        'the answering ruling must be the full-citation ledger entry, '
        f'not the siglum card: {s["quotecheck"].sids}')
    text = corpus_lines(35, 'L')[21]
    cite_at = text.find('Οβ13. 259a')
    pd_at = text.find('259', cite_at)
    pd = (22, pd_at, pd_at + 3)
    addr = (22, pd_at, pd_at + len('259a29'))
    cluster = (22, cite_at, addr[2])
    card = Ruled(35, 'L', ((22, cite_at, cite_at + 2),), 'forms:Οβ',
                 'preserve', 'test')
    assert _answers_extra(35, 'L', pd, addr, cluster, 'address',
                          [card]) is None


def test_a_whole_line_audit_accept_does_not_answer_extra_sweep_findings():
    """A GT-audit accept vouches that a line is transcribed as inked; it was
    never asked the quotecheck, lexcheck, or alphacheck question. Grok found
    three findings retired by whole-line accepts: 018-L:22 (quotecheck),
    041-R:13 (alphacheck), 061-R:36 (lexcheck). All must stay OPEN. (The
    alphacheck specimen dissolved on 2026-08-21 — 041-R:13 was a sweep
    artifact the headword-detection fix stopped nominating, so page 41 no
    longer carries an alphacheck finding to steal; the mechanism stays
    pinned by the other two.) The old count-based form was abandoned because
    later narrow rulings can answer these findings without changing this
    whole-line rule."""
    text = corpus_lines(18, 'L')[21]
    cite_at = text.find('Ρα13. 1373 b34')
    pd_at = text.find('1373', cite_at)
    assert cite_at >= 0 and pd_at >= 0, text
    pd = (22, pd_at, pd_at + len('1373'))
    addr = (22, pd_at, pd_at + len('1373 b34'))
    cluster = (22, cite_at, addr[2])
    whole_line = Ruled(18, 'L', ((22, 0, len(text)),),
                       'whole-line:018-L:22', 'accept', 'test')
    assert _answers_extra(18, 'L', pd, addr, cluster, 'address',
                          [whole_line]) is None

    text = corpus_lines(61, 'R')[35]
    at = text.find('πῦρ')
    assert at >= 0, text
    word = (36, at, at + len('πῦρ'))
    whole_line = Ruled(61, 'R', ((36, 0, len(text)),),
                       'whole-line:061-R:36', 'accept', 'test')
    assert _answers_extra(61, 'R', word, word, word, 'exact',
                          [whole_line]) is None

def test_a_wrapped_cite_anchors_on_the_line_the_address_is_printed_on():
    """063-L:56 prints `αν2.` and wraps; the address 476a17 opens line 57.
    The first mapper anchored the finding on the useless first segment, so a
    ruling naming the number could never reach it."""
    from bonitz_pipeline.adjudication import _extra_sweep_findings
    rows = [t for t in _extra_sweep_findings(63, 63)
            if t[0] == 'quotecheck' and (t[1], t[2]) == (63, 'L')]
    assert any(t[3] == 57 and t[4][1] == '476a17' for t in rows), rows


def test_a_full_number_ruling_is_not_defeated_by_bekkers_truncated_cite():
    """bekker's FRAGMENT regex keeps one line digit — its cite says 1595b2
    where 077-L:13 prints 1595b25. The mapper re-expands the span against
    the line, so a ruling naming the FULL number sits within it rather than
    straddling it. (The live ledger ruling names `1595`; this pins the shape
    a fuller ruling would take.)"""
    text = corpus_lines(77, 'L')[12]
    at = text.find('1595b25')
    assert at >= 0, 'the page prints the full number'
    pd = (13, at, at + len('1595'))
    addr = (13, at, at + len('1595b25'))
    cite_start = text.find('f. 596.')
    cluster = (13, cite_start, addr[2])
    args = (77, 'L', pd, addr, cluster, 'address')
    full = Ruled(77, 'L', ((13, at, at + 7),), 'x', 'preserve', 'test')
    assert _answers_extra(*args, [full]) is full
    wide = Ruled(77, 'L', (cluster,), 'x', 'preserve', 'test')
    assert _answers_extra(*args, [wide]) is wide
    whole_line = Ruled(77, 'L', ((13, 0, len(text)),), 'x', 'accept', 'test')
    assert _answers_extra(*args, [whole_line]) is None


def test_mapper_totals_match_the_dashboard_counters():
    """`dashboard.adjudication` compares the live counter against the
    mapper's total and reports NOT MAPPED on any drift — so the two must
    count on the same filter. Page 77 carries findings for quotecheck (2)
    and bekker (1); a filter change on either side breaks this."""
    counted = dashboard.findings(77, 77)
    parts = split(77, 77)
    for name in ('quotecheck', 'bekker'):
        assert isinstance(counted[name], int)
        assert parts[name].total == counted[name], (
            f'{name}: counter says {counted[name]}, mapper enumerated '
            f'{parts[name].total} — the NOT MAPPED alarm would fire')


def test_no_sweep_reads_not_mapped_on_63_102():
    """The five sweeps' cells must carry a real open/adjudicated split over
    the whole range, and open findings stay OPEN — the mapper must never
    render absence of a ruling as settled.

    The numbers pin the state AFTER the citation sitting of 2026-08-21
    (work/sweeps/citation-rulings-63-102.json): John ruled all 15 citation
    misprints keep-as-printed (they reach the mapper through the ledger),
    retired 10 quotecheck zeros as benign (they leave the count through
    quotecheck.ADJUDICATED), and the three corpus fixes emptied the
    breathing oracle and took lexcheck 9 -> 8. alphacheck read 12 after
    the print-order fix (test_alphacheck_print_order.py — nine flags were
    the emission-order artifact), every one a line-initial word inside an
    entry mistaken for a headword; the 2026-08-21 headword-detection fix
    (test_alphacheck_headword_detection.py) stopped nominating those, so
    the range now measures 0 and the red cell is gone. lexcheck's 8 closed
    2026-08-21 when John ruled all seven follow-up cards
    transcription-right (the two ἀντικρύ rows share one line and one
    ruling answers both occurrences)."""
    counted = dashboard.findings(63, 102)
    adj = dashboard.adjudication(63, 102, counted)
    for name in ('quotecheck', 'bekker', 'lexcheck', 'alphacheck',
                 'breathing_oracle'):
        assert isinstance(adj[name], tuple), f'{name} is {adj[name]!r}'
    assert adj['quotecheck'] == (0, 15)
    # 0 open, 0 adjudicated: the 12 artifact flags dissolved with the
    # headword-detection fix rather than being ruled — measured live above.
    assert adj['alphacheck'] == (0, 0)
    assert adj['lexcheck'] == (0, 8)
    assert adj['breathing_oracle'] == (0, 0)
    assert adj['bekker'] == (0, 1)      # 077-L:13, ruled 2026-08-19
