interface Props {
  /** What the buttons act on, so "Edit" still makes sense read out on its own. */
  name: string;
  onEdit: () => void;
  /** Left out for a role that may not delete. */
  onDelete?: (() => void) | undefined;
}

// On phones (the cards) the buttons are at least 44px tall, big enough for a thumb.
const button = 'rounded px-2 py-1 max-md:min-h-11 max-md:px-3';

/** The Edit and Delete buttons of one table row or card. */
export function RowActions({ name, onEdit, onDelete }: Props) {
  return (
    <>
      <button
        type="button"
        aria-label={`Edit ${name}`}
        onClick={onEdit}
        className={`${button} text-amber-700 hover:bg-amber-50`}
      >
        Edit
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${name}`}
          onClick={onDelete}
          className={`${button} ml-1 text-red-700 hover:bg-red-50`}
        >
          Delete
        </button>
      )}
    </>
  );
}
