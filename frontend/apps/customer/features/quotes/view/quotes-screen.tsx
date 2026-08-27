"use client";

import {
  blocksNewSelection,
  canReadFullEstimates,
  canReadFullQuotes,
  describeError,
  isSelectionConflict,
  isUnlockRequired,
  isVisitPlanRequired,
  useServerCountdown,
  type RejectionReason,
} from "@vsolve/query";
import {
  Button,
  EmptyState,
  ErrorState,
  SegmentedTrack,
  Skeleton,
  buttonStyles,
  segmentStyles,
} from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { useUnlockState, useVisitPlan } from "@/features/access/queries";
import { useRequirement } from "@/features/requirement/queries";
import { titleForSlug } from "@/features/requirement/view/my-requests-screen";
import { toQuoteListView, toSelectionView } from "../adapters";
import { destinationAfterSelection } from "../model/selection-navigation";
import {
  useCustomerQuotes,
  useRejectQuote,
  useRevalidateQuote,
  useSelectProposal,
  useSelection,
} from "../queries";
import { QuoteCard } from "./quote-card";
import { QuoteComparison } from "./quote-comparison";
import { RejectQuoteDialog } from "./reject-quote-dialog";
import { SelectionStatus } from "./selection-status";

/**
 * The quotes and estimates screen — `M2-FE-407`..`M2-FE-414`, `M2-FE-423`.
 *
 * One route for both archetypes, because after the fee is paid they are the same
 * screen: full proposals, a comparison, a choice, and a vendor who has to agree
 * before anything is booked. What differs is which door was paid for, and that
 * is read from the server rather than branched on here.
 *
 * ## Entitlement is asked for, not assumed
 *
 * The quote read refuses an unentitled caller with `403 m2_unlock_required` (A3)
 * or `409 m2_visit_plan_required` (A5). Both are **ordinary states**, not
 * faults: they are what every Customer sees before they pay. So the read is
 * enabled only once the access state says the server will answer it, and the
 * refusals are still handled — a `403` can arrive between the two reads when an
 * unlock is refunded out from under the screen.
 *
 * ## Why both access reads are mounted
 *
 * A requirement is A3 or A5 and this screen does not know which until something
 * answers. Both reads are cheap, both are the Customer's own record, and each
 * answers `null`-shaped emptiness for the archetype it does not apply to — which
 * is a better trade than threading the archetype through a route parameter that
 * could disagree with the server.
 *
 * ## `M2-FE-409`, stated rather than faked
 *
 * Clarification runs the other way in M2: a **vendor** asks a question and the
 * Customer answers it on the request timeline. There is no
 * customer-asks-a-question endpoint at 1.24.0, and a revision request that could
 * change a vendor's price does not exist by design — only a vendor may state a
 * price. What this screen offers instead is the one real revision request,
 * `M2-FE-413`'s free re-validation, and a sentence saying where questions live.
 * Logged in `frontend-execution-plan.md` §7.
 */

export interface QuotesScreenProps {
  requirementId: string;
  requestHref: string;
}

function QuoteBreadcrumb({ requestLabel }: { requestLabel: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm font-semibold text-text-muted">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href="/activity" className="hover:text-text">
            Bookings
          </Link>
        </li>
        <li aria-hidden className="text-warm-400">
          ›
        </li>
        <li>
          <Link href="/requests" className="hover:text-text">
            {requestLabel}
          </Link>
        </li>
        <li aria-hidden className="text-warm-400">
          ›
        </li>
        <li className="font-extrabold text-text" aria-current="page">
          Quotes
        </li>
      </ol>
    </nav>
  );
}

