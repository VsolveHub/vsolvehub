"use client";

import { Button, Textarea, cn } from "@vsolve/ui";
import { useState } from "react";

import type { QuestionView } from "../adapters";

/**
 * A clarification thread, drawn as one.
 *
 * Still not a chat. The record is `RequirementQuestion`: one question, at most
 * one answer, three open questions per asker at a time. What changes is the
 * *reading* — a professional's question and the Customer's answer used to be
 * two unrelated timeline rows with nothing to press, and the customer-asks
 * half had an endpoint and no screen.
 */

const MAX_OPEN_QUESTIONS = 3;

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function QuestionThread({
  questions,
  vendorName,
  onAnswer,
  onAsk,
  isAnswering,
  isAsking,
  canAsk,
}: {
  questions: readonly QuestionView[];
  vendorName: string | null;
  onAnswer: (questionId: string, answer: string) => void;
  onAsk?: (question: string) => void;
  isAnswering: boolean;
  isAsking: boolean;
  /** False before the entitlement that makes the vendor addressable. */
  canAsk: boolean;
}) {
  const [draft, setDraft] = useState("");
  const openMine = questions.filter((question) => question.askedByRole === "CUSTOMER" && question.answer === null).length;
  const left = Math.max(0, MAX_OPEN_QUESTIONS - openMine);
  const who = vendorName ?? "the professional";

  return (
    <div className="flex flex-col gap-4">
      {questions.length === 0 ? (
        <p className="rounded-card border border-line bg-surface-sunken p-4 text-sm leading-6 text-text-secondary">
          Nothing asked yet. Questions are about the work — what is included, what happens to the
          old fittings, when they can start.
        </p>
      ) : (
        <ol className="flex list-none flex-col gap-4 p-0">
          {questions.map((question) => (
            <li key={question.id} className="flex flex-col gap-2">
              <Bubble side={question.askedByRole === "CUSTOMER" ? "mine" : "theirs"} at={question.askedAt} who={question.askedByRole === "CUSTOMER" ? "You" : who}>
                {question.question}
              </Bubble>
              {question.answer !== null ? (
                <Bubble
                  side={question.askedByRole === "CUSTOMER" ? "theirs" : "mine"}
                  at={question.answeredAt ?? question.askedAt}
                  who={question.askedByRole === "CUSTOMER" ? who : "You"}
                >
                  {question.answer}
                </Bubble>
              ) : question.askedByRole === "VENDOR" ? (
                <AnswerBox questionId={question.id} onAnswer={onAnswer} isPending={isAnswering} />
              ) : (
                <p className="pl-2 text-xs text-text-muted">Waiting for {who} to answer.</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {onAsk !== undefined ? (
        <div className="rounded-[14px] border border-line bg-surface p-3">
          {canAsk ? (
            <>
              <Textarea
                rows={2}
                maxLength={2000}
                placeholder={`Ask ${who} a question…`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={left === 0}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-text-muted">
                  {left === 0
                    ? "Wait for a reply before asking another."
                    : `${left} ${left === 1 ? "question" : "questions"} left before a reply`}
                </p>
                <Button
                  size="sm"
                  disabled={draft.trim() === "" || left === 0}
                  loading={isAsking}
                  loadingLabel="Sending"
                  onClick={() => {
                    onAsk(draft.trim());
                    setDraft("");
                  }}
                >
                  Send
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm leading-6 text-text-secondary">
              You can ask {who} a question once their estimate is readable.
            </p>
          )}
        </div>
      ) : null}

      <p className="text-xs leading-5 text-text-muted">
        Questions are about the work only. Phone numbers are shared when you choose a
        professional and they confirm.
      </p>
    </div>
  );
}

function Bubble({ side, at, who, children }: { side: "mine" | "theirs"; at: string; who: string; children: string }) {
  return (
    <div className={cn("flex flex-col gap-1", side === "mine" ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-line rounded-[16px] px-3.5 py-2.5 text-sm leading-6",
          side === "mine" ? "rounded-br-[4px] bg-navy-900 text-white" : "rounded-bl-[4px] border border-line bg-surface text-text",
        )}
      >
        {children}
      </div>
      <p className="px-1 text-[11px] text-text-muted">
        {who} · {formatAt(at)}
      </p>
    </div>
  );
}

function AnswerBox({ questionId, onAnswer, isPending }: { questionId: string; onAnswer: (questionId: string, answer: string) => void; isPending: boolean }) {
  const [answer, setAnswer] = useState("");
  return (
    <div className="ml-2 rounded-[14px] border border-warning-line bg-warning-surface p-3">
      <p className="text-xs font-bold uppercase tracking-[0.06em] text-warning-text">Waiting on you</p>
      <Textarea
        rows={2}
        maxLength={2000}
        className="mt-2"
        placeholder="Your answer…"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={answer.trim() === ""} loading={isPending} loadingLabel="Sending" onClick={() => onAnswer(questionId, answer.trim())}>
          Answer
        </Button>
      </div>
    </div>
  );
}
