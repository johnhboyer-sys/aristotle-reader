"""Build the morning review page for PDF pages 52-62.

Every item carries a crop of the actual line so John rules against the ink,
never against my paraphrase of it.
"""
from __future__ import annotations
import html, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_review_crops import crop_line, as_data_uri  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# (id, page, col, line, kind, headline, printed, question, evidence)
ITEMS = [
 # ---- A. print-level anomalies: the ink is wrong, we record it as printed ----
 ("A1", "056", "R", 17, "print", "Wrong sort: <code>ξηρκν</code> where Greek wants ξηρὰν",
  "ξηρκν χ̀ θερμὴν ἀναθυμίασιν significat",
  "Record as printed (my recommendation), or overrule to ξηρὰν?",
  "I verified this one myself at 3× against the reader. The glyph after ξηρ is a clean "
  "two-stroke x with no tail and no accent. The α of ἀναθυ on the SAME line, and of "
  "ἀναθυμίασιν on l.27, is a round-bowl a — a plainly different sort. The ϗ̀ immediately "
  "after has a descending tail and a grave, so it is not that either. This is not the "
  "italic-α-mimics-κ trap from p15R; the surrounding face shows a clear round α."),
 ("A2", "055", "L", 28, "print", "<code>υἱς</code> where sense demands οἷς",
  "διαλύειν υἱς ȣ̓κ",
  "Damaged/wrong sort, or record υἱς as printed?",
  "First letter is an open-topped u identical to the υ of διαλύειν and εὔποροι on the same "
  "line, and unlike the closed round ο of λόγοι. Rough breathing over the ι, no circumflex."),
 ("A3", "053", "R", 26, "print", "<code>κ82</code> for θ82 — contradicted by the same column",
  "κ82. 836 b15",
  "Record the κ as printed, or is this one you'd correct to θ?",
  "The siglum is unmistakably the italic x-shaped κ, identical to κ6. 400a33 and κ3. 392b16 "
  "on this page. But 836b15 is de mirabilibus, which THIS column cites as θ four other times "
  "(θ154, θ29, θ113, θ2). Strong internal evidence for a compositor's error."),
 ("A4", "057", "R", 11, "print", "<code>Ρβ10</code> at 1411a2, which is <em>Rhet.</em> III",
  "Ρβ10. 1411a2",
  "Bonitz's misprint, or Bekker-range override to Ργ10?",
  "Book letter is unmistakably β (double bowl + descender), compared against γ14, γ4, γ6 on "
  "the same page. 1411a2 falls in Rhetoric III. Reader recorded the ink and refused to let "
  "the citation move the reading."),
 ("A5", "057", "R", 46, "print", "Line numbers out of order: <code>1386a6, 5, 7.</code>",
  "Ρβ8. 1386a6, 5, 7.",
  "Record as printed?",
  "Digits verified at 7×. The out-of-order sequence is what the ink shows. Bonitz normally "
  "ascends, so this is a likely source slip — but it is his slip, not ours."),
 ("A6", "057", "L", 13, "print", "<code>Ζγ1</code> — missing book letter",
  "Ζγ1. 732 a19.",
  "Record the omission as printed?",
  "At 8×: Ζ, γ, then a serif Arabic 1 (flag + foot-serif, identical to the 1 of 715a22 and "
  "716b1), then a period. No book letter, though every other GA citation on the page has one "
  "(Ζγα14, Ζγβ1, Ζγα19)."),
 ("A7", "053", "L", 13, "print", "Stray period splitting citation <code>327b4</code>",
  "10. 327.   ← next line begins “b4.”",
  "Record the stray period?",
  "A clear baseline period is printed after 327, yet l.14 opens with b4. Zoomed at 10×; "
  "unambiguous ink, not a superscript artifact."),
 ("A8", "062", "L", 30, "print", "Bare <code>ωσπερ</code> — no breathing, no accent",
  "ωσπερ",
  "Keep bare, per the αλλα/πασχει rule?",
  "Verified at 6× with the crop extended above the line so a neighbouring descender could not "
  "be mistaken for a mark. Lines 26 and 29 of this same column print ὥσπερ properly marked, "
  "which makes the bare form here look deliberate-by-accident rather than a reading failure."),

 # ---- B. reader could not resolve: needs your eye ----
 ("B1", "056", "L", 22, "unresolved", "<code>ἀπόπλ[?]ς</code> — reader refused to write the ligature",
  "ἀπόπλ[?]ς",
  "What is this glyph?",
  "Small x-shaped glyph with a short lower-right descender. Compared at ~22× against a clean ȣ "
  "in τȣ̀ς (l.14), λȣ͂ in ἀναθολȣ͂ν (l.57), the κ of κτήσεις (l.27), the ξ of ἐξ (l.25), and both "
  "ϗ̀ (l.45). NOT the o-over-u stack — no closed top bowl. Reader explicitly declined to write "
  "ȣ on the ground that the word 'must be' ἀπόπλȣς. This is the behaviour we want, and it "
  "leaves the call to you."),
 ("B2", "054", "L", 7, "unresolved", "<code>Ζιβ28</code> — glyph says β, Bekker says otherwise",
  "Ζιβ28 ... 606b12",
  "Trust the glyph (β) or the citation?",
  "Compared at 8–24× against a known θ on the same line-band (Μθ9, l.9) and known βs (μβ8 l.1, "
  "Μβ4 l.34). The disputed glyph has an open upper counter and drops below the baseline of the "
  "adjacent 28; θ here is a closed oval with crossbar and no descender. Shape says β — but "
  "606b12 is not in HA book β. NOTE: this is the page where LlamaParse read ZERO ligatures, so "
  "the three-way vote is weakest here."),
 ("B3", "062", "L", 8, "unresolved", "<code>355b26, 3,2.</code> or <code>32</code>?",
  "355b26, 3,2.",
  "Comma between the digits, or is that the 2's foot?",
  "A comma-sized blob sits between 3 and 2, descending below the baseline and merging with the "
  "2's left foot. Unambiguous 2s elsewhere (1152a22, b24) have no such foot blob. But the digit "
  "spacing is as tight as a two-digit numeral, and 32 would match Bonitz's usual 'b26, 32' habit."),
 ("B4", "053", "R", 14, "unresolved", "<code>941 a39, 48</code> — comma or period?",
  "941 a39, 48",
  "Comma (as inked) or period (as sense wants)?",
  "The mark after 39 is clearly larger than the periods elsewhere on the line and carries a "
  "descending tail, i.e. a comma; 12. and b2. on the same line are plain square dots. Sense "
  "would favour a period (ch. 12 … ch. 48)."),
 ("B5", "056", "R", 44, "unresolved", "<code>(Hom [?]λ 598)</code> — unidentified tick",
  "(Hom [?]λ 598)",
  "What is the cap-height tick before λ?",
  "Visible ink at cap height between 'Hom' and 'λ'. Raised point? apostrophe? speck? Reader left "
  "it as [?] rather than guessing it away."),
 ("B6", "053", "R", 2, "unresolved", "<code>´γ9</code> — stray raised tick",
  "1267 a39. ´γ9",
  "Stray type, broken apostrophe, or intentional mark?",
  "A small raised acute-like tick stands alone between 1267a39. and γ9. Recorded as ´. Also "
  "note 'v l)' is followed directly by Πβ7 with no period."),
 ("B7", "054", "R", 23, "unresolved", "Dot above the υ of <code>συμβαινόντων</code>",
  "συμβαινόντων",
  "Speck, or a grave we're dropping?",
  "A small ROUND dot sits directly above the υ. It is a dot, not a slanted stroke, so the reader "
  "read it as a speck and wrote no grave — flagging in case you see ink."),
 ("B8", "056", "L", 40, "unresolved", "<code>395a9</code> — blotted raised letter",
  "395a9",
  "a or b?",
  "The raised letter is heavily inked with a blot below it. Read 'a' from the visible bowl; the "
  "shape is degraded and 'b' is the second choice."),
 ("B9", "057", "R", 32, "unresolved", "<code>Α9. 992b9</code> — capital with no crossbar",
  "Α9. 992b9",
  "Α or Λ?",
  "The crossbar did not print; the glyph is two strokes with serifed feet. Read capital Α from "
  "the serifed feet plus the surrounding run of Metaphysics book letters (γ, α, this, μ, θ). "
  "Reader calls it the lowest-confidence siglum on the page."),
 ("B10", "055", "L", 49, "unresolved", "<code>ἀΐδια</code> — marginal diaeresis",
  "ἀΐδια",
  "Diaeresis, or ink noise?",
  "Smooth over α and acute over ι are clear; the two faint dots above the ι are marginal in the "
  "ink. Reader included them. If you see no dots, ἀίδια is the alternative."),
 ("B11", "054", "R", 15, "unresolved", "<code>ἢ</code> — smooth or rough?",
  "πᾶν ἡ φύσις ἢ διὰ τὸ",
  "Confirm the breathing.",
  "Reader's least certain call on that page. The breathing+grave is one merged sort. At 24× "
  "against the unambiguous rough on ἡ in the SAME line: the ἡ mark is a clear open-right 'c'; "
  "this one is a flat bar with a left downturn. Read smooth on that difference alone."),
 ("B12", "056", "L", 56, "unresolved", "<code>῾Ηρᾳ</code> — rough or smooth?",
  "῾Ηρᾳ",
  "Confirm the breathing on the capital.",
  "Breathing printed as a separate mark before the capital; read rough from tail direction, but "
  "the reader states smooth is not excluded at this resolution. Iota subscript is clear."),
 ("B13", "057", "L", 24, "unresolved", "<code>ἀφῃρημένης</code> — weakest letter on the page",
  "ἀφῃρημένης",
  "Confirm the ρ.",
  "The letter between ῃ and η has an almost invisible descender. At 22× a short left-hand stroke "
  "drops below the baseline, so read ρ — but the reader names it the weakest letter "
  "identification on the column. The iota subscript under the first η is clear."),
 ("B14", "056", "R", 20, "unresolved", "<code>νοτέρὰ</code> — two accents printed",
  "νοτέρὰ",
  "Both marks real?",
  "An acute over ε AND a grave over the final α, both separately visible. Reader merged neither "
  "and dropped neither."),
 ("B15", "053", "R", 7, "unresolved", "<code>Bk1</code> — digit after Bk",
  "Bk1",
  "1 or a poorly-inked 2?",
  "The superscript is a digit, not a raised 'a' (no bowl; compare the raised a in a35 on the same "
  "line). Shape reads as a serifed 1; a badly-inked 2 cannot be fully excluded."),
]

