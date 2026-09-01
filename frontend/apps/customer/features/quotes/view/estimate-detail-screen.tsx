"use client";

import { blocksNewSelection } from "@vsolve/query";
import { Badge, Button, ErrorState, Skeleton, buttonStyles, cn } from "@vsolve/ui";
import { ChevronLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { useRequirement } from "@/features/requirement/queries";
import { titleForSlug } from "@/features/requirement/view/my-requests-screen";
import { estimateConfirmHref, estimateQuestionsHref, requestQuotesHref } from "@/lib/routes";

import { firstStageOf, scopeGaps, type QuoteCardView } from "../adapters";
import {
  useEntitledQuoteList,
  useRejectQuote,
  useRequestRevision,
  useRevalidateQuote,
  useSelection,
} from "../queries";
import { QuestionInbox } from "./question-inbox";
import { timelineLabel, validityLabel } from "./quote-card";
import { RejectQuoteDialog } from "./reject-quote-dialog";
import { RevisionRequestDialog } from "./revision-request-dialog";
import { ShoppingListCard } from "./shopping-list-card";
import { IncludedSupplyCard } from "./included-supply-card";
import { VendorMark, VendorTrustLine } from "./vendor-trust-line";

/**
 * One estimate, read in full — `/requests/{id}/quotes/{proposalId}`.
 *
 * The document. Everything the professional wrote, in the order a Customer
 * reads it: who they are, the number, what they will do in their own words,
 * what is in and out, how the price is built, how it is paid, the terms. The
 * card on the list is the summary of this page, never the other way round.
 *
 * **No line of it is cut** — `M2-FE-423` forbids gating any part of a paid-for
 * estimate. What this page adds over the old disclosure is the scope
 * narrative, the trust row, the pay-to-start figure up front, the thread with
 * the professional, and a way to ask for a change without turning them down.
 */
export function EstimateDetailScreen({
  requirementId,
  proposalId,
  embedded = false,
  hideShoppingList = false,
}: {
  requirementId: string;
  proposalId: string;
  /**
   * Rendered inside the estimates page rather than on its own route — the
   * case of exactly one estimate, where a card that says "read the full
   * estimate" is a tap between the Customer and the only thing there is to
   * read. Drops the page frame and the "All estimates" link; keeps everything
   * else, including Choose.
   */
  embedded?: boolean;
  /**
   * The estimates page renders the shopping-list card in its own right-hand
   * column when there is one estimate; this keeps the document from showing
   * it twice.
   */
  hideShoppingList?: boolean;
}) {
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
  const [revising, setRevising] = useState(false);

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
  const openQuestions = card.questions.filter((question) => question.askedByRole === "VENDOR" && question.answer === null).length;
  const chooseable = canChoose && card.isSelectable && !card.isExpired;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-5 pb-28",
        embedded ? "" : "mx-auto max-w-3xl px-4 pt-5 sm:px-6",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {embedded ? (
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-text-muted">
            Your estimate
          </p>
        ) : (
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
        )}
        <ShareButton card={card} />
      </div>

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
          </div>
          <VendorTrustLine trust={card.trust} size="md" className="mt-1" />
          {card.vendorType !== null ? <p className="mt-0.5 text-xs text-text-muted">{card.vendorType}</p> : null}
        </div>
      </header>

      <section className="rounded-[18px] bg-navy-900 p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-signal-300">Their estimate</p>
        <p className="mt-2 text-[34px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{card.payableLabel}</p>
        <p className="mt-2 text-sm text-white/75">
          {card.taxBasis === "INCLUSIVE" ? `Includes ${card.taxLabel} tax` : `${card.totalLabel} plus ${card.taxLabel} tax`}
          {validity !== null ? ` · ${validity.text.toLowerCase()}` : ""}
          {card.revision > 1 ? ` · revision ${card.revision}` : ""}
        </p>
        {firstStage !== null || timeline !== null ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">Pay to start</dt>
              <dd className="mt-0.5 text-lg font-extrabold tabular-nums">{firstStage?.amountLabel ?? "Not stated"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">Timeline</dt>
              <dd className="mt-0.5 text-lg font-extrabold">{timeline ?? "Not dated"}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {card.revisionRequest !== null ? (
        <RevisionRequestNotice request={card.revisionRequest} />
      ) : null}

      <AccessRefusal error={reject.error} attempting="turn this estimate down" supportAction={supportAction} />
      <AccessRefusal error={revalidate.error} attempting="ask for a fresh price" supportAction={supportAction} />
      <AccessRefusal error={revision.error} attempting="ask for a revision" supportAction={supportAction} />

      <Section title="What you get">
        {card.scopeSummary !== null ? (
          <p className="whitespace-pre-line text-[15px] leading-7 text-text">“{card.scopeSummary}”</p>
        ) : (
          <p className="text-sm leading-6 text-text-secondary">They did not write a summary. What is included is listed below — ask if something matters to you.</p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ScopeList title={`Included (${card.inclusions.length})`} lines={card.inclusions} included />
          <ScopeList
            title={`Not included (${card.exclusions.length})`}
            lines={card.exclusions}
            included={false}
            emptyNote="They listed nothing as excluded. Ask before you choose if something matters to you."
          />
        </div>
        {gaps.length > 0 ? (
          <p className="mt-4 rounded-[10px] border border-warning-line bg-warning-surface px-3 py-2 text-[13px] leading-5 text-text">
            <strong className="font-bold">Other estimates include:</strong> {gaps.join(", ")}. Not listed here — it may be
            priced elsewhere or left out. Worth asking.
          </p>
        ) : null}
      </Section>

      {card.itemLines.length > 0 || card.labourLines.length > 0 || card.otherCharges.length > 0 || card.materials.length > 0 ? (
        <Section title={`How the price is built${card.itemLines.length > 0 ? " — item-wise" : card.labourLines.length > 0 ? " — labour-wise" : ""}`}>
          <ul className="flex list-none flex-col divide-y divide-line p-0">
            {card.itemLines.map((line, index) => (
              <PriceLine key={`i-${index}`} title={line.title} note={line.quantityLabel} amount={line.amountLabel} />
            ))}
            {card.labourLines.map((line, index) => (
              <PriceLine key={`l-${index}`} title={line.team === null ? line.role : `${line.role} — ${line.team}`} note={line.crewLabel} amount={line.amountLabel} />
            ))}
            {card.otherCharges.map((charge, index) => (
              <PriceLine key={`c-${index}`} title={charge.label} note="Named charge" amount={charge.amountLabel} />
            ))}
            {card.materials.map((material, index) => (
              // "Materials the pro supplies", said in full: the shopping list
              // below is materials the Customer buys, and one word for both
              // is how somebody pays for a fitting twice.
              <PriceLine key={`m-${index}`} title={material.title} note={material.quantityLabel === null ? "Materials the pro supplies · paid as an advance" : `${material.quantityLabel} · materials the pro supplies · paid as an advance`} amount={material.amountLabel ?? "—"} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-text-muted">Every line is already inside the total above.</p>
        </Section>
      ) : null}

      {card.materialFulfilmentMode === "PARTNER_TURNKEY" ? (
        <IncludedSupplyCard rows={card.includedSupplyList} />
      ) : !hideShoppingList ? (
        <ShoppingListCard
          requirementId={requirementId}
          proposalId={proposalId}
          rows={card.materialList}
          brandTierLabel={card.brandTierLabel}
          vendorName={card.vendorName}
          serviceName={serviceName}
        />
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

      {card.stages.length > 0 ? (
        <Section title="How you pay">
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
        </Section>
      ) : null}

      <Section title="Terms">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Warranty" value={card.warrantyTerms} empty="Not stated" />
          <Fact label="Valid until" value={card.validUntil === null ? null : new Date(card.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} empty="No validity given" />
          <Fact label="Written" value={card.visitCompletedAt === null ? null : "On site, after their visit"} />
          <Fact label="Sent" value={new Date(card.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
        </dl>
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <Link href={estimateQuestionsHref(requirementId, proposalId)} className={cn(buttonStyles({ variant: "outline" }), "justify-center")}>
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
          <Button
            variant="outline"
            disabled={!card.isSelectable || card.revisionRequest?.status === "OPEN"}
            onClick={() => setRevising(true)}
          >
            ✎ Ask for a revision
          </Button>
        )}
      </div>

      {chooseable && !embedded ? (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface px-4 py-3 shadow-raised md:bottom-0">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-text">{card.vendorName ?? "This professional"} · {card.payableLabel}</p>
              <p className="text-xs text-text-secondary">Choosing opens the agreement. Nothing is charged now.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>Not this one</Button>
            <Link href={estimateConfirmHref(requirementId, proposalId)} className={buttonStyles({ variant: "primary" })}>
              Choose ›
            </Link>
          </div>
        </div>
      ) : !canChoose && !embedded ? (
        <p className="text-sm leading-6 text-text-secondary">You have already chosen a professional on this request. If it falls through, the others come back at no extra charge.</p>
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
      <RevisionRequestDialog
        open={revising}
        onOpenChange={setRevising}
        card={card}
        isPending={revision.isPending}
        onSend={(reasonCode, excludedItems, note) => {
          revision.mutate(
            { requirementId, proposalId, reasonCode, excludedItems, note },
            { onSuccess: () => setRevising(false) },
          );
        }}
      />
      {!embedded ? <QuestionInbox requirementId={requirementId} /> : null}
    </div>
  );
}

export function RevisionRequestNotice({ request }: { request: NonNullable<QuoteCardView["revisionRequest"]> }) {
  const tone = request.status === "OPEN" ? "border-info-line bg-info-surface" : request.status === "DECLINED" ? "border-line bg-surface-sunken" : "border-success-line bg-success-surface";
  return (
    <div className={cn("rounded-[14px] border px-4 py-3", tone)}>
      <p className="text-sm font-bold text-text">
        {request.status === "OPEN"
          ? "You asked for a revision — waiting for their answer"
          : request.status === "ANSWERED"
            ? "They answered your revision request with a fresh estimate"
            : "They could not make that change"}
      </p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {request.reasonLabel}
        {request.excludedItems.length > 0 ? `: ${request.excludedItems.join(", ")}` : ""}
        {request.note !== null ? ` — “${request.note}”` : ""}
      </p>
      {request.declineNote !== null ? <p className="mt-1 text-sm leading-6 text-text">Their note: “{request.declineNote}”</p> : null}
      {request.status === "OPEN" ? <p className="mt-1 text-xs text-text-muted">This estimate stays valid until they reply.</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border border-line bg-surface p-4 shadow-card sm:p-5">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ScopeList({ title, lines, included, emptyNote }: { title: string; lines: readonly string[]; included: boolean; emptyNote?: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-text">{title}</h3>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm leading-6 text-text-secondary">{emptyNote ?? "Nothing listed."}</p>
      ) : (
        <ul className="mt-1.5 flex list-none flex-col gap-1 p-0">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-6 text-text-secondary">
              <span aria-hidden className={cn("font-bold", included ? "text-success-text" : "text-warm-400")}>{included ? "✓" : "✗"}</span>
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriceLine({ title, note, amount }: { title: string; note: string | null; amount: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium text-text">{title}</p>
        {note !== null ? <p className="text-sm text-text-secondary">{note}</p> : null}
      </div>
      <p className="shrink-0 font-semibold tabular-nums text-text">{amount}</p>
    </li>
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
