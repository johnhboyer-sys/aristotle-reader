
// ── round 2 ──
// English of Moerbeke's Latin: a literal working draft for the mockup (one entry per MOER sentence).
const MOER_EN = [
 'Holding <span data-t="not">knowledge</span> to be among <span data-t="bon">good and honourable things</span>, and one more than another, either <span data-t="cert">by its certainty</span>, or because it is of <span data-t="mel">better</span> and <span data-t="mir">more wonderful</span> things: <span data-t="utr">for both these reasons</span> we shall reasonably place <span data-t="hist">the history of the soul</span> <span data-t="prim">among the first</span>.',
 '<span data-t="vid1">Knowledge of it also seems to contribute much toward all truth</span>, and most of all toward nature.',
 'For it is <span data-t="tamq">as it were</span> <span data-t="princ">the principle of animals</span>.',
 '<span data-t="inq">We seek</span> <span data-t="cons">to consider</span> <span data-t="cogn">and to know</span> its nature and substance, and <span data-t="acc">then whatever happens about it</span>. Of these, some seem to be passions proper to the soul, others common, and present in animals because of it.',
 '<span data-t="omn">Altogether and in every way it is among the most difficult things</span> to gain any assurance about it.',
 'For since the question is common to many other things (I mean the question about substance and about what a thing is), perhaps it will seem to someone that there is one method for all things whose substance we wish to know, as there is demonstration of proper accidents; so that this method would have to be sought.',
 'But if there is no one common method for what a thing is, it is still more difficult to proceed. For about each thing one will have to grasp what the way is.',
 'And if it is clear whether it is some demonstration, or division, or some other method as well, it still holds many doubts and errors as to the things from which one must seek. For different things have different principles, as numbers and planes do.',
 '<span data-t="prim2">First, perhaps,</span> it is necessary to determine in which of the genera it is, and what it is. I mean whether it is a this-something and a substance, or a quality, or a quantity, or some other of the categories that have been distinguished.',
 'Further, whether it is among the things that are in potency, or rather a certain endelechia: for this makes no small difference.',
 'One must also consider whether it is divisible or indivisible, and whether every soul is of like species or not; and if not of like species, whether it differs in species or in genus.',
 'For as it is, those who speak and inquire about the soul seem to attend to the human soul only.',
 'One must take care that it not escape notice whether there is one account of it, as of animal, or a different one for each: as of horse, dog, man, or <span data-t="dei">God</span>.',
 '<span data-t="univ">But animal as a universal is either nothing or posterior</span>. And likewise if any other common thing is predicated.',
 '<span data-t="ampl">Further</span>, also if there are not many souls but parts, whether one ought to seek the whole soul first, or the parts. And it is difficult to determine which parts are by nature other from one another.',
 'And whether one ought to seek the parts first, or their works: as understanding or the intellective, and sensing or the sensitive; and likewise in the others. And if the works first, someone will again be puzzled whether their objects should be sought first, as the sensible before the sensitive, and the intelligible before the intellective.',
 '<span data-t="vid2">It seems</span> that not only is knowing what a thing is useful for knowing the causes of the accidents in substances, as in mathematics what straight is and what curved, and what a line and what a plane, for knowing to how many right angles the angles of a triangle are equal; but also, conversely, the accidents contribute a great part to knowing what a thing is.',
 'For when we are able to give an account, according to imagination, of the accidents, either all or most, then we shall also be able to say something about the substance in the best way.',
 'For the principle of every demonstration is what a thing is. So that by whatever definitions it does not happen that the accidents are known, nor even that it is easy to conjecture about them, it is clear that they have all been stated dialectically and emptily.'
];

