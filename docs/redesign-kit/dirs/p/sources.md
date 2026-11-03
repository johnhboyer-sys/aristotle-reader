# Direction P · the first words of each work

Every work page opens on the work’s first words, set as Plato’s are: capitals
on an even grid, no spaces, accents, breathings or punctuation, final sigma
as Σ, and an iota subscript written beside its vowel, as Plato’s blocks do. The Plato Reader uses one grid for every work,
twelve letters wide and four rows deep, cut at the forty-eighth letter even
inside a word (checked on eleven of its work pages, from the Euthyphro to the
Laws), so P does the same. The citation under the block is the first line as
the site has it (the registry’s first span), Bekker page, column and line;
Busse’s page for the Isagoge.

All Greek comes from the repository at `/home/user/aristotle-reader`, read
only. The manifest of each work (`manifests/<ID>.yaml`) names its TLG number
and its Greek TEI file in `sources/`; the extraction script is
`out/p-tools/build_openings.py`, and this table is generated from the module
itself by `out/p-tools/gen_sources.cjs`, so it shows exactly what the page
sets.

## Where the text needed care

- **Not in sources/, taken from the live site.** The Categories (TLG 0086.006),
  De Interpretatione (0086.017) and Porphyry’s Isagoge (2034.006) have no Greek
  file in `sources/`; the site builds them from the TLG export. Their openings
  come from the live site’s own text (aristotle.johnhboyer.com, Cat/book/1,
  Int/book/1, Isa/book/1, first line of each), added after the first build.
- **OCR slips in the TEI, corrected.** Physics: the TEI reads `Ἐπειθὴ`; every
  edition reads `Ἐπειδὴ`. Physiognomonica: the TEI runs `Ὄτιδιάνοιαι` and drops
  the article; Bekker reads `Ὅτι αἱ διάνοιαι`.
- **Older edition in the TEI, the site’s text used.** On Memory: the TEI
  (a nineteenth-century text) opens with a bridge sentence, `Περὶ μὲν οὖν τῶν
  αἰσθητηρίων … εἴρηται`, that the site’s text (Ross) does not print. On
  Dreams: the TEI reads `ζητητέον`, the site `ἐπιζητητέον`. For both, the
  opening is the site’s own line as the repository’s alignment review pages
  print it (`alignment-results/beare/review/<work>/book-01.html`).
- **Fixes past the forty-eighth letter or in accents only** (they do not
  change the capitals; they keep the hidden plain text right): De
  Audibilibus `σμάτων` → `σωμάτων`; Parts of Animals `τιμιῶτέραν` →
  `τιμιωτέραν`; MXG `Ἀιδιον εἶναι φησιν` → `Ἀίδιον εἶναί φησιν`.
- **Which part of a file.** Prior and Posterior Analytics share
  `tlg0086.tlg001`; the blocks start at its books `priora` and `posteriora`.
  The Eudemian Ethics uses the `-eebooks` copy, as its manifest does. Youth
  and Old Age uses `tlg918`, as its manifest does (`tlg018` opens the same
  way). The Sophistical Refutations TEI prints the title as its first
  paragraph, which is skipped; headings (`<head>`) and margin notes are
  skipped everywhere, and stray margin line numbers dropped.
- **Iota subscript.** The Plato Reader writes it beside the vowel, as Attic
  stones do (`ΛΥΚΕΙΩΙ`, `ΕΚΕΙΝΗΙ ΤΗΙ ΗΜΕΡΑΙ`), so P does too (`ADSCRIPT = true`
  in `script.js`; false drops it). Nine blocks carry one: Long, HA, MA, IA, GA,
  EE, Vent, Mirab, Rhet.

## The openings

