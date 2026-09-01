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
import {
  Button,
  EmptyState,
  ErrorState,
  SegmentedTrack,
  Skeleton,
  buttonStyles,
  segmentStyles,
} from "@vsolve/ui";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { useVisitPlan } from "@/features/access/queries";
import { useRequirement } from "@/features/requirement/queries";
import { titleForSlug } from "@/features/requirement/view/my-requests-screen";
import { estimateConfirmHref, estimateQuestionsHref, requestEstimateHref } from "@/lib/routes";

import { scopeGaps, toSelectionView, unansweredVendorQuestions, type QuoteListView } from "../adapters";
import {
  useEntitledQuoteList,
  useRejectQuote,
  useRequestRevision,
  useRevalidateQuote,
  useSelection,
} from "../queries";
import { EstimateDetailScreen } from "./estimate-detail-screen";
import { QuoteCard } from "./quote-card";
import { ShoppingListCard } from "./shopping-list-card";
import { QuoteComparison } from "./quote-comparison";
import { QuestionInbox } from "./question-inbox";
import { RejectQuoteDialog } from "./reject-quote-dialog";
import { RevisionRequestDialog } from "./revision-request-dialog";
import { SelectionStatus } from "./selection-status";

/**
 * The estimates on one request — `M2-FE-407`..`M2-FE-414`, `M2-FE-423`.
 *
 * One route for both archetypes: full proposals, a comparison, a choice. What
 * differs is which door was paid for, and that is read from the server rather
 * than branched on here.
 *
 * ## What changed in the revamp
 *
 * The card is a summary and the document has its own page. The comparison
 * shows where the estimates *differ* rather than a column of everything. A
 * professional's unanswered question is surfaced with a way to answer it. The
 * Customer can ask for a revision with a reason — no price on it, ever — and
 * "Choose" leads to a confirm step rather than opening the agreement from a
 * docked bar.
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
  const [revising, setRevising] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<"quotes" | "compare">("quotes");
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

  useEffect(() => {
    if (access.list === null || !window.location.hash.startsWith("#estimate-")) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target === null) return;
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }, [access.list]);

  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);
  const defaultPicked =
    canChoose && list !== null
      ? (list.cards.find((card) => card.isSelectable && !card.isExpired)?.proposalId ?? null)
      : null;
  const pickedId = picked ?? defaultPicked;
  const pickedCard = list?.cards.find((card) => card.proposalId === pickedId) ?? null;

  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );
  const requestLabel =
    requirementQuery.data === undefined ? "This request" : titleForSlug(requirementQuery.data.category_slug);
  const expected = planQuery.data?.plan?.plan_size ?? null;
  const arrived = list?.cards.length ?? 0;
  const stillDue = expected !== null && expected > arrived ? expected - arrived : 0;
  const waiting = list === null ? [] : unansweredVendorQuestions(list.cards);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pt-5 pb-28 sm:px-6 sm:pb-12 lg:px-0">
      <QuoteBreadcrumb requestLabel={requestLabel} requestHref={requestHref} />
      <header>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-text sm:text-[1.875rem]">
          {arrived === 0
            ? isA5 ? "Your estimates" : "Your quotes"
            : `${countWord(arrived)} ${isA5 ? (arrived === 1 ? "estimate" : "estimates") : arrived === 1 ? "quote" : "quotes"}${arrived > 1 ? ", side by side" : ""}.`}
        </h1>
        <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-text-secondary">
          {stillDue > 0
            ? `${stillDue} more ${stillDue === 1 ? "is" : "are"} due after the remaining ${stillDue === 1 ? "visit" : "visits"}. `
            : ""}
          Full scope, price and terms — nothing here is hidden. Choose any time; nothing is charged until you do.
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
            Chat now
          </button>
        </div>
      ) : null}

      <AccessRefusal error={reject.error} attempting="turn this estimate down" supportAction={supportAction} />
      <AccessRefusal error={revalidate.error} attempting="ask for a fresh price" supportAction={supportAction} />
      <AccessRefusal error={revision.error} attempting="ask for a revision" supportAction={supportAction} />

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
        view={view}
        onViewChange={setView}
        picked={pickedId}
        chosenId={selection?.proposalId ?? null}
        onPick={setPicked}
        isRevalidating={revalidate.isPending}
        onReject={setRejecting}
        onRequestRevision={setRevising}
        onRevalidate={(proposalId) => revalidate.mutate({ requirementId, proposalId })}
        requestHref={requestHref}
      />

      {/* The lean, made visible; the commitment lives on the confirm page. */}
      {pickedCard !== null && canChoose ? (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-2 grid gap-3 border-t border-line bg-surface px-4 py-3 shadow-raised sm:-mx-6 sm:px-6 md:bottom-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:-mx-[calc((100vw-1180px)/2)] lg:px-[calc((100vw-1180px)/2)]">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-text">
              {pickedCard.vendorName ?? "This professional"} · {pickedCard.payableLabel}
            </p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">
              You confirm what you are agreeing to on the next screen. Nothing is charged now.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={() => setRejecting(pickedCard.proposalId)}>
              Not this one
            </Button>
            <Button
              className="min-w-[198px] justify-between gap-4 px-7"
              onClick={() => router.push(estimateConfirmHref(requirementId, pickedCard.proposalId))}
            >
              Choose {pickedCard.vendorName ?? "this professional"}
              <span aria-hidden className="text-xl leading-none">›</span>
            </Button>
          </div>
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
      <RevisionRequestDialog
        open={revising !== null}
        onOpenChange={(open) => setRevising(open ? revising : null)}
        card={list?.cards.find((card) => card.proposalId === revising) ?? null}
        isPending={revision.isPending}
        onSend={(reasonCode, excludedItems, note) => {
          const proposalId = revising;
          if (proposalId === null) return;
          revision.mutate(
            { requirementId, proposalId, reasonCode, excludedItems, note },
            { onSuccess: () => setRevising(null) },
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
  view,
  onViewChange,
  picked,
  chosenId,
  onPick,
  isRevalidating,
  onReject,
  onRequestRevision,
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
  view: "quotes" | "compare";
  onViewChange: (view: "quotes" | "compare") => void;
  picked: string | null;
  chosenId: string | null;
  onPick: (proposalId: string) => void;
  isRevalidating: boolean;
  onReject: (proposalId: string) => void;
  onRequestRevision: (proposalId: string) => void;
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

  const canCompare = list.cards.length > 1;
  const cards = (
    <div className="flex flex-col gap-4">
      {list.cards.map((card, index) => (
        <QuoteCard
          key={card.proposalId}
          card={card}
          index={index}
          detailHref={requestEstimateHref(requirementId, card.proposalId)}
          questionsHref={estimateQuestionsHref(requirementId, card.proposalId)}
          scopeGaps={scopeGaps(card, list.cards)}
          onPick={canChoose ? onPick : undefined}
          isPicked={picked === card.proposalId}
          isChosen={chosenId === card.proposalId}
          onReject={canChoose ? onReject : undefined}
          onRequestRevision={canChoose ? onRequestRevision : undefined}
          onRevalidate={onRevalidate}
          isRevalidating={isRevalidating}
        />
      ))}
    </div>
  );

  if (!canCompare) {
    // One estimate: show the whole document here rather than a card that
    // links to it. Nothing to compare, nothing to summarise.
    const only = list.cards[0]!;
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0">
          <EstimateDetailScreen
            requirementId={requirementId}
            proposalId={only.proposalId}
            embedded
            hideShoppingList
          />
        </div>
        <div className="flex flex-col gap-4">
        <ShoppingListCard
          requirementId={requirementId}
          proposalId={only.proposalId}
          rows={only.materialList}
          brandTierLabel={only.brandTierLabel}
          vendorName={only.vendorName}
          serviceName={serviceName}
        />
        <aside className="rounded-[14px] border border-line bg-surface p-5 shadow-card">
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-text-muted">More choice</p>
          <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-tight text-text">
            Want another {isA5 ? "estimate" : "quote"} before choosing?
          </h2>
          <p className="mt-2 text-sm font-medium leading-6 text-text-secondary">
            Turn this one down and we send another professional, free — or ask this one for a revision with what you want changed.
          </p>
          {canChoose ? (
            <Button variant="outline" className="mt-4 w-full" onClick={() => onReject(list.cards[0]!.proposalId)}>
              Ask for another option
            </Button>
          ) : null}
        </aside>
        </div>
      </div>
    );
  }

  return (
    <>
      <SegmentedTrack label="How to read these" className="sm:max-w-sm lg:hidden">
        {([
          { value: "quotes", label: isA5 ? "Estimates" : "Quotes" },
          { value: "compare", label: "Compare" },
        ] as const).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={view === option.value}
            onClick={() => onViewChange(option.value)}
            className={segmentStyles({ selected: view === option.value })}
          >
            {option.label}
          </button>
        ))}
      </SegmentedTrack>

      <div className={view === "compare" ? "hidden" : "lg:hidden"}>{cards}</div>

      <div className={view === "compare" ? "" : "hidden lg:block"}>
        <div className="hidden gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-3">
          {list.cards.map((card, index) => (
            <QuoteCard
              key={`wide-${card.proposalId}`}
              card={card}
              index={index}
              detailHref={requestEstimateHref(requirementId, card.proposalId)}
              questionsHref={estimateQuestionsHref(requirementId, card.proposalId)}
              scopeGaps={scopeGaps(card, list.cards)}
              onPick={canChoose ? onPick : undefined}
              isPicked={picked === card.proposalId}
              isChosen={chosenId === card.proposalId}
              onReject={canChoose ? onReject : undefined}
              onRequestRevision={canChoose ? onRequestRevision : undefined}
              onRevalidate={onRevalidate}
              isRevalidating={isRevalidating}
            />
          ))}
        </div>
        <div className="lg:mt-5">
          <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-muted">Compared</h2>
          <QuoteComparison
            cards={list.cards}
            isComparableOnOneBasis={list.isComparableOnOneBasis}
            detailHrefFor={(proposalId) => requestEstimateHref(requirementId, proposalId)}
            pickedId={picked}
            chosenId={chosenId}
            onPick={canChoose ? onPick : undefined}
          />
        </div>
      </div>

      {!canChoose ? (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          You have already chosen one of these, so the others cannot be picked while that stands. If it falls through, they come back — at no extra charge.
        </p>
      ) : null}
    </>
  );
}