// Numbered text units (Dumb Ox style): one per leaf of Aquinas's division in lectio 1.
// start = the lemma target that opens the unit in the Greek; m = Moerbeke sentence indices.
const SEG_DEF = [
 {n:1, leaf:'dign1', start:null,    m:[0]},
 {n:2, leaf:'util',  start:'vid1',  m:[1,2]},
 {n:3, leaf:'ord',   start:'inq',   m:[3]},
 {n:4, leaf:'mod',   start:'omn',   m:[4,5,6,7]},
 {n:5, leaf:'gen',   start:'prim2', m:[8,9,10,11,12,13]},
 {n:6, leaf:'part',  start:'ampl',  m:[14,15]},
 {n:7, leaf:'adj',   start:'vid2',  m:[16,17,18]}
];

// Aquinas's division of the whole work. Prooemium = the lectio-1 tree (DIV).
// Book I below "Treatise" is read from each lectio's opening sentence in Parma (Latin heads are his words,
// lightly cut); Books II–III have only the two levels his Book II, lectio 1 states.
DIV.lec = 'I.1–2';
DIV.kids.find(k => k.id === 'diff').lec = 'I.1–2';   // its second part, the attributes, is lectio 2
const WORK = {id:'work', la:'Sententia libri De anima', en:'On the Soul', r:['402a1','435b25'], lec:'I.1–III.18', kids:[DIV,
 {id:'tract', la:'Prosequitur tractatum secundum ordinem promissum', en:'The treatise', r:['403b24','435b25'], lec:'I.3–III.18', said:'I.3', kids:[
  {id:'ali', la:'De natura animae secundum opinionem aliorum', en:'The soul as others held it', r:['403b24','411b30'], lec:'I.3–14', kids:[
   {id:'narr', la:'Narrat opiniones', en:'Their opinions set out', r:['403b24','405b30'], lec:'I.3–5', kids:[
    {id:'motu', la:'Qui venerunt in cognitionem animae per motum', en:'Those who knew the soul by motion', r:['403b24','404b7'], lec:'I.3'},
    {id:'sens', la:'Qui per sensum seu cognitionem', en:'Those who knew it by sensing and knowing', r:['404b8','404b29'], lec:'I.4'},
    {id:'elem', la:'Qui animam unum elementorum esse existimaverunt', en:'The soul as one of the elements', r:['404b30','405b30'], lec:'I.5'}]},
   {id:'inq2', la:'Inquirit de opinionibus, ibi «Considerandum est autem»', en:'Their opinions examined', r:['405b31','411b30'], lec:'I.6–14', kids:[
   {id:'cmot', la:'Contra opiniones secundum quas anima est principium motus', en:'Against the soul as source of motion', r:['405b31','409b18'], lec:'I.6–11', kids:[
    {id:'motc', la:'Rationes in communi contra eos qui posuerunt animam moveri', en:'Against a soul that moves: in general', r:['405b31','406b14'], lec:'I.6'},
    {id:'mots', la:'Rationes in speciali: Democritus, Plato', en:'In particular: Democritus and Plato', r:['406b15','407a1'], lec:'I.7'},
    {id:'plat', la:'Reprobat opinionem Platonis', en:'Plato refuted', r:['407a2','407b26'], lec:'I.8'},
    {id:'harm', la:'Opinio quod anima sit harmonia', en:'The soul as a harmony', r:['407b27','408a33'], lec:'I.9'},
    {id:'pers', la:'Qui animam per se moveri existimaverunt', en:'A soul moved of itself', r:['408a34','408b31'], lec:'I.10'},
    {id:'numr', la:'Numerus seipsum movens', en:'A self-moving number', r:['408b32','409b18'], lec:'I.11'}]},
   {id:'ccog', la:'Contra eos qui posuerunt ipsam esse principium cognitionis, ibi «Tribus autem modis traditis»', en:'Against the soul as source of knowing', r:['409b19','411a26'], lec:'I.12–13', kids:[
    {id:'empd', la:'Empedocles: ex omnibus elementis, ut omnia cognoscat', en:'Empedocles: of all the elements, to know all', r:['409b19','411a6'], lec:'I.12'},
    {id:'inel', la:'Ex incidenti: animam esse in elementis', en:'In passing: soul in the elements', r:['411a7','411a26'], lec:'I.13'}]},
   {id:'dubs', la:'Movet quamdam quaestionem, ibi «Quoniam autem cognoscere animae est»', en:'A question: one soul, or parts?', r:['411a26','411b30'], lec:'I.14'}]}]},
  {id:'ver', la:'Secundum propriam opinionem et veritatem', en:'The soul as it truly is', r:['412a3','435b25'], lec:'II.1–III.18', said:'II.1', kids:[
   {id:'quid', la:'Quid est anima', en:'What the soul is', r:['412a3','414a28'], lec:'II.1–4'},
   {id:'pot', la:'De partibus sive potentiis, ibi «Potentiarum autem animae»', en:'Its parts or powers', r:['414a29','435b25'], lec:'II.5–III.18', kids:[
    {id:'potc', la:'De potentiis in communi', en:'The powers in general', r:['414a29','415a22'], lec:'II.5–6'},
    {id:'pots', la:'De singulis, primo de vegetativa', en:'Each power in turn', r:['415a23','435b25'], lec:'II.7–III.18'}]}]}]}]};

