"use client";

import { describeError } from "@vsolve/query";
import { ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5 sm:px-6">
      <Link href={requestEstimateHref(requirementId, proposalId)} className="text-sm font-semibold text-text-link hover:underline">
        ← Back to the estimate
      </Link>

      {access.isPending ? (
        <div aria-busy="true"><span className="sr-only">Loading</span><Skeleton className="h-40 w-full" /></div>
      ) : card === null ? (
        <ErrorState
          title="We could not find this estimate"
          message="It may have been withdrawn, or the link is out of date."
          severity="warning"
          actionLabel="See all estimates"
          onAction={() => { window.location.href = requestQuotesHref(requirementId); }}
        />
      ) : (
        <>
          <header className="flex items-center gap-3">
            <VendorMark name={card.vendorName} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight text-text">{card.vendorName ?? "This professional"} · questions</h1>
              <VendorTrustLine trust={card.trust} />
            </div>
          </header>

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
        </>
      )}
    </div>
  );
}
