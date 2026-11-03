interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Previous / next buttons with "Page x of y". Hidden when everything fits on one page. */
export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const button =
    'rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <nav aria-label="Pagination" className="flex items-center gap-3">
      <button
        type="button"
        className={button}
        disabled={page <= 1}
        onClick={() => {
          onPageChange(page - 1);
        }}
      >
        ‹ Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className={button}
        disabled={page >= totalPages}
        onClick={() => {
          onPageChange(page + 1);
        }}
      >
        Next ›
      </button>
    </nav>
  );
}