| Work | First line | Source | Greek (first words, as stored) | The block, row by row |
|---|---|---|---|---|
| Categories | Cat. 1a1 | the live site’s text (not in sources/) | Ὁμώνυμα λέγεται ὧν ὄνομα μόνον κοινόν, ὁ δὲ κατὰ τοὔνομα λόγος τῆς οὐσίας ἕτερος | ΟΜΩΝΥΜΑΛΕΓΕΤ / ΑΙΩΝΟΝΟΜΑΜΟΝ / ΟΝΚΟΙΝΟΝΟΔΕΚ / ΑΤΑΤΟΥΝΟΜΑΛΟ |
| De Interpretatione | Int. 16a1 | the live site’s text (not in sources/) | Πρῶτον δεῖ θέσθαι τί ὄνομα καὶ τί ῥῆμα, ἔπειτα τί ἐστιν ἀπόφασις καὶ κατάφασις | ΠΡΩΤΟΝΔΕΙΘΕΣ / ΘΑΙΤΙΟΝΟΜΑΚΑ / ΙΤΙΡΗΜΑΕΠΕΙΤ / ΑΤΙΕΣΤΙΝΑΠΟΦ |
| Prior Analytics | APr. 24a10 | `sources/tlg0086.tlg001.1st1K-grc1.xml` | ΠΡΩΤΟΝ εἰπεῖν περὶ τί καὶ τίνος ἐστὶν ἡ σκέψις, ὅτι περὶ ἀπόδειξιν | ΠΡΩΤΟΝΕΙΠΕΙΝ / ΠΕΡΙΤΙΚΑΙΤΙΝ / ΟΣΕΣΤΙΝΗΣΚΕΨ / ΙΣΟΤΙΠΕΡΙΑΠΟ |
| Posterior Analytics | APo. 71a1 | `sources/tlg0086.tlg001.1st1K-grc1.xml` | ΠΑΣΑ διδασκαλία καὶ πᾶσα μάθησις διανοητικὴ ἐκ προϋπαρχούσης γίνεται | ΠΑΣΑΔΙΔΑΣΚΑΛ / ΙΑΚΑΙΠΑΣΑΜΑΘ / ΗΣΙΣΔΙΑΝΟΗΤΙ / ΚΗΕΚΠΡΟΥΠΑΡΧ |
| Topics | Top. 100a18 | `sources/tlg0086.tlg044.1st1K-grc1.xml` | Ἡ ΜΕΝ πρόθεσις τῆς πραγματείας μέθοδον εὑρεῖν, ἀφ᾿ ἧς δυνησόμεθα συλλογίζεσθαι | ΗΜΕΝΠΡΟΘΕΣΙΣ / ΤΗΣΠΡΑΓΜΑΤΕΙ / ΑΣΜΕΘΟΔΟΝΕΥΡ / ΕΙΝΑΦΗΣΔΥΝΗΣ |
| Sophistical Refutations | SE 164a20 | `sources/tlg0086.tlg040.1st1K-grc1.xml` | ΠΕΡΙ δὲ τῶν σοφιστικῶν ἐλέγχων καὶ τῶν φαινομένων μὲν ἐλέγχων ὄντων | ΠΕΡΙΔΕΤΩΝΣΟΦ / ΙΣΤΙΚΩΝΕΛΕΓΧ / ΩΝΚΑΙΤΩΝΦΑΙΝ / ΟΜΕΝΩΝΜΕΝΕΛΕ |
| Isagoge | Isag. 1.3 | the live site’s text (not in sources/) | Ὄντος ἀναγκαίου, Χρυσαόριε, καὶ εἰς τὴν τῶν παρὰ Ἀριστοτέλει κατηγοριῶν | ΟΝΤΟΣΑΝΑΓΚΑΙ / ΟΥΧΡΥΣΑΟΡΙΕΚ / ΑΙΕΙΣΤΗΝΤΩΝΠ / ΑΡΑΑΡΙΣΤΟΤΕΛ |
| Physics | Phys. 184a10 | `sources/tlg0086.tlg031.1st1K-grc1.xml` | Ἐπειδὴ τὸ εἰδέναι καὶ τὸ ἐπίστασθαι συμβαίνει περὶ πάσας τὰς μεθόδους, | ΕΠΕΙΔΗΤΟΕΙΔΕ / ΝΑΙΚΑΙΤΟΕΠΙΣ / ΤΑΣΘΑΙΣΥΜΒΑΙ / ΝΕΙΠΕΡΙΠΑΣΑΣ |
| On the Heavens | Cael. 268a1 | `sources/tlg0086.tlg005.1st1K-grc1.xml` | Ἡ περὶ φύσεως ἐπιστήμη σχεδὸν ἡ πλείστη φαίνεται περί τε σώματα καὶ | ΗΠΕΡΙΦΥΣΕΩΣΕ / ΠΙΣΤΗΜΗΣΧΕΔΟ / ΝΗΠΛΕΙΣΤΗΦΑΙ / ΝΕΤΑΙΠΕΡΙΤΕΣ |
| On Generation and Corruption | GC 314a1 | `sources/tlg0086.tlg013.1st1K-grc1.xml` | Περὶ δὲ γενέσεως καὶ φθορᾶς τῶν φύσει γινομένων καὶ φθειρομένων, | ΠΕΡΙΔΕΓΕΝΕΣΕ / ΩΣΚΑΙΦΘΟΡΑΣΤ / ΩΝΦΥΣΕΙΓΙΝΟΜ / ΕΝΩΝΚΑΙΦΘΕΙΡ |
| Meteorology | Mete. 338a20 | `sources/tlg0086.tlg026.1st1K-grc1.xml` | ΠΕΡΙ μὲν οὖν τῶν πρώτων αἰτίων τῆς φύσεως καὶ περὶ πάσης κινήσεως | ΠΕΡΙΜΕΝΟΥΝΤΩ / ΝΠΡΩΤΩΝΑΙΤΙΩ / ΝΤΗΣΦΥΣΕΩΣΚΑ / ΙΠΕΡΙΠΑΣΗΣΚΙ |
| De Anima | DA 402a1 | `sources/tlg0086.tlg002.1st1K-grc1.xml` | ΤΩΝ καλῶν καὶ τιμίων τὴν εἴδησιν ὑπολαμβάνοντες, μᾶλλον δ’ ἑτέραν | ΤΩΝΚΑΛΩΝΚΑΙΤ / ΙΜΙΩΝΤΗΝΕΙΔΗ / ΣΙΝΥΠΟΛΑΜΒΑΝ / ΟΝΤΕΣΜΑΛΛΟΝΔ |
| Sense and Sensibilia | Sens. 436a1 | `sources/tlg0086.tlg041.1st1K-grc1.xml` | ἘΠΕΙ δὲ περὶ ψυχῆς καθ’ αὑτὴν διώρισται καὶ περὶ τῶν δυνάμεων ἑκάστης | ΕΠΕΙΔΕΠΕΡΙΨΥ / ΧΗΣΚΑΘΑΥΤΗΝΔ / ΙΩΡΙΣΤΑΙΚΑΙΠ / ΕΡΙΤΩΝΔΥΝΑΜΕ |
| On Memory | Mem. 449b4 | `alignment-results/beare/review/Mem/book-01.html` (TEI: `sources/tlg0086.tlg024.1st1K-grc1.xml`) | Περὶ μνήμης καὶ τοῦ μνημονεύειν λεκτέον τί ἐστι καὶ διὰ τίν’ αἰτίαν | ΠΕΡΙΜΝΗΜΗΣΚΑ / ΙΤΟΥΜΝΗΜΟΝΕΥ / ΕΙΝΛΕΚΤΕΟΝΤΙ / ΕΣΤΙΚΑΙΔΙΑΤΙ |
| On Sleep | Somn. 453b11 | `sources/tlg0086.tlg042.1st1K-grc1.xml` | Περὶ δὲ ὕπνου καὶ ἐγρηγόρσεως σκεπτέον, τίνα τε τυγχάνει ὄντα, καὶ | ΠΕΡΙΔΕΥΠΝΟΥΚ / ΑΙΕΓΡΗΓΟΡΣΕΩ / ΣΣΚΕΠΤΕΟΝΤΙΝ / ΑΤΕΤΥΓΧΑΝΕΙΟ |
| On Dreams | Insom. 458a33 | `alignment-results/beare/review/Insomn/book-01.html` (TEI: `sources/tlg0086.tlg016.1st1K-grc1.xml`) | Μετὰ δὲ ταῦτα περὶ ἐνυπνίου ἐπιζητητέον, καὶ πρῶτον τίνι τῶν τῆς ψυχῆς | ΜΕΤΑΔΕΤΑΥΤΑΠ / ΕΡΙΕΝΥΠΝΙΟΥΕ / ΠΙΖΗΤΗΤΕΟΝΚΑ / ΙΠΡΩΤΟΝΤΙΝΙΤ |
| On Divination in Sleep | Div. Somn. 462b12 | `sources/tlg0086.tlg008.1st1K-grc1.xml` | Περὶ δὲ τῆς μαντικῆς τῆς ἐν τοῖς ὕπνοις γινομένης καὶ λεγομένης συμβαίνειν | ΠΕΡΙΔΕΤΗΣΜΑΝ / ΤΙΚΗΣΤΗΣΕΝΤΟ / ΙΣΥΠΝΟΙΣΓΙΝΟ / ΜΕΝΗΣΚΑΙΛΕΓΟ |
| On Length and Shortness of Life | Long. 464b19 | `sources/tlg0086.tlg020.1st1K-grc1.xml` | Περὶ δὲ τοῦ τὰ μὲν εἶναι μακρόβια τῶν ζῴων τὰ δὲ βραχύβια, καὶ περὶ ζωῆς | ΠΕΡΙΔΕΤΟΥΤΑΜ / ΕΝΕΙΝΑΙΜΑΚΡΟ / ΒΙΑΤΩΝΖΩΙΩΝΤ / ΑΔΕΒΡΑΧΥΒΙΑΚ |
| On Youth, Old Age, Life and Death, and Respiration | Juv. 467b10 | `sources/tlg0086.tlg918.1st1K-grc1.xml` | Περὶ δὲ νεότητος καὶ γήρως καὶ περὶ ζωῆς καὶ θανάτου λεκτέον νῦν· ἅμα | ΠΕΡΙΔΕΝΕΟΤΗΤ / ΟΣΚΑΙΓΗΡΩΣΚΑ / ΙΠΕΡΙΖΩΗΣΚΑΙ / ΘΑΝΑΤΟΥΛΕΚΤΕ |
| History of Animals | HA 486a5 | `sources/tlg0086.tlg014.1st1K-grc1.xml` | ΤΩΝ ἐν τοῖς ζῴοις μορίων τὰ μέν ἐστιν ἀσύνθετα, ὅσα διαιρεῖται εἰς | ΤΩΝΕΝΤΟΙΣΖΩΙ / ΟΙΣΜΟΡΙΩΝΤΑΜ / ΕΝΕΣΤΙΝΑΣΥΝΘ / ΕΤΑΟΣΑΔΙΑΙΡΕ |
| Parts of Animals | PA 639a1 | `sources/tlg0086.tlg030.1st1K-grc1.xml` | Περὶ πᾶσαν θεωρίαν τε καὶ μέθοδον, ὁμοίως ταπεινοτέραν τε καὶ τιμιωτέραν, | ΠΕΡΙΠΑΣΑΝΘΕΩ / ΡΙΑΝΤΕΚΑΙΜΕΘ / ΟΔΟΝΟΜΟΙΩΣΤΑ / ΠΕΙΝΟΤΕΡΑΝΤΕ |
| Movement of Animals | MA 698a1 | `sources/tlg0086.tlg021.1st1K-grc1.xml` | Περὶ δὲ κινήσεως τῆς τῶν ζῴων, ὅσα μὲν αὐτῶν περὶ ἕκαστον ὑπάρχει γένος, | ΠΕΡΙΔΕΚΙΝΗΣΕ / ΩΣΤΗΣΤΩΝΖΩΙΩ / ΝΟΣΑΜΕΝΑΥΤΩΝ / ΠΕΡΙΕΚΑΣΤΟΝΥ |
| Progression of Animals | IA 704a4 | `sources/tlg0086.tlg015.1st1K-grc1.xml` | Περὶ δὲ τῶν χρησίμων μορίων τοῖς ζῴοις πρὸς τὴν κίνησιν τὴν κατὰ τόπον | ΠΕΡΙΔΕΤΩΝΧΡΗ / ΣΙΜΩΝΜΟΡΙΩΝΤ / ΟΙΣΖΩΙΟΙΣΠΡΟ / ΣΤΗΝΚΙΝΗΣΙΝΤ |
| Generation of Animals | GA 715a1 | `sources/tlg0086.tlg012.1st1K-grc1.xml` | Ἐπεὶ δὲ περὶ τῶν ἄλλων μορίων εἴρηται τῶν ἐν τοῖς ζῴοις καὶ κοινῇ καὶ | ΕΠΕΙΔΕΠΕΡΙΤΩ / ΝΑΛΛΩΝΜΟΡΙΩΝ / ΕΙΡΗΤΑΙΤΩΝΕΝ / ΤΟΙΣΖΩΙΟΙΣΚΑ |
| Metaphysics | Met. 980a21 | `sources/tlg0086.tlg025.perseus-grc2.xml` | πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει. σημεῖον δ’ ἡ τῶν αἰσθήσεων | ΠΑΝΤΕΣΑΝΘΡΩΠ / ΟΙΤΟΥΕΙΔΕΝΑΙ / ΟΡΕΓΟΝΤΑΙΦΥΣ / ΕΙΣΗΜΕΙΟΝΔΗΤ |
| Nicomachean Ethics | EN 1094a1 | `sources/tlg0086.tlg010.perseus-grc2.xml` | πᾶσα τέχνη καὶ πᾶσα μέθοδος, ὁμοίως δὲ πρᾶξίς τε καὶ προαίρεσις, ἀγαθοῦ | ΠΑΣΑΤΕΧΝΗΚΑΙ / ΠΑΣΑΜΕΘΟΔΟΣΟ / ΜΟΙΩΣΔΕΠΡΑΞΙ / ΣΤΕΚΑΙΠΡΟΑΙΡ |
| Eudemian Ethics | EE 1214a1 | `sources/tlg0086.tlg009.perseus-grc2-eebooks.xml` | ὁ μὲν ἐν Δήλῳ παρὰ τῷ θεῷ τὴν αὑτοῦ γνώμην ἀποφηνάμενος συνέγραψεν | ΟΜΕΝΕΝΔΗΛΩΙΠ / ΑΡΑΤΩΙΘΕΩΙΤΗ / ΝΑΥΤΟΥΓΝΩΜΗΝ / ΑΠΟΦΗΝΑΜΕΝΟΣ |
| Politics | Pol. 1252a1 | `sources/tlg0086.tlg035.perseus-grc2.xml` | ἐπειδὴ πᾶσαν πόλιν ὁρῶμεν κοινωνίαν τινὰ οὖσαν καὶ πᾶσαν κοινωνίαν | ΕΠΕΙΔΗΠΑΣΑΝΠ / ΟΛΙΝΟΡΩΜΕΝΚΟ / ΙΝΩΝΙΑΝΤΙΝΑΟ / ΥΣΑΝΚΑΙΠΑΣΑΝ |
| Rhetoric | Rhet. 1354a1 | `sources/tlg0086.tlg038.perseus-grc2.xml` | ἡ ῥητορική ἐστιν ἀντίστροφος τῇ διαλεκτικῇ· ἀμφότεραι γὰρ περὶ τοιούτων | ΗΡΗΤΟΡΙΚΗΕΣΤ / ΙΝΑΝΤΙΣΤΡΟΦΟ / ΣΤΗΙΔΙΑΛΕΚΤΙ / ΚΗΙΑΜΦΟΤΕΡΑΙ |
| Poetics | Poet. 1447a8 | `sources/tlg0086.tlg034.perseus-grc2.xml` | περὶ ποιητικῆς αὐτῆς τε καὶ τῶν εἰδῶν αὐτῆς, ἥν τινα δύναμιν ἕκαστον | ΠΕΡΙΠΟΙΗΤΙΚΗ / ΣΑΥΤΗΣΤΕΚΑΙΤ / ΩΝΕΙΔΩΝΑΥΤΗΣ / ΗΝΤΙΝΑΔΥΝΑΜΙ |
| De Mundo | Mund. 391a1 | `sources/tlg0086.tlg028.perseus-grc2.xml` | ΠΟΛΛΑΚΙΣ μὲν ἔμοιγε θεῖόν τι καὶ δαιμόνιον ὄντως χρῆμα ὦ Ἀλέξανδρε | ΠΟΛΛΑΚΙΣΜΕΝΕ / ΜΟΙΓΕΘΕΙΟΝΤΙ / ΚΑΙΔΑΙΜΟΝΙΟΝ / ΟΝΤΩΣΧΡΗΜΑΩΑ |
| De Melisso Xenophane Gorgia | MXG 974a1 | `sources/tlg0086.tlg047.1st1K-grc1.xml` | Ἀίδιον εἶναί φησιν εἴ τί ἐστιν, εἴπερ μὴ ἐνδέχεται γενέσθαι μηδὲν | ΑΙΔΙΟΝΕΙΝΑΙΦ / ΗΣΙΝΕΙΤΙΕΣΤΙ / ΝΕΙΠΕΡΜΗΕΝΔΕ / ΧΕΤΑΙΓΕΝΕΣΘΑ |
| Mechanica | Mech. 847a11 | `sources/tlg0086.tlg023.1st1K-grc1.xml` | ΘΑΥΜΑΖΕΤΑΙ τῶν μὲν κατὰ φύσιν συμβαινόντων, ὅσων ἀγνοεῖται τὸ αἴτιον, | ΘΑΥΜΑΖΕΤΑΙΤΩ / ΝΜΕΝΚΑΤΑΦΥΣΙ / ΝΣΥΜΒΑΙΝΟΝΤΩ / ΝΟΣΩΝΑΓΝΟΕΙΤ |
| De Coloribus | Col. 791a1 | `sources/tlg0086.tlg007.1st1K-grc1.xml` | ΑΠΛΑ τῶν χρωμάτων ἐστὶν ὅσα τοῖς στοιχείοις συνακολουθεῖ, οἷον πυρὶ | ΑΠΛΑΤΩΝΧΡΩΜΑ / ΤΩΝΕΣΤΙΝΟΣΑΤ / ΟΙΣΣΤΟΙΧΕΙΟΙ / ΣΣΥΝΑΚΟΛΟΥΘΕ |
| De Audibilibus | Aud. 800a1 | `sources/tlg0086.tlg004.1st1K-grc1.xml` | Τὰς δὲ φωνὰς ἁπάσας συμβαίνει γίγνεσθαι καὶ τοὺς ψόφους ἢ τῶν σωμάτων | ΤΑΣΔΕΦΩΝΑΣΑΠ / ΑΣΑΣΣΥΜΒΑΙΝΕ / ΙΓΙΓΝΕΣΘΑΙΚΑ / ΙΤΟΥΣΨΟΦΟΥΣΗ |
| Physiognomonica | Phgn. 805a1 | `sources/tlg0086.tlg032.1st1K-grc1.xml` | Ὅτι αἱ διάνοιαι ἕπονται τοῖς σώμασι, καὶ οὐκ εἰσὶν αὐταὶ καθ’ ἑαυτὰς | ΟΤΙΑΙΔΙΑΝΟΙΑ / ΙΕΠΟΝΤΑΙΤΟΙΣ / ΣΩΜΑΣΙΚΑΙΟΥΚ / ΕΙΣΙΝΑΥΤΑΙΚΑ |
| De Mirabilibus Auscultationibus | Mir. 830a5 | `sources/tlg0086.tlg027.1st1K-grc1.xml` | Ἐν τῇ Παιονίᾳ φασὶν ἐν τῷ ὄρει τῷ Ἠσαίνῳ καλουμένῳ, ὃ τὴν Παιονικὴν | ΕΝΤΗΙΠΑΙΟΝΙΑ / ΙΦΑΣΙΝΕΝΤΩΙΟ / ΡΕΙΤΩΙΗΣΑΙΝΩ / ΙΚΑΛΟΥΜΕΝΩΙΟ |
| De Lineis Insecabilibus | Lin. 968a1 | `sources/tlg0086.tlg019.1st1K-grc1.xml` | ἎΡΑ γ’ εἰσὶν ἄτομοι γραμμαί, καὶ ὅλως ἐν ἅπασι τοῖς ποσοῖς ἐστί τι ἀμερές, | ΑΡΑΓΕΙΣΙΝΑΤΟ / ΜΟΙΓΡΑΜΜΑΙΚΑ / ΙΟΛΩΣΕΝΑΠΑΣΙ / ΤΟΙΣΠΟΣΟΙΣΕΣ |
| Ventorum Situs | Vent. 973a1 | `sources/tlg0086.tlg046.1st1K-grc1.xml` | ΒΟΡΡΑΣ. Οὗτος ἐν μὲν Μαλλῷ Παγρεύς· πνεῖ γὰρ ἀπὸ κρημνῶν μεγάλων καὶ | ΒΟΡΡΑΣΟΥΤΟΣΕ / ΝΜΕΝΜΑΛΛΩΙΠΑ / ΓΡΕΥΣΠΝΕΙΓΑΡ / ΑΠΟΚΡΗΜΝΩΝΜΕ |
| De Virtutibus et Vitiis | VV 1249a26 | `sources/tlg0086.tlg045.perseus-grc2.xml` | ἐπαινετὰ μέν ἐστι τὰ καλά, ψεκτὰ δὲ τὰ αἰσχρά. καὶ τῶν μὲν καλῶν ἡγοῦνται | ΕΠΑΙΝΕΤΑΜΕΝΕ / ΣΤΙΤΑΚΑΛΑΨΕΚ / ΤΑΔΕΤΑΑΙΣΧΡΑ / ΚΑΙΤΩΝΜΕΝΚΑΛ |
| Oeconomica | Oec. 1343a1 | `sources/tlg0086.tlg029.perseus-grc2.xml` | ἡ οἰκονομικὴ καὶ πολιτικὴ διαφέρει οὐ μόνον τοσοῦτον ὅσον οἰκία | ΗΟΙΚΟΝΟΜΙΚΗΚ / ΑΙΠΟΛΙΤΙΚΗΔΙ / ΑΦΕΡΕΙΟΥΜΟΝΟ / ΝΤΟΣΟΥΤΟΝΟΣΟ |
