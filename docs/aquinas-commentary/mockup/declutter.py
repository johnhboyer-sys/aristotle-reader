import sys
p = sys.argv[1]
t = open(p).read()


def rep(a, b, n=1):
    global t
    assert t.count(a) == n, (t.count(a), a[:90])
    t = t.replace(a, b)


# phone: Aquinas's Latin and English side by side, paragraph by paragraph; Aristotle's texts run as sentences
rep("""    if (a.length) groups.push({ k: 'ari', items: a, side: false });
    if (C.length) groups.push({ k: 'aq', items: C, side: false });
    return { narrow, groups };""",
    """    if (a.length) groups.push({ k: 'ari', items: a, side: false, narrow: true });
    if (C.length) groups.push({ k: 'aq', items: C, side: C.length > 1 });
    return { narrow, groups };""")
rep("""  if (it.length < 2) return ariGroup(g, s);""", """  if (it.length < 2 && !g.narrow) return ariGroup(g, s);""")
rep("""  return `${bar}<div class="sents ${S.acol}">${body}</div>`;""",
    """  return `${bar}<div class="sents ${S.acol}${it.length < 2 ? ' one' : ''}">${body}</div>`;""")
# a label only where it tells two texts apart
rep("""g.items.map(c => `<div class="tx tx-${c}"><div class="tl">${LABEL[c]}</div>${ariText(c, s)}</div>`)""",
    """g.items.map(c => `<div class="tx tx-${c}">${g.items.length > 1 ? `<div class="tl">${LABEL[c]}</div>` : ''}${ariText(c, s)}</div>`)""")
rep("""${first && S.acol === 'sent' ? `<div class="tl">${LABEL[c]}</div>` : ''}""",
    """${first && S.acol === 'sent' && it.length > 1 ? `<div class="tl">${LABEL[c]}</div>` : ''}""")
# the pinned strip: the bar above already names the unit, so the strip carries only the text and a grip
rep("""    return `<div class="cells narrow">${a && (s || (n.kids || []).length) ? `<div class="${stick ? 'strip' : 'flat'}${stick && S.tall ? ' tall' : ''}">${unit}${ariInner(a)}""",
    """    return `<div class="cells narrow">${a && (s || (n.kids || []).length) ? `<div class="${stick ? 'strip' : 'flat'}${stick && S.tall ? ' tall' : ''}">${stick ? '' : unit}${ariInner(a)}""")
rep("""  const unit = s ? `<div class="unit"><span>[${s.n}]</span><span class="ur">${fmtR(s.r)}</span>${L.narrow && stick ? `<button class="more" data-act="tall">${S.tall ? 'less ▴' : 'more ▾'}</button>` : ''}</div>` : '';""",
    """  const unit = s ? `<div class="unit"><span>[${s.n}]</span><span class="ur">${fmtR(s.r)}</span></div>` : '';""")
rep("""  bind(doc);
  lastCur = null; spy();
}""", """  bind(doc);
  // a pinned strip that holds more than it shows gets a grip at its foot
  for (const st of $$('.strip', doc)) if (S.tall || st.scrollHeight > st.clientHeight + 2)
    st.insertAdjacentHTML('beforeend', `<button class="grip" data-act="tall" aria-label="${S.tall ? 'Less of Aristotle' : 'More of Aristotle'}">${S.tall ? '▴' : '▾'}</button>`);
  lastCur = null; spy();
}""")
# the crumb on a phone: one line, the part you are in and its unit
rep("""  const shown = (doc.classList.contains('narrowdoc') || doc.classList.contains('shortdoc')) && path.length > 2 ? ['…', ...path.slice(-2)] : path;""",
    """  const shown = (doc.classList.contains('narrowdoc') || doc.classList.contains('shortdoc')) ? path.slice(-1) : path;""")
# on a phone the site bar and controls step aside while you read down, and come back when you scroll up
rep("""function bind(doc){
  let raf = 0;
  doc.addEventListener('scroll', () => { closePop(); cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); });""",
    """function bind(doc){
  let raf = 0, last = doc.scrollTop, skip = false;
  const small = W < 840 || H < 560;
  if (!small) stage.classList.toggle('bars-off', false);
  const barsH = () => $$('.site-head, .toolbar', stage).reduce((a, e) => a + e.offsetHeight, 0);
  doc.addEventListener('scroll', () => {
    closePop(); cancelAnimationFrame(raf); raf = requestAnimationFrame(spy);
    if (!small) return;
    const y = doc.scrollTop, dy = y - last; last = y;
    if (skip) { skip = false; return; }
    const off = stage.classList.contains('bars-off');
    if (!off && dy > 6 && y > 80 && !S.ctl) {
      const h = barsH();
      stage.classList.toggle('bars-off', true); skip = true; doc.scrollTop = y - h; last = doc.scrollTop;
    } else if (off && (dy < -6 || y < 10)) {
      stage.classList.toggle('bars-off', false);
      const h = barsH();
      skip = true; doc.scrollTop = y + h; last = doc.scrollTop;
    }
  });""")
# styles
rep(""".strip.tall{max-height:calc(var(--stkmax) * .8)}""", """.strip.tall{max-height:calc(var(--stkmax) * .8)}
.strip .grip{position:sticky;bottom:-10px;display:block;width:calc(100% + 32px);margin:0 -16px -10px;height:40px;border:0;padding:14px 0 0;background:linear-gradient(to bottom, transparent, var(--page-bg) 55%);color:var(--accent);font-size:14px;cursor:pointer}
.bars-off .site-head,.bars-off .toolbar{display:none}
.narrowdoc .crumbbar,.shortdoc .crumbbar{flex-wrap:nowrap}
.narrowdoc .crumbbar button,.shortdoc .crumbbar button{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.narrowdoc .crumbbar .rng,.shortdoc .crumbbar .rng{flex:none;white-space:nowrap}
.sents.one .sr{border-top:0;padding-top:2px;padding-bottom:6px}
.narrowdoc .aqp{grid-template-columns:1.9em minmax(0,1fr)}
.narrowdoc .aqt.side{column-gap:12px}
.cells.narrow .cell.aq{padding-left:8px;padding-right:10px}""")
rep(""".aqt.stack .en{margin-top:.5em;padding-left:.9em;border-left:1px solid var(--border);color:var(--text-mid)}""",
    """.aqt.stack .la + .en{margin-top:.5em;padding-left:.9em;border-left:1px solid var(--border);color:var(--text-mid)}""")
open(p, 'w').write(t)
print('ok')
