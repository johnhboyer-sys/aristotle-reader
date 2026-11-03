// Do the fixed captions show on the pages? Opens each changed work page and
// looks for a phrase of the new text in its caption.
const { chromium } = require('playwright');
const path = require('path');
const want = [
  ['h-work:Mete~later', 'Such is a comet—like', '344a32'], ['h-work:Mete~early', 'Such is a comet—like', '344a32'],
  ['h-work:SE~later', 'some are really silver', '164b22'], ['h-work:Isa~later', 'p. 12', 'Isagoge 5'],
  ['h-work:Mem~later', '(sensory stimulation)', '450a31'], ['h-work:DivSomn~later', '[to reveal the future]', '463b12'],
  ['h-work:VV~later', 'clean in his dress', '1250b28'], ['h-work:Col~later', 'Grapes on the bunch', '792b8'],
  ['b-work:Int~getty', 'A sea-fight must either take place to-morrow', '19a30'], ['b-work:PA', 'Every realm of nature is marvellous', '645a17'],
  ['b-work:Oec', 'Oeconomica', '1343a20'], ['b-work:APr~chalk', 'near to knowledge', '69a32'], ['b-work:Top~chalk', 'On the board,', '105a13'],
];
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [hash, phrase, ref] of want) {
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
    await p.goto('file://' + path.resolve(process.argv[2]) + '#' + hash); await p.waitForTimeout(900);
    const t = await p.evaluate(() => document.querySelector('.pane[data-pane="desktop"] .view').innerText);
    const ok = t.includes(phrase) && t.includes(ref);
    if (!ok) bad++;
    console.log(ok ? 'ok ' : 'BAD', hash.padEnd(22), phrase);
    await p.close();
  }
  console.log(bad ? `${bad} BAD` : 'every fixed caption shows on its page'); await b.close();
})();
