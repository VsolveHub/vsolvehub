"use client";

import { describeError } from "@vsolve/query";
import { ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { requestEstimateHref, requestQuotesHref } from "@/lib/routes";

import { useAnswerQuestion, useAskVendorQuestion, useEntitledQuoteList } from "../queries";
import { QuestionThread } from "./question-thread";
import { VendorMark, VendorTrustLine } from "./vendor-trust-line";

/**
 * Questions with one professional, about one estimate — `/requests/{id}/quotes/{proposalId}/questions`.
 */
export function QuestionThreadScreen({ requirementId, proposalId }: { requirementId: string; proposalId: string }) {
  const access = useEntitledQuoteList(requirementId);
  const answer = useAnswerQuestion();
  const ask = useAskVendorQuestion();
  const card = access.list?.cards.find((entry) => entry.proposalId === proposalId) ?? null;
  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col px-4 pt-3 pb-0 sm:px-6">
      {/* Top Back Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-line">
        <Link
          href={requestEstimateHref(requirementId, proposalId)}
          className="grid size-10 place-items-center rounded-full text-text-secondary hover:bg-surface-sunken hover:text-text transition-colors cursor-pointer"
          aria-label="Back to estimate"
        >
          <ArrowLeft className="size-5" />
        </Link>

        {card ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <VendorMark name={card.vendorName} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold leading-tight text-navy-900">
                {card.vendorName ?? "This professional"}
              </h1>
              <VendorTrustLine trust={card.trust} />
            </div>
          </div>
        ) : (
          <span className="text-sm font-semibold text-text">Questions</span>
        )}
      </div>

      {/* Trust & Safety Banner */}
      <div className="shrink-0 bg-navy-900/5 border-b border-line/60 -mx-4 sm:-mx-6 px-4 py-2 text-center text-xs text-text-secondary flex items-center justify-center gap-1.5">
        <Lock className="size-3.5 text-text-muted shrink-0" />
        <span>Keep details to the work. Phone numbers unlock once booked.</span>
      </div>

      {access.isPending ? (
        <div aria-busy="true" className="py-6"><span className="sr-only">Loading</span><Skeleton className="h-40 w-full" /></div>
      ) : card === null ? (
        <div className="py-6">
          <ErrorState
            title="We could not find this estimate"
            message="It may have been withdrawn, or the link is out of date."
            severity="warning"
            actionLabel="See all estimates"
            onAction={() => { window.location.href = requestQuotesHref(requirementId); }}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <AccessRefusal error={answer.error} attempting="send that answer" supportAction={supportAction} />
          {ask.error && !answer.error ? (
            <ErrorState inline title={describeError(ask.error, "mutation").title} message={describeError(ask.error, "mutation").message} severity="error" />
          ) : null}

          <QuestionThread
            questions={card.questions}
            vendorName={card.vendorName}
            canAsk={access.entitled}
            isAnswering={answer.isPending}
            isAsking={ask.isPending}
            onAnswer={(questionId, text) => answer.mutate({ requirementId, questionId, answer: text })}
            onAsk={(question) => ask.mutate({ requirementId, proposalId, question })}
          />
        </div>
      )}
    </div>
  );
}
