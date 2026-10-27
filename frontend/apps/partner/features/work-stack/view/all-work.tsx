"use client";

import { ChoiceChips, ErrorState, Spinner, useT } from "@vsolve/ui";
import { useState } from "react";

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
const SECTIONS: readonly { readonly id: string; readonly titleKey: string; readonly urgencies: readonly WorkUrgency[] }[] =
  [
    { id: "needsYou", titleKey: "work.allWork.section.needsYou", urgencies: ["live", "needs_price"] },
    { id: "inHand", titleKey: "work.allWork.section.inHand", urgencies: ["doing"] },
    { id: "waitingOnCustomer", titleKey: "work.allWork.section.waitingOnCustomer", urgencies: ["answered"] },
    // `not_chosen` and `closed` used to have no section to render into on this
    // screen at all — a quote the customer picked someone else for, or an
    // enquiry the customer cancelled, existed in the stack and was invisible
    // everywhere. They read as "done" to a vendor exactly as a settled job
    // does: nothing more to do, and it belongs beside the filter chip below
    // that groups all three the same way.
    { id: "done", titleKey: "work.allWork.section.done", urgencies: ["settled", "not_chosen", "closed"] },
  ];

/**
 * The filter row's own chips, and which urgencies each one keeps.
 *
 * `all` keeps every urgency `toWorkItems` can produce — spelled out rather
 * than "everything not otherwise listed" so a `WorkUrgency` this build adds
 * later and forgets to add here fails obviously (an item with no home) rather
 * than silently landing in `all` alone.
 */
const FILTERS: readonly { readonly value: string; readonly labelKey: string; readonly urgencies: readonly WorkUrgency[] | null }[] =
  [
    { value: "all", labelKey: "work.allWork.filter.all", urgencies: null },
    { value: "offers", labelKey: "work.allWork.filter.offers", urgencies: ["live"] },
    { value: "enquiries", labelKey: "work.allWork.filter.enquiries", urgencies: ["needs_price"] },
    { value: "in_progress", labelKey: "work.allWork.filter.inProgress", urgencies: ["doing"] },
    { value: "waiting", labelKey: "work.allWork.filter.waiting", urgencies: ["answered"] },
    { value: "done", labelKey: "work.allWork.filter.done", urgencies: ["settled", "closed", "not_chosen"] },
  ];

const FILTER_STORAGE_KEY = "vsolve.partner.work-all.filter";

/** The chip chosen last time, or `all` when storage has nothing to say. */
function readStoredFilter(): string {
  try {
    return window.localStorage.getItem(FILTER_STORAGE_KEY) ?? "all";
  } catch {
    return "all";
  }
}

function writeStoredFilter(value: string): void {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, value);
  } catch {
    // Private mode or a full quota. The chip still works for this visit; it
    // just does not survive a reload, which is the one thing storage buys.
  }
}

