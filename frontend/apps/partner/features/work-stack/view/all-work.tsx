"use client";

import { ErrorState, cn } from "@vsolve/ui";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";
import { Block, Screen, SectionHeading } from "@/features/shell/view/screen";
import { SkeletonList } from "@/features/shell/view/skeletons";

import type { WorkItem, WorkUrgency } from "../model/work-item";
import { useWorkStack } from "../queries";
import { WorkCard } from "./work-card";

/**
 * Everything, in the order the stack already sorts it.
 *
 * ## Why this exists
 *
 * The home used to be this list. On any account with history it opened onto a
 * wall of rows — quotes sent months ago, jobs long settled — with today's money
 * and the duty control pushed off the top of the screen. So the home answers
 * "what needs me?" and this answers "what have I got?". The split is by whose
 * move it is, not by count or by age: nothing still the Partner's to act on is
 * only reachable from here.
 *
 * ## One query, not two
 *
 * `useWorkStack` is the same hook the home calls, so opening this costs no
 * request — TanStack serves both from one cache entry. That is also what keeps
 * the two screens from ever disagreeing about what exists.
 *
 * ## What the redesign adds: a filter that is not a second sort
 *
 * The list was previously four fixed sections rendered top to bottom, which on
 * a long history meant scrolling past everything active to reach anything
 * settled — and no way at all to answer "show me only what I'm owed". The
 * filter chips below select which sections render. They do not reorder, regroup
 * or re-sort anything: the stack's own comparator still decides order inside
 * every section, so a filtered view and the full view can never disagree about
 * which card comes first.
 */

/** The section each urgency belongs under, and the order the sections run in. */
const SECTIONS: readonly {
  readonly key: string;
  readonly title: string;
  readonly urgencies: readonly WorkUrgency[];
}[] = [
  { key: "needs", title: "Needs you", urgencies: ["live", "needs_price"] },
  { key: "doing", title: "In hand", urgencies: ["doing"] },
  { key: "waiting", title: "Waiting on the customer", urgencies: ["answered"] },
  { key: "settled", title: "Settled", urgencies: ["settled", "not_chosen", "closed"] },
];

/** The chips, and which sections each one keeps. `null` keeps all of them. */
const FILTERS: readonly { readonly label: string; readonly keeps: readonly string[] | null }[] = [
  { label: "All", keeps: null },
  { label: "Needs you", keeps: ["needs"] },
  { label: "In hand", keeps: ["doing"] },
  { label: "Waiting", keeps: ["waiting"] },
  { label: "Settled", keeps: ["settled"] },
];

export function AllWork() {
  const stack = useWorkStack();
  const [filter, setFilter] = useState(0);

  const active = FILTERS[filter] ?? FILTERS[0]!;
  const sections = SECTIONS.filter(
    (section) => active.keeps === null || active.keeps.includes(section.key),
  );

  return (
    <Screen>
      {/*
        No back arrow: this is a tab, not a pushed screen. A vendor arrives from
        the Work tab and leaves by tapping another one, so a back control would
        point at whichever tab they came from — and on a first visit, at nothing.
      */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 sm:px-5">
          <h1 className="flex-1 text-title text-text">All your work</h1>
          <Count stack={stack} />
        </div>

        <div className="pv-scroll -mb-px flex gap-2 overflow-x-auto px-4 pb-3 sm:px-5">
          {FILTERS.map((option, index) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setFilter(index)}
              aria-pressed={index === filter}
              className={cn(
                "pv-tap pv-press h-9 shrink-0 rounded-pill border px-3.5 text-caption font-bold",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                index === filter
                  ? "border-action-secondary bg-action-secondary text-action-secondary-text"
                  : "border-line bg-surface text-text-secondary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Block gap="lg" className="flex-1 pt-4 pb-6">
        <Body stack={stack} sections={sections} filtered={active.keeps !== null} />
      </Block>
    </Screen>
  );
}

/** How many records there are, once there is an answer. Silent until then. */
function Count({ stack }: { stack: ReturnType<typeof useWorkStack> }) {
  if (stack.isPending || stack.error) return null;
  return <span className="pv-num text-caption font-bold text-text-muted">{stack.items.length}</span>;
}

function Body({
  stack,
  sections,
  filtered,
}: {
  stack: ReturnType<typeof useWorkStack>;
  sections: typeof SECTIONS;
  filtered: boolean;
}) {
  if (stack.isPending) {
    return <SkeletonList rows={4} label="Loading your work" />;
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

  const groups = sections
    .map((section) => ({
      section,
      items: stack.items.filter((item: WorkItem) => section.urgencies.includes(item.urgency)),
    }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <Empty
        title={filtered ? "Nothing in this group" : "Nothing here yet"}
        detail={
          filtered
            ? "Try another filter above to see the rest of your work."
            : "Offers, enquiries and jobs all appear here once they arrive."
        }
      />
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
      {groups.map(({ section, items }) => (
        <section key={section.key} className="flex flex-col gap-2.5">
          <SectionHeading count={items.length}>{section.title}</SectionHeading>
          {items.map((item, index) => (
            <WorkCard key={item.key} item={item} index={index} />
          ))}
        </section>
      ))}
    </>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="grid h-28 w-28 place-items-center rounded-pill bg-surface-sunken">
        <Pictogram name="papers" className="h-14 w-14 text-warm-400" />
      </div>
      <div className="flex max-w-[28ch] flex-col gap-1.5">
        <p className="text-title text-text">{title}</p>
        <p className="text-caption leading-relaxed text-text-secondary">{detail}</p>
      </div>
    </div>
  );
}
