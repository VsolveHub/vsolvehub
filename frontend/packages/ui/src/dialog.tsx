"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "./cn";

/**
 * Modal dialog and bottom sheet, built on the native `<dialog>` element.
 *
 * Native rather than a hand-rolled overlay because `showModal()` gives correct
 * behaviour for free, and hand-rolled versions almost always get some of it
 * wrong:
 *   - focus is trapped inside the dialog
 *   - Escape closes it
 *   - background content becomes inert, so a screen reader cannot wander out
 *   - it renders in the top layer, which ends z-index fights permanently
 *
 * What still has to be done by hand: scroll locking, closing on a backdrop
 * click, and restoring focus in the cases the platform misses — see
 * `useModalDialog`, which now does all three.
 *
 * `Sheet` is the same machinery docked to the bottom edge. On a phone that is
 * the reachable position for a summary or a picker; plan 03 asks for the price
 * summary to open as a sheet rather than a centred modal.
 */

interface BaseProps {
  open: boolean;
  /** Called for every dismissal: Escape, backdrop, or the close button. */
  onOpenChange: (open: boolean) => void;
  /** Required. A modal without an accessible name is unusable non-visually. */
  title: string;
  /** Optional sentence under the title. */
  description?: string;
  children: ReactNode;
  /** Footer actions. The primary action goes last in DOM order. */
  footer?: ReactNode;
  /**
   * Blocks backdrop and Escape dismissal. Use only where dismissing would lose
   * money or state — an in-flight payment, not a filter panel.
   */
  dismissable?: boolean;
  className?: string;
}

function useModalDialog(open: boolean, onOpenChange: (open: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);
  /**
   * What had focus before the dialog opened — almost always the trigger.
   *
   * The platform is supposed to restore this on `close()`, and usually does.
   * It stops doing it in exactly the cases that matter here: when the trigger
   * re-renders while the dialog is open, when it is removed and replaced (the
   * address row's label changes the moment a new address is chosen), or when
   * the dialog is closed programmatically rather than by the user. In all three
   * the browser drops focus on `<body>`, and a keyboard user is returned to the
   * top of the document having lost their place entirely.
   */
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Guarded because React may run effects twice in development, and calling
    // showModal() on an already-open dialog throws.
    if (open && !dialog.open) {
      trigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) return;
    const element = trigger.current;
    trigger.current = null;
    if (element === null) return;

    // Only when the platform did not already do it. Re-focusing an element that
    // already has focus is harmless, but re-focusing when the *user* has since
    // moved on — a close that happened because they clicked something else —
    // would yank them backwards.
    const active = document.activeElement;
    const platformRestored = active !== null && active !== document.body;
    if (platformRestored || !element.isConnected) return;
    element.focus();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Fires for Escape as well as programmatic close, so state stays in sync
    // when the platform closes the dialog without going through React.
    const handleClose = () => onOpenChange(false);
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    // The page behind a modal must not scroll. `<dialog>` does not do this.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return ref;
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 44px target even though the glyph is small.
      className={cn(
        "-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center",
        "rounded-control text-text-secondary",
        "hover:bg-surface-hover hover:text-text",
      )}
    >
      <span className="sr-only">Close</span>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        className="h-5 w-5"
      >
        <path d="M6 6l8 8M14 6l-8 8" />
      </svg>
    </button>
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissable = true,
  className,
}: BaseProps) {
  const ref = useModalDialog(open, onOpenChange);
  const id = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        // `cancel` fires on Escape. Preventing it is what makes a dialog
        // non-dismissable.
        if (!dismissable) event.preventDefault();
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a backdrop click: the content
        // sits in a child, so any click inside it targets that child instead.
        if (dismissable && event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-lg rounded-card p-0",
        "bg-surface text-text shadow-overlay",
        "backdrop:bg-navy-900/40",
        className,
      )}
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-bold text-text">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-description`} className="mt-1 text-sm text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          {dismissable ? <CloseButton onClick={() => onOpenChange(false)} /> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>

        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissable = true,
  className,
}: BaseProps) {
  const ref = useModalDialog(open, onOpenChange);
  const id = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        if (!dismissable) event.preventDefault();
      }}
      onClick={(event) => {
        if (dismissable && event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        // Docked to the bottom edge and full width; `mt-auto` pushes it down
        // because a modal `<dialog>` is centred by default.
        "mx-auto mb-0 mt-auto w-full max-w-xl rounded-b-none rounded-t-card p-0",
        "bg-surface text-text shadow-overlay",
        "backdrop:bg-navy-900/40",
        className,
      )}
    >
      <div className="flex max-h-[85vh] flex-col">
        {/* Grab handle: signals draggability affordance and gives a thumb a
            target that is not the close button. Decorative. */}
        <div aria-hidden className="flex justify-center pb-1 pt-3">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-2">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-bold text-text">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-description`} className="mt-1 text-sm text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          {dismissable ? <CloseButton onClick={() => onOpenChange(false)} /> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>

        {footer ? (
          <div
            className={cn(
              "flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4",
              // Keeps the action clear of the iOS home indicator.
              "pb-[max(1rem,env(safe-area-inset-bottom))]",
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