export function AllWork() {
  const t = useT();
  const stack = useWorkStack();
  // Lazy initializer rather than an effect: reading storage in `useState`'s
  // initializer runs once, before the first paint, so the remembered chip is
  // there on the very first render instead of flashing "All" and then
  // snapping to it a tick later. `window` is guarded because Next renders
  // this tree on the server first, where there is no storage to read.
  const [filter, setFilter] = useState<string>(() =>
    typeof window === "undefined" ? "all" : readStoredFilter(),
  );

  const activeFilter = FILTERS.find((option) => option.value === filter) ?? FILTERS[0]!;

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas lg:mx-auto lg:min-h-[calc(100dvh-5rem)] lg:w-full lg:max-w-5xl lg:pb-12">
      {/*
        No back arrow: this is a tab, not a pushed screen. A vendor arrives here
        from the Work tab and leaves by tapping another one, so a back control
        would point at whichever tab they happened to come from — and on a first
        visit, at nothing. The heading names the screen; the tab bar is the way
        out.
      */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3.5">
        <h1 className="flex-1 text-[1.0625rem] font-bold text-text">{t("work.allWork.title")}</h1>
        <Count stack={stack} />
      </div>

      <div className="border-b border-line bg-surface px-4 py-3">
        <FilterRow
          stack={stack}
          value={filter}
          onChange={(next) => {
            setFilter(next);
            writeStoredFilter(next);
          }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-3">
        <Body stack={stack} filter={activeFilter} />
      </div>
    </main>
  );
}

/**
 * "All · 12", "Offers · 3" — a horizontally scrollable single-select row.
 *
 * Counts are computed from the same `stack.items` the sections below render,
 * so the chip's own number and what tapping it reveals can never disagree.
 * Silent (no counts, but still tappable) while the stack is loading or failed
 * — a row of chips reading "· 0" while the real answer is still in flight
 * would tell a vendor their work is empty when it is merely not loaded yet.
 */
function FilterRow({
  stack,
  value,
  onChange,
}: {
  stack: ReturnType<typeof useWorkStack>;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const known = stack.isPending || stack.error ? null : stack.items;

  return (
    <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ChoiceChips
        label={t("work.allWork.filterRow.ariaLabel")}
        name="work-filter"
        layout="wrap"
        value={value}
        onChange={onChange}
        options={FILTERS.map((option) => ({
          value: option.value,
          label:
            known === null
              ? t(option.labelKey)
              : `${t(option.labelKey)} · ${countFor(known, option.urgencies)}`,
        }))}
      />
    </div>
  );
}

function countFor(items: readonly WorkItem[], urgencies: readonly WorkUrgency[] | null): number {
  if (urgencies === null) return items.length;
  return items.filter((item) => urgencies.includes(item.urgency)).length;
}

/** How many records there are, once there is an answer. Silent until then. */
function Count({ stack }: { stack: ReturnType<typeof useWorkStack> }) {
  if (stack.isPending || stack.error) return null;
  return (
    <span className="text-[0.8125rem] font-bold text-text-muted">{stack.items.length}</span>
  );
}

function Body({
  stack,
  filter,
}: {
  stack: ReturnType<typeof useWorkStack>;
  filter: (typeof FILTERS)[number];
}) {
  const t = useT();
  if (stack.isPending) {
    return (
      <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
        <Spinner size="sm" />
        {t("work.allWork.loading")}
      </p>
    );
  }

  if (stack.error) {
    return (
      <ErrorState
        title={t("work.allWork.error.title")}
        message={t("common.nothingChanged")}
        actionLabel={t("common.tryAgain")}
        onAction={() => window.location.reload()}
      />
    );
  }

  const filterUrgencies = filter.urgencies;
  const items =
    filterUrgencies === null
      ? stack.items
      : stack.items.filter((item) => filterUrgencies.includes(item.urgency));

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <div className="grid h-32 w-32 place-items-center rounded-full bg-surface-sunken">
          <Pictogram name="papers" className="h-16 w-16 text-[var(--color-warm-400)]" />
        </div>
        <p className="text-base font-semibold text-text-secondary">
          {/* "Nothing here yet" unfiltered — nothing has ever arrived on this
              account. A chosen chip finding nothing is a different fact: the
              work exists, just not in this bucket right now — so it is named. */}
          {filter.value === "all"
            ? t("work.allWork.empty.unfiltered")
            : t("work.allWork.empty.filtered", { filter: t(filter.labelKey) })}
        </p>
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
        const sectionItems = items.filter((item: WorkItem) =>
          section.urgencies.includes(item.urgency),
        );
        if (sectionItems.length === 0) return null;

        return (
          <section key={section.id} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
                {t(section.titleKey)}
              </h2>
              <span className="text-[0.6875rem] font-bold text-text-muted">
                {sectionItems.length}
              </span>
            </div>
            {sectionItems.map((item) => (
              <WorkCard key={item.key} item={item} />
            ))}
          </section>
        );
      })}
    </>
  );
}
