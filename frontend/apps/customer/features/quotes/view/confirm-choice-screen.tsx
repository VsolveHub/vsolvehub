"use client";

import { blocksNewSelection, isSelectionConflict } from "@vsolve/query";
import { Button, ErrorState, Skeleton, buttonStyles, cn } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { requestEstimateHref, requestQuotesHref } from "@/lib/routes";

import { firstStageOf } from "../adapters";
import { destinationAfterSelection } from "../model/selection-navigation";
import { useEntitledQuoteList, useSelectProposal, useSelection } from "../queries";
import { timelineLabel } from "./quote-card";
import { VendorMark, VendorTrustLine } from "./vendor-trust-line";

/**
 * The one step between "Choose" and the agreement.
 *
 * Selecting a professional opens the engagement in the same transaction, so
 * this is the last moment the Customer reads what they are agreeing to as one
 * list: the scope, how it is paid and when, what is not included. It is a
 * page rather than a dialog because the list is long enough to read and the
 * consequence is real. Nothing is charged here — the first stage is funded
 * from the agreement, one stage at a time.
 */
export function ConfirmChoiceScreen({ requirementId, proposalId }: { requirementId: string; proposalId: string }) {
  const router = useRouter();
  const access = useEntitledQuoteList(requirementId);
  const selectionQuery = useSelection(requirementId);
  const select = useSelectProposal();
  const card = access.list?.cards.find((entry) => entry.proposalId === proposalId) ?? null;
  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);
  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );

  if (access.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-5" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (card === null || !card.isSelectable || card.isExpired || !canChoose) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <ErrorState
          title={!canChoose ? "You have already chosen a professional" : "This estimate cannot be chosen"}
          message={!canChoose ? "If that choice falls through, the other estimates come back at no extra charge." : "It may have expired, been withdrawn, or been replaced by a newer revision."}
          severity="warning"
          actionLabel="Back to the estimates"
          onAction={() => { window.location.href = requestQuotesHref(requirementId); }}
        />
      </div>
    );
  }

  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const others = (access.list?.cards.length ?? 1) - 1;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 sm:px-6">
      <Link href={requestEstimateHref(requirementId, proposalId)} className="text-sm font-semibold text-text-link hover:underline">
        ← Back to the estimate
      </Link>

      <header>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-signal-700">Confirm your choice</p>
        <div className="mt-2 flex items-center gap-3">
          <VendorMark name={card.vendorName} />
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold leading-tight tracking-tight text-text">
              {card.vendorName ?? "This professional"} · {card.payableLabel}
            </h1>
            <VendorTrustLine trust={card.trust} />
          </div>
        </div>
      </header>

      {isSelectionConflict(select.error) ? (
        <ErrorState
          title="Somebody chose first"
          message="Another session picked a professional for this request a moment before you did."
          severity="warning"
          inline
        />
      ) : (
        <AccessRefusal error={select.error} attempting="choose this professional" supportAction={supportAction} />
      )}

      <section className="rounded-[18px] border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-muted">You are agreeing to</h2>
        <ul className="mt-3 flex list-none flex-col gap-2.5 p-0">
          <Line ok>
            The scope on their estimate
            {card.inclusions.length > 0 ? ` (${card.inclusions.length} ${card.inclusions.length === 1 ? "item" : "items"} included)` : ""}
            {card.scopeSummary !== null ? <span className="block text-sm text-text-secondary">“{card.scopeSummary}”</span> : null}
          </Line>
          {card.stages.length > 0 ? (
            <Line ok>
              {card.stages.length} payment {card.stages.length === 1 ? "stage" : "stages"}, funded one at a time
              {firstStage !== null ? ` — first ${firstStage.amountLabel} when work is scheduled` : ""}
            </Line>
          ) : null}
          {timeline !== null ? <Line ok>{timeline}</Line> : null}
          {card.warrantyTerms !== null ? <Line ok>Warranty: {card.warrantyTerms}</Line> : <Line ok={false} warn>No warranty stated</Line>}
          {card.exclusions.map((line) => (
            <Line key={line} ok={false}>
              {line} — you arrange this
            </Line>
          ))}
        </ul>
      </section>

      <div className="rounded-[14px] border border-info-line bg-info-surface px-4 py-3 text-sm leading-6 text-info-text">
        Any change after this is a written change order you approve in the app. <strong className="font-bold">Nothing is charged now.</strong>
      </div>

      <div className={cn("flex flex-col gap-2")}>
        <Button
          size="lg"
          block
          loading={select.isPending}
          loadingLabel="Opening the agreement"
          onClick={() =>
            select.mutate(
              { requirementId, proposalId },
              {
                onSuccess: (chosen) => {
                  const destination = destinationAfterSelection(chosen);
                  if (destination !== null) router.replace(destination);
                },
              },
            )
          }
        >
          Confirm and open agreement
        </Button>
        <p className="text-center text-xs leading-5 text-text-muted">
          {others > 0
            ? `The other ${others === 1 ? "estimate stays" : "estimates stay"} available if this falls through — at no extra charge.`
            : "If this falls through, we look for another professional at no extra charge."}
        </p>
      </div>
    </div>
  );
}

function Line({ ok, warn = false, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-6 text-text">
      <span aria-hidden className={cn("mt-0.5 font-bold", ok ? "text-success-text" : warn ? "text-warning-text" : "text-warm-400")}>
        {ok ? "✓" : warn ? "⚠" : "✗"}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}
