window.NOTES = window.NOTES || {};
window.NOTES.p = {
  name: 'Plato’s look',
  variants: [{ id: 'green', label: 'Green' }, { id: 'red', label: 'Red' }],
  idea: 'The Aristotle Reader in the Plato Reader’s current design: the same type, spacing, rules and parts, measured on plato.johnhboyer.com and matched. Each work page opens on the work’s own first words in capitals on a letter grid, as Plato’s do. The colour is Aristotle’s own.',
  pages: {
    home: '<p>Plato’s home page: the name in capitals on a letter grid, three even rows of eleven: ΑΡΙΣΤΟΤΕΛΗΣ in the accent, ΣΤΑΓΕΙΡΙΤΗΣ, and ΤΑ ΣΩΙΖΟΜΕΝΑ with ΤΑ in grey; the intro and search; “Begin with”; the works by division, Α to Ϛ, each with its Greek title in spaced capitals, English title in italic and Bekker range. Porphyry’s <i>Isagoge</i> closes the logic. On a phone every division stays open, so every work is in view.</p>',
    work: '<p>Plato’s work page. On the left, the work’s first forty-eight letters, twelve to a row, the last rows fading, with the Bekker line under them. On the right the division, the Greek title in large spaced capitals, the English in italic, the blurb, the facts and the buttons. Books fold, closed at first, and open on every chapter. Translations are listed once, under “Read this work”.</p>',
    reader: '<p>Plato’s head bar of small spaced capitals and his columns, 1080 wide. The Greek runs as prose, as Plato’s does, with Bekker’s line numbers in its left margin; the English keeps its own numbers in the gutter beside it. Chapters lead, each with Ostwald’s title. A Greek word opens Plato’s sidebar on the right, or a sheet from the bottom on a phone, where Greek and English stay side by side.</p>',
    search: '<p>Plato’s search page: the query on a rule, the language switch, the options and the count. Then every work with hits down the left, as in H, where Plato’s shows eight and a “more” button; beside it the places by work and chapter, each hit marked in the Greek.</p>',
    lexicon: '<p>Plato’s entry page: the headword in capitals on the grid beside it as printed, then the LSJ entry, the word elsewhere in Greek and every place in Aristotle by work and book. Plato’s right column lists the works a second time; here it lists the words beside this one.</p>',
  },
  type: 'Gentium Book Plus for Greek and English, Geologica 300 for capitals and controls, as on the Plato Reader. Green: Lyceum green ink (#1b5a3b) on a grey with a breath of green (#e2e7e3). Red: a rubric red (#a8201a) on a neutral stone grey (#e5e5e6). Each has a dark set; body text and accent text pass 4.5:1 on their grounds in all four.',
  images: 'None.',
  risk: 'It is Plato’s site in another colour, so the two readers will look like one family more than two places. Aristotle’s name is longer than Plato’s, so the masthead sets three rows of eleven letters to Plato’s eight. Three works (Categories, De Interpretatione, Isagoge) show their titles, not their first words, because their Greek is not in the repository’s sources.',
  tries: {
    home: 'Press v to switch green and red, then t for dark. On the phone, open the menu: the current page is marked.',
    work: 'Compare the Metaphysics (fourteen books, folded), the Poetics (one book, chapters open) and Youth and Old Age (a long Greek title that steps down to fit).',
    reader: 'Click a Greek word. Switch Greek, Both and English; set two translations side by side from the translation menu; type 1097b22 in Go to.',
    search: 'The hit is marked in each Greek line; each Bekker number opens the reader there.',
    lexicon: 'Open a work under “Every occurrence”, then a book, to see its places.',
  },
};
