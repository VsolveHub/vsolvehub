"use client";

import {
  blocksNewSelection,
  describeError,
  isSelectionConflict,
  isUnlockRequired,
  isVisitPlanRequired,
  useServerCountdown,
  type RejectionReason,
} from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { useVisitPlan } from "@/features/access/queries";
import { useRequirement } from "@/features/requirement/queries";
import { titleForSlug } from "@/features/requirement/view/my-requests-screen";
import { estimateConfirmHref, estimateQuestionsHref, requestEstimateHref } from "@/lib/routes";

import {
  canAskAboutPrice,
  priceSpread,
  scopeGaps,
  stageTotalMismatchPaise,
  toSelectionView,
  unansweredVendorQuestions,
  type QuoteListView,
} from "../adapters";
import {
  useEntitledQuoteList,
  useRejectQuote,
  useRequestRevision,
  useRevalidateQuote,
  useSelection,
} from "../queries";
import { PriceAskSheet } from "./price-ask-sheet";
import { QuoteCard } from "./quote-card";
import { ShoppingListCard } from "./shopping-list-card";
import { QuoteComparison } from "./quote-comparison";
import { QuestionInbox } from "./question-inbox";
import { RejectQuoteDialog } from "./reject-quote-dialog";
import { SelectionStatus } from "./selection-status";
import { StageMismatchNotice } from "./stage-mismatch-notice";

/**
 * The estimates on one request — `M2-FE-407`..`M2-FE-414`, `M2-FE-423`.
 *
 * ## This page decides; it does not read
 *
 * The split that shapes everything here: **the list is where you decide, the
 * detail page is what you decided on.** They used to be the same screen —
 * with one estimate this route rendered the entire `EstimateDetailScreen`
 * inline, so two URLs showed one experience, the back button landed you where
 * you already were, and every line of copy was maintained twice in two
 * layouts. The document now lives only at `/quotes/{proposalId}`.
 *
 * What a decision needs is the Four Facts in fixed positions, what separates
 * the estimates from one another, and one way forward. That is this page.
 *
 * ## Desktop is a different layout, not a wider one
 *
 * Below `lg` the estimates are cards with a sticky action bar. At `lg` they
 * become the **columns of one comparison matrix** with a sticky vendor header
 * carrying `Choose`, which is why there is no docked bar on a wide screen. The
 * old wide layout rendered the same estimates twice — a card grid and then a
 * comparison table underneath it — plus a mobile-only segmented control to
 * switch between two views that were both already on screen.
 *
 * ## Entitlement is asked for, not assumed
 *
 * The quote read refuses an unentitled caller with `403` (A3) or `409` (A5).
 * Both are ordinary states, handled by `useEntitledQuoteList`.
 */

export interface QuotesScreenProps {
  requirementId: string;
  requestHref: string;
}

function QuoteBreadcrumb({ requestLabel, requestHref }: { requestLabel: string; requestHref: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.history.back();
        }}
        aria-label="Go back"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-text shadow-2xs transition-colors hover:bg-surface-hover hover:text-text-primary active:scale-95 cursor-pointer"
      >
        <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
      </button>
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/activity" className="hover:text-text">Bookings</Link></li>
          <li aria-hidden className="text-warm-400">›</li>
          <li><Link href={requestHref} className="hover:text-text">{requestLabel}</Link></li>
          <li aria-hidden className="text-warm-400">›</li>
          <li className="font-extrabold text-text" aria-current="page">Estimates</li>
        </ol>
      </nav>
    </div>
  );
}

function countWord(count: number): string {
  return count === 1 ? "One" : count === 2 ? "Two" : count === 3 ? "Three" : String(count);
}

/**
 * How many visits have produced an estimate, as filled and hollow dots.
 *
 * This was a clause buried mid-paragraph — "2 more are due after the remaining
 * visits" — which is a fact about whether the decision can even be made yet,
 * hidden in reassurance prose. Rendered when the plan says more are coming.
 */
function VisitProgress({ arrived, expected }: { arrived: number; expected: number }) {
  const total = Math.max(expected, arrived);
  return (
    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-text-secondary">
      <span aria-hidden className="flex gap-1">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={index < arrived ? "text-signal-600" : "text-warm-300"}
          >
            ●
          </span>
        ))}
      </span>
      {arrived >= total
        ? `all ${total} ${total === 1 ? "visit" : "visits"} done`
        : `${arrived} of ${total} visits done`}
    </p>
  );
}

