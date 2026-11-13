import { parseBekker, type ChapterRef, type ColumnRef } from '@shared/lib/data';

export function updateTouchVerb(root: ParentNode, phone: boolean) {
  const verb = root.querySelector('#touch-verb');
  if (verb) verb.textContent = phone || matchMedia('(hover: none) and (pointer: coarse)').matches ? 'Tap' : 'Click';
}

export function initReturningLayout(top: HTMLElement, band: MediaQueryList, refit: () => void = () => {}) {
  top.classList.add('b-returning');
  const heading = top.querySelector<HTMLElement>('h1')!;
  const resume = top.querySelector<HTMLElement>('.b-resume-work')!;
  const lead = top.querySelector<HTMLElement>('.b-lead')!;
  const poster = top.querySelector<HTMLElement>('.b-po')!;
  const home = document.createComment('resume card');
  resume.before(home);
  const apply = () => {
    if (!band.matches) {
      if (resume.parentNode && !lead.parentNode) resume.replaceWith(lead);
      home.after(resume);
      heading.replaceChildren(...['The', 'Complete', 'Works of', 'Aristotle'].map(text => {
        const span = document.createElement('span'); span.className = 'b-masthead-line'; span.textContent = text; return span;
      }));
      heading.removeAttribute('style');
      heading.setAttribute('aria-label', heading.dataset.title!);
      poster.style.setProperty('--cap', '0px');
    } else {
      heading.textContent = heading.dataset.title || '';
      heading.removeAttribute('style');
      poster.style.removeProperty('--cap');
      if (lead.parentNode) lead.replaceWith(resume);
    }
    updateTouchVerb(top, band.matches);
    refit();
  };
  apply();
  band.addEventListener('change', apply);
}

function citeKey(cite: string) {
  const ref = parseBekker(cite);
  return ref ? Number(ref.column.slice(0, -1)) * 100000 + (ref.column.endsWith('b') ? 10000 : 0) + ref.line * 100 + (ref.sub ? ref.sub.charCodeAt(0) - 96 : 0) : null;
}

export function resolveHomePlace(book: number, cite: string | null, chapters: Record<string, ChapterRef[]>, columns: Record<string, ColumnRef[]>) {
  const ref = cite ? parseBekker(cite) : null;
  const owners = ref ? (columns[ref.column] || []).filter(c => ref.line >= c.lo && ref.line <= c.hi) : [];
  const owner = owners.find(c => c.book === book) || owners[0];
  if (!owner) return { book, cite: null, chapter: undefined };
  book = owner.book;
  const point = citeKey(cite!);
  const chapter = [...(chapters[String(book)] || [])].reverse().find(c => {
    const start = citeKey(`${c.column}${c.line}`);
    return start !== null && point !== null && start <= point;
  });
  return { book, cite, chapter: chapter?.chapter };
}
