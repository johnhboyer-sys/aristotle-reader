/* Diagrams for direction C: Aristotle as the old diagrams drew him, redrawn
   as line drawings from the passages cited under each one. They inherit the
   page's ink, line and ochre, so both themes work. */
(function () {
  'use strict';
  const U = window.U;
  const { esc } = U;
  const G = (window.DIAGRAMS = {});
  const t = (x, y, s, cls = '', anchor = 'middle', lang = '') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}"${lang ? ` lang="${lang}"` : ''}>${esc(s)}</text>`;
  const svg = (w, h, body, label) => `<svg class="c-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;

  // Nicomachean Ethics: the mean, after the table in II.7.
  G.EN = () => {
    const rows = [
      ['fear and confidence', 'cowardice', 'courage', 'ἀνδρεία', 'rashness'],
      ['pleasures and pains', 'insensibility', 'temperance', 'σωφροσύνη', 'self-indulgence'],
      ['giving and taking money', 'meanness', 'liberality', 'ἐλευθεριότης', 'prodigality'],
      ['great expense', 'niggardliness', 'magnificence', 'μεγαλοπρέπεια', 'vulgarity'],
      ['great honour', 'small-mindedness', 'greatness of soul', 'μεγαλοψυχία', 'vanity'],
      ['anger', 'spiritlessness', 'gentleness', 'πραότης', 'irascibility'],
      ['truth about oneself', 'self-deprecation', 'truthfulness', 'ἀλήθεια', 'boastfulness'],
      ['amusement', 'boorishness', 'wit', 'εὐτραπελία', 'buffoonery'],
      ['pleasantness in company', 'quarrelsomeness', 'friendliness', 'φιλία', 'obsequiousness'],
    ];
    let b = t(130, 30, 'deficiency', 'lab mid') + t(400, 30, 'the mean', 'lab mid') + t(670, 30, 'excess', 'lab mid');
    rows.forEach(([sphere, def, mean, gk, exc], i) => {
      const y = 92 + i * 86;
      b += `<line x1="70" y1="${y}" x2="730" y2="${y}" class="ln"/>`;
      b += `<circle cx="130" cy="${y}" r="4" class="dot-o"/><circle cx="670" cy="${y}" r="4" class="dot-o"/><circle cx="400" cy="${y}" r="7.5" class="dot"/>`;
      b += t(400, y - 14, sphere, 'cap mid');
      b += t(130, y + 24, def, 'sm') + t(670, y + 24, exc, 'sm') + t(400, y + 26, mean, 'strong') + t(400, y + 44, gk, 'gk', 'middle', 'grc');
    });
    return svg(800, 92 + 9 * 86 - 26, b, 'Virtue as a mean between deficiency and excess, in nine spheres');
  };
  G.EN.cap = 'Virtue as a mean between excess and deficiency, after the table in <i>Nicomachean Ethics</i> II.7, 1107a28–1108b10.';

  // De Interpretatione: the opposition of statements (7, 17b16–26).
  G.Int = () => {
    const P = { tl: [120, 96], tr: [560, 96], bl: [120, 356], br: [560, 356] };
    const corner = ([x, y], gk, en, below) => `<circle cx="${x}" cy="${y}" r="6" class="dot"/>` + t(x, below ? y + 34 : y - 38, gk, 'gk', 'middle', 'grc') + t(x, below ? y + 54 : y - 18, en, 'sm mid');
    let b = '';
    b += `<line x1="120" y1="96" x2="560" y2="96" class="ln strong"/><line x1="120" y1="356" x2="560" y2="356" class="ln dash"/>`;
    b += `<line x1="120" y1="96" x2="120" y2="356" class="ln faint"/><line x1="560" y1="96" x2="560" y2="356" class="ln faint"/>`;
    b += `<line x1="120" y1="96" x2="560" y2="356" class="ln"/><line x1="560" y1="96" x2="120" y2="356" class="ln"/>`;
    b += t(340, 86, 'contraries: not both true', 'cap');
    b += t(340, 376, 'may both be true', 'cap mid');
    b += t(340, 262, 'contradictories:', 'cap') + t(340, 280, 'one true, the other false', 'cap');
    b += corner(P.tl, 'πᾶς ἐστιν ἄνθρωπος λευκός', 'every man is white') + corner(P.tr, 'οὐδείς ἐστιν ἄνθρωπος λευκός', 'no man is white');
    b += corner(P.bl, 'ἔστι τις ἄνθρωπος λευκός', 'some man is white', true) + corner(P.br, 'οὐ πᾶς ἐστιν ἄνθρωπος λευκός', 'not every man is white', true);
    return svg(680, 430, b, 'The square of opposition');
  };
  G.Int.cap = 'The opposition of statements, after <i>De Interpretatione</i> 7, 17b16–26. The square itself is the later commentators’ figure.';

  // Prior Analytics: the three figures, with Aristotle's letters (I.4–6).
  G.APr = () => {
    const node = (x, y, s, mid) => `<circle cx="${x}" cy="${y}" r="21" class="${mid ? 'dot' : 'dot-o big'}"/>` + t(x, y + 7, s, mid ? 'letter on' : 'letter', 'middle', 'grc');
    let b = '';
    // first figure: A of B, B of Γ
    b += `<line x1="130" y1="70" x2="130" y2="150" class="ln"/><line x1="130" y1="150" x2="130" y2="230" class="ln"/>` + node(130, 70, 'Α') + node(130, 150, 'Β', true) + node(130, 230, 'Γ');
    // second: M of N and of Ξ
    b += `<line x1="400" y1="80" x2="330" y2="220" class="ln"/><line x1="400" y1="80" x2="470" y2="220" class="ln"/>` + node(400, 80, 'Μ', true) + node(330, 220, 'Ν') + node(470, 220, 'Ξ');
    // third: Π and Ρ of Σ
    b += `<line x1="600" y1="80" x2="670" y2="220" class="ln"/><line x1="740" y1="80" x2="670" y2="220" class="ln"/>` + node(600, 80, 'Π') + node(740, 80, 'Ρ') + node(670, 220, 'Σ', true);
    b += t(130, 290, 'first figure', 'strong') + t(130, 312, 'the middle between the extremes', 'sm mid');
    b += t(400, 290, 'second figure', 'strong') + t(400, 312, 'the middle said of both', 'sm mid');
    b += t(670, 290, 'third figure', 'strong') + t(670, 312, 'both said of the middle', 'sm mid');
    return svg(800, 330, b, 'The three figures of the syllogism');
  };
  G.APr.cap = 'The three figures of the syllogism, with Aristotle’s own letters; the middle term in ochre (<i>Prior Analytics</i> I.4–6).';

  // Physics: the four causes, with Aristotle's examples (II.3).
  G.Phys = () => {
    let b = `<circle cx="380" cy="220" r="46" class="ring"/>` + t(380, 216, 'why?', 'strong') + t(380, 238, 'διὰ τί', 'gk sm', 'middle', 'grc');
    const arm = (x2, y2, lx, ly, a, gk, ex, anchor = 'middle') => `<line x1="${380 + Math.sign(x2 - 380) * (x2 === 380 ? 0 : 46)}" y1="${220 + Math.sign(y2 - 220) * (y2 === 220 ? 0 : 46)}" x2="${x2}" y2="${y2}" class="ln"/><circle cx="${x2}" cy="${y2}" r="6" class="dot"/>` + t(lx, ly, a, 'strong', anchor) + t(lx, ly + 22, gk, 'gk sm', anchor, 'grc') + t(lx, ly + 44, ex, 'sm mid', anchor);
    b += arm(380, 86, 380, 30, 'that for the sake of which', 'τὸ οὗ ἕνεκα', 'health, for walking');
    b += arm(380, 354, 380, 384, 'that out of which', 'ὕλη', 'the bronze of the statue');
    b += arm(214, 220, 196, 196, 'the form', 'εἶδος', 'the ratio 2 : 1 of the octave', 'end');
    b += arm(546, 220, 564, 196, 'the source of change', 'ἀρχὴ τῆς κινήσεως', 'the father of the child', 'start');
    return svg(760, 440, b, 'The four causes');
  };
  G.Phys.cap = 'Four ways of answering “why?”, with Aristotle’s examples (<i>Physics</i> II.3, 194b16–195a3).';

  // On the Heavens: the earth at the centre, the elements, the heavens.
  G.Cael = () => {
    const rings = [[30, 'earth', 'γῆ'], [48, 'water', 'ὕδωρ'], [66, 'air', 'ἀήρ'], [86, 'fire', 'πῦρ'], [112, 'the moon', 'σελήνη'], [140, 'the sun and planets', 'πλανώμενα'], [168, ''], [200, 'the fixed stars', 'ἀπλανῆ']];
    let b = '';
    rings.slice().reverse().forEach(([r, en], i) => { b += `<circle cx="250" cy="250" r="${r}" class="${r <= 30 ? 'fill' : r <= 86 ? 'ring faint' : 'ring'}"/>`; });
    b += `<line x1="250" y1="250" x2="470" y2="250" class="ln faint"/>`;
    rings.forEach(([r, en, gk], i) => {
      if (!en) return;
      const y = 60 + i * 52;
      b += `<line x1="${250 + r * 0.82}" y1="${250 - r * 0.57}" x2="520" y2="${y - 6}" class="ln hair"/><circle cx="${250 + r * 0.82}" cy="${250 - r * 0.57}" r="3" class="dot"/>`;
      b += t(530, y - 2, en, 'strong', 'start') + t(530, y + 18, gk, 'gk sm', 'start', 'grc');
    });
    b += t(250, 476, 'the sublunary world: earth, water, air, fire', 'sm mid');
    return svg(760, 500, b, 'The spheres of the heavens around the earth');
  };
  G.Cael.cap = 'The earth at rest at the centre, the four elements in their natural places, and the heavens moving in circles (<i>On the Heavens</i> I.2–3, II.14, IV.4).';

  // On Generation and Corruption: elements as pairs of qualities (II.3).
  G.GC = () => {
    const C = { top: [380, 50], right: [610, 250], bottom: [380, 450], left: [150, 250] };
    let b = `<polygon points="380,50 610,250 380,450 150,250" class="ln fillnone"/>`;
    b += `<line x1="380" y1="50" x2="380" y2="450" class="ln dash"/><line x1="150" y1="250" x2="610" y2="250" class="ln dash"/>`;
    const q = ([x, y], s, gk, dy) => `<circle cx="${x}" cy="${y}" r="6" class="dot-o"/>` + t(x, y + dy, s, 'cap') + t(x, y + dy + 18, gk, 'gk sm', 'middle', 'grc');
    b += q(C.top, 'hot', 'θερμόν', -30) + q(C.bottom, 'cold', 'ψυχρόν', 26) + q(C.left, 'wet', 'ὑγρόν', -30) + q(C.right, 'dry', 'ξηρόν', -30);
    const el = (x, y, s, gk) => `<circle cx="${x}" cy="${y}" r="9" class="dot"/>` + t(x + (x > 380 ? 22 : -22), y + 6, s, 'strong', x > 380 ? 'start' : 'end') + t(x + (x > 380 ? 22 : -22), y + 26, gk, 'gk sm', x > 380 ? 'start' : 'end', 'grc');
    b += el(495, 150, 'fire', 'πῦρ') + el(265, 150, 'air', 'ἀήρ') + el(265, 350, 'water', 'ὕδωρ') + el(495, 350, 'earth', 'γῆ');
    b += t(392, 244, 'contraries', 'sm mid', 'start');
    return svg(760, 500, b, 'The four elements and their qualities');
  };
  G.GC.cap = 'Each element a pair of qualities: fire hot and dry, air hot and wet, water cold and wet, earth cold and dry (<i>On Generation and Corruption</i> II.3, 330a30–b7).';

  // De Anima: the nutritive in the perceptive as the triangle in the quadrilateral (II.3).
  G.DA = () => {
    let b = `<rect x="150" y="60" width="300" height="300" class="ln fillnone strongln"/>`;
    b += `<polygon points="150,360 450,360 150,60" class="fillsoft"/><polygon points="150,360 450,360 150,60" class="ln fillnone"/>`;
    b += t(225, 300, 'nutritive', 'strong') + t(225, 320, 'θρεπτικόν', 'gk sm', 'middle', 'grc');
    b += t(372, 140, 'perceptive', 'strong') + t(372, 160, 'αἰσθητικόν', 'gk sm', 'middle', 'grc');
    b += t(520, 160, 'the triangle is in the', 'sm mid', 'start') + t(520, 180, 'quadrilateral, as the', 'sm mid', 'start') + t(520, 200, 'nutritive soul is in', 'sm mid', 'start') + t(520, 220, 'the perceptive', 'sm mid', 'start');
    b += t(300, 392, 'plants have the one; animals have both', 'sm mid');
    return svg(760, 410, b, 'The triangle in the quadrilateral');
  };
  G.DA.cap = '“As the triangle is present potentially in the quadrilateral, so the nutritive soul is in the perceptive” (<i>De Anima</i> II.3, 414b28–32).';

  // Metaphysics: said in many ways, in relation to one (Γ.2).
  G.Meta = () => {
    const wheel = (cx, center, cgk, spokes) => {
      let s = `<circle cx="${cx}" cy="210" r="54" class="ring"/>` + t(cx, 206, center, 'strong') + t(cx, 228, cgk, 'gk sm', 'middle', 'grc');
      spokes.forEach((lab, i) => {
        const a = (-90 + i * (360 / spokes.length)) * Math.PI / 180;
        const x1 = cx + Math.cos(a) * 54; const y1 = 210 + Math.sin(a) * 54;
        const x2 = cx + Math.cos(a) * 128; const y2 = 210 + Math.sin(a) * 128;
        s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="ln"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="5" class="dot"/>`;
        const lx = cx + Math.cos(a) * 146; const ly = 210 + Math.sin(a) * 146 + 5;
        s += t(lx.toFixed(1), ly.toFixed(1), lab, 'sm', Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end');
      });
      return s;
    };
    let b = wheel(200, 'health', 'ὑγίεια', ['what keeps it', 'what makes it', 'what signals it', 'what can have it']);
    b += wheel(580, 'substance', 'οὐσία', ['its affections', 'the way to it', 'its destructions', 'its qualities', 'what makes it']);
    b += t(390, 216, 'as', 'cap mid');
    return svg(780, 420, b, 'Healthy things are related to health, beings to substance');
  };
  G.Meta.cap = '“Being is said in many ways, but in relation to one thing”, as everything healthy is so called in relation to health (<i>Metaphysics</i> Γ.2, 1003a33–b10).';

  // Categories: the ten kinds, with Aristotle's own examples (4).
  G.Cat = () => {
    const rows = [['substance', 'οὐσία', 'man, horse'], ['quantity', 'ποσόν', 'two cubits long'], ['quality', 'ποιόν', 'white, grammatical'], ['relative', 'πρός τι', 'double, half, larger'], ['where', 'ποῦ', 'in the Lyceum'], ['when', 'ποτέ', 'yesterday, last year'], ['position', 'κεῖσθαι', 'is lying, is sitting'], ['having', 'ἔχειν', 'has shoes on, has armour on'], ['doing', 'ποιεῖν', 'cutting, burning'], ['being affected', 'πάσχειν', 'being cut, being burned']];
    let b = `<circle cx="70" cy="250" r="7" class="dot"/>` + t(58, 236, 'things said', 'cap mid', 'end') + t(58, 254, 'without', 'cap mid', 'end') + t(58, 272, 'combination', 'cap mid', 'end');
    b += `<line x1="70" y1="250" x2="140" y2="250" class="ln"/><line x1="140" y1="34" x2="140" y2="466" class="ln"/>`;
    rows.forEach(([en, gk, ex], i) => {
      const y = 34 + i * 48;
      b += `<line x1="140" y1="${y}" x2="176" y2="${y}" class="ln"/><circle cx="176" cy="${y}" r="4" class="dot-o"/>`;
      b += t(192, y + 6, gk, 'gk', 'start', 'grc') + t(300, y + 6, en, 'strong', 'start') + t(470, y + 6, ex, 'sm mid', 'start');
    });
    return svg(760, 490, b, 'The ten categories with examples');
  };
  G.Cat.cap = 'The ten kinds of thing said without combination, with Aristotle’s own examples (<i>Categories</i> 4, 1b25–2a4).';

  // Politics: the six constitutions (III.7).
  G.Pol = () => {
    const rows = [['one', 'kingship', 'βασιλεία', 'tyranny', 'τυραννίς'], ['few', 'aristocracy', 'ἀριστοκρατία', 'oligarchy', 'ὀλιγαρχία'], ['many', 'polity', 'πολιτεία', 'democracy', 'δημοκρατία']];
    let b = t(330, 34, 'for the common good', 'cap') + t(580, 34, 'for the rulers alone', 'cap mid');
    b += `<line x1="200" y1="52" x2="700" y2="52" class="ln"/><line x1="455" y1="52" x2="455" y2="400" class="ln dash"/>`;
    rows.forEach(([who, good, gg, bad, bg], i) => {
      const y = 112 + i * 108;
      b += t(170, y + 6, `rule of ${who}`, 'strong', 'end');
      b += `<circle cx="330" cy="${y - 14}" r="7" class="dot"/><circle cx="580" cy="${y - 14}" r="7" class="dot-o"/>`;
      b += t(330, y + 18, good, 'strong') + t(330, y + 40, gg, 'gk sm', 'middle', 'grc') + t(580, y + 18, bad, 'strong') + t(580, y + 40, bg, 'gk sm', 'middle', 'grc');
      if (i < 2) b += `<line x1="200" y1="${y + 62}" x2="700" y2="${y + 62}" class="ln faint"/>`;
    });
    return svg(760, 420, b, 'The six constitutions');
  };
  G.Pol.cap = 'Rule by one, by few or by many, for the common good or for the rulers’ own (<i>Politics</i> III.7, 1279a22–b10).';

  // Rhetoric: the three proofs (I.2).
  G.Rhet = () => {
    let b = `<polygon points="380,70 140,380 620,380" class="ln fillnone"/>`;
    const v = (x, y, en, gk, who, dy) => `<circle cx="${x}" cy="${y}" r="9" class="dot"/>` + t(x, y + dy, en, 'strong') + t(x, y + dy + 22, gk, 'gk sm', 'middle', 'grc') + t(x, y + dy + 42, who, 'sm mid');
    b += v(380, 70, 'character', 'ἦθος', 'in the speaker', -66);
    b += v(140, 380, 'emotion', 'πάθος', 'in the hearers', 34);
    b += v(620, 380, 'argument', 'λόγος', 'in the speech itself', 34);
    b += t(380, 270, 'persuasion', 'cap mid') + t(380, 290, 'πίστις', 'gk sm', 'middle', 'grc');
    return svg(760, 480, b, 'The three kinds of proof');
  };
  G.Rhet.cap = 'Three kinds of proof furnished by speech: the speaker’s character, the hearers’ emotion, the argument itself (<i>Rhetoric</i> I.2, 1356a1–4).';

  // Poetics: the six parts of tragedy, in order of importance (6).
  G.Poet = () => {
    const parts = [['plot', 'μῦθος', 'the first part, and the soul of tragedy'], ['character', 'ἤθη', ''], ['thought', 'διάνοια', ''], ['diction', 'λέξις', ''], ['song', 'μελοποιία', ''], ['spectacle', 'ὄψις', 'the least artistic']];
    let b = `<line x1="120" y1="46" x2="120" y2="${46 + 5 * 66}" class="ln"/>`;
    parts.forEach(([en, gk, note], i) => {
      const y = 46 + i * 66;
      b += `<circle cx="120" cy="${y}" r="${i === 0 ? 13 : 7 - i * 0.6}" class="${i === 0 ? 'dot' : 'dot-o'}"/>`;
      b += t(156, y + 6, en, i === 0 ? 'strong big' : 'strong', 'start') + t(320, y + 6, gk, 'gk', 'start', 'grc') + (note ? t(450, y + 6, note, 'sm mid', 'start') : '');
    });
    return svg(760, 400, b, 'The six parts of tragedy');
  };
  G.Poet.cap = 'The six parts of tragedy, in Aristotle’s order of importance (<i>Poetics</i> 6, 1450a7–b20).';

  // Isagoge: Porphyry's tree.
  G.Isa = () => {
    const trunk = [['οὐσία', 'substance'], ['σῶμα', 'body'], ['ἔμψυχον σῶμα', 'living body'], ['ζῷον', 'animal'], ['λογικὸν ζῷον', 'rational animal'], ['ἄνθρωπος', 'human being']];
    const left = ['σωματική', 'ἔμψυχος', 'αἰσθητική', 'λογική'];
    const right = ['ἀσώματος', 'ἄψυχος', 'ἀναίσθητος', 'ἄλογος'];
    let b = `<line x1="380" y1="40" x2="380" y2="${40 + 5 * 70}" class="ln strongln"/>`;
    trunk.forEach(([gk, en], i) => {
      const y = 40 + i * 70;
      b += `<rect x="300" y="${y - 20}" width="160" height="40" class="box"/>` + t(380, y + 2, gk, 'gk', 'middle', 'grc') + t(380, y + 16, en, 'xs mid');
      if (i < 4) {
        const yy = y + 35;
        b += `<line x1="300" y1="${yy}" x2="210" y2="${yy}" class="ln"/><line x1="460" y1="${yy}" x2="550" y2="${yy}" class="ln dash"/>`;
        b += t(200, yy + 5, left[i], 'gk sm', 'end', 'grc') + t(560, yy + 5, right[i], 'gk sm mid', 'start', 'grc');
      }
    });
    const y = 40 + 5 * 70 + 40;
    b += `<line x1="380" y1="${y - 20}" x2="300" y2="${y + 14}" class="ln"/><line x1="380" y1="${y - 20}" x2="460" y2="${y + 14}" class="ln"/>`;
    b += `<circle cx="300" cy="${y + 14}" r="5" class="dot"/><circle cx="460" cy="${y + 14}" r="5" class="dot"/>` + t(300, y + 40, 'Σωκράτης', 'gk', 'middle', 'grc') + t(460, y + 40, 'Πλάτων', 'gk', 'middle', 'grc');
    b += t(200, 30, 'differences taken', 'cap mid', 'end') + t(560, 30, 'differences set aside', 'cap mid', 'start');
    return svg(760, y + 60, b, 'The tree of Porphyry');
  };
  G.Isa.cap = 'Porphyry’s tree: from substance down to Socrates, each genus divided by a pair of differences (<i>Isagoge</i>, Busse 4–5).';

  // History of Animals: blooded and bloodless (I.6, IV.1).
  G.HA = () => {
    const groups = [['blooded', 'ἔναιμα', ['human beings', 'live-bearing four-footed animals', 'egg-laying four-footed animals', 'birds', 'fishes', 'whales and dolphins']], ['bloodless', 'ἄναιμα', ['cephalopods', 'crustaceans', 'testaceans', 'insects']]];
    let b = `<circle cx="70" cy="230" r="7" class="dot"/>` + t(62, 214, 'animals', 'strong', 'end') + t(62, 254, 'ζῷα', 'gk sm', 'end', 'grc');
    b += `<line x1="70" y1="230" x2="120" y2="230" class="ln"/><line x1="120" y1="120" x2="120" y2="370" class="ln"/>`;
    let y0 = 40;
    groups.forEach(([en, gk, kids], gi) => {
      const ys = kids.map((_, i) => y0 + i * 40);
      const ym = (ys[0] + ys[ys.length - 1]) / 2;
      b += `<line x1="120" y1="${gi === 0 ? 120 : 370}" x2="170" y2="${gi === 0 ? 120 : 370}" class="ln"/>`;
      b += `<circle cx="178" cy="${gi === 0 ? 120 : 370}" r="5" class="dot-o"/>` + t(196, (gi === 0 ? 120 : 370) - 2, en, 'strong', 'start') + t(196, (gi === 0 ? 120 : 370) + 18, gk, 'gk sm', 'start', 'grc');
      b += `<line x1="300" y1="${gi === 0 ? 120 : 370}" x2="340" y2="${gi === 0 ? 120 : 370}" class="ln"/><line x1="340" y1="${ys[0]}" x2="340" y2="${ys[ys.length - 1]}" class="ln"/>`;
      ys.forEach((y, i) => { b += `<line x1="340" y1="${y}" x2="370" y2="${y}" class="ln"/>` + t(382, y + 5, kids[i], 'sm', 'start'); });
      y0 += kids.length * 40 + 30;
    });
    return svg(760, y0 - 10, b, 'The division of animals into blooded and bloodless');
  };
  G.HA.cap = 'Animals divided into blooded and bloodless, and these into their great kinds (<i>History of Animals</i> I.6, IV.1).';

  G.has = (id) => typeof G[id] === 'function';
  G.count = () => Object.keys(G).filter((k) => typeof G[k] === 'function' && k !== 'has' && k !== 'count').length;
})();