export function QuotesScreen({ requirementId, requestHref }: QuotesScreenProps) {
  const router = useRouter();
  const access = useEntitledQuoteList(requirementId);
  const planQuery = useVisitPlan(requirementId);
  const requirementQuery = useRequirement(requirementId);
  const selectionQuery = useSelection(requirementId);

  const reject = useRejectQuote();
  const revalidate = useRevalidateQuote();
  const revision = useRequestRevision();

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const list = access.list;
  const isA5 = access.isA5;
  const selection =
    selectionQuery.data === undefined || selectionQuery.data === null
      ? null
      : toSelectionView(selectionQuery.data);
  const countdown = useServerCountdown(selection?.reconfirmBy ?? null, 30_000);
  const selectedCard =
    selection === null ? null : (list?.cards.find((card) => card.proposalId === selection.proposalId) ?? null);

  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);
  const defaultPicked =
    canChoose && list !== null
      ? (list.cards.find((card) => card.isSelectable && !card.isExpired)?.proposalId ?? null)
      : null;
  const pickedId = picked ?? defaultPicked;
  const pickedCard = list?.cards.find((card) => card.proposalId === pickedId) ?? null;
  const askingCard = list?.cards.find((card) => card.proposalId === asking) ?? null;

  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );
  const requestLabel =
    requirementQuery.data === undefined ? "This request" : titleForSlug(requirementQuery.data.category_slug);
  const expected = planQuery.data?.plan?.plan_size ?? null;
  const arrived = list?.cards.length ?? 0;
  const waiting = list === null ? [] : unansweredVendorQuestions(list.cards);
  const spread = list === null ? null : priceSpread(list.cards, list.isComparableOnOneBasis);
  const noun = isA5 ? "estimate" : "quote";

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pt-5 pb-28 sm:px-6 lg:px-0 lg:pb-12">
      <QuoteBreadcrumb requestLabel={requestLabel} requestHref={requestHref} />

      {/* The header answers "how far apart are these?" before anything else.
          It used to open with three lines of reassurance and put the price
          range nowhere at all. */}
      <header>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-text sm:text-[1.875rem]">
          {arrived === 0
            ? `No ${noun}s yet.`
            : `${countWord(arrived)} ${arrived === 1 ? noun : `${noun}s`} in.`}
        </h1>
        {spread !== null ? (
          <p className="mt-1 text-[15px] font-bold tabular-nums text-text-secondary">
            {spread.lowLabel} — {spread.highLabel}
            <span className="font-semibold text-text-muted"> · spread {spread.spreadPercent}%</span>
          </p>
        ) : null}
        {expected !== null && expected > 0 ? (
          <VisitProgress arrived={arrived} expected={expected} />
        ) : null}
      </header>

      {selection !== null ? (
        <SelectionStatus
          selection={selection}
          vendorName={selectedCard?.vendorName ?? null}
          reconfirmRemaining={countdown?.isExpired === false ? countdown.announce : null}
          supportAction={supportAction}
        />
      ) : null}

      {waiting.length > 0 ? (
        <div className="rounded-[14px] border border-warning-line bg-warning-surface px-4 py-3">
          <p className="text-sm font-bold text-text">
            {waiting.length === 1 ? `${waiting[0]!.card.vendorName ?? "A professional"} asked you a question` : `${waiting.length} questions are waiting on you`}
          </p>
          <p className="mt-0.5 text-sm leading-6 text-text-secondary">“{waiting[0]!.question.question}”</p>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className={buttonStyles({ variant: "primary", size: "sm", className: "mt-2 cursor-pointer" })}
          >
            Answer
          </button>
        </div>
      ) : null}

      <AccessRefusal error={reject.error} attempting="turn this estimate down" supportAction={supportAction} />
      <AccessRefusal error={revalidate.error} attempting="ask for a fresh price" supportAction={supportAction} />
      <AccessRefusal error={revision.error} attempting="ask about this estimate" supportAction={supportAction} />

      <QuoteBody
        requirementId={requirementId}
        accessPending={access.isPending}
        entitled={access.entitled}
        isA5={isA5}
        serviceName={requestLabel}
        quotesError={access.error}
        onRetryQuotes={access.refetch}
        list={list}
        canChoose={canChoose}
        picked={pickedId}
        chosenId={selection?.proposalId ?? null}
        onPick={setPicked}
        isRevalidating={revalidate.isPending}
        onReject={setRejecting}
        onAskAboutPrice={setAsking}
        onRevalidate={(proposalId) => revalidate.mutate({ requirementId, proposalId })}
        requestHref={requestHref}
      />

      {/* The lean, made visible; the commitment lives on the confirm page.
          Hidden at `lg`, where every column of the matrix carries its own
          Choose in a sticky header and a docked bar would be a second answer
          to a question already on screen. */}
      {pickedCard !== null && canChoose ? (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-2 grid gap-3 border-t border-line bg-surface px-4 py-3 shadow-raised sm:-mx-6 sm:px-6 md:bottom-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:hidden">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-text">
              {pickedCard.vendorName ?? "This professional"} · {pickedCard.payableLabel}
            </p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">
              You confirm what you are agreeing to on the next screen. Nothing is charged now.
            </p>
          </div>
          <Button
            className="min-w-[198px] justify-between gap-4 px-7"
            onClick={() => router.push(estimateConfirmHref(requirementId, pickedCard.proposalId))}
          >
            Choose {pickedCard.vendorName ?? "this professional"}
            <span aria-hidden className="text-xl leading-none">›</span>
          </Button>
        </div>
      ) : null}

      {isSelectionConflict(selectionQuery.error) ? (
        <ErrorState title="Somebody chose first" message="Another session picked a professional a moment ago. This page shows what actually happened." severity="warning" inline />
      ) : null}

      <RejectQuoteDialog
        open={rejecting !== null}
        onOpenChange={(open) => setRejecting(open ? rejecting : null)}
        vendorName={list?.cards.find((card) => card.proposalId === rejecting)?.vendorName ?? null}
        replacementsRemaining={list?.replacementsRemaining ?? null}
        replacementKind={isA5 ? "visit" : "quote"}
        isPending={reject.isPending}
        onReject={(reason: RejectionReason, note: string) => {
          const proposalId = rejecting;
          setRejecting(null);
          if (proposalId !== null) reject.mutate({ requirementId, proposalId, reason, note });
        }}
      />
      <PriceAskSheet
        open={asking !== null}
        onOpenChange={(open) => setAsking(open ? asking : null)}
        card={askingCard}
        isPending={revision.isPending}
        onAccept={(proposalId) => {
          setAsking(null);
          router.push(estimateConfirmHref(requirementId, proposalId));
        }}
        onSend={(input) => {
          const proposalId = asking;
          if (proposalId === null) return;
          revision.mutate(
            { requirementId, proposalId, ...input },
            { onSuccess: () => setAsking(null) },
          );
        }}
      />
      <QuestionInbox
        requirementId={requirementId}
        supportAction={supportAction}
        open={chatOpen}
        onOpenChange={setChatOpen}
        showFab={false}
      />
    </div>
  );
}

