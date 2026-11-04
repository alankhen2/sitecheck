import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

/**
 * For a page's <h1>: keeps the browser tab's title in step and, after moving
 * here from another page, puts focus on the heading.
 *
 * A browser that loads a new document resets focus and a screen reader reads
 * the new title. Swapping the page inside a single-page app does neither: focus
 * would be left on a link that no longer means anything, and nothing would be
 * announced. The heading needs tabIndex={-1} to accept focus.
 *
 * The first page of a visit keeps the browser's own start, so the first Tab
 * reaches the skip link. The router gives only that location the key "default".
 */
export function usePageHeading(title: string) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { key } = useLocation();
  // Decided once, on arrival: filters change the location too, and changing a
  // filter must not pull focus away from it.
  const [cameFromAnotherPage] = useState(key !== 'default');

  useEffect(() => {
    document.title = `${title} · SiteCheck`;
  }, [title]);

  useEffect(() => {
    if (cameFromAnotherPage) heading.current?.focus();
  }, [cameFromAnotherPage]);

  return heading;
}
