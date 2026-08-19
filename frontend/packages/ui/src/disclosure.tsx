import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Explanation that is available but not in the way.
 *
 * ## Why this exists as a component
 *
 * The M2 screens explain themselves at length, and most of it is genuinely worth
 * saying — what `LEAD_ONLY` means for who holds the money, what happens when
 * nobody arrives, how a forfeited fee is split. The problem is that all of it is
 * said *at once*, to a Customer who opened the screen to check one thing. A
 * booking page that answers "is my crew coming" in the fourth paragraph has
 * answered nothing.
 *
 * Native `<details>` was already the house pattern — the checkout order summary
 * and the fit-out picker's FAQs both use it — so this is that pattern with one
 * styling rather than six. Native rather than a hand-rolled accordion because
 * the platform gives correct semantics for free: it is focusable, it toggles on
 * Enter and Space, screen readers announce the expanded state, and browser
 * find-in-page opens it to reveal a match. Every hand-rolled version has to
 * re-earn all four and usually earns two.
 *
 * ## What must never go in here
 *
 * A disclosure is for **explanation**, never for a decision or a disclosure in
 * the legal sense. Anything the reader must act on, and anything they must have
 * read before committing money — that A3 does not hold their payment, that a
 * fee is about to be forfeited — stays open on the screen. Hiding those behind a
 * chevron is how a platform gets to say it disclosed something nobody saw.
 */

export interface DisclosureProps {
  /**
   * The closed-state label. Phrase it as the question being answered, not as a
   * control: "What if nobody arrives?" reads better than "More information", and
   * tells the reader whether it is worth opening.
   */
  summary: string;
  /**
   * A short right-aligned note on the summary row — "4 things", "Fee rules".
   *
   * It tells the reader what is behind the chevron before they spend a tap on
   * it, which is the difference between a disclosure and a mystery. Keep it to
   * two or three words: it is part of the summary's accessible name, and a
   * sentence here is announced every time the control is reached.
   */
  hint?: string;
  children: ReactNode;
  /**
   * Open on first render. For the rare passage that is usually wanted — not a
   * way to reintroduce a wall of text one flag at a time.
   */
  defaultOpen?: boolean;
  className?: string;
}

export function Disclosure({
  summary,
  hint,
  children,
  defaultOpen = false,
  className,
}: DisclosureProps) {
  return (
    <details open={defaultOpen} className={cn("group", className)}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 rounded-control py-1",
          "text-sm font-medium text-text-link",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
        )}
      >
        {/* `list-none` above plus this removes the default marker on every engine;
            the chevron is ours so it can rotate with the open state. */}
        <svg
          viewBox="0 0 12 12"
          className="size-3 shrink-0 transition-transform duration-fast group-open:rotate-90"
          aria-hidden
        >
          <path
            d="M4 2.5 8 6l-4 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex-1">{summary}</span>
        {hint ? (
          // Inside the `<summary>`, so it is part of the control's own name
          // rather than a floating label a screen reader meets separately.
          <span className="shrink-0 text-xs font-medium text-text-muted">{hint}</span>
        ) : null}
      </summary>
      <div className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">{children}</div>
    </details>
  );
}
