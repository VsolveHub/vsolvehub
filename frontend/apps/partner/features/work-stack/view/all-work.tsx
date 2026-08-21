"use client";

import { ErrorState, Spinner } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

import type { WorkItem, WorkUrgency } from "../model/work-item";
import { useWorkStack } from "../queries";
import { WorkCard } from "./work-home";

/**
 * Everything, in the order the stack already sorts it.
 *
 * ## Why this exists
 *
 * The home used to be this list. On any account with history it opened onto a
 * wall of green rows — quotes sent months ago, jobs long settled — with today's
 * money and the availability control pushed off the top of the screen, and
 * `WaitingRadar` unreachable because `items.length` was never zero.
 *
 * So the home answers "what needs me?" and this answers "what have I got?".
 * The split is by whose move it is, not by count or by age: nothing that is
 * still the Partner's to act on is only reachable from here.
 *
 * ## One query, not two
 *
 * `useWorkStack` is the same hook the home calls, so opening this costs no
 * request — TanStack serves both from one cache entry. That is also what keeps
 * the two screens from ever disagreeing about what exists.
 */

/** The section each urgency belongs under, and the order the sections run in. */
const SECTIONS: readonly { readonly title: string; readonly urgencies: readonly WorkUrgency[] }[] =
  [
    { title: "Needs you", urgencies: ["live", "needs_price"] },
    { title: "In hand", urgencies: ["doing"] },
    { title: "Waiting on the customer", urgencies: ["answered"] },
    { title: "Settled", urgencies: ["settled"] },
  ];

export function AllWork() {
  const stack = useWorkStack();

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">
      {/*
        No back arrow: this is a tab, not a pushed screen. A vendor arrives here
        from the Work tab and leaves by tapping another one, so a back control
        would point at whichever tab they happened to come from — and on a first
        visit, at nothing. The heading names the screen; the tab bar is the way
        out.
      */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3.5">
        <h1 className="flex-1 text-[1.0625rem] font-bold text-text">All your work</h1>
        <Count stack={stack} />
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-3">
        <Body stack={stack} />
      </div>
    </main>
  );
}

/** How many records there are, once there is an answer. Silent until then. */
function Count({ stack }: { stack: ReturnType<typeof useWorkStack> }) {
  if (stack.isPending || stack.error) return null;
  return (
    <span className="text-[0.8125rem] font-bold text-text-muted">{stack.items.length}</span>
  );
}

function Body({ stack }: { stack: ReturnType<typeof useWorkStack> }) {
  if (stack.isPending) {
    return (
      <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
        <Spinner size="sm" />
        Loading your work…
      </p>
    );
  }

  if (stack.error) {
    return (
      <ErrorState
        title="We could not load your work"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (stack.items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <div className="grid h-32 w-32 place-items-center rounded-full bg-surface-sunken">
          <Pictogram name="papers" className="h-16 w-16 text-[var(--color-warm-400)]" />
        </div>
        <p className="text-base font-semibold text-text-secondary">Nothing here yet</p>
      </div>
    );
  }

  /*
    Grouped rather than one flat list. The stack's own comparator already orders
    by urgency and then by clock, so grouping only draws the boundaries that
    ordering implies — no second sort, and no chance of the two screens
    disagreeing about which card comes first.
  */
  return (
    <>
      {SECTIONS.map((section) => {
        const items = stack.items.filter((item: WorkItem) =>
          section.urgencies.includes(item.urgency),
        );
        if (items.length === 0) return null;

        return (
          <section key={section.title} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
                {section.title}
              </h2>
              <span className="text-[0.6875rem] font-bold text-text-muted">{items.length}</span>
            </div>
            {items.map((item) => (
              <WorkCard key={item.key} item={item} />
            ))}
          </section>
        );
      })}
    </>
  );
}