# p52 items keyed by ctx rather than line number
P52 = [
 ("C1", "052", "R", "Opus recheck OVERRODE a Sonnet HIGH verdict",
  "θατέρȣ (cf ἐξ ὁποτερȣ<b>ȣ͂</b>ν)",
  "Sonnet read one ou-ligature; Opus found TWO. Applied — confirm.",
  "At 16× there are two separate closed loops between ρ and ν, each with its own horns, with "
  "the circumflex over the SECOND only. Gives ὁποτερουοῦν, gen. of ὁποτεροσοῦν — exactly the "
  "form at Pol. Ζ4 1319b9 and exactly what the entry needs (answering ἐξ ἀμφοτέρων … ϗ μὴ "
  "θατέρȣ). All three readers dropped a ligature; the adjudicator ratified the majority. "
  "Shared-blind-spot class: the majority reading was not a possible wordform."),
 ("C2", "052", "L", "Opus recheck OVERRODE a Sonnet HIGH verdict",
  "Ρβ<b>ἀ</b>13 (Sonnet had Ρβά13)",
  "Breathing hook vs acute. Applied — confirm.",
  "Opus pixel-dumped the mark (strip-01, y190–201, x89–96): a horizontal bar descending right "
  "then curling back LEFT at the bottom — the smooth-breathing/apostrophe hook. The acute in "
  "this font is a monotonic straight diagonal with no leftward curl. Semantically odd either "
  "way (Bonitz's book sigla are otherwise bare: Ρα, Ρβ, Πγ, Ζγδ), but diplomatic rule says "
  "record the ink."),
 ("C3", "052", "L", "Adjudicated MEDIUM — queued for you",
  "ὡς ȣ̓ δεῖ",
  "Opus ȣ̓ vs Genie '20 ἢ' vs Llama '20 ϗ'.",
  "Small glyph but the same two-prong-over-loop construction as the ou-ligature elsewhere, with "
  "a breathing above right; reads ὡς οὐ δεῖ (as one ought not), not ὡς ἢ/ϗ δεῖ."),
 ("C4", "052", "L", "Adjudicated MEDIUM — queued for you",
  "τȣ͂ ' νόματος",
  "Opus τȣ͂' vs Genie ῷ vs Llama ȣ.",
  "Line ends with the closed ou-ligature under a circumflex (τȣ͂); the next line opens with a "
  "lone breathing mark before νόματος — the omicron of ὀνόματος dropped out of the type. No "
  "ῷ omega-iota shape anywhere in the ink."),
]


