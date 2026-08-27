/**
 * Group the library rail's works by their author.
 *
 * Order is preserved as far as grouping allows: authors appear in the order
 * their first work does, and works stay in their given order inside a group.
 * Nothing is sorted alphabetically — the manifest order is a curated one (the
 * corpus works come in reading order), and re-sorting it would cost more than
 * the grouping gains.
 *
 * Works with no author are not a group called "Unknown": they fall into one
 * unlabeled run at the end, which is what an anonymous work should look like
 * in a list — itself, under nothing.
 */

export interface AuthorGroup<T> {
  /** The author's name, or '' for the trailing run of anonymous works. */
  author: string;
  works: T[];
}

export function groupWorksByAuthor<T extends { author?: string }>(works: T[]): AuthorGroup<T>[] {
  const byAuthor = new Map<string, T[]>();
  const anonymous: T[] = [];

  for (const work of works) {
    const author = work.author?.trim() ?? '';
    if (author.length === 0) {
      anonymous.push(work);
      continue;
    }
    const bucket = byAuthor.get(author);
    if (bucket) bucket.push(work);
    else byAuthor.set(author, [work]);
  }

  const groups: AuthorGroup<T>[] = [...byAuthor.entries()].map(([author, grouped]) => ({
    author,
    works: grouped,
  }));
  if (anonymous.length > 0) groups.push({ author: '', works: anonymous });
  return groups;
}
