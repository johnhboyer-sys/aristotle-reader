/* The notes beside the stage: what each direction is, what to look at on each
   page, and what to try. */
window.NOTES = {
  a: {
    name: 'Bekker',
    idea: 'The Plato redesign’s sibling. It keeps that design’s grammar: one reading face for Greek and English, the interface in spaced capitals, rules instead of boxes, one pigment. Where Plato is built on an inscription, this is built on Bekker’s one numbered line, 1a1 to 1462b19, which every citation of Aristotle already uses.',
    pages: {
      home: '<p>The corpus as Bekker’s line: each work a bar from its first column to its last. The gaps are works the site does not carry (Problemata, Magna Moralia, Rhetoric to Alexander and a few short treatises).</p><p>Point at the line to read the page and the work there; click a bar to open the work. Go to takes any Bekker number. Then every work by division, Greek title in capitals, English in italic, its span beneath.</p>',
      work: '<p>The opening sentence in Greek, the title in spaced capitals, the facts. “On Bekker’s line” draws the books to scale with a tick for each chapter, then places the work on the whole line.</p>',
      reader: '<p>One row of spaced capitals, as in Plato. Under it the ten books as a strip, Book I marked and the reading position moving along it. Go to shows the line at the top of the text and takes a new one.</p><p>The translation menu lists the four, with “Compare with” under it. Each column keeps its own Bekker numbers.</p>',
      search: '<p>Plato’s search page with one addition: the corpus line again, every place a tick, so you see where a word lives before you read the list. Each hit gives the Greek line and Ross’s English at that point.</p>',
      lexicon: '<p>The same line for every place the word occurs, then the works as ruled rows, Grammata’s entry and Bonitz.</p>',
    },
    type: 'Gentium Book Plus and Geologica, as on the Plato site. Malachite green on limestone; red ochre marks the doubted works. Bekker numbers stay lower case (1094a1) even among capitals.',
    risk: 'The safe choice: Plato’s readers will feel at home, and the sites will look like a set. The line is the one new idea. If it reads as decoration rather than a map, little else here is new.',
    tries: {
      home: 'Point along the line. Click the Ethics bar. Type 1097a15 in Go to and press Enter.',
      work: 'Click Book I on the ruler. Try Resume.',
      reader: 'Click a Greek word, then ← →. Open OSTWALD ▾ and compare with Ross. Click a small note number. Type 1098a16 in Go to. Open the contents (☰) and pick chapter 7.',
      search: 'Point at the ticks on the line. Click a Bekker number to open the reader there.',
      lexicon: 'Point at the line; click a work.',
    },
  },
  b: {
    name: 'Organon',
    idea: 'Aristotle’s logical works are the Organon, the instrument. This direction treats the reader as an instrument for close reading: outline, text and inspector side by side, a status line, and the keyboard throughout. Nothing on the page moves when you click a word.',
    pages: {
      home: '<p>A command field opens the page: a Bekker number, a work, or a Greek word. Under it, Continue, then the corpus as an index you can filter by division and sort by Bekker order, title or length.</p>',
      work: '<p>A document page: title, the facts in one row, the books as a table with Book I opened to its chapters (Ostwald’s titles), and the translations with the kind of Bekker numbers each carries: fixed, mixed or estimated.</p>',
      reader: '<p>Three panes. The outline follows your place. Each column has its own head; the English head is the translation picker, and Split adds a second. The inspector stays docked, so the text never reflows, and spells the parse out as features.</p><p>With a word open, ← and → step through the text. The status line shows the line, the chapter and the translation.</p>',
      search: '<p>The form on the left; the results in the middle, with their spread across the works as a chart; a preview on the right with the Greek around the hit and Ross’s English at that point.</p>',
      lexicon: '<p>The lexicon as an index beside an entry: the counts, the works as a table with bars, every place by book and chapter, Grammata’s entry.</p>',
    },
    type: 'Literata for reading, Greek and English alike; IBM Plex Sans for the interface and Plex Mono for Bekker numbers. Graphite and paper greys, with one blue for focus and the selected word.',
    risk: 'It looks like a tool because it is one. A student arriving from a search may find three panes a lot; the two side panes fold away from the toolbar, and a phone gets one column.',
    tries: {
      home: 'Filter the index; try Length and A–Z; click Biology. Type 1097a15 in the big field.',
      work: 'Click a chapter under Book I. Click Read beside Ross.',
      reader: 'Click a Greek word, then press → a few times. Press Split. Fold the outline and the inspector with the toolbar icons. Press g, b and e. Press ⌘K.',
      search: 'Click any hit to preview it; Open in the reader.',
      lexicon: 'Switch Most used and A–Z; open the places under a work.',
    },
  },
  c: {
    name: 'Axis',
    idea: 'The site exists to set two texts side by side, so this direction makes that the structure. One ochre line runs down every page; the Greek sets to its left, the English to its right. Titles, search fields and results face each other across it.',
    pages: {
      home: '<p>The corpus as a facing index: Greek titles flush to the line from the left, English titles from the right, each division headed by its numeral and Bekker span. The two search fields face each other; Go to sits on the line.</p>',
      work: '<p>Greek and English titles face each other. The Greek side holds the opening sentence and the facts of the Greek text; the English side the description, the ways in and the translations.</p>',
      reader: '<p>Each text keeps its own Bekker numbers on its own side of the line: the Greek line numbers just left of it, the English ticks just right. The translations are tabs over the English. The sidebar spells the parse out in words.</p>',
      search: '<p>The hits read as a facing concordance: the Greek line on the left, its Bekker number on the line, the English at that point on the right.</p>',
      lexicon: '<p>The forms of the word on the Greek side and the works on the English side, each with a bar growing out from the line.</p>',
    },
    type: 'GFS Didot for titles, Greek and English; Piazzolla for reading and for the interface. No spaced capitals anywhere. Ink on white with one ochre line; ochre also marks numbers and the chosen tab.',
    risk: 'A centred line is a strong form and it costs room; on a phone it moves to the left edge. Didot titles are formal; Piazzolla keeps the reading plain.',
    tries: {
      home: 'Point at a row: the whole pair lights. Type 1097a15 in Go to.',
      work: 'Click a translation to open the reader with it.',
      reader: 'Choose Ross from the tabs; press + Compare; click a word; click a small note number.',
      search: 'Click a row to open the reader at that line.',
      lexicon: 'Click a work on the right.',
    },
  },
  d: {
    name: 'Measure',
    idea: 'Swiss: the corpus as measured data. Lengths, counts and spans are set as numerals and bars on one strict grid. One sans face at three widths sets everything, the Greek included. One yellow marks where you are and what you chose.',
    pages: {
      home: '<p>One number leads: the Bekker pages the site carries, out of Bekker’s 1,462. Then every work as a bar of its length, by division or sorted by length, so the shape of the corpus shows at once.</p>',
      work: '<p>The facts as numerals beside the title; the books as bars; the translations placed on a time line by year.</p>',
      reader: '<p>A black bar holds the controls. The Bekker page and column stand large in the margin and stay in view while you read that column. The word sidebar is a table of features: lemma, gloss, case, number, gender, tense, mood, voice.</p>',
      search: '<p>The count, the spread across the works as bars, then a table: Bekker number, the Greek line, Ross’s English at that point.</p>',
      lexicon: '<p>The count, then who uses the word, as bars: the authors before Aristotle, Aristotle, his contemporaries. Then the works.</p>',
    },
    type: 'Fira Sans, with Fira Sans Condensed for numerals and titles. The Greek is set in Fira Sans too, which carries full polytonic Greek. Black on white; signal yellow is only ever a fill.',
    risk: 'Sans-serif Greek is the largest break here, with print and with the other readers. It reads cleanly at this size, but a reader raised on OCT pages may not want it every day. The reading face could become a serif without changing anything else.',
    tries: {
      home: 'Switch to By length. Point at a row.',
      work: 'Point at a translation on the time line.',
      reader: 'Scroll: the margin keeps the column (1094a, 1094b …). Click a word. Open Ostwald ▾ and compare.',
      search: 'Click the bars to mark works; click a Bekker number.',
      lexicon: 'Compare Aristotle with the authors before him.',
    },
  },
};
