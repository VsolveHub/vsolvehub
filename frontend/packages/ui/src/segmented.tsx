import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * One control, two or three destinations, and the current one obvious at a
 * glance.
 *
 * ## Why this exists
 *
 * The Customer app filed its work under three top-level nav items — bookings,
 * requests and projects — and a Customer looking for "the thing I am waiting
 * on" had to guess which of the three it was filed under. Merging them into one
 * list is not available: an A3 booking and an A5 project make different
 * promises about who holds the money, and one noun over both would misstate
 * that (see `engagement-list-screen.tsx`). So they become segments of one
 * screen: one place to look, three promises kept apart.
 *
 * ## Why the styles are exported separately
 *
 * Segments that change what a screen *shows* are buttons. Segments that change
 * which *record set* a screen is showing should be links — they belong in the
 * URL so the back button works, so a segment is shareable, and so a reload
 * lands where the reader was. This package cannot depend on a router, for the
 * same reason `buttonStyles` exists next to `Button`: the app supplies the
 * `<Link>` and takes the styling from here.
 *
 * ```tsx
 * <SegmentedTrack label="Your work">
 *   <Link href="/activity?tab=booked" className={segmentStyles({ selected })}>
 *     Booked <SegmentCount value={3} selected={selected} />
 *   </Link>
 * </SegmentedTrack>
 * ```
 */

export function segmentStyles({
  selected = false,
  className,
}: {
  selected?: boolean;
  className?: string;
} = {}): string {
  return cn(
    "flex flex-1 items-center justify-center gap-1.5 rounded-control px-3",
    // 38px inside a 4px-padded track is a 46px control — over the 44px floor
    // once the track's own padding is counted, which is what a thumb hits.
    "min-h-[2.375rem] text-sm font-bold tracking-tight whitespace-nowrap",
    "transition-colors duration-fast",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    selected
      ? // Raised rather than filled. A filled segment reads as the primary
        // action of the screen, which it is not — it is a place, not a verb.
        "bg-surface text-text shadow-card"
      : "text-text-secondary hover:text-text",
    className,
  );
}

/**
 * The sunken track the segments sit in.
 *
 * `label` names the group for assistive tech. It is not rendered — the screen
 * already has a heading, and repeating it above the control is noise on a
 * 390px viewport.
 */
export function SegmentedTrack({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex gap-1 rounded-[0.625rem] bg-surface-sunken p-1", className)}
    >
      {children}
    </div>
  );
}

/**
 * The count pill inside a segment.
 *
 * Counts earn their place here: they are what tells somebody whether the
 * segment they are not looking at is worth a tap. Rendered as part of the
 * segment's own accessible name rather than as a bare number beside it.
 */
export function SegmentCount({ value, selected = false }: { value: number; selected?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-[0.3125rem]",
        "text-[0.6875rem] font-extrabold",
        selected ? "bg-action text-action-text" : "bg-warm-200 text-warm-600",
      )}
    >
      {value}
    </span>
  );
}

/*
 * There is deliberately no `SegmentedControl` component here.
 *
 * Segments come in two kinds and both are three lines at the call site: a
 * segment that changes *where you are* is a `<Link>`, and one that changes what
 * a screen shows is a `<button>`. A component wrapping either would have to
 * take a router or an `onChange` — the first this package refuses, the second
 * would make this module client-only and stop Server Components (the Activity
 * hub is one) from using `segmentStyles` at all.
 *
 * So this module stays pure and the two call sites each spend three lines.
 */
