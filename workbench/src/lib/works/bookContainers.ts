/**
 * Document Books are boundaries over the marker-built outline, not rows in the
 * document. Keeping these transforms pure is what lets the rail change a work's
 * organization without inserting, moving, or deleting translation text.
 */

export interface BookContainer {
  label: string;
  /** 1-based ordinal of the outline ROOT NODE this Book begins at. */
  start: number;
}

/** Defensive registry cap: real works stay far below this. */
export const MAX_BOOK_CONTAINERS = 200;

/**
 * Restore the invariants that make Book boundaries a partition: the first Book
 * owns the top of the document, and each later boundary can only move forward.
 * Invalid starts fall back to the last valid boundary so corrupt registry data
 * cannot create a gap in the outline.
 */
export function normalizeContainers(list: BookContainer[]): BookContainer[] {
  const normalized: BookContainer[] = [];
  let runningStart = 1;
  for (const container of list.slice(0, MAX_BOOK_CONTAINERS)) {
    const start =
      Number.isInteger(container.start) && container.start >= 1
        ? Math.max(runningStart, container.start)
        : runningStart;
    normalized.push({
      label: container.label,
      start: normalized.length === 0 ? 1 : start,
    });
    runningStart = normalized[normalized.length - 1].start;
  }
  return normalized;
}

/**
 * LENIENT registry-data sanitizer. Bad entries must not take down the library
 * rail; bad fields are coerced where the entry can still keep its position.
 */
export function sanitizeContainers(raw: unknown): BookContainer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const containers: BookContainer[] = [];
  for (const entry of raw) {
    if (containers.length >= MAX_BOOK_CONTAINERS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const value = entry as { label?: unknown; start?: unknown };
    containers.push({
      // Trimmed like sanitizeBooks's labels — a Book whose label is nothing but
      // whitespace should read as unlabeled, not as a blank row in the rail.
      label: typeof value.label === 'string' ? value.label.trim() : '',
      start:
        typeof value.start === 'number' && Number.isInteger(value.start) && value.start >= 1
          ? value.start
          : 1,
    });
  }
  return containers.length > 0 ? normalizeContainers(containers) : undefined;
}

/**
 * The first Book wraps the document already on screen. Later Books begin just
 * past the last root, so adding one never moves an existing chapter.
 */
export function withAddedBookContainer(
  containers: BookContainer[],
  label: string,
  rootCount: number,
): BookContainer[] {
  return normalizeContainers([
    ...containers,
    { label, start: containers.length === 0 ? 1 : rootCount + 1 },
  ]);
}

/**
 * An inserted Book begins at the following Book's boundary and is therefore
 * empty. At the end it begins just past the current outline for the same reason.
 */
export function withInsertedBookContainerAfter(
  containers: BookContainer[],
  index: number,
  label: string,
  rootCount: number,
): BookContainer[] {
  if (index < 0 || index >= containers.length) return normalizeContainers(containers);
  const start = containers[index + 1]?.start ?? rootCount + 1;
  return normalizeContainers([
    ...containers.slice(0, index + 1),
    { label, start },
    ...containers.slice(index + 1),
  ]);
}

/** Rename one Book without changing any outline boundary. */
export function withRenamedBookContainer(
  containers: BookContainer[],
  index: number,
  label: string,
): BookContainer[] {
  return containers.map((container, i) =>
    i === index ? { ...container, label } : { ...container },
  );
}

/**
 * Removing a Book removes only its boundary. The new first Book is re-clamped
 * to the document top; every other removed range joins the preceding Book.
 */
export function withRemovedBookContainer(
  containers: BookContainer[],
  index: number,
): BookContainer[] {
  return normalizeContainers(containers.filter((_, i) => i !== index));
}

/**
 * Move one Book boundary to a root ordinal. Earlier Books cannot begin after
 * it, and later Books cannot begin before it, so this single change preserves
 * a complete, ordered partition without touching the outline nodes themselves.
 *
 * The FIRST Book is fixed at the document top, so asking it to begin elsewhere
 * is a no-op rather than a move: normalization would clamp it straight back to
 * 1 and the forward clamp would silently push the SECOND Book's boundary
 * instead — dragging chapters out of a Book the user never touched.
 */
export function withBookStartAt(
  containers: BookContainer[],
  index: number,
  rootOrdinal: number,
): BookContainer[] {
  if (index <= 0 || index >= containers.length) return normalizeContainers(containers);
  return normalizeContainers(
    containers.map((container, i) => ({
      ...container,
      start:
        i < index
          ? Math.min(container.start, rootOrdinal)
          : i > index
            ? Math.max(container.start, rootOrdinal)
            : rootOrdinal,
    })),
  );
}