export function QuotesScreen({
  requirementId,
  requestHref,
}: QuotesScreenProps) {
  const router = useRouter();
  const unlockQuery = useUnlockState(requirementId);
  const planQuery = useVisitPlan(requirementId);
  const requirementQuery = useRequirement(requirementId);

  const unlockState = unlockQuery.data ?? null;
  const planState = planQuery.data ?? null;

  // The server's own entitlement flags, never a local inference. Either one
  // being true is enough: a requirement is one archetype and the other read
  // simply never says yes.
  const entitled =
    (unlockState !== null && canReadFullQuotes(unlockState)) ||
    (planState !== null && canReadFullEstimates(planState));

  const isA5 = planState !== null && planState.plan !== null;

  const quotesQuery = useCustomerQuotes(requirementId, entitled);
  const selectionQuery = useSelection(requirementId);

  const select = useSelectProposal();
  const reject = useRejectQuote();
  const revalidate = useRevalidateQuote();

  const [rejecting, setRejecting] = useState<string | null>(null);
  /**
   * Which quote the Customer is leaning towards, and which half of the screen
   * they are reading.
   *
   * `picked` is local and free — see `QuoteCard`. It is deliberately *not*
   * seeded from `selection`: a real selection removes the ability to pick at
   * all, so the two can never be on screen together and pre-filling one from
   * the other would only make the docked bar offer a choice that is already
   * made.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<"quotes" | "compare">("quotes");

  const list = quotesQuery.data === undefined ? null : toQuoteListView(quotesQuery.data);
  const selection =
    selectionQuery.data === undefined || selectionQuery.data === null
      ? null
      : toSelectionView(selectionQuery.data);

  const countdown = useServerCountdown(selection?.reconfirmBy ?? null, 30_000);

  const selectedCard =
    selection === null
      ? null
      : (list?.cards.find((card) => card.proposalId === selection.proposalId) ?? null);

  // A visit-detail link can arrive before this async list has mounted its
  // estimate card. Re-apply the hash once the server data is present so the
  // Customer lands on the professional they chose, not merely at page top.
  useEffect(() => {
    if (quotesQuery.data === undefined || !window.location.hash.startsWith("#estimate-")) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target === null) return;
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }, [quotesQuery.data]);

  // `M2-FE-414`. A live selection blocks a second one and the control is
  // withheld rather than disabled, so a stale render cannot start one. The
  // server refuses anyway with `m2_selection_conflict`; this is what stops the
  // Customer meeting that refusal in the first place.
  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);
  const defaultPicked =
    canChoose && list !== null
      ? (list.cards[1]?.isSelectable === true && !list.cards[1].isExpired
        ? list.cards[1].proposalId
        : null) ??
        list.cards.find((card) => card.isSelectable && !card.isExpired)?.proposalId ??
        null
      : null;
  const pickedId = picked ?? defaultPicked;

  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );

  const accessPending = unlockQuery.isPending && planQuery.isPending;
  const requestLabel =
    requirementQuery.data === undefined
      ? "This request"
      : titleForSlug(requirementQuery.data.category_slug);

  return (
    // Wider than a reading column, because a three-estimate comparison needs the
    // room — the table has a label column plus one per estimate, and squeezing it
    // into 48rem turns the thing that makes this screen worth building into a
    // horizontal scroll. The prose inside still holds itself to `max-w-prose`.
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-0">
      <QuoteBreadcrumb requestLabel={requestLabel} />
      <header>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-text sm:text-[1.875rem]">
          {isA5 ? "Three estimates, side by side" : "Three quotes, side by side"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-text-secondary">
          Full scope, price and terms. You have already unlocked these - nothing here is hidden.
        </p>
      </header>

      {selection !== null ? (
        <SelectionStatus
          selection={selection}
          vendorName={selectedCard?.vendorName ?? null}
          reconfirmRemaining={countdown?.isExpired === false ? countdown.announce : null}
          supportAction={supportAction}
        />
      ) : null}

      {/* `m2_selection_conflict` is the one refusal in this wave that resolves
          itself: somebody else's selection landed first, and the answer changes
          on its own. So it reads as "we re-read it" rather than as a failure,
          and the panel above now shows whatever is actually true. */}
      {isSelectionConflict(select.error) ? (
        <ErrorState
          title="Somebody chose first"
          message="Another session picked a professional for this request a moment before you did. We have refreshed this page so you are looking at what actually happened."
          severity="warning"
          inline
        />
      ) : null}

      <AccessRefusal
        error={isSelectionConflict(select.error) ? null : select.error}
        attempting="choose this professional"
        supportAction={supportAction}
      />
      <AccessRefusal error={reject.error} attempting="turn this quote down" supportAction={supportAction} />
      <AccessRefusal error={revalidate.error} attempting="ask for a fresh price" supportAction={supportAction} />

      <QuoteBody
        accessPending={accessPending}
        entitled={entitled}
        isA5={isA5}
        quotesPending={quotesQuery.isPending && entitled}
        quotesError={quotesQuery.error}
        onRetryQuotes={() => void quotesQuery.refetch()}
        list={list}
        canChoose={canChoose}
        view={view}
        onViewChange={setView}
        picked={pickedId}
        chosenId={selection?.proposalId ?? null}
        onPick={setPicked}
        isRevalidating={revalidate.isPending}
        onReject={setRejecting}
        onRevalidate={(proposalId) => revalidate.mutate({ requirementId, proposalId })}
        requestHref={requestHref}
      />

      {/* The commitment, made once, with its consequence beside it.
       *
       * Docked rather than inline because a quote card is often a screen tall:
       * an inline control means the price you are agreeing to has scrolled away
       * by the time you reach the button. The sentence under it is `M2-FE-411`
       * verbatim in shorter words, and it is here rather than in a dialog
       * because a Customer must read it *before* pressing, not after.
       *
       * Above the phone tab bar, not over it. */}
      {pickedId !== null && canChoose ? (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-2 grid gap-3 border-t border-line bg-surface px-4 py-3 shadow-raised sm:-mx-6 sm:px-6 md:bottom-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:-mx-[calc((100vw-1180px)/2)] lg:px-[calc((100vw-1180px)/2)]">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-text">
              {list?.cards.find((card) => card.proposalId === pickedId)?.vendorName ??
                "This professional"}
              {" · "}
              {list?.cards.find((card) => card.proposalId === pickedId)?.payableLabel}
            </p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">
              Choosing opens the engagement. Nothing is charged now.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" className="min-w-[164px]" onClick={() => setRejecting(pickedId)}>
              Turn this one down
            </Button>
            <Button
              className="min-w-[198px] justify-between gap-4 px-7"
              onClick={() =>
                select.mutate(
                  { requirementId, proposalId: pickedId },
                  {
                    onSuccess: (chosen) => {
                      const destination = destinationAfterSelection(chosen);
                      if (destination !== null) {
                        router.replace(destination);
                      }
                    },
                  },
                )
              }
              loading={select.isPending}
              loadingLabel="Choosing"
            >
              Choose{" "}
              {list?.cards.find((card) => card.proposalId === pickedId)?.vendorName ??
                "this professional"}
              <span aria-hidden className="text-xl leading-none">
                ›
              </span>
            </Button>
          </div>
        </div>
      ) : null}

      <RejectQuoteDialog
        open={rejecting !== null}
        onOpenChange={(open) => setRejecting(open ? rejecting : null)}
        vendorName={
          list?.cards.find((card) => card.proposalId === rejecting)?.vendorName ?? null
        }
        replacementsRemaining={list?.replacementsRemaining ?? null}
        replacementKind={isA5 ? "visit" : "quote"}
        isPending={reject.isPending}
        onReject={(reason: RejectionReason, note: string) => {
          const proposalId = rejecting;
          setRejecting(null);
          if (proposalId !== null) {
            reject.mutate({ requirementId, proposalId, reason, note });
          }
        }}
      />
    </div>
  );
}

