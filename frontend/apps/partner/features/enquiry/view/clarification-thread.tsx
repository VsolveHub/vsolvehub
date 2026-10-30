"use client";

import { describeError } from "@vsolve/query";
import { Button, ErrorState, cn, useHydrated, useT, useTranslator } from "@vsolve/ui";
import {
  ArrowLeft,
  CheckCheck,
  Lock,
  MessageCircle,
  Send,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { EnquiryRecord } from "../model/wire";
import { useAnswerQuestion, useAskQuestion } from "../queries";

/**
 * Full-page messaging and clarification thread with the customer.
 *
 * Rendered as a floating action button on the bottom right of the enquiry view.
 * When clicked, opens a full-page chat interface designed like a modern
 * messaging app.
 */

const MAX_OPEN = 3;

/** Mirrors the id `PartnerShell`'s focused header renders. */
const HEADER_ACTION_SLOT_ID = "partner-header-action";

function when(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface ClarificationThreadProps {
  readonly enquiry: EnquiryRecord;
  /**
   * Controlled open state. Omit and the component owns it.
   *
   * The enquiry screen drives it because two other controls open this thread —
   * the customer card's "Message" button and the "Something's wrong" sheet —
   * and a component that owned its own state could not be opened by either.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function ClarificationThread({
  enquiry,
  open,
  onOpenChange,
}: ClarificationThreadProps) {
  const t = useT();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setIsOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const headerSlot = useHeaderActionSlot();
  const ask = useAskQuestion(enquiry.id);
  const answer = useAnswerQuestion(enquiry.id);
  const [draft, setDraft] = useState("");
  const closed =
    enquiry.status === "DECLINED" ||
    enquiry.status === "EXPIRED" ||
    enquiry.status === "WITHDRAWN";
  const openMine = enquiry.questions.filter(
    (row) => row.asked_by_role === "VENDOR" && row.answered_at === null,
  ).length;
  const left = Math.max(0, MAX_OPEN - openMine);
  const failure = ask.error ?? answer.error;

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
      {/*
        The trigger lives in the app bar, not in a floating bubble.

        The bubble was `fixed bottom-6 right-6`, which is exactly where the
        sticky action bar and the last card now are — it covered the "Estimate"
        step of the progress rail and clipped the button under it. A chat entry
        point is navigation, and this screen already has a place for that.
      */}
      {headerSlot === null
        ? null
        : createPortal(
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label={t("enquiry.thread.openChat")}
              className="group relative grid size-11 place-items-center rounded-control text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <MessageCircle className="size-5" />
              {enquiry.questions.length > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-500 px-1 text-[10px] font-extrabold text-white">
                  {enquiry.questions.length}
                </span>
              ) : null}
            </button>,
            headerSlot,
          )}

      {/* Full-Page Messaging Experience */}
      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("enquiry.thread.dialogLabel")}
          className="fixed inset-0 z-[100] flex flex-col bg-canvas animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {/* Top Navigation Bar */}
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface px-4 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={t("enquiry.thread.backToEnquiry")}
                className="grid size-10 place-items-center rounded-full text-text-secondary hover:bg-surface-sunken hover:text-text transition-colors cursor-pointer"
              >
                <ArrowLeft className="size-5" />
              </button>

              <div className="relative">
                <div className="grid size-10 place-items-center rounded-full bg-navy-900 text-white font-bold text-sm shadow-2xs">
                  <User className="size-5" />
                </div>
                <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success-text ring-2 ring-white" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-bold text-navy-900 leading-tight">
                  {t("enquiry.thread.customer")}
                </h1>
                <p className="truncate text-xs font-medium text-text-muted">
                  {enquiry.serviceName ? enquiry.serviceName : t("enquiry.thread.defaultTitle")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={t("enquiry.thread.closeChat")}
              className="grid size-9 place-items-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text transition-colors cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </header>

          {/* Safety & Context Header Banner */}
          <div className="shrink-0 bg-navy-900/5 border-b border-line/60 px-4 py-2 text-center text-xs text-text-secondary flex items-center justify-center gap-1.5">
            <Lock className="size-3.5 text-text-muted shrink-0" />
            <span>{t("enquiry.thread.safetyBanner")}</span>
          </div>

          {/* Mutation Failure Alert */}
          {failure ? (
            <div className="p-4 shrink-0">
              <ErrorState
                inline
                title={describeError(failure, "mutation").title}
                message={describeError(failure, "mutation").message}
                severity="error"
              />
            </div>
          ) : null}

          {/* Main Message Stream */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="flex justify-center my-1">
              <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold text-text-muted shadow-2xs">
                {t("enquiry.thread.streamLabel")}
              </span>
            </div>

            {enquiry.questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-center px-6">
                <div className="grid size-12 place-items-center rounded-full bg-navy-100 text-navy-800 mb-3">
                  <MessageCircle className="size-6" />
                </div>
                <h3 className="text-sm font-bold text-navy-900">{t("enquiry.thread.empty.title")}</h3>
                <p className="mt-1 text-xs text-text-secondary max-w-xs leading-relaxed">
                  {t("enquiry.thread.empty.message")}
                </p>
              </div>
            ) : (
              <ol className="flex list-none flex-col gap-4 p-0 m-0">
                {enquiry.questions.map((row) => {
                  const mine = row.asked_by_role === "VENDOR";
                  return (
                    <li key={row.id} className="flex flex-col gap-2">
                      <ChatBubble side={mine ? "mine" : "theirs"} who={mine ? t("enquiry.thread.you") : t("enquiry.thread.customer")} at={row.asked_at}>
                        {row.question}
                      </ChatBubble>

                      {row.answered_at !== null && row.answer.trim() !== "" ? (
                        <ChatBubble side={mine ? "theirs" : "mine"} who={mine ? t("enquiry.thread.customer") : t("enquiry.thread.you")} at={row.answered_at}>
                          {row.answer}
                        </ChatBubble>
                      ) : row.asked_by_role === "CUSTOMER" ? (
                        <div className="ml-2 max-w-[92%] rounded-2xl border border-line bg-white p-3.5 shadow-sm">
                          <p className="text-xs font-bold text-signal-700 uppercase tracking-wide">
                            {t("enquiry.thread.customerWaiting")}
                          </p>
                          <AnswerBox
                            onAnswer={(text) => answer.mutate({ questionId: row.id, answer: text })}
                            pending={answer.isPending}
                          />
                        </div>
                      ) : (
                        <p className="text-right text-[11px] font-medium text-text-muted pr-2">
                          {t("enquiry.thread.waitingForCustomer")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Bottom Chat Message Input */}
          {closed ? (
            <div className="shrink-0 border-t border-line bg-surface p-4 text-center text-xs text-text-muted">
              {t("enquiry.thread.closed")}
            </div>
          ) : (
            <div className="shrink-0 border-t border-line bg-white px-3.5 pt-2.5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] shadow-lg">
              <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1.5 px-1">
                <span>
                  {left === 0
                    ? t("enquiry.thread.waitBeforeAsking")
                    : t("enquiry.thread.openQuestionsAllowed", { count: left })}
                </span>
                <span>{t("enquiry.thread.maxChars", { max: 2000 })}</span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim() === "" || left === 0 || ask.isPending) return;
                  ask.mutate({ question: draft.trim() }, { onSuccess: () => setDraft("") });
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <textarea
                    rows={1}
                    maxLength={2000}
                    placeholder={t("enquiry.thread.messagePlaceholder")}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    disabled={left === 0 || ask.isPending}
                    className="w-full resize-none rounded-[22px] border border-line bg-surface-sunken px-4 py-2.5 text-sm text-navy-900 leading-5 placeholder:text-text-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-navy-900/20 max-h-32 min-h-[44px] box-border"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (draft.trim() !== "" && left > 0 && !ask.isPending) {
                          ask.mutate(
                            { question: draft.trim() },
                            {
                              onSuccess: () => {
                                setDraft("");
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
                  disabled={draft.trim() === "" || left === 0 || ask.isPending}
                  aria-label={t("enquiry.thread.send")}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-navy-900 text-white shadow-md transition-all hover:bg-navy-800 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  <Send className="size-5" />
                </button>
              </form>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function ChatBubble({
  side,
  at,
  children,
}: {
  side: "mine" | "theirs";
  who: string;
  at: string;
  children: string;
}) {
  const { locale } = useTranslator();
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
          <span>{when(at, locale)}</span>
          {isMine ? <CheckCheck className="size-3 text-sky-300 inline" /> : null}
        </div>
      </div>
    </div>
  );
}

function AnswerBox({ onAnswer, pending }: { onAnswer: (text: string) => void; pending: boolean }) {
  const t = useT();
  const [text, setText] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("enquiry.thread.answerPlaceholder")}
        className="w-full resize-none rounded-xl border border-line bg-white p-2.5 text-sm text-navy-900 placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy-900/20"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={text.trim() === ""}
          loading={pending}
          loadingLabel={t("enquiry.thread.sending")}
          onClick={() => {
            onAnswer(text.trim());
            setText("");
          }}
        >
          {t("enquiry.thread.sendReply")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The app bar's action slot, once it exists in the DOM.
 *
 * `PartnerShell`'s focused header renders an empty, correctly sized box on the
 * trailing side of every detail route. Portalling into it keeps this feature's
 * trigger out of the shell's imports — the shell has no business knowing an
 * enquiry has a chat thread — while still putting the control where a header
 * control belongs.
 *
 * Returns null on the first render and on any route whose header has no slot,
 * which is what makes it safe: the thread simply has no trigger there rather
 * than throwing.
 */
function useHeaderActionSlot(): HTMLElement | null {
  // `useHydrated` rather than `useState` + `useEffect`: the effect version
  // schedules a state update during the commit that just finished, which is the
  // cascading render `react-hooks/set-state-in-effect` exists to prevent. The
  // lookup itself is a read of a DOM node the shell mounted above this
  // component and never replaces, so it is stable for the life of the route.
  return useHydrated() ? document.getElementById(HEADER_ACTION_SLOT_ID) : null;
}
