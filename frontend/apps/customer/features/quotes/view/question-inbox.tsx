"use client";

import { Button, Textarea } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";

import { toQuestionView } from "../adapters";
import { useAnswerQuestion, useRequirementQuestions } from "../queries";

/**
 * A professional's question, on the request page, with somewhere to answer it.
 *
 * The one thing on the whole quotes journey that only the Customer can move.
 * It arrives before the visit — "is the old tiling coming off?" — so it lives
 * here rather than on the estimates page, is not gated on the paywall, and
 * shows the words with a box under them instead of a timeline row with nothing
 * to press.
 */
export function QuestionInbox({ requirementId, supportAction }: { requirementId: string; supportAction?: React.ReactNode }) {
  const query = useRequirementQuestions(requirementId);
  const answer = useAnswerQuestion();
  const waiting = (query.data?.questions ?? [])
    .map(toQuestionView)
    .filter((question) => question.askedByRole === "VENDOR" && question.answer === null);

  if (waiting.length === 0) return null;

  return (
    <section aria-labelledby="question-inbox-heading" className="rounded-[14px] border border-warning-line bg-warning-surface p-4">
      <h2 id="question-inbox-heading" className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-warning-text">
        {waiting.length === 1 ? "A professional asked" : `${waiting.length} professionals asked`}
      </h2>
      <AccessRefusal error={answer.error} attempting="send that answer" supportAction={supportAction} />
      <ul className="mt-2 flex list-none flex-col gap-3 p-0">
        {waiting.map((question) => (
          <InboxRow
            key={question.id}
            questionText={question.question}
            askedAt={question.askedAt}
            isPending={answer.isPending}
            onAnswer={(text) => answer.mutate({ requirementId, questionId: question.id, answer: text })}
          />
        ))}
      </ul>
    </section>
  );
}

function InboxRow({ questionText, askedAt, isPending, onAnswer }: { questionText: string; askedAt: string; isPending: boolean; onAnswer: (text: string) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const when = new Date(askedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <li className="rounded-[12px] border border-line bg-surface p-3">
      <p className="text-[15px] font-semibold leading-6 text-text">“{questionText}”</p>
      <p className="text-xs text-text-muted">{when}</p>
      {open ? (
        <div className="mt-2">
          <Textarea rows={2} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Your answer…" />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Later</Button>
            <Button size="sm" disabled={text.trim() === ""} loading={isPending} loadingLabel="Sending" onClick={() => onAnswer(text.trim())}>Send answer</Button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <Button size="sm" onClick={() => setOpen(true)}>Answer</Button>
        </div>
      )}
    </li>
  );
}
