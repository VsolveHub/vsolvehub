import type { ReactNode } from "react";

import { cn } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

/**
 * The header a pushed task screen gets instead of the partner navbar.
 *
 * FE-5's rule: top-level destinations orient (full top bar and bottom tabs);
 * pushed screens focus (back control, title, no persistent chrome). This is the
 * pushed half. Hiding navigation must not weaken authorization — the route gate
 * still runs above this; all this component does is stop drawing tabs.
 *
 * The navy gradient is load-bearing rather than decorative. A partner moving
 * between a list and a task needs to know which one they are on before they read
 * anything, and a dark band under a light list is the fastest signal available.
 * Focus rings inside it switch to `focus-ring-inverse`, because the usual
 * navy-600 ring is invisible against navy-900.
 *
 * KNOWN DUPLICATION: six screens currently inline this same gradient header —
 * enquiry-detail-screen, visit-screen, engagement-job-view, work-home,
 * me-home and profile-panel. They should migrate here. They are left alone in
 * this change because rewriting six unrelated features inside a screen build is
 * how a reviewable diff becomes an unreviewable one.
 */

export interface FocusedHeaderProps {
  /** Small caps line above the title. Says what kind of screen this is. */
  eyebrow?: string;
  title: string;
  /** Where back goes. Rendered by the caller so this package owns no router. */
  backSlot: ReactNode;
  /** Optional right-hand element — a status pill, a kebab, a saved indicator. */
  trailing?: ReactNode;
  className?: string;
}

export function FocusedHeader({
  eyebrow,
  title,
  backSlot,
  trailing,
  className,
}: FocusedHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-2.5",
        "bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)]",
        "px-3 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      {backSlot}

      <span className="flex min-w-0 flex-1 flex-col">
        {eyebrow !== undefined ? (
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-navy-200">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="mt-0.5 truncate text-[17px] font-bold leading-snug tracking-[-0.02em] text-surface">
          {title}
        </h1>
      </span>

      {trailing}
    </header>
  );
}

/**
 * The 44px tile the back control and any header icon button share.
 *
 * Exported rather than baked in because the caller decides whether back is a
 * `<Link>` (deep-linkable, and what a pushed route should almost always use) or
 * a `router.back()` button. Both need to look identical.
 */
export function HeaderTile({
  children,
  emphasis = false,
  className,
}: {
  children: ReactNode;
  /** Promotes the tile to the action colour — used for a header "+". */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
        emphasis ? "bg-action text-action-text" : "bg-surface/13 text-surface",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Back chevron at the size the header tile expects. */
export function BackGlyph({ label }: { label: string }) {
  return (
    <>
      <Pictogram name="back" size="md" />
      <span className="sr-only">{label}</span>
    </>
  );
}
