/* Notes beside each direction: the idea, each page, type and colour, the
   pictures, the risk. Shown in the Notes drawer. */
window.NOTES = {
  a: {
    name: 'Capitals',
    idea: 'Plato’s sibling. Plato’s home page sets one inscription; here each work is announced by its own key word in Greek capitals, every word on one letter grid, so they line up down the page.',
    pages: {
      home: '<p>Seven key words stack beside the title as a way in. Below, every work by division, each with its word. Rules, no boxes.</p>',
      work: '<p>The work’s word set large, then the title, every chapter with Ostwald’s titles where the site has them, and the translations.</p>',
      reader: '<p>The running head names the chapter you are in and its title. Each chapter opens with its number on the letter grid. Bekker numbers stay in the margins: every fifth Greek line, and each translation’s own ticks.</p>',
      search: '<p>Hits grouped by book and chapter, each with its Greek line and Ross’s English.</p>',
      lexicon: '<p>The headword as a word block; counts as plain numbers.</p>',
    },
    type: 'Gentium Book Plus for all reading text, as Plato. Commissioner for the capitals and the controls: Plato’s Geologica has no polytonic Greek. Malachite green on limestone.',
    images: 'None. The word blocks are the art.',
    risk: 'The closest to Plato. The key word for each work is a judgment call (ΑΝΤΙΦΑΣΙΣ for <i>De Interpretatione</i>, ΚΑΛΟΚΑΓΑΘΙΑ for the <i>Eudemian Ethics</i>); the list needs your eye.',
    tries: {
      home: 'Point at a word block; open any work from the list.',
      reader: 'Click a Greek word in either pane: both open it. Try the contents (☰) and Aa on the phone.',
    },
  },
  b: {
    name: 'Collection',
    idea: 'Each work with an early photograph, chosen for what the work is about. The prints carry the colour; the type stays black on bone, and the reader stays plain.',
    pages: {
      home: '<p>The moon’s craters Aristotle and Eudoxus lead. Then every work as a print with its title, by division.</p>',
      work: '<p>The print large with a one-line caption that ties it to the text, and the Getty’s full credit. The reader opens beside a small copy of the same print.</p>',
      reader: '<p>Quiet on purpose: one small print at the head of the book, then text. Chapter numbers set large.</p>',
      search: '<p>The query set large; hits by chapter.</p>',
      lexicon: '<p>The headword very large, with the print of the work where it occurs most.</p>',
    },
    type: 'Noto Serif Display Light for titles, Literata for reading, Source Sans 3 for controls. Ink on bone; sepia only in the pictures.',
    images: 'Forty-two photographs, from the 1840s to the 1920s, all from the J. Paul Getty Museum’s Open Content program (CC0). Each work page carries the credit and the Getty’s accession number.',
    risk: 'Some pairings are plain (Le Gray’s wave for the <i>Meteorology</i>, an archer for the <i>Ethics</i>), some are a stretch (a spirit photograph for the <i>Sophistical Refutations</i>). Any can be swapped.',
    tries: {
      home: 'Scroll the collection; open any print.',
      work: 'Try a few works from the home page: Meteorology, Memory, Sophistical Refutations.',
    },
  },
  c: {
    name: 'Diagram',
    idea: 'Aristotle as the old diagrams drew him. The home page is a division of the sciences, theoretical, practical and productive, with logic as their instrument, and it names every work. Work pages carry a diagram of the doctrine.',
    pages: {
      home: '<p>The whole corpus as one division, left to right. On a phone it turns into an indented outline.</p>',
      work: '<p>A diagram of the work’s doctrine with the passage it comes from, then the chapters as branches. Works without a diagram show their place in the division.</p>',
      reader: '<p>The contents and the word sidebar are drawn as divisions too: a word’s readings branch from it.</p>',
      search: '<p>Results as a division: work, chapter, place.</p>',
      lexicon: '<p>Where the word falls, as a division with the count in each work.</p>',
    },
    type: 'Alegreya for reading and titles, Didact Gothic for labels. Indigo ink and ochre on white.',
    images: 'Fourteen diagrams drawn for this mockup: the mean, the opposition of statements, the three figures, the four causes, the heavens, the elements, the triangle in the quadrilateral, being and health, the categories, the six constitutions, the three proofs, the parts of tragedy, Porphyry’s tree and the division of animals.',
    risk: 'Every diagram must be right to the letter; each cites its passage and needs checking. On a phone the wide ones scroll sideways.',
    tries: {
      home: 'Follow a branch to a work; works marked with a dot have a diagram.',
      work: 'Try De Interpretatione, Prior Analytics, Physics, On the Heavens and the Isagoge.',
    },
  },
  d: {
    name: 'Aldine',
    idea: 'Every work beside its first printing: the Greek Aristotle of Aldus Manutius, Venice 1495–98. The pages are shown as documents with their source; the site itself stays modern.',
    pages: {
      home: '<p>The first page of the <i>Categories</i>, 1495, beside the title. Each division opens with the first page of one of its works.</p>',
      work: '<p>The work’s first page as Aldus printed it, with its volume and year and a link to the whole volume.</p>',
      reader: '<p>The book opens beside the same opening in the 1498 volume. Chapter numbers in rubric red.</p>',
      search: '<p>Hits by chapter, the chapter number in red.</p>',
      lexicon: '<p>The headword in Garamond; counts in one sentence.</p>',
    },
    type: 'EB Garamond throughout, Greek and English. Black and rubric red on warm white.',
    images: 'The opening pages of 36 works, from the Boston Public Library’s copy as digitised by the Internet Archive (Public Domain Mark).',
    risk: 'Rubric red and Garamond could tip into costume; the pages are kept as pictures with captions, not as a frame for the site. The <i>Rhetoric</i> and <i>Poetics</i> have no Aldine page here.',
    tries: {
      home: 'Scroll the divisions; open a work to see its first page.',
      work: 'Compare the Physics, the History of Animals and the Politics.',
    },
  },
};
