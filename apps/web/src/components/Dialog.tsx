import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Called for Esc and for the close buttons; the parent then stops rendering the dialog. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal built on the browser's own <dialog>. `showModal()` gives, for free,
 * what a hand-made modal must build: focus moves inside, Tab stays inside, the
 * page behind cannot be clicked or read by screen readers, Esc closes it, and
 * focus goes back to the button that opened it afterwards.
 *
 * The parent renders it only while it is open: mounting opens it, unmounting
 * closes it. That keeps "is it open?" in React state instead of in the DOM.
 * Mark the element that should get focus first with `data-autofocus`.
 */
export function Dialog({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // React's autoFocus would run before showModal(), while the dialog is
      // still closed and nothing in it can take focus. So the element that
      // should start with focus is marked data-autofocus and focused here.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    return () => {
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc fires "cancel". Stop the browser closing it by itself, so React
      // state stays the only thing that decides whether the dialog is shown.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
