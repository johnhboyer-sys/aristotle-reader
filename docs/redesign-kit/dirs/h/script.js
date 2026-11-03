/* Direction H · Plates. Each work gets one plate: a woodcut, engraving or
   etching from the books and prints that grew up around its subject, cut
   hard, scaled up and printed in one ink beside modern type. The type never
   sits on the picture. The reader, search and lexicon carry no pictures;
   there the same ink marks what matters. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const H = (window.T.h = {});
  H.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.5"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.5"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.5"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    arrow: '<svg viewBox="0 0 16 10" width="16" height="10" aria-hidden="true"><path d="M1 5h13M10 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  };
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const divName = (d) => (d ? (d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title) : 'Commentary');
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="h-tag">${esc(w.authenticity)}</span>` : '');

  // ── The plates ───────────────────────────────────────────────────────────
  // q: the line of Aristotle the picture shows; c: where it is; t: the
  // translation quoted. who/what/when/how/where: the print and its holder.
  // side: 'l' puts the plate on the left, so a figure faces the title.
  // pos: a tonal print (night sky, eclipse, aquatint) keeps its darks and
  // lights in dark mode instead of printing light on dark.
  const MET = 'The Metropolitan Museum of Art, New York';
  const RIJKS = 'Rijksmuseum, Amsterdam';
  const COMMONS = 'Wikimedia Commons';
  const IA = (lib) => `${lib}, via the Internet Archive`;
  const PL = {
    home: { side: 'r', alt: 'Engraved profile of Aristotle: a long beard, a soft cap, a heavy cloak', note: 'Aristotle of Stagira, as a French engraver pictured him in 1566.', who: 'René Boyvin', what: 'Illustrium philosophorum et poetarum effigies', when: '1566', how: 'Engraving', where: RIJKS, lic: 'CC0' },
    // Logic
    Cat: { side: 'r', alt: 'A great horse seen from behind, its head turned; a soldier in a plumed helmet stands at its side', q: 'Substance, in the truest and primary and most definite sense of the word, is that which is neither predicable of a subject nor present in a subject; for instance, the individual man or horse.', c: 'Categories 5, 2a11', t: 'Edghill', who: 'Albrecht Dürer', what: 'The Large Horse', when: '1505', how: 'Engraving', where: MET, lic: 'CC0' },
    Int: { side: 'r', alt: 'Warships under full sail fire on one another through clouds of smoke', q: 'A sea-fight must either take place to-morrow or not, but it is not necessary that it should take place to-morrow, neither is it necessary that it should not take place.', c: 'De Interpretatione 9, 19a30', t: 'Edghill', who: 'Reinier Nooms, called Zeeman', what: 'Naval Battle', when: '17th century', how: 'Etching', where: MET, lic: 'CC0' },
    APr: { side: 'r', pre: true, alt: 'Logic as a woman with a sword marked Syllogismus; her hounds Truth and Falsehood run below', note: 'Logic carries the syllogism as her sword; her hounds, Truth and Falsehood, chase the hare of the problem.', q: 'A syllogism is discourse in which, certain things being stated, something other than what is stated follows of necessity from their being so.', c: 'Prior Analytics I.1, 24b18', t: 'Jenkinson', who: 'Gregor Reisch', what: 'Margarita philosophica', when: 'Freiburg, 1503', how: 'Woodcut', where: COMMONS, lic: 'public domain' },
    APo: { side: 'r', pos: true, alt: 'The sun in total eclipse: a black disc ringed by a bright corona', q: 'What is an eclipse? a privation of light from the moon through the interposition of the earth.', c: 'Posterior Analytics II.2, 90a16', t: 'Owen', note: 'Aristotle’s stock case of a fact and its cause. The plate shows the sun’s eclipse of 18 July 1860.', who: 'Amédée Guillemin', what: 'The Heavens', when: 'London, 1867, plate XII', how: 'Print', where: IA('University of California Libraries'), lic: 'public domain' },
    Top: { side: 'r', alt: 'Two fencers, a young man and a bearded older one, cross swords', q: 'You should display your training in inductive reasoning against a young man, in deductive against an expert.', c: 'Topics VIII.14, 164a12', t: 'Pickard-Cambridge', who: 'Dirck Volckertsz Coornhert, after Maarten van Heemskerck', what: 'Two Fencers, from Fencers, plate 5', when: '1552', how: 'Etching and engraving', where: MET, lic: 'CC0' },
    SE: { side: 'r', pre: true, note: 'A quack at a fair: the look of a skill, sold for money.', alt: 'A travelling quack pulls a tooth from a wincing man while a woman leans in behind them', q: 'The art of the sophist is the semblance of wisdom without the reality, and the sophist is one who makes money from an apparent but unreal wisdom.', c: 'Sophistical Refutations 1, 165a21', t: 'Pickard-Cambridge', who: 'Lucas van Leyden', what: 'The Dentist', when: '1523', how: 'Engraving', where: MET, lic: 'CC0' },
    // Nature
    Phys: { side: 'l', alt: 'Winged Time, an old man beside an hourglass, measures a globe with a pair of compasses', q: 'For time is just this, number of motion in respect of “before” and “after”.', c: 'Physics IV.11, 219b1', t: 'Hardie and Gaye', who: 'Enea Vico', what: 'Time', when: 'about 1545', how: 'Engraving', where: MET, lic: 'CC0' },
    Cael: { side: 'r', alt: 'A traveller on his knees pushes his head through the starry sphere of the sky to see what lies beyond it', q: 'The shape of the heaven is of necessity spherical; for that is the shape most appropriate to its substance and also by nature primary.', c: 'On the Heavens II.4, 286b10', t: 'Stocks', who: 'Anonymous', what: 'L’atmosphère: météorologie populaire, by Camille Flammarion', when: 'Paris, 1888', how: 'Wood engraving', where: COMMONS, lic: 'public domain' },
    Mete: { side: 'r', pos: true, alt: 'A great comet sweeps across the night sky over Prague while townspeople with lanterns stop to stare', q: 'Such is a comet: like a shooting-star that contains its beginning and end in itself.', c: 'Meteorology I.7, 344a34', t: 'Webster', who: 'Jiří Daczický', what: 'Von einem schrecklichen und wunderbarlichen Cometen', when: 'Prague, 1577', how: 'Woodcut', where: 'Zentralbibliothek Zürich', lic: 'public domain' },
    DA: { side: 'r', pre: true, alt: 'A swallowtail butterfly seen from above, its striped wings spread', note: 'Ψυχή, the soul of this book’s Greek title, is also the Greek word for a butterfly.', q: 'The so-called psyche or butterfly is generated from caterpillars which grow on green leaves.', c: 'History of Animals V.19, 551a14', t: 'Thompson', who: 'Wenceslaus Hollar', what: 'Three Butterflies and a Wasp', when: '1646', how: 'Etching', where: MET, lic: 'CC0' },
    Somn: { side: 'r', alt: 'A spaniel asleep on its side, its nose on its paws', q: 'That, therefore, all animals sleep may be gathered from these considerations.', c: 'On Sleep 1, 454b24', t: 'Beare', who: 'Pieter Gerardus van Os', what: 'Sleeping Dog', when: '1821', how: 'Etching', where: MET, lic: 'CC0' },
    Insomn: { side: 'r', pos: true, alt: 'A man asleep at a desk, his head in his arms, while owls and bats crowd the dark behind him', q: 'Some very young persons, if it is dark, though looking with wide open eyes, see multitudes of phantom figures moving before them, so that they often cover up their heads in terror.', c: 'On Dreams 3, 462a12', t: 'Beare', who: 'Francisco de Goya', what: 'The sleep of reason produces monsters, Los Caprichos 43', when: '1799', how: 'Etching and aquatint', where: MET, lic: 'CC0' },
    DivSomn: { side: 'r', pre: true, note: 'A devil blows a dream into a sleeping scholar’s ear with a pair of bellows.', alt: 'A scholar asleep against his pillows by a stove, while a small devil works a pair of bellows at his ear', q: 'Forasmuch as certain of the lower animals also dream, it may be concluded that dreams are not sent by God, nor are they designed for this purpose.', c: 'On Divination in Sleep 2, 463b12', t: 'Beare', who: 'Albrecht Dürer', what: 'The Dream of the Doctor', when: 'about 1498', how: 'Engraving', where: MET, lic: 'CC0' },
    Long: { side: 'r', alt: 'An elephant in profile, a castle on its back', q: 'The longest-lived animals fall among sanguineous animals which have feet, e.g. man and elephant.', c: 'On Length and Shortness of Life 4, 466a13', t: 'Ross', who: 'Martin Schongauer', what: 'The Elephant', when: 'about 1485', how: 'Engraving', where: MET, lic: 'CC0' },
    // Animals
    HA: { side: 'r', alt: 'An octopus seen from above, its eight arms curling out', q: 'It seeks its prey by so changing its colour as to render it like the colour of the stones adjacent to it; it does so also when alarmed.', c: 'History of Animals IX.37, 622a9', t: 'Thompson', who: 'Guillaume Rondelet', what: 'Libri de piscibus marinis', when: 'Lyon, 1554', how: 'Woodcut', where: IA('Smithsonian Libraries'), lic: 'public domain' },
    PA: { side: 'r', pre: true, note: 'Belon set a man’s bones beside a bird’s and lettered the matching parts alike.', alt: 'A human skeleton and a bird’s skeleton side by side, their matching bones lettered alike', q: 'In birds the arms or forelegs are replaced by a pair of wings, and this is their distinctive character.', c: 'Parts of Animals IV.12, 693b10', t: 'Ogle', who: 'Pierre Belon', what: 'L’histoire de la nature des oyseaux', when: 'Paris, 1555', how: 'Woodcut', where: COMMONS, lic: 'public domain' },
    // Metaphysics, ethics
    Meta: { side: 'l', alt: 'A single human eye, etched large, with its brow and lashes', q: 'All men by nature desire to know. An indication of this is the delight we take in our senses; … and above all others the sense of sight.', c: 'Metaphysics I.1, 980a21', t: 'Ross', who: 'Wenceslaus Hollar', what: 'Two Eyes and Two Heads', when: '1644–52', how: 'Etching', where: MET, lic: 'CC0' },
    EN: { side: 'l', alt: 'A swallow perched in profile, its long tail crossed', q: 'One swallow does not make a spring, nor does one sunny day; similarly, one day or a short time does not make a man blessed and happy.', c: 'Nicomachean Ethics I.7, 1098a18', t: 'Ostwald', who: 'Conrad Gessner', what: 'Historiae animalium, book III, on birds', when: 'Zurich, 1555', how: 'Woodcut', where: IA('BIU Santé, Paris'), lic: 'public domain' },
    Pol: { side: 'r', alt: 'Straw beehives in a row under a wooden shelter, bees flying in and out among the flowers', q: 'Now, that man is more of a political animal than bees or any other gregarious animals is evident.', c: 'Politics I.2, 1253a7', t: 'Jowett', cr: 'An unidentified early woodcut, photographed for a lantern slide about 1915–25, probably by Frances Benjamin Johnston. Library of Congress (no known restrictions).' },
    Rhet: { side: 'l', alt: 'Saint Paul, arms raised, speaks to a crowd of Athenians gathered before a round temple', q: 'Rhetoric may be defined as the faculty of observing in any given case the available means of persuasion.', c: 'Rhetoric I.2, 1355b26', t: 'Roberts', who: 'Marcantonio Raimondi, after Raphael', what: 'Saint Paul preaching in Athens', when: 'about 1517–20', how: 'Engraving', where: MET, lic: 'CC0' },
    Poet: { side: 'r', alt: 'Two terracotta theatre masks with gaping mouths and staring eyes', q: 'Tragedy, then, is an imitation of an action that is serious, complete, and of a certain magnitude; … through pity and fear effecting the proper purgation of these emotions.', c: 'Poetics 6, 1449b24', t: 'Butcher', who: 'Francesco Ficoroni', what: 'De larvis scenicis et figuris comicis antiquorum Romanorum', when: 'Rome, 1754', how: 'Engraving', where: IA('Getty Research Institute'), lic: 'public domain' },
    // Doubted works
    VV: { side: 'r', alt: 'Temperance, a clock on her head and a bridle in her mouth, stands among people measuring, reading and making music', q: 'Temperance is a virtue of the appetitive part, by which men cease to desire bad sensual pleasures.', c: 'De Virtutibus et Vitiis 1250a8', t: 'Solomon', who: 'Philips Galle, after Pieter Bruegel the Elder', what: 'Temperance, from The Virtues', when: 'about 1559–60', how: 'Engraving', where: MET, lic: 'CC0' },
    Vent: { side: 'r', pre: true, alt: 'Notus, the south wind: a winged young man in flight who pours rain from a great jar', q: 'Notus (the South Wind) bears the same name everywhere.', c: 'Ventorum Situs 973b8', t: 'Forster', note: 'One of the eight winds carved, each with its name, on the Tower of the Winds in Athens.', who: 'James Stuart and Nicholas Revett, engraved by James Basire', what: 'The Antiquities of Athens, volume I', when: 'London, 1762', how: 'Engraving', where: COMMONS, lic: 'public domain' },
    Phgn: { side: 'r', alt: 'A broad-faced man and an ox, drawn head to head', q: 'A small face marks a small soul, in the cat and the ape: a large face means lethargy, in asses and cattle.', c: 'Physiognomonica 6, 811b8', t: 'Loveday and Forster', who: 'Giambattista della Porta', what: 'De humana physiognomonia', when: 'Vico Equense, 1586', how: 'Engraving', where: MET, lic: 'CC0' },
  };
  // ── The later plates (the default variant) ──────────────────────────────
  // Prints of about 1700–1900: the plates of encyclopedias, natural
  // histories, star books and catalogues of antiquities, with a few fine-art
  // etchings and lithographs of the same years. Each shows a thing the work
  // itself names; every work has one.
  const WEL = 'Wellcome Collection, London';
  const CMA = 'Cleveland Museum of Art';
  const LOC = 'Library of Congress, Washington';
  const ROUX = 'H. Roux the elder';
  const PL_LATER = {
    home: { side: 'r', pos: true, alt: 'Engraved head of Aristotle after an ancient bust: short curled hair, a lined face, a cloak over one shoulder', note: 'Aristotle after an ancient bust, in an engraving of the early 1800s.', who: 'Samuele Jesi', what: 'Aristotle, after the ancient bust', when: 'early 19th century', how: 'Line engraving', where: WEL, lic: 'public domain' },
    // Logic
    Cat: { side: 'r', alt: 'A dappled horse steps forward, one foreleg raised, alone on a patch of ground', q: 'Substance, in the truest and primary and most definite sense of the word, is that which is neither predicable of a subject nor present in a subject; for instance, the individual man or horse.', c: 'Categories 5, 2a11', t: 'Edghill', who: 'Théodore Géricault', what: 'Dappled Horse', when: '1823', how: 'Lithograph', where: MET, lic: 'CC0' },
    Int: { side: 'r', alt: 'Two warships under full sail fire broadsides at close range through clouds of smoke', q: 'A sea-fight must either take place to-morrow or not, but it is not necessary that it should take place to-morrow, neither is it necessary that it should not take place.', c: 'De Interpretatione 9, 19a30', t: 'Edghill', who: 'Balthasar Friedrich Leizelt, after Richard Paton', what: 'Combat mémorable entre le Pearson et Paul Jones', when: 'Augsburg, 1779', how: 'Etching', where: LOC, lic: 'public domain' },
    Isa: { side: 'l', alt: 'A hooded crow stands on a tussock, its grey back and black wings sharply drawn', q: 'To sleep is a separable accident, but to be black happens inseparably to a crow … we may possibly indeed conceive a white crow.', c: 'Porphyry, Isagoge 5, 12a26', t: 'Owen', who: 'Anonymous English engraver', what: 'Kentish Crow', when: 'undated, early 19th century', how: 'Engraving, coloured by hand', where: WEL, lic: 'public domain' },
    APr: { side: 'l', alt: 'A shaggy mule stands in profile, its long ears up', q: '… knowing that every mule is sterile and that this is a mule, and thinking that this animal is with foal.', c: 'Prior Analytics II.21, 67a35', t: 'Jenkinson', note: 'Aristotle’s case of a man who knows both premisses yet fails to join them.', who: 'Robert Hills', what: 'A Mule', when: 'London, 1810', how: 'Etching', where: WEL, lic: 'public domain' },
    APo: { side: 'r', pos: true, alt: 'The moon in eclipse: a dark disc with a thin lit edge, against a black sky', q: 'What is an eclipse? a privation of light from the moon through the interposition of the earth.', c: 'Posterior Analytics II.2, 90a16', t: 'Owen', who: 'Amédée Guillemin, drawn by P. Lackerbauer', what: 'The Heavens, plate IV: total and partial eclipses of the moon', when: 'London, 1867', how: 'Colour print', where: IA('University of California Libraries'), lic: 'public domain' },
    Top: { side: 'r', alt: 'Two fencers in knee breeches lunge at each other, one blade turning the other aside', q: 'You should display your training in inductive reasoning against a young man, in deductive against an expert.', c: 'Topics VIII.14, 164a12', t: 'Pickard-Cambridge', who: 'Hall, after James Gwyn', what: 'The School of Fencing, by Domenico Angelo, plate 23', when: 'London, 1763', how: 'Engraving', where: WEL, lic: 'public domain' },
    SE: { side: 'r', alt: 'Both faces of a Greek silver coin: a woman’s head ringed by dolphins, and a four-horse chariot crowned by a flying Victory', q: 'Some things are really silver and others gold, while others are not and merely seem to be such to our sense; e.g. things made of litharge and tin seem to be of silver.', c: 'Sophistical Refutations 1, 164b24', t: 'Pickard-Cambridge', note: 'A silver coin of Syracuse, both faces.', who: 'Charles Combe', what: 'Nummorum veterum populorum et urbium qui in Museo Gulielmi Hunter asservantur, coins of Syracuse', when: 'London, 1782', how: 'Engraving', where: IA('Getty Research Institute'), lic: 'public domain' },
    // Nature
    Phys: { side: 'r', alt: 'A large spider at the centre of its web, smaller spiders and two flies caught round it', q: 'If then it is both by nature and for an end that the swallow makes its nest and the spider its web … it is plain that this kind of cause is operative in things which come to be and are by nature.', c: 'Physics II.8, 199a26', t: 'Hardie and Gaye', who: 'J. Pass, after Johann Eberhard Ihle', what: 'Aranea: the Fasciata, or Barbary Spider', when: 'London, 1796', how: 'Etching', where: WEL, lic: 'public domain' },
    Cael: { side: 'r', pos: true, alt: 'The full moon, large, its craters and rays drawn in fine dots', q: 'For how else should the moon as it waxes and wanes show for the most part a crescent-shaped or gibbous figure, and only at one moment a half-moon?', c: 'On the Heavens II.11, 291b20', t: 'Stocks', note: 'Aristotle’s proof that the moon is a sphere.', who: 'E. Salle', what: 'The Full Moon, plate VIII of The Heavens, by Amédée Guillemin', when: 'London, 1867', how: 'Engraving', where: IA('University of California Libraries'), lic: 'public domain' },
    GC: { side: 'r', pos: true, alt: 'Rain and lightning beat down on a coach and riders struggling through a mountain pass', q: 'It must rain if there is to be a cloud and, conversely, there must be a cloud if it is to rain.', c: 'On Generation and Corruption II.11, 338b6', t: 'Joachim', who: 'Henry Chawner Shenton, after Luke Clennell', what: 'A Thunderstorm', when: 'early 19th century', how: 'Engraving', where: WEL, lic: 'public domain' },
    Mete: { side: 'l', pos: true, alt: 'A great comet streams across a starry sky above dark fields and a river', q: 'Such is a comet: like a shooting-star that contains its beginning and end in itself.', c: 'Meteorology I.7, 344a34', t: 'Webster', who: 'Anonymous', what: 'Grand Meteoric Phenomenon: the Comet', when: 'London, 1860', how: 'Wood engraving', where: WEL, lic: 'public domain' },
    DA: { side: 'r', alt: 'A human hand with the skin removed, its tendons running down each finger', q: 'The soul is analogous to the hand; for as the hand is a tool of tools, so the mind is the form of forms and sense the form of sensible things.', c: 'De Anima III.8, 432a1', t: 'Smith', who: 'Nicolas-Henri Jacob', what: 'The hand, from Bourgery and Jacob, Traité complet de l’anatomie de l’homme', when: 'Paris, 1831–54', how: 'Lithograph', where: WEL, lic: 'public domain' },
    Sens: { side: 'r', pre: true, alt: 'An ancient bronze lantern, shown from the front and the side, hanging from its chains', note: 'Aristotle quotes Empedocles, who likened the eye to a lantern. This one was found at Herculaneum in 1760.', q: 'As when one who purposes going abroad prepares a lantern, a gleam of fire blazing through the stormy night …', c: 'Sense and Sensibilia 2, 437b26', t: 'Beare', who: ROUX, what: 'Herculanum et Pompéi, volume VII, bronzes, plate 62', when: 'Paris, 1840 (printed 1861)', how: 'Engraving', where: IA('Getty Research Institute'), lic: 'public domain' },
    Mem: { side: 'r', alt: 'The wax impression of an engraved gem: a young ruler’s head in profile, with a headband and a cloak of scales', q: 'The process of movement involved the act of perception stamps in, as it were, a sort of impression of the percept, just as persons do who make an impression with a seal.', c: 'On Memory 1, 450a31', t: 'Beare', who: 'Rudolf Erich Raspe', what: 'A Descriptive Catalogue of Ancient and Modern Engraved Gems, cast by James Tassie, plate LV', when: 'London, 1791', how: 'Engraving', where: IA('Boston Public Library'), lic: 'public domain' },
    Somn: { side: 'r', alt: 'A child asleep, its head of curls turned on the pillow, eyes closed', q: 'Extreme youth also has this effect; infants, for example, sleep a great deal.', c: 'On Sleep 3, 457a4', t: 'Beare', who: 'Dominique Vivant Denon', what: 'Head of a Sleeping Child', when: 'about 1765–1825', how: 'Etching', where: MET, lic: 'CC0' },
    Insomn: { side: 'r', pos: true, alt: 'A woman asleep across a bed, her head hanging down; a goblin squats on her and a horse’s head looks in through the curtain', q: 'The dream is a sort of presentation, and, more particularly, one which occurs in sleep.', c: 'On Dreams 3, 462a16', t: 'Beare', who: 'Martin Johann Schmidt, after Henry Fuseli', what: 'The Night Mare', when: 'after 1781', how: 'Stipple engraving', where: WEL, lic: 'public domain' },
    DivSomn: { side: 'r', alt: 'A long-eared dog asleep on a cushion, its nose on its paws', q: 'Forasmuch as certain of the lower animals also dream, it may be concluded that dreams are not sent by God, nor are they designed for this purpose.', c: 'On Divination in Sleep 2, 463b12', t: 'Beare', who: 'Cornelis Ploos van Amstel', what: 'Sleeping Dog', when: '1777', how: 'Etching', where: MET, lic: 'CC0' },
    Long: { side: 'l', alt: 'A young elephant walks to the right, its trunk swinging low', q: 'The longest-lived animals fall among sanguineous animals which have feet, e.g. man and elephant.', c: 'On Length and Shortness of Life 4, 466a13', t: 'Ross', who: 'Johann Heinrich Tischbein the Younger', what: 'A Young Elephant, drawn from life', when: 'late 18th century', how: 'Etching and aquatint', where: MET, lic: 'CC0' },
    Juv: { side: 'l', alt: 'A whale in profile, its blowhole on top of its head', q: 'Examples of such animals are dolphins and whales, and all others that have a blowhole. They have no feet, yet possess a lung though admitting the sea-water.', c: 'On Youth, Old Age, Life and Death, and Respiration 18, 476b13', t: 'Ross', who: 'Frederick Polydore Nodder', what: 'A Whale', when: 'London, 1793', how: 'Engraving', where: WEL, lic: 'public domain' },
    // Animals
    HA: { side: 'l', alt: 'A chameleon climbs along a branch, its tail curled round the stem, above a wide landscape', q: 'The change in its colour takes place when it is inflated with air; it is then black, not unlike the crocodile, or green like the lizard but black-spotted like the pard.', c: 'History of Animals II.11, 503b2', t: 'Thompson', who: 'Anonymous English engraver', what: 'Cameleon', when: 'undated, about 1800', how: 'Etching', where: WEL, lic: 'public domain' },
    PA: { side: 'r', alt: 'Two elephants under palm trees, their trunks curled round each other', q: 'For the elephant uses its nostril as a hand; this being the instrument with which it conveys food, fluid and solid alike, to its mouth.', c: 'Parts of Animals II.16, 658b35', t: 'Ogle', who: 'Jean-Pierre Houël', what: 'Histoire naturelle des deux éléphans du Muséum, plate XV', when: 'Paris, 1803', how: 'Etching and engraving', where: MET, lic: 'CC0' },
    IA: { side: 'r', alt: 'A crab seen from above, its long legs spread and its claws held in front', q: 'Even crabs move in this way … it is the only animal that moves not forwards, but obliquely.', c: 'Progression of Animals 14, 712b13', t: 'Farquharson', who: 'Anonymous English engraver', what: 'Red Mottled Crab', when: 'undated, about 1800', how: 'Etching and engraving', where: WEL, lic: 'public domain' },
    MA: { side: 'r', alt: 'Atlas, bent under the weight, carries the great sphere of the heavens on his shoulders; figures of the constellations are drawn on it', q: 'And the mythologists with their fable of Atlas setting his feet upon the earth appear to have based the fable upon intelligent grounds. They make Atlas a kind of diameter twirling the heavens about the poles.', c: 'Movement of Animals 3, 699a27', t: 'Farquharson', note: 'Aristotle’s point: a thing that moves must push against something outside it that does not move.', who: 'Pieter Schenk, after G. van Houten', what: 'Title print for Louis Renard, Atlas van zeevaert en koophandel door de geheele weereldt', when: 'Amsterdam, about 1725–45', how: 'Engraving', where: RIJKS, lic: 'public domain' },
    GA: { side: 'r', pre: true, alt: 'A piece of honeycomb, its six-sided cells holding the young bees', note: 'Aristotle on how bees are born, and on how to judge the question.', q: 'Credit must be given rather to observation than to theories, and to theories only if what they affirm agrees with the observed facts.', c: 'Generation of Animals III.10, 760b31', t: 'Platt', who: 'H. Summons', what: 'Bee', when: 'London, Richards and Co., early 19th century', how: 'Engraving', where: WEL, lic: 'public domain' },
    // Metaphysics, ethics
    Meta: { side: 'r', alt: 'A single human eye, engraved large, with its lashes and brow', q: 'All men by nature desire to know. An indication of this is the delight we take in our senses; … and above all others the sense of sight.', c: 'Metaphysics I.1, 980a21', t: 'Ross', who: 'Thomas Milton', what: 'Anatomy: the eye, plate I', when: 'London, 1809', how: 'Engraving', where: WEL, lic: 'public domain' },
    EN: { side: 'l', alt: 'A swallow perched on a post above a town, two more flying overhead', q: 'One swallow does not make a spring, nor does one sunny day; similarly, one day or a short time does not make a man blessed and happy.', c: 'Nicomachean Ethics I.7, 1098a18', t: 'Ostwald', who: 'Josiah Wood Whymper', what: 'The Swallow', when: 'London, mid-19th century', how: 'Wood engraving, coloured by hand', where: WEL, lic: 'public domain' },
    EE: { side: 'r', pos: true, alt: 'The Milky Way rising over a dark shore and a calm bay, a palm tree at one side', q: 'Anaxagoras answered a man who was raising problems of this sort and asking why one should choose rather to be born than not—‘for the sake of viewing the heavens and the whole order of the universe’.', c: 'Eudemian Ethics I.5, 1216a11', t: 'Solomon', who: 'Amédée Guillemin and Clerget', what: 'The Southern Heavens, plate XI of The Heavens', when: 'London, 1867', how: 'Colour print', where: IA('University of California Libraries'), lic: 'public domain' },
    Pol: { side: 'r', alt: 'Three beehives: a box hive with drawers, a straw hive under a glass dome, a pair of wooden boxes', q: 'Now, that man is more of a political animal than bees or any other gregarious animals is evident.', c: 'Politics I.2, 1253a7', t: 'Jowett', who: 'Anonymous', what: 'Bee Hives', when: 'London, Richards and Co., early 19th century', how: 'Engraving', where: WEL, lic: 'public domain' },
    // Doubted works
    Oec: { side: 'l', alt: 'An old farmhouse with an outside stair; a woman sits by the door with a child, hens at her feet', q: 'So, according to Hesiod, it would be necessary that there should be First and foremost a house, then a wife …', c: 'Oeconomica I.2, 1343a20', t: 'Forster', who: 'Charles Jacque', what: 'In Front of the House', when: '1845', how: 'Etching', where: MET, lic: 'CC0' },
    VV: { side: 'r', alt: 'A peacock perched on a branch in a forest, its long tail hanging down; a second bird beside it', q: 'The liberal man is also clean in his dress and house, … inclined to keep all animals that have anything peculiar or marvellous about them.', c: 'De Virtutibus et Vitiis 5, 1250b25', t: 'Solomon', who: 'Karl Bodmer', what: 'Peacocks on a Branch', when: 'about 1860', how: 'Etching', where: MET, lic: 'CC0' },
    DM: { side: 'r', pos: true, alt: 'A volcano erupting at night: a column of fire and black smoke above the cone, the moon low over the sea', q: 'Many have vents and spiracles, as Lipara, Etna, and the volcanoes of the Aeolian islands. Some of them frequently flow like rivers and cast up red-hot lumps.', c: 'De Mundo 4, 395b21', t: 'Forster', who: 'Thomas Sutherland, after Romagni', what: 'Eruption of Mount Aetna in 1669', when: 'London, 1809', how: 'Aquatint with engraving', where: CMA, lic: 'CC0' },
    Mech: { side: 'r', alt: 'Ancient bronze steelyards: long beams with hooks, and weights cast as small busts', q: 'Why is it that steelyards weigh great weights of meat with a small counterpoise, the whole forming only a half balance? … Is it because the steelyard is at once a beam and a lever?', c: 'Mechanica 20, 853b25', t: 'Forster', note: 'Steelyards found at Pompeii and Herculaneum.', who: ROUX, what: 'Herculanum et Pompéi, volume VII, bronzes, plate 96', when: 'Paris, 1840 (printed 1861)', how: 'Engraving', where: IA('Getty Research Institute'), lic: 'public domain' },
    Col: { side: 'r', alt: 'A bunch of black grapes hanging from a vine stem, with two broad leaves', q: 'Grapes on the bunch, which grow wine-coloured as they ripen; for, as they blacken, their crimson turns to a violet.', c: 'De Coloribus 2, 792b5', t: 'Loveday and Forster', who: 'After J. Polydore', what: 'A black grape, from Ampélographie française', when: 'Geneva, De Villain, mid-19th century', how: 'Lithograph, coloured by hand', where: WEL, lic: 'public domain' },
    Phgn: { side: 'l', alt: 'A lion lies on a rock above the sea, its great mane lifted, looking out to the right', q: 'This being so, the lion manifestly exhibits the male type in its most perfect form.', c: 'Physiognomonica 5, 809b14', t: 'Loveday and Forster', who: 'George Stubbs', what: 'A Lion Resting on a Rock', when: '1788', how: 'Etching with roulette work', where: MET, lic: 'CC0' },
    MXG: { side: 'l', pre: true, alt: 'Neptune with his trident rides the waves in a shell drawn by sea-horses', note: 'Gorgias argues that what we think of need not exist.', q: 'Nothing could be false, not even (he says) though one should say that chariots are racing on the sea.', c: 'De Melisso Xenophane Gorgia 6, 980a10', t: 'Loveday and Forster', who: 'François Antoine Aveline', what: 'Neptune Calming the Storm', when: '18th century', how: 'Etching and engraving', where: MET, lic: 'CC0' },
    Aud: { side: 'l', alt: 'Apollo stands with his lyre, one hand on the strings, the other pointing away', q: 'If one touches the strings violently instead of softly with the hand, they necessarily respond with more violent sounds.', c: 'De Audibilibus 803a30', t: 'Loveday and Forster', note: 'Apollo with his lyre, from a wall painting at Pompeii.', who: ROUX, what: 'Herculanum et Pompéi, volume IV, paintings', when: 'Paris, 1839 (printed 1861)', how: 'Engraving', where: IA('Getty Research Institute'), lic: 'public domain' },
    Lin: { side: 'r', pre: true, alt: 'Ancient bronze compasses and calipers above a long folding rule, shown open and half folded', note: 'Bronze compasses, calipers and a folding foot-rule found at Pompeii. Dots on the rule mark sixteen digits on one face and twelve inches on the other.', q: 'If we accept their definition of ‘commensurate’ lines as those which are measured by the same unit of measurement, … there will be some actual length, by which all of them will be measured.', c: 'On Indivisible Lines 968b4', t: 'Joachim', who: 'Gennaro Aveta, engraved by Lasinio the younger', what: 'Real Museo Borbonico, volume VI, plate XV: bronze measures from Pompeii', when: 'Naples, 1830', how: 'Engraving', where: IA('Wellcome Library'), lic: 'public domain' },
    Vent: { side: 'r', alt: 'The top of an eight-sided marble tower; under the roof, winged figures fly along a carved band, each with a name above it', q: 'Notus (the South Wind) bears the same name everywhere.', c: 'Ventorum Situs 973b8', t: 'Forster', note: 'The Tower of the Winds at Athens: each face carries one wind, carved with its name.', who: 'Julien-David Le Roy', what: 'Les ruines des plus beaux monuments de la Grèce, the Tower of the Winds', when: 'Paris, 1758', how: 'Engraving', where: IA('Getty Research Institute'), lic: 'public domain' },
    Mirab: { side: 'l', alt: 'A crocodile with gaping jaws crawls along a riverbank, pyramids behind it', q: 'Men say that in Egypt the sandpipers fly into the mouths of the crocodiles, and cleanse their teeth, pulling out the pieces of flesh, which stick in their snouts, while the crocodiles are pleased, and do them no harm.', c: 'De Mirabilibus Auscultationibus 7, 831a11', t: 'Dowdall', who: 'Anonymous English engraver', what: 'Common Crocodile', when: 'undated, about 1800', how: 'Etching', where: WEL, lic: 'public domain' },
    // Rhetoric and poetics
    Rhet: { side: 'r', alt: 'Two heads drawn in outline, eyes wide, brows knotted, mouths twisted with rage', q: 'Anger may be defined as an impulse, accompanied by pain, to a conspicuous revenge for a conspicuous slight directed without justification towards what concerns oneself or towards what concerns one’s friends.', c: 'Rhetoric II.2, 1378a31', t: 'Roberts', who: 'Sébastien Le Clerc the Younger, after Charles Le Brun', what: 'Anger, from Caractères des passions', when: 'about 1695–1720', how: 'Etching', where: MET, lic: 'CC0' },
    Poet: { side: 'r', alt: 'Three ancient bronze theatre masks: a bearded one with a gaping mouth, a young one crowned with leaves, an old man', q: 'To take an obvious example, the comic mask is ugly and distorted, but does not imply pain.', c: 'Poetics 5, 1449a36', t: 'Butcher', note: 'Bronze masks found at Herculaneum and Pompeii.', who: ROUX, what: 'Herculanum et Pompéi, volume VI, bronzes', when: 'Paris, 1840 (printed 1861)', how: 'Engraving', where: IA('Getty Research Institute'), lic: 'public domain' },
  };

  // The mockup's variant picks the set: 'later' (above, the default) or
  // 'early' (the first set). The layout is the same for both.
  const SETS = { later: { pl: PL_LATER, dir: 'later/' }, early: { pl: PL, dir: '' } };
  const set = () => SETS[U.variant('h')] || SETS.later;
  const has = (id) => !!set().pl[id];
  const img = (id, cut) => `img/h/${set().dir}${cut}/${id}.jpg`;

  // A plate is printed in one ink. The file is the print with its paper
  // cleaned to white; the page lays it over the ink colour so the lines
  // take the ink and the white drops out (and the reverse in dark mode).
  // A desktop gets the wide cut, a phone the shorter one.
  const CUT = { desktop: 'desk', phone: 'phone' };
  function plate(id, P, cls = '') {
    const p = set().pl[id];
    if (!p) return '';
    return `<div class="h-ink${p.pos ? ' pos' : ''} ${cls}"><img src="${img(id, CUT[P.kind] || 'desk')}" alt="${esc(p.alt)}" decoding="async"></div>`;
  }
  const credit = (p) => p.cr ? esc(p.cr) : `${esc(p.who)}${p.what ? `, <i>${esc(p.what)}</i>` : ''}${p.when ? `, ${esc(p.when)}` : ''}. ${esc(p.how)}. ${esc(p.where)} (${esc(p.lic)}).`;
  // Greek words inside English text take the Greek face.
  const grc = (html) => html.replace(/[\u0370-\u03ff\u1f00-\u1fff]+/g, (m) => `<span lang="grc">${m}</span>`);
  function caption(id, full = true) {
    const p = set().pl[id];
    if (!p) return '';
    // A note that explains the picture comes first (pre); one that
    // qualifies the quotation comes after it.
    const note = p.note ? `<p class="h-cap-n${p.pre ? ' pre' : ''}">${grc(esc(p.note))}</p>` : '';
    return `<figcaption class="h-cap">${p.pre ? note : ''}${p.q ? `<p class="h-cap-q">“${esc(p.q)}”</p><p class="h-cap-c">${esc(p.c)}${p.t ? `, tr. ${esc(p.t)}` : ''}</p>` : ''}${p.pre ? '' : note}
      <p class="h-cap-s">${credit(p)}${full && p.url ? ' <a href="#" data-noop>Record</a>' : ''}</p></figcaption>`;
  }

  // ── Fitting a title to its box ───────────────────────────────────────────
  // The largest size at which every word fits the width and the title takes
  // no more than `data-lines` lines. Measured in the page, once the fonts
  // are in; again when the box changes width.
  function fit(el) {
    const W = el.clientWidth;
    if (!W) return;
    const max = +el.dataset.max || 160;
    const min = +el.dataset.min || 20;
    const lines = +el.dataset.lines || 3;
    const lh = parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize) || 1;
    let lo = min;
    let hi = max;
    const ok = (s) => {
      el.style.fontSize = `${s}px`;
      // Accents and descenders may hang a little past the line box; an
      // extra line would overshoot by a whole line, so allow a fifth. The
      // padding that keeps descenders in view is not part of the lines.
      const cs = getComputedStyle(el);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      return el.scrollWidth <= el.clientWidth + 0.5 && el.scrollHeight - pad <= s * lh * (lines + 0.2) + 2;
    };
    if (ok(hi)) { el.dataset.w = String(W); return; }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ok(mid)) lo = mid; else hi = mid;
    }
    ok(lo);
    el.dataset.w = String(W);
  }
  const RO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      if (!el.isConnected) { RO.unobserve(el); continue; }
      if (String(el.clientWidth) !== el.dataset.w) fit(el);
    }
  });
  function fitAll(P) {
    for (const el of P.view.querySelectorAll('[data-fit]')) { fit(el); RO.observe(el); }
  }
  H.after = (S, P) => fitAll(P);
  H.fitText = fitAll;
  if (document.fonts) {
    Promise.all([
      document.fonts.load('800 100px Archivo', 'Nicomachean'),
      document.fonts.load('400 100px "GFS Didot"', 'ἀρετή'),
      document.fonts.load('400 20px Piazzolla', 'ἀρετή virtue'),
    ]).catch(() => []).then(() => U.shown().forEach(fitAll));
    // Each title face loads when its switch is first chosen: set the titles
    // again once it is in.
    document.fonts.addEventListener('loadingdone', () => U.shown().forEach(fitAll));
  }

  // ── Frame ────────────────────────────────────────────────────────────────
  const brand = () => '<a class="h-brand" href="#" data-go="home"><b>Aristotle</b> <i>Reader</i></a>';
  const nav = (on) => `<header class="h-nav">
      ${brand()}
      <nav class="h-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => {
          const x = k === 'phrases' || k === 'support';
          return `<a href="#" ${x ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${x ? ' h-x-s' : ''}"${on === k ? ' aria-current="page"' : ''}>${l}</a>`;
        }).join('')}
        <button type="button" class="h-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="h-foot">
      <div class="h-foot-b">${brand()}<p>Greek and English, side by side.</p></div>
      <p class="h-foot-l"><span>Also</span><a href="#" data-noop>The Plato Reader</a><a href="#" data-noop>The Homer Reader</a><a href="#" data-noop>The Greek Drama Reader</a><a href="#" data-noop>Grammata</a></p>
      <p class="h-foot-l"><a href="#" data-noop>Texts and licences</a><a href="#" data-noop>Picture credits</a><a href="#" data-noop>Support</a><a href="#" data-noop>Desktop app</a><a href="#" data-noop>Report an error</a><a href="#" data-noop>Play a game</a></p>
      <p class="h-foot-m">Site by John H. Boyer. The pictures are old prints in the public domain; each work’s page names its source.</p>
    </footer>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  // One plate: Aristotle himself, after the ancient bust (Samuele Jesi's
  // engraving in the later set, René Boyvin's of 1566 in the early one).
  // Below it, every work, by division; each line names the work's plate in
  // small italic, as a book lists its plates.
  const workLine = (x) => `<li><a href="#" data-go="work:${x.id}">
      <span class="h-wt">${esc(x.title)}${tag(x)}</span>
      <span class="h-wg" lang="grc">${esc(x.greekTitle)}</span>
      <span class="h-we">${esc(U.extent(x))}</span>
    </a></li>`;
  H.home = (S, P) => {
    const divs = U.divisions();
    const isa = U.work('Isa');
    return `<div class="h-page">${nav('home')}
      <section class="h-hero h-home${has('home') ? '' : ' bare'}">
        <div class="h-hero-t">
          <p class="h-kick">The complete works, in Greek and English</p>
          <h1 class="h-h1 h-home-t" data-fit data-max="200" data-min="60" data-lines="2"><span>Aristotle</span> <span class="h-home-r">Reader</span></h1>
          <p class="h-lead">Forty-one works, the Greek beside the English. Click any Greek word to parse it and read its dictionary entry. Search every work in either language.</p>
          <div class="h-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the works" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="h-cont"><a href="#" data-go="reader:${U.RESUME.cite}"><b>Continue reading</b> <i>Nicomachean Ethics</i>, Book I, chapter 7&nbsp;${ICON.arrow}</a></p>
        </div>
        <figure class="h-plate">${plate('home', P)}</figure>
      </section>
      ${has('home') ? `<div class="h-home-cap">${caption('home', false)}</div>` : ''}
      <section class="h-works" aria-label="All works">
        ${divs.map((d) => `<section class="h-div${d.appendix ? ' app' : ''}">
          <h2 class="h-dh"><span class="h-dn" aria-hidden="true">${esc(d.numeral || '∗')}</span><span>${esc(divName(d))}</span></h2>
          <div class="h-dw">${d.groups.map((g) => `${g.label ? `<h3 class="h-sub">${esc(g.label)}</h3>` : ''}<ul class="h-wl">${g.works.map(workLine).join('')}</ul>`).join('')}
            ${d.numeral === 'I' && isa ? `<h3 class="h-sub">With it, a commentary</h3><ul class="h-wl">${workLine({ ...isa, title: 'Porphyry, Isagoge' })}</ul>` : ''}</div>
        </section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  const books = (w) => {
    const en = w.id === 'EN';
    const bs = U.workBooks(w.id);
    const go = (b, c) => (en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader');
    const row = (b, c) => `<li><a href="#" data-go="${go(b, c)}"><span class="h-cn">${esc(c.ch)}</span><span class="h-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="h-cb">${esc(c.bekker)}</span></a></li>`;
    if (bs.length < 2) return `<ol class="h-chs">${(bs[0] ? bs[0].chapters : []).map((c) => row(bs[0], c)).join('')}</ol>`;
    const span = (b) => { const s = U.bookSpan(w, b.n); return s ? `${s[0]}–${s[1]}` : ''; };
    return `<p class="h-bkall"><button type="button" data-act="books:open">Open all books</button><button type="button" data-act="books:close">Close all</button></p>
      <div class="h-bks">${bs.map((b) => `<details class="h-bk" data-book="${b.n}"><summary>
          <span class="h-bkn"><small>Book</small> <b${/[α-ωΑ-Ω]/.test(b.label) ? ' lang="grc"' : ''}>${esc(b.label)}</b></span>
          <span class="h-bkf">${b.chapters[0] && b.chapters[0].title ? esc(b.chapters[0].title) : `<span class="h-bks2">${esc(span(b))}</span>`}</span>
          <span class="h-bkc">${b.chapters.length} chapter${b.chapters.length === 1 ? '' : 's'}</span>
        </summary><ol class="h-chs">${b.chapters.map((c) => row(b, c)).join('')}</ol></details>`).join('')}</div>`;
  };

  // Where a work has no picture, its Greek title is the plate, set in the
  // same ink.
  const typePlate = (w) => `<div class="h-tplate" aria-hidden="true"><p class="h-tplate-g" lang="grc" data-fit data-max="190" data-min="40" data-lines="4">${esc(w.greekTitle)}</p></div>`;

  H.work = (S, P) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const p = set().pl[w.id];
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const many = U.workBooks(w.id).length > 1;
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const by = w.author && w.author !== 'Aristotle' ? `<p class="h-by">${esc(w.author)}</p>` : '';
    return `<div class="h-page">${nav('home')}
      <section class="h-hero h-wk${p && p.side === 'l' ? ' flip' : ''}${p ? '' : ' bare'}">
        <div class="h-hero-t">
          <p class="h-crumb"><a href="#" data-go="home">Works</a> <span>/</span> ${d && d.numeral ? `<b>${esc(d.numeral)}</b> ` : ''}${esc(divName(d))}</p>
          ${by}
          <h1 class="h-h1 h-wk-t" data-fit data-max="${P.kind === 'phone' ? 84 : 128}" data-min="36" data-lines="${w.title.length > 26 ? 4 : 3}">${esc(w.title)}</h1>
          <p class="h-wk-g" lang="grc">${esc(w.greekTitle)}</p>
          <p class="h-wk-b">${esc(w.blurb)}${tag(w)}</p>
          <div class="h-ctas">
            <a href="#" class="h-btn pri" data-go="reader">Start reading ${ICON.arrow}</a>
            ${en ? `<a href="#" class="h-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
          </div>
          <p class="h-ctas2"><a href="#" data-go="reader:greek">Greek only</a>${trs.length > 1 ? '<a href="#" data-go="reader:compare">Compare translations</a>' : ''}</p>
          ${en ? '' : '<p class="h-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
        </div>
        <figure class="h-plate">${p ? plate(w.id, P) : typePlate(w)}${p ? caption(w.id) : ''}</figure>
      </section>
      <section class="h-sec h-facts-s">
        <dl class="h-facts">
          <div><dt>Greek text</dt><dd>${esc(w.greekSource.full)}</dd></div>
          <div><dt>English</dt><dd>${trs.map((t) => `<a href="#" data-go="reader:${t.id}">${esc(t.who)}</a>, ${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${trs.length > 1 && (w.defaultTranslation || trs[0].id) === t.id ? ' <small>opens first</small>' : ''}`).join('<br>')}</dd></div>
          <div><dt>Length</dt><dd>${esc(U.extent(w))}</dd></div>
        </dl>
      </section>
      <section class="h-sec">
        <h2 class="h-h2">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="h-note3">Chapter titles are Ostwald’s.</p>' : ''}
        ${books(w)}
      </section>
      <section class="h-sec h-two">
        ${fr.length ? `<div><h2 class="h-h2">In print</h2><ul class="h-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul></div>` : ''}
        <div>${w.commentaries ? `<h2 class="h-h2">Commentary</h2><ul class="h-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul>` : ''}
          ${w.related ? `<h2 class="h-h2">Related</h2><ul class="h-trs">${w.related.map((r) => `<li><a href="#" data-go="work:${r.id}"><span>${esc(U.work(r.id) ? U.work(r.id).title : r.id)}</span><small>${esc(r.label)}</small></a></li>`).join('')}</ul>` : ''}
          <h2 class="h-h2">Sources</h2><p class="h-cred"><a href="#" data-noop>Texts and licences</a>${p ? ' · <a href="#" data-noop>Picture credits</a>' : ''}</p></div>
      </section>
      ${foot()}</div>`;
  };

  // ── The reader: no pictures ──────────────────────────────────────────────
  H.reader = (S) => `<div class="h-rd" data-body>
      <header class="h-rh" data-sticky>
        <button type="button" class="h-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="h-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="h-rh-b" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
        <span class="h-rh-ch"><b><span class="hide-s">Chapter </span><span class="show-s">Ch. </span><span data-here-ch>1</span></b><i data-here-title></i></span>
        <span class="h-msg" data-jump-msg></span>
        <span class="h-sp"></span>
        <span class="h-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="h-rh-b hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="h-ib" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="h-ib h-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="h-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="h-text" data-text></main>
    </div>`;

  H.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` + ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  H.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let lastSi = -1;
    let html = `<header class="h-bookh">
        <p class="h-bk-k">Nicomachean Ethics</p>
        <h1 class="h-bk-t">Book I</h1>
        <p class="h-bk-g" lang="grc">Ἠθικῶν Νικομαχείων Α</p>
        <p class="h-bk-s">Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`} · 13 chapters, 1094a1–1103a10</p>
      </header>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) html += `<div class="h-chh"><span class="h-chn">${esc(bk.chapter)}</span><div><p class="h-cht">${esc(U.TITLES[bk.chapter] || '')}</p><p class="h-chb">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      html += `<div class="h-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="h-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="h-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="h-ln${typeof num === 'string' && num ? ' col' : ''}">${num}</span><span class="h-lt">${U.lineHTML(bk, L)}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="h-ec" data-t="${c}" data-tn="${esc(U.trans(c).short)}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    html += '<p class="h-end">End of Book I. This mockup carries Book I only.</p>';
    return html;
  };

  H.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="h-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="h-side-h"><p class="h-w" lang="grc">${esc(S.word.t)}</p><p class="h-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="h-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="h-side-b">
        ${cards.length ? cards.map((c) => `<section class="h-card">
          <p class="h-lem" lang="grc">${esc(c.head)}${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="h-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="h-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="h-card-f">${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="h-none">No analysis for this form.</p>'}
        <p class="h-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  H.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="h-note" style="left:${x}px;top:${at.y + 8}px;width:${wpx}px" role="note"><p class="h-note-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="h-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="h-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="h-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="h-mk">Compare with</p>
      <p class="h-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  H.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      // The chapter you are in is marked as the drawer opens; scrolling
      // moves the mark (the shell's tick).
      const cur = String(P.ui.hereCh || S.hereCh || '1');
      return `<aside class="h-toc" aria-label="Contents">
        <div class="h-toc-h"><a href="#" data-go="home">← All works</a><button type="button" class="h-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <p class="h-toc-w">Nicomachean Ethics</p>
        <div class="h-toc-go" data-jump-host><label for="h-go-${P.kind}">Go to a Bekker line</label><div><input id="h-go-${P.kind}" data-jump placeholder="1097a15" autocomplete="off" spellcheck="false"><button type="button" data-act="jumpgo" aria-label="Go">${ICON.arrow}</button></div><p class="h-msg" data-jump-msg></p></div>
        <ol class="h-toc-b">${U.bookList().map((b) => `<li${b.b === 1 ? ' class="on"' : ''}><p class="h-toc-bh"><span><b>${ROMAN[b.b]}</b> Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="h-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"${c.ch === cur ? ' class="now" aria-current="true"' : ''}><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="h-menu h-bmenu" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px"><p class="h-mk">Books</p><ul class="h-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span><b>${ROMAN[b.b]}</b> Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    if (P.ui.panel === 'picker') return `<div class="h-menu h-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="h-mk">Translation</p>${transList(S)}<p class="h-note2">Each translation keeps its own Bekker numbers in the margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="h-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="h-menu h-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        <p class="h-mk">View</p>${views(S)}${phone ? `<p class="h-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="h-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="h-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search: no pictures ──────────────────────────────────────────────────
  H.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="h-page">${nav('search')}
      <section class="h-sq">
        <div class="h-sq-f">${ICON.search}<input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="h-btn pri" data-go="search">Search</button></div>
        <p class="h-sq-o"><span class="h-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button" aria-pressed="false">English</button><button type="button" aria-pressed="false">Both</button></span><span>Any form · accents ignored · all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="h-sr">
        <div class="h-sr-n"><p class="h-sr-big">${fmt(R.count)}</p><div><p class="h-sr-t">places in ${R.works.length} works for <span lang="grc">${esc(R.head)}</span>, <i>${esc(R.gloss)}</i>.</p><p class="h-sr-l"><a href="#" data-go="lexicon:arete">Open the lexicon page</a><a href="#" data-noop>Export as CSV</a></p></div></div>
        <div class="h-sr-body">
          <nav class="h-sr-w" aria-label="Works with hits">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}"${i === 0 ? ' aria-current="true"' : ''}><span>${esc(x.title)}</span><b>${x.count}</b></a>`).join('')}</nav>
          <div class="h-sr-r">
            <section class="h-sg"><h2>Nicomachean Ethics <span>${en.count} places · Book I shown</span></h2>
              ${b1.chapters.map((c) => `<div class="h-sch"><h3><b>${esc(c.chapter)}</b> ${esc(U.TITLES[c.chapter] || '')}</h3>
                ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="h-hit"><a href="#" class="h-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="h-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="h-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
            </section>
            ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<section class="h-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2></section>`).join('')}
          </div>
        </div>
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon: no pictures ─────────────────────────────────────────────────
  // The headword is set like a plate: GFS Didot, in the ink, as large as the
  // column allows.
  H.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    return `<div class="h-page">${nav('lexicon')}
      <section class="h-lx">
        <p class="h-crumb"><a href="#" data-go="lexicon">Lexicon</a> <span>/</span> ${fmt(U.LEMMA_TOTAL || 0)} words</p>
        <h1 class="h-wp" lang="grc" data-fit data-max="300" data-min="72" data-lines="1">${esc(L.head)}</h1>
        <div class="h-lx-h"><p class="h-lx-gl">${esc((L.glosses || []).join('; '))}</p>
        <dl class="h-lx-n">
          <div><dt>times in Aristotle</dt><dd>${fmt(L.count)}</dd></div>
          ${dz ? `<div><dt>in authors before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>in his contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
          <div><dt>works</dt><dd>${L.byWork.length}</dd></div>
        </dl></div>
      </section>
      <section class="h-sec"><h2 class="h-h2">By work</h2><ol class="h-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ol></section>
      <section class="h-sec h-two"><div><h2 class="h-h2">LSJ</h2>${U.t8(L.key)}</div>
        <div><h2 class="h-h2">Key passages</h2><p class="h-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <h2 class="h-h2">Nearby</h2><p class="h-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on" aria-current="true"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
