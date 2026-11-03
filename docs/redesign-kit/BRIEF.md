# Design brief, round six

## The client and where we are

John H. Boyer teaches philosophy and classics and builds a family of reading
sites: the Aristotle Reader (this one), a Plato Reader, a Homer Reader and a
Greek Drama Reader. Readers are students and scholars who read Aristotle in
Greek beside English, click words to parse them, search, and compare
translations.

Five rounds of redesign have not produced a direction he loves. After round
five he wrote: **"I'm not wowed by the current options. Give me four new
ones."** Before that, his brief for the round was: **"Something visual and
graphic. Nothing gimmicky."**

Your direction has to make him stop and look: striking at first sight on the
home page and a work page, and still a calm, excellent place to read in the
reader. Visual and graphic means strong composition, scale, colour, image,
type with character. Gimmicky means anything that is clever once and tiresome
after (his words about round one: "Neat the first time. Gets old fast").

## Everything he has said, by round

Round one (A: the corpus as one Bekker-number line; B: an app with docked
panes; C: Greek and English facing across a centre line; D: Swiss, the corpus
as measured bars):
- "Too utilitarian a design. I want some style."
- "Chapter divisions are more important than Bekker divisions." Too hung up on
  Bekker numbers as design.
- "Neat the first time. Gets old fast." "These measure bars are gimmicky."

Round two (A Capitals: each work's key word in Greek capitals on a letter grid;
B Collection: 42 early photographs; C Diagram: a division of the sciences and
a doctrine diagram per work; D Aldine: each work beside its first printing,
Venice 1495):
- "No diagrams. Too gimmicky."
- "Too many photos on homepage." "No need for photos on every page." "No
  pictures on reader pages."
- "These books need to be collapsible."
- He liked B's style best: one early photograph with the title set over it in
  large red capitals that let the photograph show through.

Rounds three and four (A Capitals, B Poster, D Aldine):
- B: "This picture doesn't work for the title layout." "Different ones for
  mobile and desktop."
- All: "The alternating Greek then English simply doesn't work here" (phone
  reader: set them side by side). "Have this feature on each option" (mark the
  current page in the menu). "Don't we have this at the top of the page too?"
  (no duplicate lists).
- D: "Don't like this font at all" (EB Garamond's Greek). "Text seems too
  big?" "Not sure about the photo being sticky." "Too much space for the photo
  here on mobile."
- A's word blocks: "Don't change yet" (phone home page), "Not loving this on
  works pages".
- He liked D's logo: "Aristotle" in EB Garamond with "Reader" in red italic.

Poster titles page (B's titles set seven ways): whole-word settings "Good",
"Yes"; words broken at any letter "Okay"; "Center the text on the vertical
access"; "Too much space between words"; "Can't read bottom word against pic";
"Of Aristotle is too hard to read".

Photographs for B: "Don't get picture" (a spirit photograph for the
Sophistical Refutations), "Photo is okay but why a horse?" (Categories),
"Okay but maybe an eclipse?" (Posterior Analytics), "Maybe zoom in more so
it's clear it's fencers?", "Good photo choice" (Muybridge's fencers for the
Topics). Lesson: an image must explain itself; an obscure pairing fails.

Round five (B only, all photographs in black and white, red titles, the
reader opening on its first words in red Greek capitals, the lexicon headword
huge in red): "not wowed".

## Do not repeat

- Greek capitals on a letter grid (A); the Plato Reader is built on an
  inscription, so stoichedon capitals are taken.
- Red sans-serif capitals over early photographs (B).
- Facsimiles of Renaissance printed pages as the image (D).
- The Greek Drama Reader uses vase-style figure drawings; leave vases as
  drawings to it.
- Bekker numbers as a graphic; data bars; timelines; diagrams of doctrine; a
  division-of-the-sciences tree; maps used as diagrams.
- The common generated looks: warm cream with a serif and terracotta; near
  black with one acid accent; everything centred; rounded cards everywhere;
  Inter or Space Grotesk as the face.

## Constraints that come from the site

- Pictures: at most one on the home page; one per work page is allowed; none
  in the reader, search or lexicon. A picture must work as a wide desktop cut
  and a tall or banner phone cut. Only public-domain or CC0 images, credited.
- Hosts that answered from this sandbox: The Met's open access API
  (collectionapi.metmuseum.org; images.metmuseum.org web-large/original for
  isPublicDomain objects), the Cleveland Museum of Art open access API
  (openaccess-api.clevelandart.org; images on openaccess-cdn.clevelandart.org,
  CC0), Wikimedia Commons (upload.wikimedia.org, send a User-Agent header),
  archive.org, the Library of Congress, the Wellcome Collection API, the
  Biodiversity Heritage Library API, e-rara. Save images under your module's
  `img/`, sized for use (a desktop cut about 1600 px wide, a phone cut about
  720 px wide, JPEG quality about 82); keep the module's images under 12 MB.
- Fonts: Google Fonts only. Running Greek needs full polytonic coverage.
- The six pages: home, a work (the Nicomachean Ethics, and any other work by
  ID), the reader (Ethics Book I), search (ἀρετή), the lexicon (ἀρετή).
  Desktop and phone, light and dark. The mockup data has all 41 works.

## What to hand back

Your module in `dirs/<k>/` (see README.md), checked with `tools/walk.cjs` (no
errors, no failed loads, nothing wider than its pane) and looked at in
screenshots at both widths and both themes, plus `concept.md`: at most 350
words, in plain English (short words, active voice, no stock phrases): the
idea in two sentences, why it suits Aristotle, each page in a line, type and
colour, images and their rights, the risk.