function QuoteBody({
  accessPending,
  entitled,
  isA5,
  quotesPending,
  quotesError,
  onRetryQuotes,
  list,
  canChoose,
  view,
  onViewChange,
  picked,
  chosenId,
  onPick,
  isRevalidating,
  onReject,
  onRevalidate,
  requestHref,
}: {
  accessPending: boolean;
  entitled: boolean;
  isA5: boolean;
  quotesPending: boolean;
  quotesError: unknown;
  onRetryQuotes: () => void;
  list: ReturnType<typeof toQuoteListView> | null;
  canChoose: boolean;
  view: "quotes" | "compare";
  onViewChange: (view: "quotes" | "compare") => void;
  picked: string | null;
  chosenId: string | null;
  onPick: (proposalId: string) => void;
  isRevalidating: boolean;
  onReject: (proposalId: string) => void;
  onRevalidate: (proposalId: string) => void;
  requestHref: string;
}) {
  if (accessPending || quotesPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your quotes</span>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!entitled) {
    return (
      <EmptyState
        title={isA5 ? "Your estimates are not ready yet" : "These quotes are not unlocked yet"}
        description={
          isA5
            ? "Once a professional has visited and written your estimate, it appears here in full — you will not be asked to pay again to read it."
            : "Unlock them from your request to read the full scope, price and terms."
        }
        action={
          <Link href={requestHref} className={buttonStyles({ variant: "primary" })}>
            Back to this request
          </Link>
        }
      />
    );
  }

  if (quotesError !== null && quotesError !== undefined) {
    // The two entitlement refusals can still land here — an unlock refunded, or
    // a plan voided, between the access read and this one. They are states, not
    // faults, and they read as the state.
    if (isUnlockRequired(quotesError) || isVisitPlanRequired(quotesError)) {
      return (
        <EmptyState
          title="You cannot read these right now"
          description="Your access to these quotes has changed since this page loaded. Open your request to see where it stands."
          action={
            <Link href={requestHref} className={buttonStyles({ variant: "primary" })}>
              Back to this request
            </Link>
          }
        />
      );
    }
    const presentation = describeError(quotesError, "read");
    return (
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={onRetryQuotes}
        reference={presentation.reference}
      />
    );
  }

  if (list === null || list.cards.length === 0) {
    return (
      <EmptyState
        title={isA5 ? "No estimates yet" : "No quotes yet"}
        description={
          isA5
            ? "The professionals who visit write your estimate on site. They appear here as they arrive."
            : "Nothing has arrived yet. We will tell you when it does."
        }
      />
    );
  }

  // Comparing one thing is not comparing. With a single quote the control would
  // offer a view that is identical to the one already open.
  const canCompare = list.cards.length > 1;

  if (!canCompare) {
    const card = list.cards[0]!;
    return (
      <SingleQuoteExperience
        card={card}
        isA5={isA5}
        canChoose={canChoose}
        picked={picked}
        isChosen={chosenId === card.proposalId}
        onPick={onPick}
        onReject={onReject}
        onRevalidate={onRevalidate}
        isRevalidating={isRevalidating}
      />
    );
  }

  return (
    <>
      {/* The segment is a phone affordance only.
          Above `lg` the table and the cards are not two views of one screen —
          the table *is* the screen, at the width it was designed for, and the
          cards are how the same three quotes render when there is no room for
          columns. Offering a toggle there would be offering a choice between a
          layout and a worse version of itself. */}
      {canCompare ? (
        <SegmentedTrack label="How to read these" className="sm:max-w-sm lg:hidden">
          {(
            [
              { value: "quotes", label: isA5 ? "Estimates" : "Quotes" },
              { value: "compare", label: "Compare" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              // `aria-pressed` rather than `role="tab"`: there is no tabpanel
              // relationship here, and claiming one promises navigation
              // semantics this control does not have.
              aria-pressed={view === option.value}
              onClick={() => onViewChange(option.value)}
              className={segmentStyles({ selected: view === option.value })}
            >
              {option.label}
            </button>
          ))}
        </SegmentedTrack>
      ) : null}

      {/* The table is the reason this screen is worth building: aligned rows let
          somebody read across totals, first stages and exclusions instead of
          comparing two stacked cards from memory.

          It used to be `hidden lg:block` — desktop only, on the grounds that it
          is unusable on a phone. It is not: it already carries `overflow-x-auto`
          and a `min-w`, so it scrolls sideways, and a phone is where most of
          this product is read. What made it unusable was being rendered *at the
          same time* as the cards, so a phone got the whole comparison and the
          whole of every card in one column. Behind a segment it is a view the
          Customer asks for, at any width.

          **It compares and it does not decide.** Picking stays on the cards, and
          committing stays in the docked bar. A Choose control in the table as
          well would give one estimate two of them — two places a selection can
          be made, two places a refusal has to be rendered, and two things to
          keep in step with `canChoose`. "Read it" links each column to the card
          that holds the vendor's own words. */}
      {/* Always at `lg`, and below it only when asked for. */}
      <div className={canCompare && view === "compare" ? "" : "hidden lg:block"}>
        <QuoteComparison
          cards={list.cards}
          isComparableOnOneBasis={list.isComparableOnOneBasis}
          detailHrefFor={(proposalId) => `#estimate-${proposalId}`}
          pickedId={picked}
          chosenId={chosenId}
          onPick={canChoose ? onPick : undefined}
        />
      </div>

      <div
        className={
          canCompare && view === "compare"
            ? "hidden"
            : "flex flex-col gap-4 lg:hidden"
        }
      >
        {list.cards.map((card, index) => (
          <QuoteCard
            key={card.proposalId}
            card={card}
            index={index}
            onPick={canChoose ? onPick : undefined}
            isPicked={picked === card.proposalId}
            isChosen={chosenId === card.proposalId}
            onReject={canChoose ? onReject : undefined}
            onRevalidate={onRevalidate}
            isRevalidating={isRevalidating}
          />
        ))}
      </div>

      {!canChoose ? (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          You have already chosen one of these, so the others cannot be picked
          while that stands. If it falls through, they come back — at no extra
          charge.
        </p>
      ) : null}
    </>
  );
}

function SingleQuoteExperience({
  card,
  isA5,
  canChoose,
  picked,
  isChosen,
  onPick,
  onReject,
  onRevalidate,
  isRevalidating,
}: {
  card: ReturnType<typeof toQuoteListView>["cards"][number];
  isA5: boolean;
  canChoose: boolean;
  picked: string | null;
  isChosen: boolean;
  onPick: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
  onRevalidate: (proposalId: string) => void;
  isRevalidating: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="min-w-0">
        <QuoteCard
          card={card}
          index={0}
          onPick={canChoose ? onPick : undefined}
          isPicked={picked === card.proposalId}
          isChosen={isChosen}
          onReject={canChoose ? onReject : undefined}
          onRevalidate={onRevalidate}
          isRevalidating={isRevalidating}
        />
      </div>

      <aside className="rounded-[10px] border border-line bg-surface p-5 shadow-card">
        <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-text-muted">
          More choice
        </p>
        <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-tight text-text">
          Want more {isA5 ? "estimates" : "quotes"} before choosing?
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-text-secondary">
          You can keep this one visible and ask us to look for another professional
          if the price, timing or scope does not feel right.
        </p>

        <div className="mt-4 rounded-[8px] border border-action-line bg-action-surface p-4">
          <p className="text-sm font-extrabold text-text">Best when you want to compare</p>
          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            <PromptLine>Another professional may include different scope.</PromptLine>
            <PromptLine>You can compare price, warranty and exclusions.</PromptLine>
            <PromptLine>Nothing is booked until one confirms.</PromptLine>
          </ul>
        </div>

        {canChoose ? (
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => onReject(card.proposalId)}
          >
            Ask for another option
          </Button>
        ) : null}
      </aside>
    </div>
  );
}

function PromptLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm font-semibold leading-5 text-text-secondary">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-1 size-3.5 shrink-0 text-success-text"
      >
        <path d="m5 12 5 5 9-10" />
      </svg>
      <span>{children}</span>
    </li>
  );
}
