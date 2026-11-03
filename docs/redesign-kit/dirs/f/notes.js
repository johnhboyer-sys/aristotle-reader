window.NOTES = window.NOTES || {};
window.NOTES.f = {
    name: 'Objects',
    idea: 'Each work is shown the way a museum shows one object: cut from its photograph, lit on a dark wall, with a label that says why it is there. The site reads as the catalogue of an exhibition about Aristotle, one plate per work.',
    pages: {
      home: '<p>The cover: Aristotle’s own portrait, the Altemps bust, larger than life and lit from above, his name in English and Greek beside it, with search on the wall. Below, every work as a checklist that names its object.</p>',
      work: '<p>A spread. On the left the plate: the object large on the wall, with the line it stands for set under it as wall text, so the pairing explains itself. On the right the entry: title, Greek title, what to read, and the full museum label. A work with no object shows its Greek title on the wall instead.</p>',
      reader: '<p>No picture. The wall becomes the head bar. Greek in GFS Didot, English in Source Serif, side by side at both widths, each with its own Bekker numbers in its margin. The word opens as a label: the word on the wall colour, the parse below.</p>',
      search: '<p>No picture. The query set large in the Greek face, the count, then the places by chapter.</p>',
      lexicon: '<p>No picture. The word set large, with a label beside it, as an object would have.</p>',
    },
    type: 'GFS Didot (the Greek Font Society’s revival of Didot’s Greek types) for titles and all Greek; Source Serif 4 for English; Fira Sans for labels. Near-white paper, a deep blue-black wall with a pool of light, one gilt accent.',
    images: '26 works have an object, 15 show their Greek title instead. Objects from The Met (public domain) and the Cleveland Museum of Art (CC0); the portrait is Jastrow’s photograph of the Altemps bust (public domain). Each is cut out once and serves both widths; the label on each work page credits it.',
    risk: 'GFS Didot’s Greek is a different style from EB Garamond’s, but it is still a book Greek, and John may not like it. Some works have no good object; their title panels are calmer than the object pages.',
    tries: {
      home: 'Scroll the checklist: each work names its object. Then open the Metaphysics.',
      work: 'Try the Metaphysics, De Anima, the Topics and the Politics; then On Dreams, which has no object. The Categories has a horse again, and its label now gives Aristotle’s own reason.',
      reader: 'Click a Greek word; switch Greek, Both and English; compare two translations; open the contents.',
      lexicon: 'Compare the phone: the word still leads.',
    },
};
