# H · Plates: sources for the later set (prints of about 1700–1870)

The later set is the default variant (`later`, labelled 1700–1900). It gives a
plate to the home page and all 41 works. Every print is public domain or
CC0. Each line below gives the work, the line of Aristotle (or Porphyry) the
plate shows with its Bekker (or Busse) number and translator, then the print:
maker, title, date, medium, holder, licence, and where the file came from.

Lines were checked against the repository's translations in
`/home/user/aristotle-reader/sources/` (read only). Bekker numbers come from the
repository's anchors (`anchors.yaml`, every fifth line); where a passage falls
between anchors the number is the anchor at or just before it, or the standard
line. The Isagoge is cited by Busse page and line, as the site numbers it.

## Rebuilding

Downloads were kept outside the module, in `KIT/out/h7dl/` (the originals in
`full/`). Rebuild with H’s own recipe:

```
python3 -I tools/mkspec-later.py tools/plates-later.json     # crops and ink settings
H_SET=later H_DL=<downloads>/full python3 -I tools/prep.py all
```

`prep.py` is H's first-set recipe with three additions that leave the first set
unchanged: `H_SET=later` reads `plates-later.json` and writes `img/later/`;
`chan: "max"` reads a hand-coloured print by its brightest channel, so the wash
drops out and the printed line stays; `deskFit/phoneFit: "contain"` with `pad`
fits a long subject whole on bare paper. Files are 1280×914 (desk) and 640×558
(phone), home 1280×1158 and 640×706, JPEG quality 74 for line work and 64 for
dense or tonal prints. Total 15.9 MB for 42 plates (desk 12.0, phone 3.9).

`pos` (in `script.js`) marks night scenes and dark grounds that keep their
darks in dark mode: home, APo, Cael, GC, Mete, Insomn, EE, DM.

## The plates

