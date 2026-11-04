import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches right now, updated when it changes.
 * useSyncExternalStore is React's way to read a value that lives outside React
 * (here, in the browser) without a render ever seeing an out-of-date answer.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/**
 * Wide enough for a table; below this, lists are cards. The same width as
 * Tailwind's `md:` so the `max-md:` touch sizes switch together with the layout.
 */
export function useIsWideScreen(): boolean {
  return useMediaQuery('(min-width: 48rem)');
}