// Lectio and book starts used as rules. Checked 2026-11-04 against Parma's Moerbeke incipits, the Greek line
// that holds each incipit's first word, and the Foster–Humphries ranges on isidore.co.
const RULES = [
 {key:'402a1',  label:'Book I · Lectio 1', at:'work'},
 {key:'403a3',  label:'Lectio 2'}, {key:'403b24', label:'Lectio 3'}, {key:'404b8', label:'Lectio 4'}, {key:'404b30', label:'Lectio 5'},
 {key:'405b31', label:'Lectio 6'}, {key:'406b15', label:'Lectio 7'}, {key:'407a2', label:'Lectio 8'}, {key:'407b27', label:'Lectio 9'},
 {key:'408a34', label:'Lectio 10'}, {key:'408b32', label:'Lectio 11'}, {key:'409b19', label:'Lectio 12'}, {key:'411a7', label:'Lectio 13'},
 {key:'411a26', label:'Lectio 14'}, {key:'412a3', label:'Book II · Lectio 1'}, {key:'414a29', label:'Lectio 5'}, {key:'415a23', label:'Lectio 7'}
];

// Moerbeke's Greek, lectio 1: places where his Latin implies a Greek other than Ross's (the site's text).
// Inferred by reading the Latin against the Greek word by word (Claude), then checked by a second reader
// (GPT-6.1-Sol, 2026-11-04), which dropped two first-draft entries (περί at 402a3; endelechia, a spelling
// Latin inherited) and added two (aliqua 402a19, et si 402b9). NOT checked against Ross's or Gauthier's
// apparatus. g = [line, Ross's words, implied words]; m / en = [Moerbeke sentence, words].
// grade: strong = the Latin has a word nothing in Ross accounts for, and its order agrees; likely = the
// Latin points one way but a translator could have made it so; slight = a small word (καί, τι, ἤ) the
// Latin has and Ross lacks, which Latin could supply unprompted.
const MGK = [
 {id:'koina', grade:'strong',
  g:[['402a9',"τὰ δὲ δι'",'τὰ δὲ κοινὰ'],['402a10','ἐκείνην καὶ τοῖς ζῴοις ὑπάρχειν',"καὶ τοῖς ζῴοις δι' ἐκείνην ὑπάρχειν"]],
  m:[[3,'aliae autem communes, et animalibus propter illam inesse']], en:[[3,'others common, and present in animals because of it']],
  app:{ross:"δι' ἐκείνην καὶ τοῖς ζῴοις", imp:"κοινὰ καὶ τοῖς ζῴοις δι' ἐκείνην", la:'communes, et animalibus propter illam'},
  why:'Nothing in Ross stands behind <i>communes</i>, and <i>propter illam</i> comes after <i>animalibus</i>, where Moerbeke, who mostly keeps the Greek order, would have put δι᾽ ἐκείνην first. The Latin implies κοινά and the other order.',
  aq:8, aqnote:'Aquinas builds on it: some attributes belong <i>communiter animalibus</i> through the soul.'},
 {id:'kai', grade:'slight',
  g:[['402a10','πάντῃ δὲ πάντως','πάντῃ δὲ καὶ πάντως']], m:[[4,'Omnino autem et penitus']], en:[[4,'Altogether and in every way']],
  app:{ross:'πάντῃ δὲ πάντως', imp:'πάντῃ δὲ καὶ πάντως', la:'omnino autem et penitus'},
  why:'<i>Et</i> may stand for a καί that Ross does not print, or Moerbeke may have joined the two adverbs himself.',
  aq:2, aqnote:'Aquinas quotes the lemma with <i>et</i>.'},
 {id:'aliqua', grade:'slight',
  g:[['402a19','ἀπόδειξίς','ἀπόδειξίς τίς']], m:[[7,'demonstratio aliqua']], en:[[7,'some demonstration']],
  app:{ross:'ἀπόδειξίς ἐστιν', imp:'ἀπόδειξίς τίς ἐστιν', la:'demonstratio aliqua sit'},
  why:'<i>Aliqua</i> may stand for a τις that Ross does not print, or be the translator’s own.'},
 {id:'aut', grade:'slight',
  g:[['402b7','ἀνθρώπου, θεοῦ','ἀνθρώπου ἢ θεοῦ']], m:[[12,'hominis, aut ']], en:[[12,'man, or ']],
  app:{ross:'ἀνθρώπου, θεοῦ', imp:'ἀνθρώπου ἢ θεοῦ', la:'hominis, aut Dei'},
  why:'<i>Aut</i> before <i>Dei</i>, where Ross has none. It may stand for ἤ, or simply close the list in Latin.',
  aq:12, aqnote:'Aquinas keeps <i>aut Dei</i> and explains <i>Dei</i>: the heavenly bodies were thought gods.'},
 {id:'etsi', grade:'slight',
  g:[['402b9','ἔτι δέ, εἰ','ἔτι δὲ καὶ εἰ']], m:[[14,'et si non']], en:[[14,'also if']],
  app:{ross:'ἔτι δέ, εἰ', imp:'ἔτι δὲ καὶ εἰ', la:'amplius autem et si'},
  why:'<i>Et</i> before <i>si</i> may stand for a καί that Ross does not print, as with the <i>et</i> at 402a10.'},
 {id:'nous', grade:'likely',
  g:[['402b13','τὸν νοῦν','τὸ νοητικόν'],['402b16','τοῦ νοῦ','τοῦ νοητικοῦ']],
  m:[[15,'intellectivum'],[15,'intellectivo']], en:[[15,'or the intellective'],[15,'before the intellective']],
  app:{ross:'τὸν νοῦν … τοῦ νοῦ', imp:'τὸ νοητικόν … τοῦ νοητικοῦ', la:'intellectivum … intellectivo'},
  why:'Moerbeke turns νοῦς into <i>intellectus</i>. <i>Intellectivum</i>, matched with <i>sensitivum</i> (τὸ αἰσθητικόν), suggests an adjective in -ικόν, such as τὸ νοητικόν, in both places. But a translator or a copyist could have made the pair match; the critical Latin text would settle what Moerbeke wrote.',
  aq:14, aqnote:'Aquinas builds on it: the soul’s potential parts are the intellective, the sensitive and the vegetative (though he also writes <i>intellectum</i> once).'},
 {id:'linea', grade:'slight',
  g:[['402b19','ἢ τί γραμμὴ','καὶ τί γραμμὴ']], m:[[16,'et quid linea']], en:[[16,'and what a line']],
  app:{ross:'ἢ τί γραμμὴ', imp:'καὶ τί γραμμὴ', la:'et quid linea'},
  why:'<i>Et</i> where Ross has ἤ. It may stand for καί, or come from recasting the list in Latin.'},
 {id:'ti', grade:'slight',
  g:[['402b25','λέγειν κάλλιστα','λέγειν τι κάλλιστα']], m:[[17,'dicere aliquid optime']], en:[[17,'say something']],
  app:{ross:'λέγειν κάλλιστα', imp:'λέγειν τι κάλλιστα', la:'dicere aliquid optime'},
  why:'<i>Aliquid</i> may stand for a τι that Ross does not print, or give <i>dicere</i> the object Latin wants.'}
];