# Three-reader votes from work/flags-by-col/ (compare run on pages 53-57).
# "no flag" means all three readers agreed -- strong evidence the oddity is
# Bonitz's, not ours.
VOTES = {
 "A1": ("opus <b>κν</b> &middot; genie <b>κ</b> &middot; llama <b>ὰν</b>",
        "2&ndash;1 for kappa, and my own zoom agrees. LlamaParse is the lone vote for "
        "ξηρὰν &mdash; and it has a measured false-positive habit on exactly this kind of "
        "call. Adjudicator settles it against the image."),
 "A2": ("opus <b>υἱςȣ̓</b> &middot; genie <b>ὡςοὐ</b> &middot; llama <b>ὡςȣ̓</b>",
        "<b>I had this wrong.</b> Both other readers see <b>ὡς</b>, not υἱς and not οἷς. "
        "In context &mdash; λόγοι ἀναγκαστικοὶ ϗ̀ ȣ̓κ εὔποροι διαλύειν <b>ὡς</b> ȣ̓κ "
        "ἐνδέχεται ἄλλως ἔχειν &mdash; ὡς reads perfectly. This is very likely an Opus "
        "misread of ὡ as υἱ, not a printer's error. Demoted from a print anomaly."),
 "A3": ("no flag &mdash; all three readers agree on <b>κ82</b>", 
        "Strengthened. Independent agreement across three engines means the κ is really "
        "on the page, so the conflict with the four θ citations in the same column is "
        "Bonitz's error, not ours."),
 "A5": ("no flag &mdash; all three readers agree on <b>1386a6, 5, 7</b>",
        "Strengthened. The out-of-order line numbers are genuinely printed."),
 "A6": ("no flag &mdash; all three readers agree on <b>Ζγ1</b>",
        "Strengthened. The missing book letter is genuinely printed."),
 "A7": ("opus <b>.</b> &middot; genie <b>(nothing)</b> &middot; llama <b>(nothing)</b>",
        "<b>Weakened.</b> Only Opus sees the stray period; the other two read straight "
        "through. More likely a speck than printed punctuation."),
 "B1": ("opus <b>[?]</b> &middot; genie <b>η</b> &middot; llama <b>ȣ</b>",
        "LlamaParse reads the ligature, giving ἀπόπλȣς. Genie reads η. The Opus reader "
        "examined it at 22× and said it is specifically NOT the o-over-u stack, so a "
        "2&ndash;1 majority here would be exactly the shared-blind-spot pattern. Needs the image."),
 "B2": ("opus <b>β</b> &middot; genie <b>6</b> &middot; llama <b>6</b>",
        "<b>The vote points at a third answer neither the reader nor I proposed: θ.</b> "
        "Genie and LlamaParse both read a <b>6</b>, and 6 is what a θ turns into when "
        "misread. HA book θ is book 8, and <b>606b12 falls squarely in HA VIII</b> &mdash; "
        "so Ζιθ28 would resolve the citation conflict that made the reader uneasy about β. "
        "Do not let this be settled 2&ndash;1 as '6'; it needs the image."),
}

