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

/**
 * Where a `Sheet` docks.
 *
 * - `bottom` — the original sheet. Right for a summary or a picker on a phone.
 * - `end` — a record inspector. Bottom sheet below `lg:`, right-hand panel from
 *   `lg:` up, so a list on a wide screen keeps its rows in view while one of
 *   them is open beside it.
 */
export type SheetSide = "bottom" | "end";

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
        "fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] overflow-hidden rounded-card p-0",
        "bg-surface text-text shadow-overlay border border-line/60",
        "backdrop:bg-navy-900/50 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] flex-col overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 pb-3 pt-5">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">{children}</div>

        {footer ? (
          <div className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-4">
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
  fullScreen = false,
  side = "bottom",
}: BaseProps & { fullScreen?: boolean; side?: SheetSide }) {
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
        fullScreen
          ? "fixed inset-0 m-0 max-h-none h-dvh w-full max-w-none rounded-none border-0 p-0 bg-surface text-text shadow-none z-50 backdrop:bg-navy-900/40"
          : side === "end"
            ? // A record inspector on a wide screen, the familiar sheet on a
              // phone. Written as one string rather than merging a `lg:` override
              // over the bottom-sheet classes because `cn` is `clsx` and does not
              // resolve conflicting utilities — the behaviour would then depend
              // on stylesheet order rather than on this line.
              "fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-xl max-h-[96dvh] overflow-hidden rounded-b-none rounded-t-[20px] border border-line/60 p-0 bg-surface text-text shadow-overlay backdrop:bg-navy-900/40 lg:inset-y-0 lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:m-0 lg:h-dvh lg:max-h-none lg:w-full lg:max-w-md lg:rounded-none lg:rounded-l-[20px] lg:border-0 lg:border-l lg:border-line/60"
            : "fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-xl max-h-[96dvh] overflow-hidden rounded-b-none rounded-t-[20px] border border-line/60 p-0 bg-surface text-text shadow-overlay backdrop:bg-navy-900/40",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden",
          fullScreen ? "h-dvh" : side === "end" ? "max-h-[96dvh] lg:h-dvh lg:max-h-none" : "max-h-[96dvh]",
        )}
      >
        <div
          className={cn(
            "shrink-0 flex items-center justify-between gap-4 border-b border-line/80",
            fullScreen ? "px-4 py-3 bg-surface shadow-2xs" : "px-4 py-2 bg-surface",
          )}
        >
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-bold text-text truncate">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-description`} className="mt-0.5 text-xs text-text-secondary truncate">
                {description}
              </p>
            ) : null}
          </div>
          {dismissable ? <CloseButton onClick={() => onOpenChange(false)} /> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">{children}</div>

        {footer ? (
          <div
            className={cn(
              "shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3",
              // Keeps the action clear of the iOS home indicator.
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