// Aquinas's own parts: the opening of a lectio, where he sets out the division. It is one run of text
// (in lectio 1, his preface, n. 1, runs straight into the division, n. 2) and not a row of the division.
// at = the lectio start it follows. Parma prints n. 1 after the lectio 1 heading and Moerbeke's text.
const AQ_OWN = [
 {id:'own-l1', n:[1,2], at:'402a1', en:'Division of the text', divides:'proem'}
];

// Aristotle's chapters as the site prints them (build/dist/DA/chapters.json): [book, chapter, first line]
const CH = [[1,1,"402a1"],[1,2,"403b20"],[1,3,"405b31"],[1,4,"407b27"],[1,5,"409a31"],[2,1,"412a3"],[2,2,"413a11"],[2,3,"414a29"],[2,4,"415a14"],[2,5,"416b32"],[2,6,"418a7"],[2,7,"418a26"],[2,8,"419b4"],[2,9,"421a7"],[2,10,"422a8"],[2,11,"422b17"],[2,12,"424a17"],[3,1,"424b22"],[3,2,"425b12"],[3,3,"427a17"],[3,4,"429a10"],[3,5,"430a10"],[3,6,"430a26"],[3,7,"431a1"],[3,8,"431b20"],[3,9,"432a15"],[3,10,"433a9"],[3,11,"433b31"],[3,12,"434a22"],[3,13,"435a11"]];

