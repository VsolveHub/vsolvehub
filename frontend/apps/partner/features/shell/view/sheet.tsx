"use client";

import { cn } from "@vsolve/ui";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A bottom sheet — the Partner app's one modal surface.
 *
 * ## Why a sheet rather than another route
 *
 * The old app answered every secondary question with a navigation: choosing an
 * area, seeing why earnings are held, confirming an action all pushed a screen.
 * On a phone that costs a page transition, a data fetch and a way back, for an
 * interaction that is over in two taps. Uber, Rapido and Swiggy all reach for a
 * sheet here and so does this — it keeps the screen behind it visible, which is
 * the whole point when the sheet is *about* something on that screen.
 *
 * ## Implemented with `<dialog>`, not a div with a z-index
 *
 * `showModal()` gives the top layer, the inert background, focus containment
 * and Escape-to-close for free, all of which a hand-rolled overlay gets subtly
 * wrong. The one thing it does not give is a light-dismiss on the backdrop, so
 * that is wired below by testing whether the click landed outside the panel.
 *
 * The element mounts closed and is opened by effect rather than being
 * conditionally rendered, so the open animation actually runs — a node inserted
 * and shown in the same frame has no start state to animate from.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional supporting line, announced with the title. */
  description?: string;
  children: ReactNode;
  /** Pinned below the scrolling body — the sheet's committing action. */
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="pv-sheet-title"
      aria-describedby={description === undefined ? undefined : "pv-sheet-description"}
      /* `close` fires for Escape and for `form method="dialog"` alike, so the
         parent's state is reconciled from the element rather than only from the
         paths this component controls. Without it, Escape leaves `open` true
         and the sheet can never be reopened. */
      onClose={onClose}
      onClick={(event) => {
        // `<dialog>`'s own box fills the viewport; the visible panel is the
        // child. A click whose target is the dialog itself landed on backdrop.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 max-h-[90dvh] w-full max-w-[480px] bg-transparent p-0 backdrop:bg-navy-900/45",
        // `<dialog>` centres itself; this pins it to the bottom of the viewport
        // and centres it horizontally for the tablet/desktop case.
        "fixed inset-x-0 bottom-0 top-auto mx-auto",
        "backdrop:backdrop-blur-[2px]",
      )}
    >
      <div
        className="pv-sheet-up flex max-h-[90dvh] flex-col rounded-t-sheet bg-surface shadow-sheet"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {/* The grab handle. Purely a signifier — this sheet is dismissed by the
            close button, the backdrop or Escape, and a drag gesture that looked
            available but did nothing would be worse than no handle at all. So
            it is `aria-hidden` and sized as decoration. */}
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1 w-9 rounded-pill bg-warm-300" />
        </div>

        <div className="flex items-start gap-3 px-5 pt-1.5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="pv-sheet-title" className="text-title text-text">
              {title}
            </h2>
            {description === undefined ? null : (
              <p id="pv-sheet-description" className="mt-1 text-caption text-text-secondary">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="pv-tap -mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-pill text-text-muted hover:bg-surface-sunken hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="pv-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer === undefined ? null : (
          <div className="border-t border-line px-5 py-3.5">{footer}</div>
        )}
      </div>
    </dialog>
  );
}
