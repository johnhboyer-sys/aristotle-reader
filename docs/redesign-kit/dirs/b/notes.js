window.NOTES = window.NOTES || {};
window.NOTES.b = {
    name: 'Poster',
    switches: [
      { name: 'photo', label: 'Photographs', options: [{ id: 'bw', label: 'Black and white' }, { id: 'printed', label: 'As printed' }] },
      { name: 'font', label: 'Title face', options: [
        { id: 'oswald', label: 'Oswald' }, { id: 'xc', label: 'Sofia Extra Condensed' }, { id: 'anton', label: 'Anton' },
        { id: 'bebas', label: 'Bebas Neue' }, { id: 'shoulders', label: 'Big Shoulders' }, { id: 'r5', label: 'Round five' },
      ] },
      { name: 'logic', label: 'Logic works', options: [{ id: 'chalk', label: 'Chalkboards' }, { id: 'getty', label: 'As before' }] },
    ],
    idea: 'The home page and each work page open on one poster: a black-and-white photograph with the title over it in red capitals. In the lexicon the headword is the poster; the reader opens plainly. Everything under the poster stays quiet.',
    pages: {
      home: '<p>One photograph with the site’s title over it; the site would show a different one at each visit, and “Next photograph” steps through eight here. Below, the works by division, each division named in red.</p>',
      work: '<p>The work’s photograph across the page with its title over it: a wide cut on a desktop, a tall cut on a phone. The caption ties it to the text. Below, the facts and the books, each book’s number large and red.</p>',
      reader: '<p>No photograph and no poster. Book I opens on a plain head: the work’s name, then BOOK I in red capitals in the title face, then its Greek title and the editions. Chapter numbers in red; the text itself is plain.</p>',
      search: '<p>No photograph. The count in red, then every work with hits down the left, as in H, beside the hits by chapter.</p>',
      lexicon: '<p>No photograph. The headword in red, as large as the column allows, accents kept.</p>',
    },
    type: 'Titles in Oswald Bold, John’s pick, now the default; the switch keeps Sofia Sans Extra Condensed ExtraBold, Anton, Bebas Neue, Big Shoulders Black and round five’s Sofia Sans SemiBold to compare. Sofia Sans SemiBold for labels and controls; Literata for reading and for the lexicon’s headword. Black on near-white and one red; the photographs in black and white.',
    images: 'Forty-one photographs from the J. Paul Getty Museum’s Open Content program (CC0), from the 1840s to the 1920s, each cut twice, wide and tall. Three logic works now open on a blackboard instead (John: “photographs of logic being done on a chalkboard”): the <i>Prior Analytics</i> on Hippocrates’ lunes and the <i>De Interpretatione</i> on Greek past tenses, both chalked at the Stedelijk Gymnasium in Utrecht (Het Utrechts Archief, Public Domain Mark), and the <i>Topics</i> on a homework board of about 1900 (Getty, CC0). The “Logic works” switch brings back their Getty photographs. All are shown in black and white except Lumière’s autochrome for <i>De Coloribus</i>.',
    risk: 'Where a title crosses a mid-gray, the red stands out by colour, not by lightness, so a reader who cannot tell red from gray may lose part of it. Some pairings of photograph and work are still a stretch.',
    tries: {
      home: 'Press “Next photograph”, then switch the bar to “As printed”.',
      work: 'Open the Prior Analytics, De Interpretatione and Topics: each opens on a blackboard; switch “Logic works” to see the photographs they replace. Compare a long title with a short one on the phone: De Interpretatione, Physiognomonica, Topics.',
      reader: 'Click a Greek word; switch Greek, Both and English; open the translation menu and add a second one.',
      search: 'Scroll the hits: the list of works stays beside them. On a phone it is a row to swipe.',
      lexicon: 'Compare the phone: the headword sets itself to the width.',
    },
};