CSS = """
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
 color:#1a1a1a;background:#fbfaf8}
.wrap{max-width:1180px;margin:0 auto;padding:32px 22px 80px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:#6b6560;font-size:14px;margin-bottom:26px}
.state{background:#fff;border:1px solid #e3ded7;border-radius:10px;padding:16px 18px;margin-bottom:30px}
.state table{border-collapse:collapse;width:100%;font-size:14px}
.state td{padding:5px 10px 5px 0;border-bottom:1px solid #f0ece6}
.state tr:last-child td{border-bottom:none}
.ok{color:#1a7f45;font-weight:600}
.part{color:#b06a00;font-weight:600}
.no{color:#8a8580}
h2{font-size:16px;text-transform:uppercase;letter-spacing:.09em;color:#7a736c;
 margin:38px 0 6px;padding-bottom:7px;border-bottom:1px solid #e3ded7}
h2 .n{color:#b3aca4;font-weight:400;text-transform:none;letter-spacing:0}
.lede{color:#5f5952;font-size:14px;margin:0 0 18px}
.item{background:#fff;border:1px solid #e3ded7;border-radius:10px;margin-bottom:16px;overflow:hidden}
.item.print{border-left:4px solid #b06a00}
.item.unresolved{border-left:4px solid #4a6fa5}
.item.p52{border-left:4px solid #1a7f45}
.hd{display:flex;gap:12px;align-items:baseline;padding:13px 17px 9px;flex-wrap:wrap}
.id{font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:#8a8580;
 border-radius:4px;padding:2px 7px;flex:none}
.item.print .id{background:#b06a00}
.item.unresolved .id{background:#4a6fa5}
.item.p52 .id{background:#1a7f45}
.loc{font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b6560;flex:none}
.ttl{font-weight:600;font-size:15px;flex:1 1 320px;min-width:0}
.body{padding:0 17px 15px}
.q{background:#fdf7e8;border:1px solid #f0e3c0;border-radius:7px;padding:9px 12px;
 font-size:14px;font-weight:600;margin:8px 0 11px}
.item.unresolved .q{background:#eff4fb;border-color:#d3e0f0}
.item.p52 .q{background:#eef8f1;border-color:#cfe8d8}
.ev{font-size:13.5px;color:#4a453f;margin-bottom:11px}
.txt{font:15px/1.5 "GFS Didot","Times New Roman",Georgia,serif;background:#f7f4ef;
 border:1px solid #e8e2da;border-radius:6px;padding:8px 11px;margin-bottom:11px}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:#f0ece6;
 padding:1px 5px;border-radius:3px}
.crop{border:1px solid #ddd6cd;border-radius:6px;overflow-x:auto;background:#fff;
 -webkit-overflow-scrolling:touch}
.crop img{display:block;width:1400px;max-width:100%;height:auto}
.vote{background:#f4f1fb;border:1px solid #ddd5ee;border-radius:7px;padding:9px 12px;margin:0 0 11px}
.vr{font:13.5px ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:5px}
.vg{font-size:13.5px;color:#4a453f}
@media (prefers-color-scheme:dark){.vote{background:#231f2e;border-color:#3a3350}.vg{color:#b5aea6}}
.hint{display:none;font-size:12px;color:#8a8580;margin:5px 0 0}
/* On a phone, fitting a 1400px line-crop to the viewport makes it ~33px tall
   and unreadable. Keep it at native size and let the box scroll instead. */
@media(max-width:820px){
 .wrap{padding:20px 13px 60px}
 .crop img{max-width:none}
 .hint{display:block}
 .hd{padding:11px 13px 8px}.body{padding:0 13px 13px}
 h1{font-size:22px}
}
.nocrop{font-size:13px;color:#8a8580;font-style:italic;padding:8px 0}
.note{background:#fff;border:1px solid #e3ded7;border-left:4px solid #a33;border-radius:10px;
 padding:15px 18px;margin-bottom:16px}
.note h3{margin:0 0 7px;font-size:15px}
.note p{margin:0 0 8px;font-size:14px;color:#4a453f}
.note p:last-child{margin-bottom:0}
@media (prefers-color-scheme:dark){
 body{background:#16151a;color:#e8e4de}
 .state,.item,.note{background:#1e1d23;border-color:#33313a}
 .state td{border-bottom-color:#2a2830}
 h2{color:#9a938c;border-bottom-color:#33313a}
 .lede,.ev{color:#b5aea6}.sub,.loc{color:#918a83}
 .txt{background:#26242c;border-color:#36333d}
 code{background:#2e2b35}
 .q{background:#2e2718;border-color:#4a3d20}
 .item.unresolved .q{background:#1c2430;border-color:#2c3a4d}
 .item.p52 .q{background:#18261d;border-color:#26402e}
 .crop{border-color:#36333d;background:#e8e4de}
}
:root[data-theme=dark] body{background:#16151a;color:#e8e4de}
:root[data-theme=dark] .state,:root[data-theme=dark] .item,:root[data-theme=dark] .note{background:#1e1d23;border-color:#33313a}
:root[data-theme=dark] .txt{background:#26242c;border-color:#36333d}
:root[data-theme=dark] .crop{border-color:#36333d;background:#e8e4de}
:root[data-theme=light] body{background:#fbfaf8;color:#1a1a1a}
:root[data-theme=light] .state,:root[data-theme=light] .item,:root[data-theme=light] .note{background:#fff;border-color:#e3ded7}
"""



