import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 300;

interface Props {
  /** The search currently applied (from the URL). */
  value: string;
  /** Called once the user has paused typing. */
  onSearch: (text: string) => void;
}

/**
 * A search input that waits until typing pauses before searching, so typing
 * "excavator" sends one request instead of nine.
 *
 * It keeps its own text (what is in the box) apart from `value` (what is
 * applied). When `value` changes from outside, e.g. "Clear filters" or the
 * Back button, the box follows it.
 */
export function SearchBox({ value, onSearch }: Props) {
  const [text, setText] = useState(value);
  const [applied, setApplied] = useState(value);

  // Follow an outside change. Done while rendering (React's recommended way
  // to adjust state to a prop), not in an effect that would render twice.
  // Compared after trimming, so a trailing space being typed is not wiped
  // when the trimmed search comes back from the URL.
  if (value !== applied) {
    setApplied(value);
    if (value !== text.trim()) setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => {
      onSearch(text.trim());
    }, DEBOUNCE_MS);
    // A new keystroke cancels the pending search and starts the wait again.
    return () => {
      clearTimeout(timer);
    };
  }, [text, value, onSearch]);

  return (
    <div className="min-w-56 flex-1">
      <label htmlFor="plant-search" className="sr-only">
        Search plants
      </label>
      <input
        id="plant-search"
        type="search"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        placeholder="Search name, type or serial number"
        maxLength={100}
        className="w-full rounded border border-slate-300 bg-white px-3 py-2 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/30"
      />
    </div>
  );
}
