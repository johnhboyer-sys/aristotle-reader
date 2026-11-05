import sys
p = sys.argv[1]
t = open(p).read()


def rep(a, b, n=1):
    global t
    assert t.count(a) == n, (t.count(a), a[:90])
    t = t.replace(a, b)


# John, 2026-11-04: whoever reads Moerbeke's Latin reads Latin, so no English of it for now.
# The renderers and MOER_EN stay; only the offer goes, and a saved choice is cleared.
rep("""S.cols = Object.assign({ grc: true, en: false, moer: false, moen: false, aqla: true, aqen: true }, v.cols || {}); } catch (e) {}""",
    """S.cols = Object.assign({ grc: true, en: false, moer: false, moen: false, aqla: true, aqen: true }, v.cols || {}); } catch (e) {}
S.cols.moen = false;   // no English of Moerbeke for now: a reader of his Latin reads Latin""")
rep("""    const a = merged ? [...A, ...B] : ['grc', 'en', 'moer', 'moen'].filter(c => S.cols[c]).slice(0, 1);""",
    """    const a = merged ? [...A, ...B] : ['grc', 'en', 'moer'].filter(c => S.cols[c]).slice(0, 1);""")
rep("""    const a = ['grc', 'en', 'moer', 'moen'].find(c => S.cols[c]) || 'none';""",
    """    const a = ['grc', 'en', 'moer'].find(c => S.cols[c]) || 'none';""")
rep("""${['grc', 'en', 'moer', 'moen'].map(c => `<button class="chip" data-col="${c}" aria-pressed="${!!S.cols[c]}">${SHORT[c]}</button>`).join('')}""",
    """${['grc', 'en', 'moer'].map(c => `<button class="chip" data-col="${c}" aria-pressed="${!!S.cols[c]}">${SHORT[c]}</button>`).join('')}""")
rep("""['moer', "Moerbeke's Latin"], ['moen', 'English of Moerbeke'], ['none', 'None']]""",
    """['moer', "Moerbeke's Latin"], ['none', 'None']]""")
rep("""  const chips = `<span class="lab">Aristotle</span>${['grc', 'en', 'moer', 'moen'].map(chip).join('')}""",
    """  const chips = `<span class="lab">Aristotle</span>${['grc', 'en', 'moer'].map(chip).join('')}""")
rep("""  if (s.dataset.sel === 'ari') { for (const c of ['grc', 'en', 'moer', 'moen']) S.cols[c] = c === v; }""",
    """  if (s.dataset.sel === 'ari') { for (const c of ['grc', 'en', 'moer']) S.cols[c] = c === v; }""")

# notes
rep("""   leaves, the six texts are columns.""", """   leaves, the five texts are columns.""")
rep("""      <li><b>The six texts are columns.</b> Greek, Smith's English, Moerbeke's Latin, an English of Moerbeke, Aquinas's Latin, an English of Aquinas.""",
    """      <li><b>The five texts are columns.</b> Greek, Smith's English, Moerbeke's Latin, Aquinas's Latin, an English of Aquinas. There is no English of Moerbeke: whoever reads his Latin reads Latin.""")
rep("""      <li><b>Aristotle's four texts line up by sentence.</b> Five texts are really two: Aristotle's Greek and the Latin Aquinas read, each with an English, and Moerbeke's Greek is marks on Ross's.""",
    """      <li><b>Aristotle's three texts line up by sentence.</b> They are Aristotle's Greek with Smith's English, and the Latin Aquinas read; Moerbeke's Greek is marks on Ross's.""")
rep("""An English sits under its original behind a rule, at full size.""",
    """Smith sits under the Greek behind a rule, at full size.""")
rep("""      <li>The English of Moerbeke and of Aquinas are drafts written for this mockup.</li>""",
    """      <li>The English of Aquinas is a draft written for this mockup.</li>""")
open(p, 'w').write(t)
print('ok')
