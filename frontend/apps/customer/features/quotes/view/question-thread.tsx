"use client";

import { Button, cn } from "@vsolve/ui";
import { CheckCheck, Send } from "lucide-react";
import { useRef, useEffect, useState } from "react";

import type { QuestionView } from "../adapters";

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
  canAsk: boolean;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const openMine = questions.filter(
    (question) => question.askedByRole === "CUSTOMER" && question.answer === null,
  ).length;
  const left = Math.max(0, MAX_OPEN_QUESTIONS - openMine);
  const who = vendorName ?? "Professional";

  // Check if there is an unanswered question from the vendor that needs answering
  const pendingVendorQuestion = questions.find(
    (q) => (q.askedByRole === "VENDOR" || q.askedByRole === "OPERATIONS") && q.answer === null,
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [questions.length]);

  function handleSubmit() {
    if (draft.trim() === "" || isAnswering || isAsking) return;

    if (pendingVendorQuestion) {
      onAnswer(pendingVendorQuestion.id, draft.trim());
      setDraft("");
    } else if (onAsk && canAsk && left > 0) {
      onAsk(draft.trim());
      setDraft("");
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-between">
      {/* Messages Stream */}
      <div className="flex-1 space-y-4 py-3">
        {questions.length === 0 ? (
          <div className="rounded-card border border-line bg-surface-sunken p-6 text-center text-sm text-text-secondary">
            <p className="font-semibold text-text">No questions asked yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Use this chat to ask {who} about job scope, timing, materials, or site details.
            </p>
          </div>
        ) : (
          <ol className="flex list-none flex-col gap-3 p-0 m-0">
            {questions.map((question) => {
              const isVendor = question.askedByRole === "VENDOR" || question.askedByRole === "OPERATIONS";
              return (
                <li key={question.id} className="flex flex-col gap-2">
                  {/* First message / Question */}
                  <ChatBubble
                    side={isVendor ? "theirs" : "mine"}
                    who={isVendor ? who : "You"}
                    at={question.askedAt}
                  >
                    {question.question}
                  </ChatBubble>

                  {/* Reply message / Answer if present */}
                  {question.answer !== null && question.answer.trim() !== "" ? (
                    <ChatBubble
                      side={isVendor ? "mine" : "theirs"}
                      who={isVendor ? "You" : who}
                      at={question.answeredAt ?? question.askedAt}
                    >
                      {question.answer}
                    </ChatBubble>
                  ) : isVendor ? (
                    <p className="text-left text-[11px] font-medium text-warning-text pl-2">
                      Waiting for your reply below…
                    </p>
                  ) : (
                    <p className="text-right text-[11px] font-medium text-text-muted pr-2">
                      Waiting for {who} to answer…
                    </p>
                  )}
                </li>
              );
            })}
            <div ref={endRef} />
          </ol>
        )}
      </div>

      {/* Bottom Sticky Composer */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-5 border-t border-line bg-white px-4 pt-3 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] shadow-lg sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1.5 px-1">
          <span>
            {pendingVendorQuestion ? `Replying to ${who}` : `Message ${who}`}
          </span>
          {canAsk && !pendingVendorQuestion ? (
            <span>{left} {left === 1 ? "question" : "questions"} left</span>
          ) : null}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <textarea
              rows={1}
              maxLength={2000}
              placeholder={
                pendingVendorQuestion
                  ? `Type your answer to ${who}…`
                  : canAsk && left > 0
                    ? `Ask ${who} a question…`
                    : "Wait for a reply before asking another…"
              }
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              disabled={isAnswering || isAsking || (!pendingVendorQuestion && (!canAsk || left === 0))}
              className="w-full resize-none rounded-[22px] border border-line bg-[#F8F9FA] px-4 py-2.5 text-sm text-navy-900 leading-5 placeholder:text-text-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900/20 max-h-32 min-h-[44px] box-border"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          <Button
            type="submit"
            size="md"
            disabled={
              draft.trim() === "" ||
              isAnswering ||
              isAsking ||
              (!pendingVendorQuestion && (!canAsk || left === 0))
            }
            loading={isAnswering || isAsking}
            className="size-11 shrink-0 rounded-full p-0 flex items-center justify-center bg-navy-900 text-white hover:bg-navy-800"
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function ChatBubble({
  side,
  at,
  who,
  children,
}: {
  side: "mine" | "theirs";
  at: string;
  who: string;
  children: string;
}) {
  const isMine = side === "mine";
  return (
    <div className={cn("flex flex-col gap-1", isMine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-line rounded-[18px] px-4 py-2.5 text-sm leading-relaxed shadow-2xs",
          isMine
            ? "rounded-br-[4px] bg-navy-900 text-white font-normal"
            : "rounded-bl-[4px] border border-line/70 bg-surface text-navy-900 font-normal",
        )}
      >
        {children}
      </div>
      <div className="flex items-center gap-1 px-1.5 text-[11px] text-text-muted">
        <span>{who}</span>
        <span>·</span>
        <span>{formatAt(at)}</span>
        {isMine ? <CheckCheck className="size-3.5 text-info-text inline ml-0.5" /> : null}
      </div>
    </div>
  );
}