// Sentence rows of the Aristotle column, lectio 1: one of Moerbeke's sentences (MOER index) with the Greek and
// Smith's English that answer it. Ross's Greek sometimes has only a comma where Moerbeke starts a sentence,
// and Smith sometimes runs two of Moerbeke's sentences together with a comma, colon or semicolon: the row
// is cut there, or two sentences make one row. g = [line, first Greek words]; e = Smith's first words.
const SENT_DEF = [
 {m:[0],     g:['402a1','Τῶν καλῶν'],             e:'Holding as we do'},
 {m:[1,2],   g:['402a4','δοκεῖ δὲ καὶ'],          e:'The knowledge of the soul admittedly'},
 {m:[3],     g:['402a7','ἐπιζητοῦμεν'],           e:'Our aim is to grasp'},
 {m:[4],     g:['402a10','πάντῃ δὲ πάντως'],      e:'To attain any assured'},
 {m:[5],     g:['402a11','καὶ γάρ, ὄντος'],       e:'As the form of question'},
 {m:[6],     g:['402a16','εἰ δὲ μὴ ἔστι μία'],    e:'But if there is no such single'},
 {m:[7],     g:['402a19','ἐὰν δὲ φανερὸν'],       e:'If to this there be a clear answer'},
 {m:[8],     g:['402a23','πρῶτον'],               e:'First, no doubt'},
 {m:[9],     g:['402a25','ἔτι δὲ πότερον'],       e:'Further, does soul belong'},
 {m:[10],    g:['402b1','σκεπτέον δὲ'],           e:'We must consider also'},
 {m:[11],    g:['402b3','νῦν μὲν γὰρ'],           e:'up to the present time'},
 {m:[12,13], g:['402b5','εὐλαβητέον'],            e:'We must be careful'},
 {m:[14],    g:['402b9','ἔτι δέ, εἰ μὴ'],         e:'Further, if what exists'},
 {m:[15],    g:['402b11','καὶ πότερον'],          e:'Again, which ought we'},
 {m:[16],    g:['402b16','ἔοικε'],                e:'It seems not only useful'},
 {m:[17],    g:['402b22','ἐπειδὰν γὰρ'],          e:'for, when we are able'},
 {m:[18],    g:['402b25','πάσης γὰρ'],            e:'in all demonstration a definition'}
];
