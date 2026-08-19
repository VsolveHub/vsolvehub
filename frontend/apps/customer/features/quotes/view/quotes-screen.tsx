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
import { EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { useUnlockState, useVisitPlan } from "@/features/access/queries";
import { toQuoteListView, toSelectionView } from "../adapters";
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

export function QuotesScreen({
  requirementId,
  requestHref,
}: QuotesScreenProps) {
  const unlockQuery = useUnlockState(requirementId);
  const planQuery = useVisitPlan(requirementId);

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

  // `M2-FE-414`. A live selection blocks a second one and the control is
  // withheld rather than disabled, so a stale render cannot start one. The
  // server refuses anyway with `m2_selection_conflict`; this is what stops the
  // Customer meeting that refusal in the first place.
  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);

  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );

  const accessPending = unlockQuery.isPending && planQuery.isPending;

  return (
    // Wider than a reading column, because a three-estimate comparison needs the
    // room — the table has a label column plus one per estimate, and squeezing it
    // into 48rem turns the thing that makes this screen worth building into a
    // horizontal scroll. The prose inside still holds itself to `max-w-prose`.
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold text-text">
          {isA5 ? "Your estimates" : "Your quotes"}
        </h1>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          {isA5
            ? "Each professional who visited has written down what the job takes and what it costs. Read them in full — you have already paid for these."
            : "The full scope, price and terms of every quote you unlocked. Compare them and choose one."}
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
        isSelecting={select.isPending}
        isRevalidating={revalidate.isPending}
        onSelect={(proposalId) => select.mutate({ requirementId, proposalId })}
        onReject={setRejecting}
        onRevalidate={(proposalId) => revalidate.mutate({ requirementId, proposalId })}
        requestHref={requestHref}
      />

      <p className="max-w-prose text-sm leading-6 text-text-secondary">
        You cannot change a price here, and neither can we — only the
        professional who wrote it can. If one of them has asked you something, it
        is on{" "}
        <Link href={requestHref} className="font-medium text-info-text underline-offset-4 hover:underline">
          your request
        </Link>
        , with the rest of what has happened.
      </p>

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
  isSelecting,
  isRevalidating,
  onSelect,
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
  isSelecting: boolean;
  isRevalidating: boolean;
  onSelect: (proposalId: string) => void;
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

  return (
    <>
      {/* The table is the reason this screen is worth building on a wide
          display: aligned rows let somebody read across totals, first stages and
          exclusions instead of comparing two stacked cards from memory. It is
          unusable on a phone, so it is not rendered there — `hidden` is
          `display:none`, which takes it out of the accessibility tree too rather
          than leaving a screen reader to walk a table nobody can see.

          **It compares and it does not decide.** Choosing stays on the cards
          below, which render at every size. Putting a Choose control in the
          table as well would give one estimate two of them — two places a
          selection can be made, two places a refusal has to be rendered, and two
          things to keep in step with `canChoose`. "Read it" links each column to
          the card that holds the vendor's own words. */}
      <div className="hidden lg:block">
        <QuoteComparison
          cards={list.cards}
          isComparableOnOneBasis={list.isComparableOnOneBasis}
          detailHrefFor={(proposalId) => `#estimate-${proposalId}`}
        />
      </div>

      <div className="flex flex-col gap-4">
        {list.cards.map((card, index) => (
          <QuoteCard
            key={card.proposalId}
            card={card}
            index={index}
            onSelect={canChoose ? onSelect : undefined}
            isSelecting={isSelecting}
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
