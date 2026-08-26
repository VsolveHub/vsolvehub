"use client";

import { cn } from "@vsolve/ui";

/**
 * Loading states that show the shape of the answer.
 *
 * ## Why these replace the spinner
 *
 * Every main surface — Home, Work, Money — answered a pending read with a
 * centred `<Spinner>` and the words "Loading your work…". On a good connection
 * that is a flash nobody sees. On the connection this product actually runs
 * on — a mid-range Android on patchy mobile data, which is the stated design
 * target throughout this codebase — it is several seconds of an empty screen
 * with a dot spinning in the middle, which is indistinguishable from a screen
 * that has failed.
 *
 * A skeleton says three things a spinner cannot: something is coming, roughly
 * this much of it, and laid out like this. The screen also stops reflowing when
 * the data lands, because the space was already reserved.
 *
 * All of these are `aria-hidden` with a single `role="status"` announcement on
 * the container, so a screen reader hears "Loading your work" once rather than
 * enumerating a dozen empty boxes.
 */

function Bar({ className }: { className?: string }) {
  return <span className={cn("pv-shimmer block rounded-control", className)} />;
}

export function SkeletonList({
  rows = 3,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5"
        >
          <div className="flex items-center gap-3">
            <Bar className="h-13 w-13 shrink-0 rounded-tile" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className="h-3.5 w-2/3" />
              <Bar className="h-6 w-1/3" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Bar className="h-3 w-4/5" />
            <Bar className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The home's hero plate and its three supporting metrics. */
export function SkeletonHome() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-label="Loading your day">
      <div aria-hidden className="flex flex-col gap-3.5">
        <Bar className="h-[104px] rounded-card" />
        <div className="grid grid-cols-3 gap-2">
          <Bar className="h-[58px] rounded-card" />
          <Bar className="h-[58px] rounded-card" />
          <Bar className="h-[58px] rounded-card" />
        </div>
      </div>
    </div>
  );
}

/** The money screen: hero figure, three plates, a chart block. */
export function SkeletonMoney() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading your earnings">
      <div aria-hidden className="flex flex-col gap-4">
        <Bar className="h-[124px] rounded-card" />
        <div className="grid grid-cols-3 gap-2.5">
          <Bar className="h-[72px] rounded-card" />
          <Bar className="h-[72px] rounded-card" />
          <Bar className="h-[72px] rounded-card" />
        </div>
        <Bar className="h-[168px] rounded-card" />
      </div>
    </div>
  );
}
