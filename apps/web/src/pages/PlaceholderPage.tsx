/** Stands in for a page that a later session builds (3.1 to 3.4). */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-600">Coming soon.</p>
    </section>
  );
}
