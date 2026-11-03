window.NOTES = window.NOTES || {};
window.NOTES.h = {
  name: 'Plates',
  // Two sets of plates, same layout: prints of 1700–1900 (the default) and
  // the first set, mostly of the 1500s.
  switches: [
    { name: 'plates', label: 'Plates', options: [{ id: 'later', label: '1700–1900' }, { id: 'early', label: '1500s' }] },
    { name: 'font', label: 'Title face', options: [
      { id: 'didone', label: 'Noto Serif Display' }, { id: 'bodoni', label: 'Bodoni Moda' }, { id: 'garamond', label: 'EB Garamond' },
      { id: 'instrument', label: 'Instrument Serif' }, { id: 'piazzolla', label: 'Piazzolla' }, { id: 'r7', label: 'Archivo (as before)' },
    ] },
  ],
  idea: 'Each work gets one plate: an old print of a thing the work itself names, cut hard, scaled up and printed in one blue ink. Each picture comes with the line of Aristotle it shows, and the type never sits on a picture. One switch offers two sets: prints of 1700–1900, and the first set, mostly of the 1500s. The other offers six title faces.',
  pages: {
    home: '<p>One plate: Aristotle, printed large in the ink. In the later set he is Samuele Jesi’s engraving after the ancient bust, of the early 1800s; in the early set, René Boyvin’s engraving of 1566. Beside him the site’s name, the search and the way back to your place. Below, every work by division, each division under a large numeral in the same ink. No other picture.</p>',
    work: '<p>The plate fills most of the first screen: a wide cut on a desktop, a shorter one on a phone, set on the side that lets a figure face the title. Under it, the line of Aristotle it shows, then the print’s maker, date and holder. In the later set every work has a plate. In the early set a work with no picture gets its Greek title as its plate, in the same ink. Then the facts, the translations once, the books (closed) and every chapter.</p>',
    reader: '<p>No picture. The ink marks only what you look for: chapter numbers, the Bekker column at the start of a page, the open word. Greek and English side by side on the phone too, each with its own Bekker numbers.</p>',
    search: '<p>No picture. The count in the ink, the works with hits down the side, each hit in Greek with Ross’s English under it.</p>',
    lexicon: '<p>No picture. The headword is set as a plate: GFS Didot, in the ink, as wide as the column.</p>',
  },
  type: 'Titles, headings and large numerals in Noto Serif Display, a Didone, narrowed and heavy: the kind of type most of the later plates’ books were printed in. The switch offers five others: Bodoni Moda, EB Garamond, Instrument Serif, Piazzolla set heavy, and Archivo as round seven had it. Archivo stays for labels and controls; Piazzolla for reading, Greek and English alike; GFS Didot, cut from the Didots’ Greek types, for Greek set large. In the site’s name the two words are set at one size and one width. Black type on a cool white, one ultramarine ink for the plates and the marks. In dark mode the ink turns light and line prints print light on dark; night scenes and dark grounds keep their night.',
  images: 'Two sets, all public domain or CC0, each credited under its plate. The cleaned paper drops out and the lines print in the one ink, from one file in both themes. The later set, shown first: all 41 works and the home page, prints of about 1700 to 1870, most of them plates from encyclopedias, natural histories, star books and catalogues of antiquities. Eighteen come from the Wellcome Collection, ten from The Metropolitan Museum of Art, eleven from book scans at the Internet Archive (Guillemin’s The Heavens, Roux’s Herculanum et Pompéi, the Real Museo Borbonico, Combe’s coins, Raspe’s gems, Le Roy’s Greek ruins), and one each from the Rijksmuseum, the Cleveland Museum of Art and the Library of Congress. The early set: 24 works and the home page, mostly prints of the 1500s, from the Met, the Rijksmuseum, the Internet Archive, Wikimedia Commons, the Zentralbibliothek Zürich and the Library of Congress.',
  risk: 'A picture that needs its caption. Most later plates show a thing the line names: a horse, a sea-fight, a mule, a crab, a seal, a steelyard, a lantern, Atlas, a foot-rule. A few ask more of the reader: a comb of young bees for the Generation of Animals, Neptune’s chariot for Gorgias, Apollo’s lyre for On Things Heard.',
  tries: {
    home: 'Switch sets with the dashed switch, or press v; press f to step through the title faces. Then switch to dark: the bust keeps its shading.',
    work: 'Try Categories, Sophistical Refutations, Mechanica, De Mundo and Poetics in both sets, then the Movement of Animals and On Indivisible Lines: Atlas and a Roman foot-rule in the later set, Greek titles in the early one.',
    reader: 'Click a Greek word; switch Greek, Both and English; open the contents, the translation menu and Aa.',
    lexicon: 'Compare the phone: the headword sets itself to the width.',
  },
};