| Work | Line | Print | Holder, licence | Source |
|---|---|---|---|---|
| home | — | Samuele Jesi, *Aristotle*, after the ancient bust, early 19th century, line engraving ("S. Jesi del. et sculp.", "per Dalla Libera") | Wellcome Collection, public domain (PDM) | wellcomecollection.org/works/fevwmpdw (V0000202) |
| Cat | Categories 5, 2a11, tr. Edghill: "…for instance, the individual man or horse." | Théodore Géricault, *Dappled Horse*, 1823, lithograph | The Met 358041, CC0 | metmuseum.org/art/collection/search/358041 |
| Int | De Interpretatione 9, 19a30, tr. Edghill: "A sea-fight must either take place to-morrow or not…" | Balthasar Friedrich Leizelt after Richard Paton, *Combat mémorable entre le Pearson et Paul Jones*, Augsburg, 1779, etching | Library of Congress, no known restrictions (public domain) | loc.gov/item/00651172 (master TIFF pga 07337) |
| Isa | Porphyry, Isagoge 5, 12a26 (Busse 12.26), tr. Owen: "To sleep is a separable accident, but to be black happens inseparably to a crow … we may possibly indeed conceive a white crow." | Anonymous English engraver, *Kentish Crow*, undated (early 19th century by its lettering and style), engraving coloured by hand | Wellcome Collection, public domain (PDM) | works/begxbfsn (V0022262EL) |
| APr | Prior Analytics II.21, 67a35, tr. Jenkinson: "…knowing that every mule is sterile and that this is a mule, and thinking that this animal is with foal." | Robert Hills, *A Mule*, London, 1 January 1810, etching | Wellcome Collection, public domain (PDM) | works/g8nc9qz3 (V0020695) |
| APo | Posterior Analytics II.2, 90a16, tr. Owen: "What is an eclipse? a privation of light from the moon through the interposition of the earth." | Amédée Guillemin, drawn by P. Lackerbauer, *The Heavens*, plate IV, total and partial eclipses of the moon, London, 1867, colour print | University of California Libraries via the Internet Archive, public domain | archive.org/details/heavensillustrat00guil, leaf n224 |
| Top | Topics VIII.14, 164a12, tr. Pickard-Cambridge: "You should display your training in inductive reasoning against a young man, in deductive against an expert." | Hall after James Gwyn, plate 23 of Domenico Angelo, *The School of Fencing*, London, February 1763, engraving | Wellcome Collection, public domain (PDM) | works/eg3dcvc9 (V0040493) |
| SE | Sophistical Refutations 1, 164b24, tr. Pickard-Cambridge: "Some things are really silver and others gold, while others are not and merely seem to be such to our sense; e.g. things made of litharge and tin seem to be of silver." | Charles Combe, *Nummorum veterum populorum et urbium qui in Museo Gulielmi Hunter asservantur*, plate of the coins of Syracuse (coin IX, both faces), London, 1782, engraving | Getty Research Institute via the Internet Archive, public domain | archive.org/details/gri_33125010866735, leaf n580 |
| Phys | Physics II.8, 199a26, tr. Hardie and Gaye: "If then it is both by nature and for an end that the swallow makes its nest and the spider its web … it is plain that this kind of cause is operative in things which come to be and are by nature." | J. Pass after Johann Eberhard Ihle, *Aranea: the Fasciata, or Barbary Spider*, London (J. Wilkes), 1 April 1796, etching | Wellcome Collection, public domain (PDM) | works/xps9wtu7 (V0022392) |
| Cael | On the Heavens II.11, 291b20, tr. Stocks: "For how else should the moon as it waxes and wanes show for the most part a crescent-shaped or gibbous figure, and only at one moment a half-moon?" | E. Salle, *The Full Moon*, plate VIII of Guillemin, *The Heavens*, London, 1867, engraving | University of California Libraries via the Internet Archive, public domain | heavensillustrat00guil, leaf n175 |
| GC | On Generation and Corruption II.11, 338b6, tr. Joachim: "It must rain if there is to be a cloud and, conversely, there must be a cloud if it is to rain." | Henry Chawner Shenton after Luke Clennell, *A Thunderstorm* (rain beating down on travellers in a mountain pass), early 19th century, engraving | Wellcome Collection, public domain (PDM) | works/me2wz7ve (V0025776) |
| Mete | Meteorology I.7, 344a34, tr. Webster: "Such is a comet: like a shooting-star that contains its beginning and end in itself." | Anonymous, *Grand Meteoric Phenomenon: the Comet*, London, 1860, wood engraving | Wellcome Collection, public domain (PDM) | works/drxb3h2a (V0024750) |
| DA | De Anima III.8, 432a1, tr. Smith: "The soul is analogous to the hand; for as the hand is a tool of tools, so the mind is the form of forms…" | Nicolas-Henri Jacob, the hand (plate 122) from Bourgery and Jacob, *Traité complet de l'anatomie de l'homme*, Paris, C. A. Delaunay, 1831–54, lithograph | Wellcome Collection, public domain (PDM) | works/uwtygeqt (V0008438) |
| Sens | Sense and Sensibilia 2, 437b26, tr. Beare (Empedocles quoted): "As when one who purposes going abroad prepares a lantern, a gleam of fire blazing through the stormy night…" | H. Roux the elder, *Herculanum et Pompéi*, vol. VII, bronzes, plate 62 (bronze lantern found at Herculaneum in 1760), Paris, 1840, printed 1861, engraving | Getty Research Institute via the Internet Archive, public domain | archive.org/details/herculanumetpomp07barr, leaf n331 |
| Mem | On Memory 1, 450a31, tr. Beare: "…stamps in, as it were, a sort of impression of the percept, just as persons do who make an impression with a seal." | Rudolf Erich Raspe, *A Descriptive Catalogue of a General Collection of Ancient and Modern Engraved Gems… cast by James Tassie*, plate LV, London, 1791, engraving | Boston Public Library via the Internet Archive, public domain | archive.org/details/descriptivecatal02rasp, leaf n495 |
| Somn | On Sleep 3, 457a4, tr. Beare: "Extreme youth also has this effect; infants, for example, sleep a great deal." | Dominique Vivant Denon, *Head of a Sleeping Child*, 1765–1825, etching | The Met 639568, CC0 | metmuseum.org/art/collection/search/639568 |
| Insomn | On Dreams 3, 462a16, tr. Beare: "The dream is a sort of presentation, and, more particularly, one which occurs in sleep." | Martin Johann Schmidt after Henry Fuseli, *The Night Mare*, after 1781, stipple engraving | Wellcome Collection, public domain (PDM) | works/wu5yny24 (V0016637) |
| DivSomn | On Divination in Sleep 2, 463b12, tr. Beare: "Forasmuch as certain of the lower animals also dream, it may be concluded that dreams are not sent by God…" | Cornelis Ploos van Amstel, *Sleeping Dog*, 1777, etching | The Met 414165, CC0 | metmuseum.org/art/collection/search/414165 |
| Long | On Length and Shortness of Life 4, 466a13, tr. Ross: "…e.g. man and elephant." | Johann Heinrich Tischbein the Younger, *A Young Elephant* ("Elefant in der Castellschen Menagerie, nach dem Leben gezeichnet"), late 18th century (Met: n.d.), etching and aquatint | The Met 352393, CC0 | metmuseum.org/art/collection/search/352393 |
| Juv | On Youth, Old Age, Life and Death, and Respiration 18 (Respiration 12), 476b13, tr. Ross: "Examples of such animals are dolphins and whales, and all others that have a blowhole…" | Frederick Polydore Nodder, *A Whale*, London, F. P. Nodder & Co., 1 March 1793, engraving | Wellcome Collection, public domain (PDM) | works/pvc29xr6 (V0021593) |
| HA | History of Animals II.11, 503b2, tr. Thompson: "The change in its colour takes place when it is inflated with air…" | Anonymous English engraver, *Cameleon* ("1st Figure"), undated (about 1800 by style), etching | Wellcome Collection, public domain (PDM) | works/tjdwqpe7 (V0022468) |
| PA | Parts of Animals II.16, 658b35, tr. Ogle: "For the elephant uses its nostril as a hand…" | Jean-Pierre Houël, *Histoire naturelle des deux éléphans du Muséum de Paris*, plate XV, Paris, 1803, etching and engraving | The Met 351833, CC0 | metmuseum.org/art/collection/search/351833 |
| IA | Progression of Animals 14, 712b13, tr. Farquharson: "Even crabs move in this way … it is the only animal that moves not forwards, but obliquely." | Anonymous English engraver, red mottled crab (*Pagurus maculatus*), upper figure, undated (about 1800 by style), etching and engraving | Wellcome Collection, public domain (PDM) | works/jweqd3c5 (V0022034) |
| MA | Movement of Animals 3, 699a27, tr. Farquharson: "And the mythologists with their fable of Atlas setting his feet upon the earth appear to have based the fable upon intelligent grounds. They make Atlas a kind of diameter twirling the heavens about the poles." (The chapter's point, 698b12–15: what moves must support itself on something outside it that does not move.) | Pieter Schenk ("…nk sculp.") after G. van Houten ("G. Van Houten fec."), title print for Louis Renard, *Atlas van zeevaert en koophandel door de geheele weereldt*, Amsterdam, R. and J. Ottens, 1725–45 (Rijksmuseum's dating), engraving. The museum's description: Atlas "carries the celestial sphere on his shoulders"; cut to the sphere and Atlas beneath it | Rijksmuseum, Amsterdam, RP-P-1878-A-1065, public domain | id.rijksmuseum.nl/200394457 (image iiif.micr.io/xWLMx) |
| GA | Generation of Animals III.10, 760b31, tr. Platt: "Credit must be given rather to observation than to theories…" | H. Summons, *Bee* (honeycomb with brood, one figure of the plate), London, Richards & Co., early 19th century, engraving | Wellcome Collection, public domain (PDM) | works/s47ncrek (V0025727) |
| Meta | Metaphysics I.1, 980a21, tr. Ross: "All men by nature desire to know…" | Thomas Milton, *Anatomy: organs of sense, the eye*, plate I (figure I), London, Longman, Hurst, Rees & Orme, 1 January 1809, engraving | Wellcome Collection, public domain (PDM) | works/ujrhdw8w (V0008055FA) |
| EN | Nicomachean Ethics I.7, 1098a18, tr. Ostwald: "One swallow does not make a spring…" | Josiah Wood Whymper, *The Swallow*, London, SPCK, mid-19th century, wood engraving coloured by hand | Wellcome Collection, public domain (PDM) | works/pum4thqp (V0020517) |
| EE | Eudemian Ethics I.5, 1216a11, tr. Solomon: "…'for the sake of viewing the heavens and the whole order of the universe'." | Amédée Guillemin and Clerget, *The Southern Heavens*, plate XI of *The Heavens*, London, 1867, colour print | University of California Libraries via the Internet Archive, public domain | heavensillustrat00guil, leaf n399 |
| Pol | Politics I.2, 1253a7, tr. Jowett: "Now, that man is more of a political animal than bees…" | Anonymous, *Bee Hives* (figures 2, 3, 5, labels removed), London, Richards & Co., early 19th century, engraving | Wellcome Collection, public domain (PDM) | works/jvrhsteu (V0025726) |
| Oec | Oeconomica I.2, 1343a20, tr. Forster: "So, according to Hesiod, it would be necessary that there should be First and foremost a house, then a wife…" | Charles Jacque, *In Front of the House*, 1845, etching | The Met 829471, CC0 | metmuseum.org/art/collection/search/829471 |
| VV | De Virtutibus et Vitiis 5, 1250b25, tr. Solomon: "The liberal man … inclined to keep all animals that have anything peculiar or marvellous about them." | Karl Bodmer, *Peacocks on a Branch*, about 1860, etching | The Met 696815, CC0 | metmuseum.org/art/collection/search/696815 |
| DM | De Mundo 4, 395b21, tr. Forster: "…as Lipara, Etna, and the volcanoes of the Aeolian islands. Some of them frequently flow like rivers and cast up red-hot lumps." | Thomas Sutherland after Romagni, *Eruption of Mount Aetna in 1669*, from R. J. Thornton, London, 1809, aquatint with engraving | Cleveland Museum of Art 1959.295, CC0 | clevelandart.org/art/1959.295 |
| Mech | Mechanica 20, 853b25, tr. Forster: "Why is it that steelyards weigh great weights of meat with a small counterpoise…? … Is it because the steelyard is at once a beam and a lever?" | H. Roux the elder, *Herculanum et Pompéi*, vol. VII, bronzes, plate 96 (five bronze steelyards), Paris, 1840, printed 1861, engraving (turned a quarter turn so the beams lie flat) | Getty Research Institute via the Internet Archive, public domain | herculanumetpomp07barr, leaf n509 |
| Col | De Coloribus 2, 792b5, tr. Loveday and Forster: "Grapes on the bunch, which grow wine-coloured as they ripen…" | After J. Polydore, a black grape, *Ampélographie française*, Geneva, De Villain, mid-19th century, lithograph coloured by hand | Wellcome Collection, public domain (PDM) | works/dzceygyr (V0043078) |
| Phgn | Physiognomonica 5, 809b14, tr. Loveday and Forster: "This being so, the lion manifestly exhibits the male type in its most perfect form." | George Stubbs, *A Lion Resting on a Rock*, 1 May 1788, etching with roulette work | The Met 343646, CC0 | metmuseum.org/art/collection/search/343646 |
| MXG | De Melisso Xenophane Gorgia 6, 980a10, tr. Loveday and Forster: "Nothing could be false, not even (he says) though one should say that chariots are racing on the sea." | François Antoine Aveline, *Neptune apaisant la tempête*, 18th century, etching and engraving (lower part: Neptune's chariot) | The Met 414309, CC0 | metmuseum.org/art/collection/search/414309 |
| Aud | De Audibilibus 803a30, tr. Loveday and Forster: "If one touches the strings violently instead of softly with the hand, they necessarily respond with more violent sounds." | H. Roux the elder, *Herculanum et Pompéi*, vol. IV, paintings (Apollo with his lyre, a Pompeian wall painting), Paris, 1839, printed 1861, engraving | Getty Research Institute via the Internet Archive, public domain | herculanumetpomp04barr, leaf n286 |
| Lin | On Indivisible Lines 968b4, tr. Joachim: "…if we accept their definition of 'commensurate' lines as those which are measured by the same unit of measurement, … there will be some actual length, by which all of them will be measured." | Gennaro Aveta ("Jan. Aveta del."), engraved by Lasinio the younger ("Lasinio fil. sculp."), *Real Museo Borbonico*, volume VI, plate XV, "Misure di bronzo, provenienti da Pompei", Naples, Stamperia Reale, 1830, engraving. The plate's text names item 8 a Roman foot, dotted into sixteen digits on one face and twelve inches on the other, folding at its centre. Kept: the compasses, calipers and the foot-rule (open and half folded); the four plumb-bobs masked out | Wellcome Library via the Internet Archive, public domain (PDM) | archive.org/details/b33520859_0006, leaf n105 (text on n107–n110) |
| Vent | Ventorum Situs 973b8, tr. Forster: "Notus (the South Wind) bears the same name everywhere." | Julien-David Le Roy, *Les ruines des plus beaux monuments de la Grèce*, the Tower of the Winds (top of the elevation; the wind rose above it left out), Paris, 1758, engraving | Getty Research Institute via the Internet Archive, public domain | archive.org/details/gri_33125009324597, leaf n215 |
| Mirab | De Mirabilibus Auscultationibus 7, 831a11, tr. Dowdall: "Men say that in Egypt the sandpipers fly into the mouths of the crocodiles, and cleanse their teeth…" | Anonymous English engraver, *Common Crocodile*, undated (about 1800 by style), etching | Wellcome Collection, public domain (PDM) | works/bpgp54a2 (V0021255) |
| Rhet | Rhetoric II.2, 1378a31, tr. Roberts: "Anger may be defined as an impulse, accompanied by pain, to a conspicuous revenge for a conspicuous slight…" | Sébastien Le Clerc the Younger after Charles Le Brun, *La Colère*, from *Caractères des passions*, about 1695–1720, etching | The Met 681484, CC0 | metmuseum.org/art/collection/search/681484 |
| Poet | Poetics 5, 1449a36, tr. Butcher: "To take an obvious example, the comic mask is ugly and distorted, but does not imply pain." | H. Roux the elder, *Herculanum et Pompéi*, vol. VI, bronzes (three bronze masks below a statue), Paris, 1840, printed 1861, engraving | Getty Research Institute via the Internet Archive, public domain | herculanumetpomp06barr, leaf n304 |

Holders: Wellcome Collection 18, The Met 10, Internet Archive book scans 11,
Rijksmuseum 1, Cleveland 1, Library of Congress 1 (42 plates).

## Coverage

Every work has a plate in the later set. The last two were found on a second
pass: Atlas for the Movement of Animals (Rijksmuseum) and the Pompeian
foot-rule for On Indivisible Lines (Real Museo Borbonico). The early set keeps
its seventeen Greek-title plates.

## Rejects

- Wikimedia Commons, all files: Haeckel's *Die Radiolarien* (1862), Luke
  Howard's cloud plates (1803), Burke's *Nightmare* after Fuseli, the
  Encyclopédie's *Escrime*, Le Brun's *La Colère*, Oudry's *Horse and Stag*
  (the fable told in Rhetoric II.20), Hamilton's *Campi Phlegraei*, Audubon's
  *Barn Swallow*. Commons and upload.wikimedia.org answered 429 to this
  sandbox, so none could be fetched or checked.
- Peacock and two peahens, etching (Wellcome V0023056): undated and looks
  17th-century; replaced by Bodmer, about 1860.
- *A Prospect of Mount Ætna, with its Irruption in 1669* (Wellcome V0025181):
  undated, possibly of 1669, and lettered with a key; replaced by Sutherland,
  1809.
- Géricault, *Black Horse Tethered in a Stable* (Met 358105): a strong horse
  but a busy stable; the dappled horse stands alone.
- Stubbs, *The Anatomy of the Horse* (Met 359031): a flayed horse.
- Guillemin's Donati's comet (plate XXII): two thin comets on black; the 1860
  comet over fields reads at once.
- Guillemin, *The Heavens from the Horizon of Paris*: constellation names
  lettered across the sky.
- Wellcome *Bee* plate as a whole: a chart of numbered figures; only the comb
  is used. *Testaceous and crustaceous animals* (V0022036): a labelled chart.
- Wellcome *Commemorative French coins* (V0023682): Napoleonic medals.
- Cleveland's tetradrachms of Athens: photographs of coins, not prints.
- Combe's other coin plates: coins too small to cut large.
- Raspe's other plates (leaves n451, n461): several small gems on one sheet.
- Library of Congress, Woollett's *Battle at La Hogue* (1781): crowded with
  figures in boats; the two ships of the Pearson print read at once. The LOC
  web images stop at 1024 px, so the master TIFF was used.
- Lucas after Constable, mezzotints: storms and moonlight, but no rain.
- Wellcome swallows after Francis Barlow (about 1690): too early for the set.
- Rowlandson, Gillray, Daumier caricatures (comet, fencing, Atlas): jokes, not
  plain pictures.
- Roux's lantern plate kept its two elevations but not its plans and sections,
  which read as diagrams.
- Second pass, Movement of Animals: Gravelot and Vivares's frontispiece of
  Vaucanson's automata (the piper, the duck and the flute player), in *An
  account of the mechanism of an automaton*, London, 1742 (Internet Archive,
  ECCO microfilm scan): an honest tie to the puppets of 701b2, but the scan is
  murky grey and the figures read as garden statues until the caption explains
  them. The 1738 French edition on the Internet Archive has no plate.
- Rijksmuseum: *Atlas van Farnese* (1874–79) is a photograph; *Three statues
  of Atlas carrying the world* (RP-P-OB-30.674) is a printer's stock vignette
  with blank globes; Homann's *Atlas Novus* title (1710) and Delisle's (1730)
  bury a small Atlas in a crowd of allegory. The Met's only Atlas print is
  Claude Mellan's *Hercules Assisting Atlas*, of the 1600s.
- Real Museo Borbonico: no plate of the Farnese Atlas turned up in the volumes
  with searchable text (several Google scans have none). Cagnazzi, *Su i
  valori delle misure e dei pesi degli antichi Romani* (Naples, 1825): its one
  folding plate is scanned folded, half missing. Roux's bronzes (vol. VII)
  have no measuring rule.
