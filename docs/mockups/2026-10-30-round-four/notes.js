/* Notes beside each direction: the idea, each page, type and colour, the
   pictures, the risk. Shown in the Notes drawer. */
window.NOTES = {
  a: {
    name: 'Capitals',
    idea: 'Plato’s sibling. Plato’s home page sets one inscription; here each work is announced by its own key word in Greek capitals, every word on one letter grid, so they line up down the page.',
    pages: {
      home: '<p>Seven key words stack beside the title as a way in. Below, every work by division, each with its word. Rules, no boxes.</p>',
      work: '<p>The work’s word set large, then the title, the facts (each translation opens from its name) and the books, closed by default; each opens to its chapters, with Ostwald’s titles where the site has them.</p>',
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
    name: 'Poster',
    idea: 'The style you liked: one early photograph with the title over it in large red capitals that let the photograph show through. One photograph on the home page, one on each work page, none anywhere else. A desktop shows a wide cut of it, a phone a tall one.',
    pages: {
      home: '<p>One photograph, the site’s title over it. The site would show a different photograph at each visit; “Next photograph” steps through eight wide, quiet ones here: busy photographs fight the type. Below, the works as a plain list by division.</p>',
      work: '<p>The work’s photograph across the page with its title over it, as on the home page: a wide cut on a desktop, a tall cut on a phone. The caption ties it to the text, the credit follows, and the work’s details come below. Books close by default.</p>',
      reader: '<p>No photograph. The red capitals carry over to the book’s title and the chapter numbers; the text itself is plain.</p>',
      search: '<p>No photograph. Hits by chapter, with the chapter number in red.</p>',
      lexicon: '<p>No photograph. The headword large, the counts in red.</p>',
    },
    type: 'Sofia Sans, a grotesque with Greek, for the titles, labels and controls; Literata for reading. Black on near-white, one signal red. In dark mode the capitals lie over the photograph without blending.',
    images: 'Forty-one photographs from the J. Paul Getty Museum’s Open Content program (CC0), from the 1840s to the 1920s. Each is cut twice from the full-size original, wide and tall, and shown only on its own work page and on the home page.',
    risk: 'Capitals over a busy photograph can be hard to read; the type is sized to fit each title. A tall photograph loses most of its height in the wide cut: each cut is chosen by hand, and a work can take a second photograph for one shape instead. Some pairings of photograph and work are a stretch and can be swapped.',
    tries: {
      home: 'Press “Next photograph” a few times.',
      work: 'Compare the two cuts where a tall photograph had to give a wide one: Nicomachean Ethics, Rhetoric, On Sophistical Refutations. Then a long title: On Youth, Old Age, Life and Death, and Respiration.',
    },
  },
  d: {
    name: 'Aldine',
    idea: 'Every work beside its first printing: the Greek Aristotle of Aldus Manutius, Venice 1495–98. The pages are shown as documents with their source; the site itself stays modern.',
    pages: {
      home: '<p>The first page of the <i>Categories</i>, 1495, beside the title. Each division opens with the first page of one of its works. On a phone each page gives way to a banner cut from its top: the woodcut headpiece and the title.</p>',
      work: '<p>The work’s first page as Aldus printed it, with its volume and year and a link to the whole volume. It scrolls with the text. On a phone, a banner cut from its top. Books close by default.</p>',
      reader: '<p>No picture. Chapter numbers in rubric red.</p>',
      search: '<p>Hits by chapter, the chapter number in red.</p>',
      lexicon: '<p>The headword in Gentium Book Plus; counts in one sentence.</p>',
    },
    type: 'EB Garamond for English; Gentium Book Plus for Greek, matched to Garamond’s x-height. Black and rubric red on warm white.',
    images: 'The opening pages of 36 works, from the Boston Public Library’s copy as digitised by the Internet Archive (Public Domain Mark), on the home page and the work pages only.',
    risk: 'Rubric red and Garamond could tip into costume; the pages are kept as pictures with captions, not as a frame for the site. The <i>Rhetoric</i> and <i>Poetics</i> have no Aldine page here.',
    tries: {
      home: 'Scroll the divisions; open a work to see its first page.',
      work: 'Compare the Physics, the History of Animals and the Politics.',
    },
  },
};
