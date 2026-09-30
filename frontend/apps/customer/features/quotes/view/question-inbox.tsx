"use client";

import { cn } from "@vsolve/ui";
import {
  ArrowLeft,
  Briefcase,
  CheckCheck,
  Lock,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";

import { toQuestionView } from "../adapters";
import { useAnswerQuestion, useRequirementQuestions } from "../queries";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Full-page messaging and question-answering with professionals for the customer.
 *
 * Rendered as a floating action button on the bottom right and an inline alert when questions are pending.
 * When clicked, opens a full-page chat interface designed like a modern messaging app.
 */
export function QuestionInbox({
  requirementId,
  supportAction,
  open: controlledOpen,
  onOpenChange,
  showFab = true,
}: {
  requirementId: string;
  supportAction?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showFab?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setIsOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const query = useRequirementQuestions(requirementId);
  const answer = useAnswerQuestion();
  const [draftAnswer, setDraftAnswer] = useState("");

  const allQuestions = (query.data?.questions ?? []).map(toQuestionView);
  const waiting = allQuestions.filter(
    (question) => question.askedByRole === "VENDOR" && question.answer === null,
  );

  const activeQuestionToAnswer = waiting.length > 0 ? waiting[0] : null;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Floating Chat Trigger on Bottom Right (when questions/conversations exist) */}
      {showFab && allQuestions.length > 0 ? (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="Open chat with professional"
            className="group relative flex size-12 items-center justify-center rounded-full bg-action text-white shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ring-4 ring-white/90"
          >
            <MessageCircle className="size-5 transition-transform group-hover:scale-110" />
            {waiting.length > 0 ? (
              <span className="absolute -top-1 -right-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-signal-500 px-1.5 text-[11px] font-extrabold text-white shadow-xs">
                {waiting.length}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      {/* Full-Page Messaging Experience */}
      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat with Professional"
          className="fixed inset-0 z-[100] flex flex-col bg-surface-sunken animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {/* Top Navigation Bar */}
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface px-4 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Back to request"
                className="grid size-10 place-items-center rounded-full text-text-secondary hover:bg-surface-sunken hover:text-text transition-colors cursor-pointer"
              >
                <ArrowLeft className="size-5" />
              </button>

              <div className="relative">
                <div className="grid size-10 place-items-center rounded-full bg-navy-900 text-white font-bold text-sm shadow-2xs">
                  <Briefcase className="size-5" />
                </div>
                <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success-text ring-2 ring-white" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-bold text-navy-900 leading-tight">
                  Service Professional
                </h1>
                <p className="truncate text-xs font-medium text-text-muted">
                  Questions & Clarifications
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="grid size-9 place-items-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text transition-colors cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </header>

          {/* Safety & Context Header Banner */}
          <div className="shrink-0 bg-navy-900/5 border-b border-line/60 px-4 py-2 text-center text-xs text-text-secondary flex items-center justify-center gap-1.5">
            <Lock className="size-3.5 text-text-muted shrink-0" />
            <span>Keep details to the work. Direct phone numbers unlock once booked.</span>
          </div>

          <AccessRefusal
            error={answer.error}
            attempting="send that answer"
            supportAction={supportAction}
          />

          {/* Main Message Stream */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="flex justify-center my-1">
              <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold text-text-muted shadow-2xs">
                Questions & Clarifications
              </span>
            </div>

            {allQuestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-center px-6">
                <div className="grid size-12 place-items-center rounded-full bg-navy-100 text-navy-800 mb-3">
                  <MessageCircle className="size-6" />
                </div>
                <h3 className="text-sm font-bold text-navy-900">No questions yet</h3>
                <p className="mt-1 text-xs text-text-secondary max-w-xs leading-relaxed">
                  Have questions regarding site access, materials, or requirements? Messages from professionals will appear here.
                </p>
              </div>
            ) : (
              <ol className="flex list-none flex-col gap-4 p-0 m-0">
                {allQuestions.map((row) => {
                  const isPro = row.askedByRole === "VENDOR" || row.askedByRole === "OPERATIONS";
                  return (
                    <li key={row.id} className="flex flex-col gap-2">
                      {/* Pro's Question */}
                      <ChatBubble
                        side={isPro ? "theirs" : "mine"}
                        who={isPro ? "Professional" : "You"}
                        at={row.askedAt}
                      >
                        {row.question}
                      </ChatBubble>

                      {/* Customer's Answer if provided */}
                      {row.answer !== null && row.answer.trim() !== "" ? (
                        <ChatBubble
                          side={isPro ? "mine" : "theirs"}
                          who={isPro ? "You" : "Professional"}
                          at={row.answeredAt ?? row.askedAt}
                        >
                          {row.answer}
                        </ChatBubble>
                      ) : isPro ? (
                        <p className="text-left text-[11px] font-medium text-warning-text pl-2">
                          Waiting for your reply below…
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Bottom Chat Message Composer Bar */}
          {activeQuestionToAnswer ? (
            <div className="shrink-0 border-t border-line bg-white px-3.5 pt-2.5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] shadow-lg">
              <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1.5 px-1">
                <span>Replying to professional</span>
                <span>Max 2000 chars</span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draftAnswer.trim() === "" || answer.isPending) return;
                  answer.mutate(
                    {
                      requirementId,
                      questionId: activeQuestionToAnswer.id,
                      answer: draftAnswer.trim(),
                    },
                    {
                      onSuccess: () => setDraftAnswer(""),
                    },
                  );
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <textarea
                    rows={1}
                    maxLength={2000}
                    placeholder="Type your answer to the professional…"
                    value={draftAnswer}
                    onChange={(e) => {
                      setDraftAnswer(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    disabled={answer.isPending}
                    className="w-full resize-none rounded-[22px] border border-line bg-surface-sunken px-4 py-2.5 text-sm text-navy-900 leading-5 placeholder:text-text-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900/20 max-h-32 min-h-[44px] box-border"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (draftAnswer.trim() !== "" && !answer.isPending) {
                          answer.mutate(
                            {
                              requirementId,
                              questionId: activeQuestionToAnswer.id,
                              answer: draftAnswer.trim(),
                            },
                            {
                              onSuccess: () => {
                                setDraftAnswer("");
                                const el = e.currentTarget;
                                if (el) el.style.height = "44px";
                              },
                            },
                          );
                        }
                      }
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={draftAnswer.trim() === "" || answer.isPending}
                  aria-label="Send reply"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-navy-900 text-white shadow-md transition-all hover:bg-navy-800 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  <Send className="size-5" />
                </button>
              </form>
            </div>
          ) : (
            <div className="shrink-0 border-t border-line bg-surface p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-text-muted">
              All questions have been answered.
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function ChatBubble({
  side,
  who: _who,
  at,
  children,
}: {
  side: "mine" | "theirs";
  who: string;
  at: string;
  children: string;
}) {
  const isMine = side === "mine";
  return (
    <div className={cn("flex flex-col gap-1", isMine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[84%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs",
          isMine
            ? "bg-navy-900 text-white rounded-br-xs"
            : "bg-white text-navy-900 border border-line/80 rounded-bl-xs",
        )}
      >
        <p className="break-words">{children}</p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            isMine ? "text-navy-200" : "text-text-muted",
          )}
        >
          <span>{when(at)}</span>
          {isMine ? <CheckCheck className="size-3 text-sky-300 inline" /> : null}
        </div>
      </div>
    </div>
  );
}
