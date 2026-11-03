/* Direction F · Objects. Each work is shown as a museum shows one object:
   cut from its photograph, lit on a dark wall, with a label that says why it
   is there. The home page is the catalogue's cover (Aristotle's portrait);
   a work page is a spread, the plate on the left and the entry on the right.
   The reader, search and lexicon carry no pictures; the wall colour returns
   in the reader's head bar, and words are labelled as objects are. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const F = (window.T.f = {});
  F.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.4"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.4"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.4"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    out: '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M4 2h6v6M10 2 3 9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const divName = (d) => (d ? (d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title) : '');
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="f-tag">${esc(w.authenticity)}</span>` : '');

  // ── The objects ──────────────────────────────────────────────────────────
  // One per work where a real object from Aristotle's world makes the point
  // at a glance; the label quotes or sums up the line it stands for. `q` is
  // the wall text under the object (a quotation when `quote` is set, else a
  // plain summary); `why` says in a sentence why this object; `fit` places it
  // in the plate. The Met's images are public domain (Open Access); the
  // Cleveland Museum of Art's are CC0.
  const MET = 'The Metropolitan Museum of Art';
  const CMA = 'The Cleveland Museum of Art';
  const met = (n) => `https://www.metmuseum.org/art/collection/search/${n}`;
  const cma = (n) => `https://www.clevelandart.org/art/${n}`;
  const PD = 'Public domain';
  const OBJ = {
    Cat: { name: 'Bronze horse', made: 'Greek, 8th century BC', mat: 'Bronze', size: 'H. 17.6 cm', mus: MET, acc: '21.88.24', lic: PD, url: met(251050),
      why: 'Not the horse in general but this one, cast in bronze. Aristotle’s first example of a substance is a particular horse.',
      q: 'Substance, in the strictest sense, is neither said of a subject nor in one: this man, or this horse.', quote: true, grc: 'οἷον ὁ τὶς ἄνθρωπος ἢ ὁ τὶς ἵππος', cite: 'Categories 5, 2a11–14', fit: '--ot:9%;--ob:27%;--ox:12%' },
    Int: { name: 'Silver coin of Demetrios the Besieger', made: 'Greek, 300–294 BC', mat: 'Silver', size: 'Diam. 2.6 cm', mus: MET, acc: '05.44.399', lic: PD, url: met(247147),
      why: 'Victory alights on the prow of a warship. Demetrios struck this coin for the sea battle he won off Cyprus in 306 BC.',
      q: 'There must either be a sea battle tomorrow or not; but it is not necessary that there be one.', quote: true, grc: 'ἀνάγκη μὲν ἔσεσθαι ναυμαχίαν αὔριον ἢ μὴ ἔσεσθαι', cite: 'De Interpretatione 9, 19a30–32', fit: '--ot:8%;--ob:28%;--ox:14%' },
    Top: { name: 'Bronze handle with two wrestlers', made: 'Made in Praeneste, Italy, 4th century BC', mat: 'Bronze', size: 'H. 11.4 cm', mus: MET, acc: '96.18.8', lic: PD, url: met(246541),
      why: 'Two wrestlers lock arms to make the handle of a lidded box. The Topics trains you for argument as a match between two: one asks, one answers.',
      q: 'The treatise is useful for three things: for training, for encounters, and for philosophy.', quote: true, grc: 'πρὸς γυμνασίαν, πρὸς τὰς ἐντεύξεις, πρὸς τὰς κατὰ φιλοσοφίαν ἐπιστήμας', cite: 'Topics I.2, 101a26–28', fit: '--ot:10%;--ob:28%;--ox:10%' },
    SE: { name: 'Plated stater, a forgery', made: 'Greek, Kyzikos, 6th century BC', mat: 'Electrum over a base-metal core', size: 'Diam. 1.85 cm', mus: MET, acc: '2021.40.86', lic: PD, url: met(330163),
      why: 'A forger’s coin: cheap metal inside, a thin skin of electrum outside. The book opens with things that seem real and are not.',
      q: 'Some things really are silver and gold; others are not, but seem so to the senses.', quote: true, cite: 'Sophistical Refutations 1, 164b24–26', fit: '--ot:9%;--ob:28%;--ox:14%' },
    Phys: { name: 'Bronze athlete', made: 'Greek, about 450 BC', mat: 'Bronze', size: 'H. 21.3 cm', mus: MET, acc: '08.258.11', lic: PD, url: met(248083),
      why: 'Bronze is what the statue is made of; the athlete is the shape it was given. This is Aristotle’s first example of a cause.',
      q: 'In one way a cause is that out of which a thing comes to be: the bronze of the statue.', quote: true, grc: 'οἷον ὁ χαλκὸς τοῦ ἀνδριάντος', cite: 'Physics II.3, 194b23–24', fit: '--ot:4%;--ob:23%;--ox:18%' },
    Cael: { name: 'Wall painting with a globe', made: 'Roman, from a villa at Boscoreale near Pompeii, about 50–40 BC', mat: 'Fresco', size: 'H. 72 cm', mus: MET, acc: '03.14.2', lic: PD, url: met(247006),
      why: 'A globe set on a pillar, painted on a garden wall. Aristotle argues that the heavens, and the earth at their centre, are spheres.',
      q: 'In eclipses of the moon the edge of the earth’s shadow is always curved: so the earth is round.', cite: 'On the Heavens II.14, 297b24–30', fit: '--ot:7%;--ob:25%;--ox:16%' },
    Mete: { name: 'Silver stater of Elis', made: 'Greek, Elis, about 432–421 BC', mat: 'Silver', size: 'Diam. 2.5 cm', mus: CMA, acc: '1916.995.b', lic: 'CC0', url: cma('1916.995.b'),
      why: 'Zeus’s thunderbolt, struck on a coin of the city that ran the games at Olympia. Aristotle explains thunder and lightning without Zeus.',
      q: 'Thunder and lightning come from dry vapour forced out of a cloud.', cite: 'Meteorology II.9', fit: '--ot:9%;--ob:28%;--ox:14%' },
    DA: { name: 'Gold ring engraved with Hermes', made: 'Greek, made in Taras, south Italy, late 4th century BC', mat: 'Gold', size: 'H. 2 cm', mus: MET, acc: '1994.230.3', lic: PD, url: met(256193),
      why: 'A seal ring of Aristotle’s own century. Pressed into wax it leaves its picture and keeps its gold: his image for how the senses work.',
      q: 'Sense takes in the forms of things without their matter, as wax takes the seal of a ring without the iron or the gold.', quote: true, grc: 'οἷον ὁ κηρὸς τοῦ δακτυλίου ἄνευ τοῦ σιδήρου καὶ τοῦ χρυσοῦ δέχεται τὸ σημεῖον', cite: 'De Anima II.12, 424a17–20', fit: '--ot:9%;--ob:28%;--ox:16%' },
    Mem: { name: 'Portrait of a thin-faced, bearded man', made: 'Roman Egypt, 160–180 AD', mat: 'Wax paint on limewood', size: 'H. 38.1 cm', mus: MET, acc: '09.181.1', lic: PD, url: met(547856),
      why: 'Painted to lie over a dead man’s face. A memory, Aristotle says, is like such a picture: we can look at it as a painting, or as someone we knew.',
      q: 'A figure painted on a panel is both a figure and a likeness.', quote: true, cite: 'On Memory 1, 450b20–22', fit: '--ot:7%;--ob:25%;--ox:20%' },
    Somn: { name: 'Bronze statue of Eros sleeping', made: 'Greek, 3rd–2nd century BC', mat: 'Bronze', size: 'L. 85.2 cm', mus: MET, acc: '43.11.4', lic: PD, url: met(254502),
      why: 'A winged boy asleep where he fell, made life size. Aristotle asks what sleep is, and why every animal needs it.',
      q: 'Sleep is a rest that keeps the animal alive: nothing can be awake and at work without pause.', cite: 'On Sleep 1–2', fit: '--ot:13%;--ob:30%;--ox:7%' },
    HA: { name: 'Perfume flask in the shape of a hedgehog', made: 'Greek, Rhodes, mid-6th century BC', mat: 'Terracotta', size: 'L. 10.8 cm', mus: MET, acc: '69.11.3', lic: PD, url: met(255278),
      why: 'The History of Animals is full of small facts, seen or heard. This one is about hedgehogs and the wind.',
      q: 'Hedgehogs sense a change of wind and move the mouths of their burrows. A man in Byzantium won a name as a weather prophet by watching his.', cite: 'History of Animals IX.6, 612b4–10', fit: '--ot:12%;--ob:30%;--ox:12%' },
    PA: { name: 'Marble hand holding a book roll', made: 'Roman, 1st or 2nd century AD', mat: 'Marble', size: 'L. 30.5 cm', mus: MET, acc: '21.88.10', lic: PD, url: met(251036),
      why: 'The left hand of a lost statue, still holding its book. Aristotle calls the hand the tool of tools.',
      q: 'The hand is not one tool but many: it is a tool for tools.', quote: true, grc: 'ἔστι γὰρ ὡσπερεὶ ὄργανον πρὸ ὀργάνων', cite: 'Parts of Animals IV.10, 687a19–21', fit: '--ot:12%;--ob:30%;--ox:9%' },
    MA: { name: 'Clay doll with jointed arms and legs', made: 'Greek, Corinth, 5th century BC', mat: 'Terracotta', size: 'H. 12 cm', mus: MET, acc: '44.11.8', lic: PD, url: met(254514),
      why: 'Her arms and legs hang on pegs and swing. Aristotle likens an animal’s motion to puppets that a small push sets going.',
      q: 'Animals move as self-moving puppets do: a small movement at the start, and the limbs follow.', cite: 'Movement of Animals 7, 701b1–10', fit: '--ot:6%;--ob:25%;--ox:24%' },
    IA: { name: 'Bronze crab', made: 'Greek, 3rd–1st century BC', mat: 'Bronze', size: 'W. 16.5 cm', mus: MET, acc: '1992.11.69', lic: PD, url: met(256125),
      why: 'Aristotle asks why the crab alone of animals walks sideways, and looks for the answer in how its legs bend.',
      q: 'Why does the crab, alone of animals, walk sideways?', cite: 'Progression of Animals', fit: '--ot:12%;--ob:30%;--ox:12%' },
    GA: { name: 'Silver coin of Ephesos with a bee', made: 'Greek, Ephesos, 202–133 BC', mat: 'Silver', size: 'Diam. 1.7 cm', mus: MET, acc: '05.44.660', lic: PD, url: met(247161),
      why: 'The bee was the badge of Ephesos. How bees breed was a puzzle, and Aristotle said so plainly.',
      q: 'The facts have not been grasped well enough. If they ever are, trust the senses rather than theories.', quote: true, grc: 'τῇ αἰσθήσει μᾶλλον τῶν λόγων πιστευτέον', cite: 'Generation of Animals III.10, 760b30–33', fit: '--ot:9%;--ob:28%;--ox:14%' },
    Meta: { name: 'Pair of eyes from a bronze statue', made: 'Greek, 5th century BC or later', mat: 'Bronze, marble, frit, quartz, obsidian', size: 'L. 5.1 cm', mus: MET, acc: '1991.11.3a, b', lic: PD, url: met(255977),
      why: 'Eyes made to be set into a bronze statue, lashes and all. The Metaphysics opens with our delight in seeing.',
      q: 'All men by nature desire to know.', quote: true, grc: 'Πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει.', cite: 'Metaphysics Α.1, 980a21', fit: '--ot:12%;--ob:30%;--ox:4%' },
    EN: { name: 'Bronze diskos thrower', made: 'Greek, about 480–460 BC', mat: 'Bronze', size: 'H. 24.5 cm', mus: MET, acc: '07.286.87', lic: PD, url: met(247967),
      why: 'An athlete with his diskos raised. Aristotle uses the games at Olympia to say that a good life lies in doing, not in having.',
      q: 'At Olympia it is not the finest and strongest who are crowned, but those who compete.', quote: true, grc: 'οὐχ οἱ κάλλιστοι καὶ ἰσχυρότατοι στεφανοῦνται ἀλλ᾽ οἱ ἀγωνιζόμενοι', cite: 'Nicomachean Ethics I.8, 1099a3–5', fit: '--ot:4%;--ob:22%;--ox:14%' },
    Pol: { name: 'Bronze juror’s ticket', made: 'Greek, Athens, 4th century BC', mat: 'Bronze', size: 'L. 11.4 cm', mus: MET, acc: '07.286.95', lic: PD, url: met(247975),
      why: 'An Athenian juror, Epikrates, carried this strip with his name on it to be chosen by lot for a court. Aristotle defines a citizen by just this.',
      q: 'A citizen is defined by nothing so much as by his share in judging and in office.', quote: true, grc: 'τῷ μετέχειν κρίσεως καὶ ἀρχῆς', cite: 'Politics III.1, 1275a22–23', fit: '--ot:12%;--ob:32%;--ox:7%' },
    Oec: { name: 'Silver coin of Athens with an owl', made: 'Greek, Athens, 449–407 BC', mat: 'Silver', size: 'Diam. 2.3 cm', mus: CMA, acc: '1916.992.b', lic: 'CC0', url: cma('1916.992.b'),
      why: 'Athena’s owl, the badge of Athens, on a four-drachma coin. The second book collects the ways cities and rulers raised money.',
      q: 'How cities, kings and governors have found money when they needed it.', cite: 'Oeconomica II.2', fit: '--ot:9%;--ob:28%;--ox:14%' },
    Rhet: { name: 'Marble head of Demosthenes', made: 'Roman, 2nd century AD, after a Greek bronze of about 280 BC', mat: 'Marble', size: 'H. 27.9 cm', mus: MET, acc: '2012.479.9', lic: PD, url: met(257882),
      why: 'The great orator of Athens. He was born and died in the same years as Aristotle, 384 and 322 BC.',
      q: 'Rhetoric is the power to see, in each case, the means of persuasion it offers.', quote: true, grc: 'δύναμις περὶ ἕκαστον τοῦ θεωρῆσαι τὸ ἐνδεχόμενον πιθανόν', cite: 'Rhetoric I.2, 1355b25–26', fit: '--ot:7%;--ob:25%;--ox:16%' },
    Poet: { name: 'Mask of a tragic heroine', made: 'Roman', mat: 'Terracotta', size: 'H. 17.5 cm', mus: MET, acc: '06.1103', lic: PD, url: met(247521),
      why: 'Actors in tragedy played behind masks. This one, in clay, is a heroine with her mouth open to speak.',
      q: 'Tragedy is the imitation of an action that is serious, complete, and of some size.', quote: true, grc: 'ἔστιν οὖν τραγῳδία μίμησις πράξεως σπουδαίας καὶ τελείας μέγεθος ἐχούσης', cite: 'Poetics 6, 1449b24–25', fit: '--ot:8%;--ob:27%;--ox:14%' },
    DM: { name: 'Head of Alexander the Great', made: 'Greek, Alexandria, about 300–200 BC', mat: 'Marble', size: 'H. 26.5 cm', mus: CMA, acc: '1927.209', lic: 'CC0', url: cma('1927.209'),
      why: 'Aristotle taught Alexander as a boy. This treatise on the world is written as a letter to him.',
      q: 'Philosophy has often seemed to me, Alexander, a divine thing.', quote: true, cite: 'De Mundo 1, 391a1–2', fit: '--ot:7%;--ob:25%;--ox:18%' },
    Mech: { name: 'Bronze steelyard and weights', made: 'Roman, 4th–6th century AD', mat: 'Bronze', size: 'L. 34 cm', mus: MET, acc: '00.13.8', lic: PD, url: met(246909),
      why: 'A balance with unequal arms: a small weight slid along the long arm lifts a heavy load hung from the short one.',
      q: 'Why does a steelyard weigh a heavy load with a small weight?', cite: 'Mechanics 20, 853b25', fit: '--ot:10%;--ob:28%;--ox:8%' },
    Col: { name: 'Mosaic glass bowl', made: 'Roman, late 1st century BC–early 1st century AD', mat: 'Glass', size: 'Diam. 9.2 cm', mus: MET, acc: '19.57.1', lic: PD, url: met(250728),
      why: 'Slices of coloured glass rods, fused and shaped into a bowl. This short work asks what colours are and how they arise.',
      q: 'What colours are, how they come to be, and how they mix.', cite: 'De Coloribus', fit: '--ot:12%;--ob:30%;--ox:12%' },
    Phgn: { name: 'Bronze head of a grotesque', made: 'Roman, 1st–2nd century AD', mat: 'Bronze', size: 'H. 6 cm', mus: MET, acc: '97.22.6', lic: PD, url: met(246684),
      why: 'A face pulled out of true. The Physiognomonica claims to read a person’s character in the face and body.',
      q: 'The mind follows the body, and is not untouched by what moves it.', cite: 'Physiognomonica 1, 805a1–3', fit: '--ot:8%;--ob:27%;--ox:16%' },
    Mirab: { name: 'Bronze griffin head from a cauldron', made: 'Greek, mid-7th to early 6th century BC', mat: 'Bronze', size: 'H. 12 cm', mus: MET, acc: '2025.320', lic: PD, url: met(923853),
      why: 'Greeks set griffins, beasts from travellers’ tales, round the rims of great bronze cauldrons. This book collects 178 such tales.',
      q: 'One hundred and seventy-eight marvels, heard of in far places.', cite: 'De Mirabilibus Auscultationibus', fit: '--ot:6%;--ob:25%;--ox:18%' },
  };
  // The cover: Aristotle's portrait, the Altemps bust.
  const COVER = {
    name: 'Portrait of Aristotle', made: 'Roman copy of a Greek bronze of about 330 BC', mat: 'Marble; the mantle is modern alabaster',
    mus: 'Palazzo Altemps, Rome', acc: 'inv. 8575', photo: 'Photograph by Jastrow, 2006, public domain', url: 'https://commons.wikimedia.org/wiki/File:Aristotle_Altemps_Inv8575.jpg',
    why: 'The lost bronze was made while Aristotle taught in Athens, perhaps by Lysippos; this marble is a Roman copy.',
  };
  const src = (id) => `img/f/${id}.webp`;
  const has = (id) => !!OBJ[id];

  // Catalogue numbers: the works in the order the home page lists them.
  const ORDER = [];
  U.divisions().forEach((d) => d.groups.forEach((g) => g.works.forEach((w) => ORDER.push(w.id))));
  const EXTRA = U.W.filter((w) => !ORDER.includes(w.id));
  EXTRA.forEach((w) => ORDER.push(w.id));
  const no = (id) => ORDER.indexOf(id) + 1;

  // A work's title is set as large as its column allows: its longest word
  // fits the width, and the title runs to three lines at most. Measured in
  // GFS Didot once the font is in.
  const cv = document.createElement('canvas').getContext('2d');
  let didotIn = false;
  function fitTitle(el) {
    const W = el.clientWidth;
    if (!W) return;
    const cs = getComputedStyle(el);
    const max = parseFloat(cs.getPropertyValue('--fmax')) || 112;
    const min = parseFloat(cs.getPropertyValue('--fmin')) || 34;
    const words = el.textContent.trim().split(/\s+/);
    cv.font = '400 100px "GFS Didot", Georgia, serif';
    const at = (s) => (didotIn ? cv.measureText(s).width : s.length * 52);
    const longest = Math.max(...words.map(at));
    let f = Math.min(max, (W * 0.97) / (longest / 100));
    const total = at(words.join(' '));
    const lines = parseFloat(cs.getPropertyValue('--flines')) || 2.7;
    while (f > min && (total * f) / 100 / W > lines) f -= 1;
    el.style.fontSize = `${Math.max(min, f).toFixed(1)}px`;
    el.dataset.w = String(W);
  }
  const RO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      if (!el.isConnected) { RO.unobserve(el); continue; }
      if (String(el.clientWidth) !== el.dataset.w) fitTitle(el);
    }
  });
  const fitAll = (P) => P.view.querySelectorAll('[data-fit="title"]').forEach((el) => { fitTitle(el); RO.observe(el); });
  F.after = (S, P) => fitAll(P);
  document.fonts.load('400 100px "GFS Didot"', 'AaBbΑαΒβ').catch(() => []).then(() => { didotIn = true; U.shown().forEach(fitAll); });

  // ── Shared parts ─────────────────────────────────────────────────────────
  const brand = () => '<a class="f-brand" href="#" data-go="home"><span class="f-b1">Aristotle</span> <span class="f-b2">Reader</span></a>';
  const nav = (on, wall) => `<header class="f-nav${wall ? ' on-wall' : ''}">
      ${brand()}
      <nav class="f-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => {
          const noop = k === 'phrases' || k === 'support';
          return `<a href="#" ${noop ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${noop ? ' f-x-s' : ''}"${on === k ? ' aria-current="page"' : ''}>${l}</a>`;
        }).join('')}
        <button type="button" class="f-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="f-foot">
      <p class="f-foot-k">Also</p>
      <p><a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>Picture credits</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;

  // The museum label: what the object is, why it is here, where it lives.
  const tomb = (o) => `<p class="f-tb">${esc(o.made)} · ${esc(o.mat)}${o.size ? ` · ${esc(o.size)}` : ''}<br>${esc(o.mus)}, ${esc(o.acc)}${o.photo ? `. ${esc(o.photo)}` : ` · ${esc(o.lic)}`}. <a href="#" data-noop>Object record ${ICON.out}</a></p>`;
  const wall = (o) => `<div class="f-wt">${o.quote ? `<q>${esc(o.q)}</q>` : `<p class="f-wt-s">${esc(o.q)}</p>`}<cite>${esc(o.cite)}</cite></div>`;

  // A plate: the object on the wall, the wall text under it.
  const plate = (id, cls = '') => {
    const o = OBJ[id];
    const w = U.work(id);
    if (!o) {
      // No object: the Greek title stands in the case.
      return `<figure class="f-plate f-plate-t ${cls}"><p class="f-pt" lang="grc" data-fit="title">${esc(w.greekTitle)}</p><figcaption class="f-wt"><cite>${esc(w.title)}, its title in Greek</cite></figcaption></figure>`;
    }
    return `<figure class="f-plate ${cls}" style="${o.fit}">
        <div class="f-obj"><img src="${src(id)}" alt="${esc(o.name)}" decoding="async"></div>
        <figcaption>${wall(o)}</figcaption>
      </figure>`;
  };

  // ── Home: the catalogue's cover, then the checklist ──────────────────────
  F.home = (S, P) => {
    const divs = U.divisions();
    const row = (x) => {
      const o = OBJ[x.id];
      return `<li><a href="#" data-go="work:${x.id}">
          <span class="f-cn">${no(x.id)}</span>
          <span class="f-ct"><span class="f-wt1">${esc(x.title)}${tag(x)}</span><span class="f-wg" lang="grc">${esc(x.greekTitle)}</span></span>
          <span class="f-co">${o ? `${esc(o.name)}<small>${esc(o.made.split(',').slice(0, 2).join(','))}</small>` : ''}</span>
          <span class="f-ce">${esc(U.extent(x))}</span>
        </a></li>`;
    };
    return `<div class="f-page f-home">
      <section class="f-cover">
        ${nav('home', true)}
        <div class="f-cv-obj"><img src="${src('home')}" alt="Marble portrait of Aristotle" decoding="async"></div>
        <div class="f-cv-t">
          <p class="f-kick">The complete works in Greek and English</p>
          <h1 class="f-cv-h">Aristotle</h1>
          <p class="f-cv-g" lang="grc">Ἀριστοτέλης</p>
          <div class="f-cv-s">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή" aria-label="Search the corpus" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="f-cv-c"><a href="#" data-go="reader:${U.RESUME.cite}">Continue reading <i>Nicomachean Ethics</i>, Book I, chapter 7</a></p>
        </div>
        <p class="f-cv-l"><b>${esc(COVER.name)}</b> ${esc(COVER.made)}. ${esc(COVER.mat)}. ${esc(COVER.mus)}, ${esc(COVER.acc)}. ${esc(COVER.photo)}.</p>
      </section>
      <section class="f-lead">
        <p>Forty-one works in Greek beside English. Click any Greek word to parse it. Each work has its own page, and most show an object from Aristotle’s world, with a label that says why it is there.</p>
      </section>
      <section class="f-list" aria-label="All works">
        <p class="f-list-h"><span>Works</span><span>Object</span><span>Length</span></p>
        ${divs.map((d) => `<section class="f-div">
            <h2 class="f-dh"><span class="f-dn">${esc(d.numeral || '·')}</span>${esc(divName(d))}</h2>
            ${d.groups.map((g) => `${g.label ? `<h3 class="f-sub">${esc(g.label)}</h3>` : ''}<ol class="f-works">${g.works.map(row).join('')}</ol>`).join('')}
          </section>`).join('')}
        ${EXTRA.length ? `<section class="f-div"><h2 class="f-dh"><span class="f-dn">·</span>A commentary</h2><ol class="f-works">${EXTRA.map(row).join('')}</ol></section>` : ''}
      </section>
      ${foot()}</div>`;
  };

  // ── A work: the spread ───────────────────────────────────────────────────
  const books = (w) => {
    const en = w.id === 'EN';
    const bs = U.workBooks(w.id);
    const row = (b, c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="f-chn">${esc(c.ch)}</span><span class="f-cht">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="f-chb">${esc(c.bekker)}</span></a></li>`;
    if (bs.length < 2) return `<ol class="f-chs">${(bs[0] ? bs[0].chapters : []).map((c) => row(bs[0], c)).join('')}</ol>`;
    const span = (b) => { const s = U.bookSpan(w, b.n); return s ? `${s[0]}–${s[1]}` : ''; };
    return `<p class="f-bkall"><button type="button" data-act="books:open">Open all books</button><button type="button" data-act="books:close">Close all</button></p>
      <div class="f-bks">${bs.map((b) => `<details class="f-bk" data-book="${b.n}"><summary>
          <span class="f-bkn" lang="${/[α-ωΑ-Ω]/.test(b.label) ? 'grc' : 'en'}"><span class="f-vh">Book </span>${esc(b.label)}</span>
          <span class="f-bkf">${b.chapters[0] && b.chapters[0].title ? esc(b.chapters[0].title) : `<span class="f-bks2">${esc(span(b))}</span>`}</span>
          <span class="f-bkc">${b.chapters.length} chapter${b.chapters.length === 1 ? '' : 's'}</span>
        </summary><ol class="f-chs">${b.chapters.map((c) => row(b, c)).join('')}</ol></details>`).join('')}</div>`;
  };

  F.work = (S, P) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const o = OBJ[w.id];
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const many = U.workBooks(w.id).length > 1;
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const facts = `<dl class="f-facts">
          <div><dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd></div>
          <div><dt>English</dt><dd>${trs.map((t) => `<a href="#" data-go="reader:${t.id}">${esc(t.who)}</a>, ${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${trs.length > 1 && (w.defaultTranslation || trs[0].id) === t.id ? ' <small>opens first</small>' : ''}`).join('<br>')}</dd></div>
          <div><dt>Length</dt><dd>${esc(U.extent(w))}</dd></div>
        </dl>`;
    const label = o ? `<section class="f-label" aria-label="The object">
          <p class="f-k">The object</p>
          <p class="f-on">${esc(o.name)}</p>
          <p class="f-why">${esc(o.why)}</p>
          ${o.grc ? `<p class="f-grc" lang="grc">${esc(o.grc)}</p>` : ''}
          ${tomb(o)}
        </section>` : '';
    return `<div class="f-page f-wk">${nav('home')}
      <p class="f-crumb"><a href="#" data-go="home">Works</a>${divName(d) !== w.title ? `<span>/</span>${esc(divName(d) || 'A commentary')}` : ''}<span>/</span><b>${esc(w.title)}</b></p>
      <div class="f-spread${o ? '' : ' no-obj'}">
        ${plate(w.id, 'f-wplate')}
        <div class="f-entry">
          <p class="f-no">No. ${no(w.id)} of ${ORDER.length}</p>
          <h1 class="f-title" data-fit="title">${esc(w.title)}</h1>
          ${o ? `<p class="f-gt" lang="grc">${esc(w.greekTitle)}</p>` : ''}
          <p class="f-blurb">${esc(w.blurb)}${tag(w)}</p>
          <div class="f-ctas">
            <a href="#" class="f-btn pri" data-go="reader">Start reading</a>
            <p class="f-more">${en ? `<a href="#" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}<a href="#" data-go="reader:greek">Greek only</a>${trs.length > 1 ? '<a href="#" data-go="reader:compare">Compare translations</a>' : ''}</p>
          </div>
          ${en ? '' : '<p class="f-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
          ${label || `<div class="f-efacts">${facts}</div>`}
        </div>
      </div>
      ${o ? `<section class="f-sec f-facts-s">${facts}</section>` : ''}
      <section class="f-sec">
        <h2 class="f-h2">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="f-note3">Chapter titles are Ostwald’s.</p>' : ''}
        ${books(w)}
      </section>
      <section class="f-sec f-two">
        ${fr.length ? `<div><h2 class="f-h2">In print</h2><ul class="f-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul></div>` : '<div></div>'}
        <div>${w.commentaries ? `<h2 class="f-h2">Commentary</h2><ul class="f-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul>` : ''}
          <h2 class="f-h2">Sources</h2><p class="f-cred"><a href="#" data-noop>Texts &amp; licences</a>${o ? ` · Picture: ${esc(o.mus)}, ${esc(o.acc)}, ${esc(o.lic.toLowerCase() === 'cc0' ? 'CC0' : 'public domain')}` : ''}</p></div>
      </section>
      ${foot()}</div>`;
  };

  // ── The reader: no pictures ──────────────────────────────────────────────
  F.reader = (S) => `<div class="f-rd" data-body>
      <header class="f-rh" data-sticky>
        <button type="button" class="f-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="f-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="f-rh-b" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
        <span class="f-rh-ch"><span>Chapter <b data-here-ch>1</b></span><i data-here-title></i></span>
        <span class="f-msg" data-jump-msg></span>
        <span class="f-sp"></span>
        <span class="f-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="f-rh-b hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="f-ib hide-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="f-ib f-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="f-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="f-text" data-text></main>
    </div>`;

  F.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  F.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let lastSi = -1;
    let html = `<header class="f-bookh">
        <p class="f-k">Nicomachean Ethics · Book I</p>
        <p class="f-bk-g" lang="grc">Ἠθικῶν Νικομαχείων Α</p>
        <p class="f-bk-s">Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p>
      </header>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) html += `<div class="f-chh"><span class="f-chn2">${esc(bk.chapter)}</span><div><p class="f-cht2">${esc(U.TITLES[bk.chapter] || '')}</p><p class="f-chb2">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      html += `<div class="f-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="f-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="f-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="f-ln${typeof num === 'string' && num ? ' col' : ''}">${num}</span><span class="f-lt">${U.lineHTML(bk, L)}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="f-ec" data-t="${c}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  // The word sidebar: the word as an object's label, its parse and its entry.
  F.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="f-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="f-side-h"><p class="f-w" lang="grc">${esc(S.word.t)}</p><p class="f-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="f-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="f-side-b">
        ${cards.length ? cards.map((c) => `<section class="f-card">
          <p class="f-lem" lang="grc">${esc(c.head)}${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="f-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="f-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="f-card-f">${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="f-none2">No analysis for this form.</p>'}
        <p class="f-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  F.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="f-note" style="left:${x}px;top:${at.y + 6}px;width:${wpx}px" role="note"><p class="f-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="f-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="f-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="f-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="f-k">Compare with</p>
      <p class="f-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  F.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      return `<aside class="f-toc" aria-label="Contents">
        <div class="f-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="f-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <p class="f-toc-w">Nicomachean Ethics</p>
        <p class="f-toc-g" lang="grc">Ἠθικὰ Νικομάχεια</p>
        <div class="f-toc-go" data-jump-host><label for="f-go-${P.kind}">Go to a Bekker line</label><input id="f-go-${P.kind}" data-jump placeholder="1097a15" autocomplete="off" spellcheck="false"><p class="f-msg" data-jump-msg></p></div>
        <ol class="f-toc-b">${U.bookList().map((b) => `<li><p class="f-toc-bh${b.b === 1 ? ' on' : ''}"><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="f-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="f-menu" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px"><ul class="f-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    if (P.ui.panel === 'picker') return `<div class="f-menu f-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="f-k">Translation</p>${transList(S)}<p class="f-note2">Each translation keeps its own Bekker numbers in its margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="f-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="f-menu f-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        ${views(S)}${phone ? `<p class="f-k">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="f-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="f-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search: no pictures ──────────────────────────────────────────────────
  F.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="f-page f-srp">${nav('search')}
      <section class="f-sq">
        <p class="f-k">Search the works</p>
        <div class="f-sq-f"><input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="f-btn pri" data-go="search">Search</button></div>
        <p class="f-sq-o"><span class="f-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button">English</button><button type="button">Both</button></span><span>any form · accents ignored · all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="f-sr">
        <div class="f-sr-n"><p class="f-sr-big">${fmt(R.count)}</p><div><p class="f-sr-t">places in ${R.works.length} works for <span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)}.</p><p class="f-sr-l"><a href="#" data-go="lexicon:arete">The word in the lexicon</a><a href="#" data-noop>Export as CSV</a></p></div></div>
        <p class="f-sr-w">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}">${esc(x.title)} <span>${x.count}</span></a>`).join('')}</p>
        <section class="f-sg"><h2>Nicomachean Ethics <span>${en.count} places · Book I shown</span></h2>
          ${b1.chapters.map((c) => `<div class="f-sch"><h3><b>${esc(c.chapter)}</b> ${esc(U.TITLES[c.chapter] || '')}</h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="f-hit"><a href="#" class="f-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="f-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="f-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<section class="f-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon: no pictures; the word gets a label, as an object would ───────
  F.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    return `<div class="f-page f-lxp">${nav('lexicon')}
      <section class="f-lx">
        <p class="f-k">The lexicon</p>
        <h1 class="f-lx-w" lang="grc">${esc(L.head)}</h1>
        <div class="f-lx-l">
          <p class="f-lx-gl">${esc((L.glosses || []).join('; '))}</p>
          <dl class="f-lx-n">
            <div><dt>in Aristotle</dt><dd>${fmt(L.count)}</dd></div>
            ${dz ? `<div><dt>in authors before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>in his contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
            <div><dt>works</dt><dd>${L.byWork.length}</dd></div>
          </dl>
          <p class="f-lx-a"><a href="#" data-go="search">Every place it occurs</a></p>
        </div>
      </section>
      <section class="f-sec"><h2 class="f-h2">By work</h2><ol class="f-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ol></section>
      <section class="f-sec f-two"><div><h2 class="f-h2">LSJ</h2>${U.t8(L.key)}</div>
        <div><h2 class="f-h2">Key passages</h2><p class="f-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <h2 class="f-h2">Nearby</h2><p class="f-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
