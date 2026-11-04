import { Link } from 'react-router';
import { usePageHeading } from '../lib/usePageHeading';

export function NotFoundPage() {
  const heading = usePageHeading('Page not found');

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
        Page not found
      </h1>
      <p className="mt-2 text-slate-600">The address may be mistyped, or the page was moved.</p>
      <Link to="/plants" className="mt-6 inline-block text-amber-700 underline">
        Go to plants
      </Link>
    </main>
  );
}
