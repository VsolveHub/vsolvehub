"use client";

import { describeError } from "@vsolve/query";
import { Button, Card, ErrorState, Textarea, cn } from "@vsolve/ui";
import { useState } from "react";

import type { EnquiryRecord } from "../model/wire";
import { useAnswerQuestion, useAskQuestion } from "../queries";

/**
 * Questions with the customer, on the enquiry.
 *
 * The two hooks existed and nothing mounted them: a vendor could not ask "is
 * the old tiling coming off?" from the live route, and a customer's question
 * about the estimate landed as a row nobody could answer. Still not a chat —
 * one question, one answer, three open at a time — drawn as the thread it is.
 */

const MAX_OPEN = 3;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function ClarificationThread({ enquiry }: { readonly enquiry: EnquiryRecord }) {
  const ask = useAskQuestion(enquiry.id);
  const answer = useAnswerQuestion(enquiry.id);
  const [draft, setDraft] = useState("");
  const closed = enquiry.status === "DECLINED" || enquiry.status === "EXPIRED" || enquiry.status === "WITHDRAWN";
  const openMine = enquiry.questions.filter((row) => row.asked_by_role === "VENDOR" && row.answered_at === null).length;
  const left = Math.max(0, MAX_OPEN - openMine);
  const failure = ask.error ?? answer.error;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">Questions with the customer</h2>
        <span className="text-xs text-text-muted">{enquiry.questions.length === 0 ? "None yet" : `${enquiry.questions.length}`}</span>
      </div>

      {failure ? (
        <ErrorState inline title={describeError(failure, "mutation").title} message={describeError(failure, "mutation").message} severity="error" />
      ) : null}

      {enquiry.questions.length > 0 ? (
        <ol className="flex list-none flex-col gap-3 p-0">
          {enquiry.questions.map((row) => {
            const mine = row.asked_by_role === "VENDOR";
            return (
              <li key={row.id} className="flex flex-col gap-1.5">
                <Bubble side={mine ? "mine" : "theirs"} who={mine ? "You" : "Customer"} at={row.asked_at}>
                  {row.question}
                </Bubble>
                {row.answered_at !== null && row.answer.trim() !== "" ? (
                  <Bubble side={mine ? "theirs" : "mine"} who={mine ? "Customer" : "You"} at={row.answered_at}>
                    {row.answer}
                  </Bubble>
                ) : row.asked_by_role === "CUSTOMER" ? (
                  <AnswerBox
                    onAnswer={(text) => answer.mutate({ questionId: row.id, answer: text })}
                    pending={answer.isPending}
                  />
                ) : (
                  <p className="pl-1 text-xs text-text-muted">Waiting for the customer.</p>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}

      {closed ? null : (
        <div className="rounded-control border border-line bg-surface-sunken p-3">
          <Textarea
            rows={2}
            maxLength={2000}
            placeholder="Ask the customer something about the work…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={left === 0 || ask.isPending}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-text-muted">
              {left === 0 ? "Wait for a reply before asking another." : `${left} open ${left === 1 ? "question" : "questions"} allowed`}
            </p>
            <Button
              size="sm"
              disabled={draft.trim() === "" || left === 0}
              loading={ask.isPending}
              loadingLabel="Sending"
              onClick={() => {
                ask.mutate({ question: draft.trim() }, { onSuccess: () => setDraft("") });
              }}
            >
              Ask
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs leading-5 text-text-muted">
        Keep it to the work. Phone numbers are shared by Vsolve once the customer chooses you.
      </p>
    </Card>
  );
}

function Bubble({ side, who, at, children }: { side: "mine" | "theirs"; who: string; at: string; children: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5", side === "mine" ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] whitespace-pre-line rounded-[14px] px-3 py-2 text-sm leading-6",
          side === "mine" ? "rounded-br-[4px] bg-navy-900 text-surface" : "rounded-bl-[4px] border border-line bg-surface text-text",
        )}
      >
        {children}
      </div>
      <p className="px-1 text-[11px] text-text-muted">
        {who} · {when(at)}
      </p>
    </div>
  );
}

function AnswerBox({ onAnswer, pending }: { onAnswer: (text: string) => void; pending: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="rounded-control border border-warning-line bg-warning-surface p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-warning-text">Waiting on you</p>
      <Textarea rows={2} maxLength={2000} className="mt-2" value={text} onChange={(event) => setText(event.target.value)} placeholder="Your answer…" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={text.trim() === ""} loading={pending} loadingLabel="Sending" onClick={() => onAnswer(text.trim())}>
          Answer
        </Button>
      </div>
    </div>
  );
}