def vote_html(iid):
    v = VOTES.get(iid)
    if not v:
        return ''
    readings, gloss = v
    return (f'<div class="vote"><div class="vr">{readings}</div>'
            f'<div class="vg">{gloss}</div></div>')

def crop_html(page, col, line):
    try:
        im = crop_line(page, col, line)
        return f'<div class="crop"><img alt="p{page}-{col} line {line}" src="{as_data_uri(im)}"></div>'
    except Exception as e:                                    # noqa: BLE001
        return f'<div class="nocrop">[crop unavailable: {html.escape(str(e))}]</div>'


def main():
    out = [f'<title>Bonitz 52–62 — review</title><style>{CSS}</style>',
           '<div class="wrap">',
           '<h1>Bonitz — spots needing your ruling</h1>',
           '<div class="sub">PDF pages 52–62 &middot; three-reader pipeline &middot; '
           'Opus 5 readers, Sonnet 5 adjudicators &middot; every item shows the actual ink</div>']

    out.append('<div class="state"><table>'
               '<tr><td><b>p52</b></td><td class="ok">complete</td>'
               '<td>reconciled; lexcheck, breathing, Bekker, alphabetical and family checks all 0</td></tr>'
               '<tr><td><b>pp. 53–57</b></td><td class="part">read, not yet adjudicated</td>'
               '<td>9/10 columns; 55-R was killed by the 2:10am session limit and is re-running</td></tr>'
               '<tr><td><b>pp. 58–62</b></td><td class="part">re-reading</td>'
               '<td>9/10 lost to the limit, relaunched at 06:20</td></tr>'
               '<tr><td><b>pp. 63–91</b></td><td class="no">not read</td>'
               '<td>rendered and stripped only — stopped per your call</td></tr>'
               '</table></div>')

    out.append('<div class="note"><h3>Two things to decide before the next run</h3>'
               '<p><b>1. The all-Sonnet adjudicator config may be leaking.</b> It was adopted on the '
               'p49 measurement &ldquo;0 overrides on Sonnet&rsquo;s 30 HIGH-confidence verdicts&rdquo;. '
               'On p52 the Opus recheck overrode <b>2 of 20</b> high-confidence verdicts, and both were '
               'real (C1, C2 below). The silent-leak rate is not zero.</p>'
               '<p><b>2. LlamaParse is damaged on three pages in this range and cannot be re-run '
               'without a key.</b> Page <b>54 read zero ligatures</b> and flattened 9 words to plain '
               'upsilon; p74 (10 kept / 8 flattened) and p89 (14 / 4) are also degraded. On p54 the '
               'three-way vote effectively collapses to Opus alone for every &#x223; — item B2 sits '
               'on that page.</p>'
               '<p><b>Also worth knowing:</b> parallel readers were writing zoom crops to a shared '
               'scratch path with generic filenames, and one was served another column&rsquo;s image. '
               'It caught the collision itself and re-verified. I added a private-scratch rule to the '
               'reader prompt, but pages 53–62 were launched before that fix.</p></div>')

    groups = [
        ("print", "Print-level anomalies",
         f"{sum(1 for i in ITEMS if i[4]=='print')} items",
         "The ink is wrong and we recorded it wrong, on purpose. Each needs a yes/no: keep as "
         "printed, or is this one where you'd move toward Bekker? Default per the diplomatic "
         "rule is keep."),
        ("unresolved", "Reader could not resolve",
         f"{sum(1 for i in ITEMS if i[4]=='unresolved')} items",
         "The reader declined to guess and said so. These have not been through adjudication "
         "yet — they are the reader's own doubts, which is why they reach you with the crop."),
    ]
    for kind, title, n, lede in groups:
        out.append(f'<h2>{title} <span class="n">— {n}</span></h2>')
        out.append(f'<p class="lede">{lede}</p>')
        for iid, page, col, line, k, headline, printed, question, evidence in ITEMS:
            if k != kind:
                continue
            out.append(
                f'<div class="item {k}">'
                f'<div class="hd"><span class="id">{iid}</span>'
                f'<span class="loc">p{int(page)}-{col} l.{line}</span>'
                f'<span class="ttl">{headline}</span></div>'
                f'<div class="body">'
                f'<div class="txt">{html.escape(printed)}</div>'
                f'<div class="q">{html.escape(question)}</div>'
                f'<div class="ev">{evidence}</div>'
                f'{vote_html(iid)}'
                f'{crop_html(page, col, line)}'
                f'<p class="hint">swipe the strip sideways &rarr;</p>'
                f'</div></div>')

    out.append('<h2>Page 52 — already applied or queued <span class="n">— 4 items</span></h2>')
    out.append('<p class="lede">C1 and C2 are Opus recheck overrides I patched in before '
               'reconciling (Sonnet originals kept as <code>*.sonnet.json</code>). C3 and C4 are the '
               'two medium-confidence verdicts the pipeline queued for you.</p>')
    for iid, page, col, headline, printed, question, evidence in P52:
        out.append(
            f'<div class="item p52">'
            f'<div class="hd"><span class="id">{iid}</span>'
            f'<span class="loc">p{int(page)}-{col}</span>'
            f'<span class="ttl">{headline}</span></div>'
            f'<div class="body">'
            f'<div class="txt">{printed}</div>'
            f'<div class="q">{html.escape(question)}</div>'
            f'<div class="ev">{evidence}</div>'
            f'</div></div>')

    out.append('</div>')
    p = ROOT / 'work' / 'REVIEW-52-62.html'
    p.write_text('\n'.join(out), encoding='utf-8')
    print(p, p.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