function QuoteBody({
  requirementId,
  accessPending,
  entitled,
  isA5,
  serviceName,
  quotesError,
  onRetryQuotes,
  list,
  canChoose,
  picked,
  chosenId,
  onPick,
  isRevalidating,
  onReject,
  onAskAboutPrice,
  onRevalidate,
  requestHref,
}: {
  requirementId: string;
  accessPending: boolean;
  entitled: boolean;
  isA5: boolean;
  /** Names the shopping list when it is shared — "What to buy — Full home rewiring". */
  serviceName: string;
  quotesError: unknown;
  onRetryQuotes: () => void;
  list: QuoteListView | null;
  canChoose: boolean;
  picked: string | null;
  chosenId: string | null;
  onPick: (proposalId: string) => void;
  isRevalidating: boolean;
  onReject: (proposalId: string) => void;
  onAskAboutPrice: (proposalId: string) => void;
  onRevalidate: (proposalId: string) => void;
  requestHref: string;
}) {
  if (accessPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your estimates</span>
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
        action={<Link href={requestHref} className={buttonStyles({ variant: "primary" })}>Back to this request</Link>}
      />
    );
  }

  if (quotesError !== null && quotesError !== undefined) {
    if (isUnlockRequired(quotesError) || isVisitPlanRequired(quotesError)) {
      return (
        <EmptyState
          title="You cannot read these right now"
          description="Your access to these estimates has changed since this page loaded. Open your request to see where it stands."
          action={<Link href={requestHref} className={buttonStyles({ variant: "primary" })}>Back to this request</Link>}
        />
      );
    }
    const presentation = describeError(quotesError, "read");
    return (
      <ErrorState title={presentation.title} message={presentation.message} severity={presentation.severity} actionLabel="Try again" onAction={onRetryQuotes} reference={presentation.reference} />
    );
  }

  if (list === null || list.cards.length === 0) {
    return (
      <EmptyState
        title={isA5 ? "No estimates yet" : "No quotes yet"}
        description={isA5 ? "The professionals who visit write your estimate on site. They appear here as they arrive." : "Nothing has arrived yet. We will tell you when it does."}
      />
    );
  }

  const cards = list.cards;

  const cardList = (
    <div className="flex flex-col gap-4">
      {cards.map((card, index) => (
        <QuoteCard
          key={card.proposalId}
          card={card}
          index={index}
          detailHref={requestEstimateHref(requirementId, card.proposalId)}
          questionsHref={estimateQuestionsHref(requirementId, card.proposalId)}
          scopeGaps={scopeGaps(card, cards)}
          siblings={cards}
          onPick={canChoose ? onPick : undefined}
          isPicked={picked === card.proposalId}
          isChosen={chosenId === card.proposalId}
          onReject={canChoose ? onReject : undefined}
          onRequestRevision={canChoose ? onAskAboutPrice : undefined}
          onAskAboutPrice={canChoose ? onAskAboutPrice : undefined}
          onRevalidate={onRevalidate}
          isRevalidating={isRevalidating}
        />
      ))}
    </div>
  );

  if (cards.length === 1) {
    // One estimate is still a decision, but a different one: not "which of
    // these?" but "is this fair, and should I get another?". So it gets a
    // decision surface too — not the whole document inlined, which is what
    // this branch used to render.
    const only = cards[0]!;
    const mismatch = stageTotalMismatchPaise(only);
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {mismatch !== null ? (
            <StageMismatchNotice card={only} driftPaise={mismatch} />
          ) : null}
          {cardList}
        </div>
        <div className="flex flex-col gap-4">
          {only.materialFulfilmentMode === "CUSTOMER_PROCURES" ? (
            <ShoppingListCard
              requirementId={requirementId}
              proposalId={only.proposalId}
              rows={only.materialList}
              brandTierLabel={only.brandTierLabel}
              vendorName={only.vendorName}
              serviceName={serviceName}
            />
          ) : null}
          <aside className="rounded-[14px] border border-line bg-surface p-5 shadow-card">
            <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-text-muted">
              Before you decide
            </p>
            <h2 className="mt-2 text-lg font-extrabold leading-tight tracking-tight text-text">
              Nothing to compare it against yet.
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-text-secondary">
              One {isA5 ? "estimate" : "quote"} tells you a price. Two tell you whether it is a
              good one.
            </p>
            {/* Both actions act *on this estimate*, so both need it to still be
                live. `canChoose` alone was the wrong gate: it asks whether the
                request has a chosen vendor, which is true of an estimate the
                Customer already turned down — and offering "get another" on a
                rejected estimate is a button that rejects it a second time. */}
            {canChoose && only.isSelectable ? (
              <div className="mt-4 flex flex-col gap-2">
                <Button variant="outline" onClick={() => onReject(only.proposalId)}>
                  Get another {isA5 ? "estimate" : "quote"} — free
                </Button>
                {canAskAboutPrice(only) ? (
                  <Button variant="outline" onClick={() => onAskAboutPrice(only.proposalId)}>
                    Ask about the price
                  </Button>
                ) : null}
              </div>
            ) : null}
            {canChoose && only.isSelectable ? (
              <p className="mt-3 text-xs leading-5 text-text-muted">
                Both keep this {isA5 ? "estimate" : "quote"} live. Nothing is charged either way.
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Below `lg`: cards, then the differences underneath them.
          At `lg`: the matrix alone, which is the cards *as* columns. Rendering
          both at once was the old wide layout's mistake. */}
      <div className="lg:hidden">{cardList}</div>
      <div className="mt-2 lg:mt-0">
        <QuoteComparison
          cards={cards}
          isComparableOnOneBasis={list.isComparableOnOneBasis}
          detailHrefFor={(proposalId) => requestEstimateHref(requirementId, proposalId)}
          confirmHrefFor={(proposalId) => estimateConfirmHref(requirementId, proposalId)}
          pickedId={picked}
          chosenId={chosenId}
          onPick={canChoose ? onPick : undefined}
          canChoose={canChoose}
        />
      </div>

      {!canChoose ? (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          You have already chosen one of these, so the others cannot be picked while that stands. If it falls through, they come back — at no extra charge.
        </p>
      ) : null}
    </>
  );
}
