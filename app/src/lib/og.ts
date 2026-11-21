// A share card's address carries its picture's hash (src/data/og-cards.json, which
// og-cards.test.ts holds to the files). X, iMessage, and Slack keep a card by its address and
// do not look again, so a card redrawn under its old address stays the old picture there.
import record from '../data/og-cards.json';

const cards = record as Record<string, { sha256: string }>;

/** The work's own card, else the site's: a path under the site base, with no leading slash. */
export function shareCard(workId?: string): string {
  const own = workId && workId !== 'home' && Object.hasOwn(cards, workId) ? cards[workId] : undefined;
  const v = (own ?? cards.home).sha256.slice(0, 8);
  return own ? `og/${workId}.jpg?v=${v}` : `og-default.png?v=${v}`;
}
