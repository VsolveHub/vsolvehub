"use client";

import { blocksNewSelection } from "@vsolve/query";
import { Badge, Button, Disclosure, ErrorState, Skeleton, buttonStyles, cn , formatDate} from "@vsolve/ui";
import { ChevronLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { useRequirement } from "@/features/requirement/queries";
import { titleForSlug } from "@/features/requirement/view/my-requests-screen";
import { estimateConfirmHref, estimateQuestionsHref, requestQuotesHref } from "@/lib/routes";

import {
  canAskAboutPrice,
  firstStageOf,
  scopeGaps,
  stageTotalMismatchPaise,
  type QuoteCardView,
} from "../adapters";
import {
  useEntitledQuoteList,
  useRejectQuote,
  useRequestRevision,
  useRevalidateQuote,
  useSelection,
} from "../queries";
import { DecisionRail } from "./decision-rail";
import { PriceAskSheet } from "./price-ask-sheet";
import { PriceLines, type PriceLineView } from "./price-lines";
import { QuestionInbox } from "./question-inbox";
import { timelineLabel, validityLabel } from "./quote-card";
import { RejectQuoteDialog } from "./reject-quote-dialog";
import { ShoppingListCard } from "./shopping-list-card";
import { IncludedSupplyCard } from "./included-supply-card";
import { StageMismatchNotice } from "./stage-mismatch-notice";
import { VendorMark, VendorTrustLine, vendorTypeLabel } from "./vendor-trust-line";

/**
 * One estimate, read in full — `/requests/{id}/quotes/{proposalId}`.
 *
 * ## Three bands of decreasing weight
 *
 * The page used to be seven `Section` cards with identical borders, identical
 * radii and identical headings, stacked — so a warranty clause was styled
 * exactly like the ₹2.2 lakh a Customer was about to commit. No hierarchy
 * means no reading order, which means they read all of it or none of it.
 *
 * Now: **the verdict** (who, the number, what to start, and whether it adds
 * up), **the substance** (the priced lines by size, what is excluded, how it
 * is paid, what to buy), and **the fine print** (terms, provenance) collapsed
 * because it is referred to rather than read.
 *
 * ## Nothing is said twice
 *
 * `Included (N)` was `itemLines` reprinted as a bare list — the same eight
 * strings, forty lines of screen apart. The priced lines *are* what is
 * included, so the list is gone. The "what you get" paragraph was
 * `itemLines.join(", ")` rendered inside quotation marks as if the
 * professional had written it; it now appears only when it is genuinely their
 * prose.
 *
 * ## Desktop
 *
 * The document keeps the left column and the decision moves into a sticky
 * rail — which is why the fixed bottom bar is hidden at `lg`. See
 * `DecisionRail`.
 *
 * **No line of it is cut** — `M2-FE-423` forbids gating any part of a paid-for
 * estimate. Folding trivial lines and collapsing the fine print are reading
 * aids: everything opens, and nothing is withheld.
 */
export function EstimateDetailScreen({
  requirementId,
  proposalId,
}: {
  requirementId: string;
  proposalId: string;
}) {
  const router = useRouter();
  const access = useEntitledQuoteList(requirementId);
  const selectionQuery = useSelection(requirementId);
  // Only for naming the shopping list when it is shared — "What to buy —
  // Bathroom renovation". The estimate itself never waits on this read.
  const requirementQuery = useRequirement(requirementId);
  const serviceName =
    requirementQuery.data === undefined
      ? "this job"
      : titleForSlug(requirementQuery.data.category_slug);
  const reject = useRejectQuote();
  const revalidate = useRevalidateQuote();
  const revision = useRequestRevision();
  const [rejecting, setRejecting] = useState(false);
  const [asking, setAsking] = useState(false);

  const cards = access.list?.cards ?? [];
  const card = cards.find((entry) => entry.proposalId === proposalId) ?? null;
  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);
  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );

  if (access.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-5" aria-busy="true">
        <span className="sr-only">Loading this estimate</span>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!access.entitled || card === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-5">
        <ErrorState
          title={access.entitled ? "We could not find this estimate" : "This estimate is not readable yet"}
          message={
            access.entitled
              ? "It may have been withdrawn, or the link is out of date."
              : "Once a professional has visited and written it, it appears here in full."
          }
          severity="warning"
          actionLabel="Back to the estimates"
          onAction={() => { window.location.href = requestQuotesHref(requirementId); }}
        />
      </div>
    );
  }

  const gaps = scopeGaps(card, cards);
  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const validity = validityLabel(card);
  const mismatch = stageTotalMismatchPaise(card);
  const openQuestions = card.questions.filter((question) => question.askedByRole === "VENDOR" && question.answer === null).length;
  const chooseable = canChoose && card.isSelectable && !card.isExpired;
  const priceAskable = canChoose && canAskAboutPrice(card);
  const confirmHref = estimateConfirmHref(requirementId, proposalId);
  const questionsHref = estimateQuestionsHref(requirementId, proposalId);

  // The priced lines, as one ranked list. Materials the pro supplies are named
  // in full because the shopping list below is materials the *Customer* buys,
  // and one word for both is how somebody pays for a fitting twice.
  const priceLines: readonly PriceLineView[] = [
    ...card.itemLines.map((line) => ({
      title: line.title,
      note: line.quantityLabel,
      amountLabel: line.amountLabel,
      amountPaise: line.amountPaise,
    })),
    ...card.labourLines.map((line) => ({
      title: line.team === null ? line.role : `${line.role} — ${line.team}`,
      note: line.crewLabel,
      amountLabel: line.amountLabel,
      amountPaise: line.amountPaise,
    })),
    ...card.otherCharges.map((charge) => ({
      title: charge.label,
      note: "Named charge",
      amountLabel: charge.amountLabel,
      amountPaise: charge.amountPaise,
    })),
    ...card.materials.map((material) => ({
      title: material.title,
      note:
        material.quantityLabel === null
          ? "Materials the pro supplies · paid as an advance"
          : `${material.quantityLabel} · materials the pro supplies · paid as an advance`,
      amountLabel: material.amountLabel ?? "—",
      amountPaise: null,
    })),
  ];

  const hasShoppingList =
    card.materialFulfilmentMode === "PARTNER_TURNKEY" || card.materialList.length > 0;

  const sections = [
    priceLines.length > 0 ? { id: "the-work", label: "The work" } : null,
    { id: "not-included", label: "Not included" },
    card.stages.length > 0 ? { id: "how-you-pay", label: "How you pay" } : null,
    hasShoppingList ? { id: "materials", label: "Materials" } : null,
    { id: "terms", label: "Terms" },
  ].filter((section): section is { id: string; label: string } => section !== null);

  /**
   * The vendor's own prose, or nothing.
   *
   * `scope_summary` is filled by some composers with a join of the line items
   * — "Wall putty - two coats ×5000, Masking and protection ×5000, …" — and
   * rendering that inside quotation marks presents machine output as a
   * professional's own words. It reads as somebody who cannot write a
   * sentence, which is the precise opposite of what this section is for.
   */
  const summaryIsMachineJoin =
    card.scopeSummary !== null &&
    card.itemLines.length > 1 &&
    card.itemLines.filter((line) => card.scopeSummary!.includes(line.title)).length >=
      card.itemLines.length;
  const prose = summaryIsMachineJoin ? null : card.scopeSummary;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-28 sm:px-6 lg:max-w-[1180px] lg:px-0 lg:pb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.history.back();
            }}
            aria-label="Back to all estimates"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-text shadow-2xs transition-colors hover:bg-surface-hover hover:text-text-primary active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
          </button>
          <Link
            href={requestQuotesHref(requirementId)}
            className="text-sm font-bold text-navy-900 hover:text-action transition-colors"
          >
            All estimates
          </Link>
        </div>
        <ShareButton card={card} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex items-start gap-3">
            <VendorMark name={card.vendorName} className="size-14 text-xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold leading-tight tracking-tight text-text">
                  {card.vendorName ?? "This professional"}
                </h1>
                {card.isVerified ? <Badge tone="success">Verified</Badge> : null}
                {card.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
                {card.isExpired ? <Badge tone="neutral">Price expired</Badge> : null}
                {card.discountPaise > 0 ? (
                  <Badge tone="success">
                    {card.discountPercent === null
                      ? "Price reduced"
                      : `${card.discountPercent}% off`}
                  </Badge>
                ) : null}
              </div>
              {vendorTypeLabel(card.vendorType) !== null ? (
                <p className="mt-0.5 text-sm font-semibold text-text-secondary">
                  {vendorTypeLabel(card.vendorType)}
                </p>
              ) : null}
              <VendorTrustLine trust={card.trust} size="md" className="mt-0.5" />
            </div>
          </header>

          {/* BAND 1 — the verdict. Duplicated into the rail at `lg`, where this
              copy is hidden: a wide screen keeps the number pinned while the
              document scrolls, and two of them would be two answers. */}
          <section className="rounded-[18px] bg-navy-900 p-5 text-white lg:hidden">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-signal-300">
              {card.discountPaise > 0 ? "Discounted estimate" : "Their estimate"}
            </p>
            <p className="mt-2 text-[34px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{card.payableLabel}</p>
            {card.discountPaise > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="tabular-nums text-white/60 line-through">
                  {card.discountBaseLabel}
                </span>
                <span className="font-bold text-success-200">You save {card.discountLabel}</span>
              </div>
            ) : null}
            <p className="mt-2 text-sm text-white/75">
              {card.taxBasis === "INCLUSIVE"
                ? `Includes ${card.taxLabel} tax`
                : `Includes ${card.taxLabel} tax added to service rates`}
              {validity !== null ? ` · ${validity.text.toLowerCase()}` : ""}
              {card.revision > 1 ? ` · revision ${card.revision}` : ""}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">To start</dt>
                <dd className="mt-0.5 text-lg font-extrabold tabular-nums">{firstStage?.amountLabel ?? "Not stated"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">Takes</dt>
                <dd className="mt-0.5 text-lg font-extrabold">{timeline ?? "Not stated"}</dd>
              </div>
            </dl>
            {priceAskable ? (
              <button
                type="button"
                onClick={() => setAsking(true)}
                className="mt-4 flex w-full items-center justify-between gap-2 border-t border-white/10 pt-3 text-left text-sm font-bold text-signal-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Any negotiations?
                <span aria-hidden className="text-base leading-none">→</span>
              </button>
            ) : null}
          </section>

          {mismatch !== null ? <StageMismatchNotice card={card} driftPaise={mismatch} /> : null}

          {card.revisionRequest !== null ? (
            <RevisionRequestNotice request={card.revisionRequest} priceLabel={card.payableLabel} />
          ) : null}

          {card.discountPaise > 0 ? <CustomerDiscountSummary card={card} /> : null}

          <AccessRefusal error={reject.error} attempting="turn this estimate down" supportAction={supportAction} />
          <AccessRefusal error={revalidate.error} attempting="ask for a fresh price" supportAction={supportAction} />
          <AccessRefusal error={revision.error} attempting="ask about this estimate" supportAction={supportAction} />

          {/* BAND 2 — the substance. */}
          {prose !== null ? (
            <Section title="In their words" id="in-their-words">
              <p className="whitespace-pre-line text-[15px] leading-7 text-text">“{prose}”</p>
            </Section>
          ) : null}

          {priceLines.length > 0 ? (
            <Section
              id="the-work"
              title={`The work — ${priceLines.length} ${priceLines.length === 1 ? "line" : "lines"}, ${card.payableLabel}`}
            >
              <PriceLines
                lines={priceLines}
                totalPaise={card.discountBasePaise || card.payablePaise}
              />
            </Section>
          ) : null}

          <Section id="not-included" title="Not included">
            {card.exclusions.length === 0 ? (
              // An empty state that does something. This was a half-width
              // column reading "Not included (0)" above an apology.
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm leading-6 text-text-secondary">
                  They listed nothing as excluded.
                </p>
                <Link
                  href={questionsHref}
                  className="text-sm font-bold text-text-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  Ask what&rsquo;s out →
                </Link>
              </div>
            ) : (
              <ul className="flex list-none flex-col gap-1 p-0">
                {card.exclusions.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm leading-6 text-text-secondary">
                    <span aria-hidden className="font-bold text-warm-400">✗</span>
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {gaps.length > 0 ? (
              <p className="mt-3 rounded-[10px] border border-warning-line bg-warning-surface px-3 py-2 text-[13px] leading-5 text-text">
                <strong className="font-bold">Other estimates include:</strong> {gaps.join(", ")}. Not listed
                here — it may be priced elsewhere or left out. Worth asking.
              </p>
            ) : null}
          </Section>

          {card.stages.length > 0 ? (
            <Section id="how-you-pay" title="How you pay">
              <ol className="flex list-none flex-col gap-2 p-0">
                {card.stages.map((stage, index) => (
                  <li key={`s-${index}`} className="flex items-start gap-3 rounded-[12px] border border-line p-3">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-action-surface text-xs font-bold text-signal-700">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text">{stage.title === "" ? `Stage ${index + 1}` : stage.title}</p>
                      {stage.deliverable !== null ? <p className="text-sm text-text-secondary">{stage.deliverable}</p> : null}
                      {stage.endsOn !== null ? <p className="text-xs text-text-muted">By {stage.endsOn}</p> : null}
                    </div>
                    <p className="shrink-0 font-extrabold tabular-nums text-text">{stage.amountLabel}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-sm text-text-secondary">You fund one stage at a time. Work money reaches the professional after each stage is done.</p>
              {card.completionDays !== null ? (
                // Not a new policy — `submit_proposal` refuses once a Customer has chosen,
                // so this total has never been movable after acceptance. Saying it is the
                // point: an unstated guarantee protects nobody, because nobody relies on it.
                <p className="mt-2 rounded-[10px] border border-success-line bg-success-surface px-3 py-2 text-[13px] leading-5 text-text">
                  <strong className="font-bold">
                    {card.completionDays} working {card.completionDays === 1 ? "day" : "days"}, at this price.
                  </strong>{" "}
                  If the work runs longer, you pay nothing extra — the price above is fixed from
                  the moment you choose them.
                </p>
              ) : null}
            </Section>
          ) : null}

          {hasShoppingList ? (
            <div id="materials" className="scroll-mt-6">
              {card.materialFulfilmentMode === "PARTNER_TURNKEY" ? (
                <IncludedSupplyCard rows={card.includedSupplyList} />
              ) : (
                <ShoppingListCard
                  requirementId={requirementId}
                  proposalId={proposalId}
                  rows={card.materialList}
                  brandTierLabel={card.brandTierLabel}
                  vendorName={card.vendorName}
                  serviceName={serviceName}
                />
              )}
            </div>
          ) : null}

          {card.rateLabel !== null ? (
            <Section title="Rate">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <Fact label="Per worker, per day" value={card.rateLabel} />
                <Fact label="Workers" value={card.workerCount === null ? null : String(card.workerCount)} />
                <Fact label="Minimum" value={card.minimumDays === null ? null : `${card.minimumDays} ${card.minimumDays === 1 ? "day" : "days"}`} />
              </dl>
            </Section>
          ) : null}

          {/* BAND 3 — the fine print. Referred to, not read. */}
          <div id="terms" className="scroll-mt-6 rounded-[18px] border border-line bg-surface px-4 shadow-card sm:px-5">
            <Disclosure summary="Terms, warranty and dates">
              <dl className="grid gap-3 pb-3 sm:grid-cols-2">
                <Fact label="Warranty" value={card.warrantyTerms} empty="Not stated" />
                <Fact label="Valid until" value={card.validUntil === null ? null : formatDate(card.validUntil)} empty="No validity given" />
                <Fact label="Written" value={card.visitCompletedAt === null ? null : "On site, after their visit"} empty="Not recorded" />
                <Fact label="Sent" value={formatDate(card.submittedAt)} />
                {card.revision > 1 ? <Fact label="Revision" value={String(card.revision)} /> : null}
              </dl>
            </Disclosure>
          </div>

          {/* Mobile-only actions. At `lg` these live in the rail. */}
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            <Link href={questionsHref} className={cn(buttonStyles({ variant: "outline" }), "justify-center")}>
              <MessageCircle className="size-4" aria-hidden />
              Ask them{openQuestions > 0 ? ` (${openQuestions} waiting)` : ""}
            </Link>
            {card.isExpired ? (
              card.hasAskedForRevalidation ? (
                <p className="flex items-center justify-center rounded-control bg-surface-sunken px-3 text-sm text-text-secondary">Fresh price asked for</p>
              ) : (
                <Button variant="outline" onClick={() => revalidate.mutate({ requirementId, proposalId })} loading={revalidate.isPending} loadingLabel="Asking">
                  Ask for a fresh price — free
                </Button>
              )
            ) : (
              <Button variant="outline" disabled={!priceAskable} onClick={() => setAsking(true)}>
                Ask for a change
              </Button>
            )}
          </div>
        </div>

        <DecisionRail
          card={card}
          confirmHref={confirmHref}
          questionsHref={questionsHref}
          chooseable={chooseable}
          canAskPrice={priceAskable}
          onAskAboutPrice={() => setAsking(true)}
          onReject={() => setRejecting(true)}
          sections={sections}
        />
      </div>

      {/* One docked action, below `lg` only. It carried three. */}
      {chooseable ? (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface px-4 py-3 shadow-raised md:bottom-0 lg:hidden">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-text">{card.payableLabel}</p>
              <p className="text-xs text-text-secondary">Nothing is charged now.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>Not this one</Button>
            <Link href={confirmHref} className={buttonStyles({ variant: "primary" })}>
              Choose ›
            </Link>
          </div>
        </div>
      ) : !canChoose ? (
        <p className="mt-5 text-sm leading-6 text-text-secondary">You have already chosen a professional on this request. If it falls through, the others come back at no extra charge.</p>
      ) : null}

      <RejectQuoteDialog
        open={rejecting}
        onOpenChange={setRejecting}
        vendorName={card.vendorName}
        replacementsRemaining={access.list?.replacementsRemaining ?? null}
        replacementKind={access.isA5 ? "visit" : "quote"}
        isPending={reject.isPending}
        onReject={(reason, note) => {
          setRejecting(false);
          reject.mutate({ requirementId, proposalId, reason, note });
        }}
      />
      <PriceAskSheet
        open={asking}
        onOpenChange={setAsking}
        card={card}
        isPending={revision.isPending}
        onAccept={() => {
          setAsking(false);
          router.push(confirmHref);
        }}
        onSend={(input) => {
          revision.mutate(
            { requirementId, proposalId, ...input },
            { onSuccess: () => setAsking(false) },
          );
        }}
      />
      <QuestionInbox requirementId={requirementId} />
    </div>
  );
}

function CustomerDiscountSummary({ card }: { readonly card: QuoteCardView }) {
  return (
    <section
      aria-labelledby="customer-discount-title"
      className="rounded-[18px] border border-success-line bg-success-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="customer-discount-title" className="font-extrabold text-text">
          Overall discount applied
        </h2>
        <Badge tone="success">
          {card.discountPercent === null ? "Price reduced" : `${card.discountPercent}% off`}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">Original estimate</dt>
          <dd className="tabular-nums text-text-secondary line-through">
            {card.discountBaseLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">Overall discount</dt>
          <dd className="font-bold tabular-nums text-success-text">−{card.discountLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-success-line pt-2">
          <dt className="font-extrabold text-text">Your final total</dt>
          <dd className="text-lg font-extrabold tabular-nums text-text">{card.payableLabel}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-5 text-success-text">
        The scope, warranty and line-item rates are unchanged. The saving is spread across your
        payment stages automatically.
      </p>
    </section>
  );
}

/**
 * Where a revision request stands, including a price ask.
 *
 * The load-bearing sentence in every state is the last one: **the estimate is
 * still choosable.** A Customer who asks for 5% off has not given anything up
 * and is not waiting for permission — if the vendor is slow, or says no, the
 * original price is exactly where they left it.
 */
export function RevisionRequestNotice({
  request,
  priceLabel,
}: {
  request: NonNullable<QuoteCardView["revisionRequest"]>;
  /** The estimate's own total, so "you can still choose at X" names a figure. */
  priceLabel: string;
}) {
  const agreed =
    request.counteredDiscountPercent !== null &&
    request.requestedDiscountPercent !== null &&
    request.counteredDiscountPercent >= request.requestedDiscountPercent;
  const countered =
    request.isPriceAsk &&
    request.counteredDiscountPercent !== null &&
    request.requestedDiscountPercent !== null &&
    request.counteredDiscountPercent < request.requestedDiscountPercent;

  const tone =
    request.status === "OPEN"
      ? "border-info-line bg-info-surface"
      : request.status === "DECLINED"
        ? "border-line bg-surface-sunken"
        : "border-success-line bg-success-surface";

  const heading =
    request.status === "OPEN"
      ? request.isPriceAsk && request.requestedDiscountPercent !== null
        ? `You asked for ${request.requestedDiscountPercent}% off — waiting for their answer`
        : "You asked for a revision — waiting for their answer"
      : request.status === "ANSWERED"
        ? countered
          ? `They came back at ${request.counteredDiscountPercent}%, not ${request.requestedDiscountPercent}%`
          : agreed
            ? "They agreed — a new estimate is on this request"
            : "They answered with a fresh estimate"
        : request.isPriceAsk
          ? "They cannot move on price"
          : "They could not make that change";

  return (
    <div className={cn("rounded-[14px] border px-4 py-3", tone)}>
      <p className="text-sm font-bold text-text">{heading}</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {request.reasonLabel}
        {request.excludedItems.length > 0 ? `: ${request.excludedItems.join(", ")}` : ""}
        {request.note !== null ? ` — “${request.note}”` : ""}
      </p>
      {request.declineNote !== null ? (
        <p className="mt-1 text-sm leading-6 text-text">Their note: “{request.declineNote}”</p>
      ) : null}
      {request.status === "OPEN" ? (
        <p className="mt-1 text-xs text-text-muted">
          This estimate stays valid, and you can still choose it at {priceLabel} while you wait.
        </p>
      ) : null}
      {request.status === "DECLINED" ? (
        <p className="mt-1 text-xs text-text-muted">Their estimate stands at {priceLabel}.</p>
      ) : null}
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-[18px] border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value, empty }: { label: string; value: string | null; empty?: string }) {
  if (value === null && empty === undefined) return null;
  return (
    <div>
      <dt className="text-xs font-semibold text-text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-sm", value === null ? "text-warning-text" : "text-text")}>{value ?? empty}</dd>
    </div>
  );
}

/**
 * Hands the estimate to whoever the Customer decides with — a spouse, a
 * parent, a landlord. The Web Share sheet where the device has one, the
 * clipboard where it does not. Text only: the page itself is behind the
 * Customer's session, so a link alone would land the reader on a login.
 */
function ShareButton({ card }: { card: QuoteCardView }) {
  const [copied, setCopied] = useState(false);
  const text = [
    `${card.vendorName ?? "Estimate"} — ${card.payableLabel}`,
    card.scopeSummary ?? null,
    card.inclusions.length > 0 ? `Includes: ${card.inclusions.join(", ")}` : null,
    card.exclusions.length > 0 ? `Not included: ${card.exclusions.join(", ")}` : null,
    card.warrantyTerms !== null ? `Warranty: ${card.warrantyTerms}` : null,
    "Shared from Vsolve",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  async function share() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: `${card.vendorName ?? "Estimate"} — ${card.payableLabel}`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A dismissed share sheet is not an error.
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void share()}>
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
