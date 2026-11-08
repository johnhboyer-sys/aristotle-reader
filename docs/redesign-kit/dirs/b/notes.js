window.NOTES = window.NOTES || {};
window.NOTES.b = {
    name: 'Poster',
    switches: [
      // John, 7 Nov: Oswald, "this is the one" / "remove others". One option: the bar draws no switch.
      { name: 'font', label: 'Title face', options: [{ id: 'oswald', label: 'Oswald' }] },
      { name: 'tpos', label: 'Title place', options: [{ id: 'set', label: 'As set' }, { id: 'over', label: 'Over the plate' }, { id: 'top', label: 'Top' }, { id: 'foot', label: 'Foot' }, { id: 'band', label: 'Above the plate' }, { id: 'side', label: 'Beside' }] },
      { name: 'tsize', label: 'Title size', options: [{ id: 'ts-set', label: 'As set' }, { id: '1', label: 'Full' }, { id: 'w', label: 'Whole words' }, { id: '0.8', label: 'Smaller' }] },
      // John, 8 Nov: phone home "beside"; then "keep bust same location on screen but have closer crop". One option: no switch.
      { name: 'hphone', label: 'Phone home', options: [{ id: 'p-side', label: 'Title beside' }] },
      { name: 'hw', label: 'Headword face', options: [{ id: 'gentium', label: 'Gentium' }, { id: 'didot', label: 'GFS Didot' }, { id: 'literata', label: 'Literata (as was)' }] }, // John, 8 Nov: "Smaller. Different font."
      { name: 'sub', label: 'Subheads', options: [{ id: 'label', label: 'Ruled label' }] }, // John, 7 Nov: "go with this."
      { name: 'lede', label: 'Home line', options: [{ id: 'plato', label: 'As in Plato' }, { id: 'none', label: 'None' }] }, // John, 8 Nov: "Remove" What you can do and What it is
      { name: 'dplate', label: 'Plates in dark mode', options: [{ id: 'paper', label: 'Paper rectangle' }, { id: 'outline', label: 'Paper outline' }] }, // John, 8 Nov: on paper; the outline idea tried, then 16:28 the rectangle everywhere, home included
    ],
    idea: 'The home page and each work page open on one poster: an old print, in black ink and whole at its own shape, with the title beside it in red capitals; on a phone the title stands above it. In the lexicon the headword is the poster; the reader opens plainly. Everything under the poster stays quiet.',
    pages: {
      home: '<p>Huot’s etching of a marble bust of Aristotle, the site’s title beside it. Below, the works by division, each division named in red.</p>',
      work: '<p>The work’s plate across the page, its title beside it. Under it, only the record: maker, title, date, technique, holder, licence. Below, the facts and the books, each book’s number large and red.</p>',
      reader: '<p>No plate and no poster. Book I opens on a plain head: the work’s name, then BOOK I in red capitals in the title face, then its Greek title and the editions. Chapter numbers in red; the text itself is plain.</p>',
      search: '<p>No plate. The count in red, then every work with hits down the left, as in H, beside the hits by chapter.</p>',
      lexicon: '<p>No plate. The headword in red, accents kept, in Gentium Book Plus, the Greek face of the live site and the Plato reader; at most 150px.</p>',
    },
    type: 'Titles in Oswald Bold, John’s pick. Sofia Sans SemiBold for labels and controls; Literata for reading; Gentium Book Plus for the lexicon’s headword. Black on near-white and one red; the plates in black ink.',
    images: 'Prints from 1500 to 1900, each chosen to show what the whole work is about, from museum and library collections; each is credited under its plate. Public domain or CC0 first; the home page’s bust is the British Museum’s, CC BY-NC-SA 4.0.',
    risk: 'A plate with fine lines can read grey at phone size, and in dark mode the paper behind a plate is a dimmed grey-beige. Some pairings of print and work are still a stretch.',
    tries: {
      home: 'Switch to dark mode: the plate keeps its dark ink on a dimmed paper; “Plates in dark mode” shows light lines instead.',
      work: 'Compare a long title with a short one on the phone: De Interpretatione, Physiognomonica, Topics. Switch “Title place” to set the title over, above or beside the plate.',
      reader: 'Click a Greek word; switch Greek, Both and English; open the translation menu and add a second one.',
      search: 'Scroll the hits: the list of works stays beside them. On a phone it is a row to swipe.',
      lexicon: 'Compare the phone: the headword sets itself to the width.',
    },
};
