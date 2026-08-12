"use client";

import { Button, Card, Field, Textarea, Timeline, TimelineEvent } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useState } from "react";

import { timeAgo } from "@/lib/format";
import { permissionsFor } from "../model/enquiry-state";
import type { EnquiryRecord } from "../model/wire";
import { useAskQuestion } from "../queries";

/**
 * Structured clarification: one question, one answer, on the shared timeline.
 *
 * Closes `M2-FE-305`, and `SIM-07` is the reason it looks like this.
 *
 * ## What this deliberately is not
 *
 * Not a chat thread. `RequirementQuestion` holds a question and at most one
 * answer, `answer_question` refuses a second, and there is no participant list,
 * no read receipt and no typing state to publish. A messaging UI over a
 * question/answer record would promise a conversation the platform does not run
 * and cannot moderate — and moderation is the point: every question is a
 * candidate for off-platform contact, which is why it goes through a record
 * Operations can read rather than a channel it cannot.
 *
 * ## Why the guidance sits on the composer rather than in a policy page
 *
 * `M2-FE-307` requires safety guidance before contact could be disclosed. This
 * is the only place in the Partner surface where a vendor can type free text
 * that reaches a customer, so it is the only place the guidance can arrive in
 * time to change what they type. `proposals.looks_like_contact_sharing` flags
 * questions that carry a phone number or an off-platform handle; the flag is a
 * review signal Django keeps and does not publish, so the honest thing to say is
 * that questions are reviewed — not to reproduce the regex here and pretend to
 * enforce it.
 */

const MAX_QUESTION = 2000;

export interface ClarificationPanelProps {
  readonly enquiry: EnquiryRecord;
}

export function ClarificationPanel({ enquiry }: ClarificationPanelProps) {
  const [question, setQuestion] = useState("");
  const ask = useAskQuestion(enquiry.id);
  const permissions = permissionsFor(enquiry.status);

  const trimmed = question.trim();
  const tooLong = question.length > MAX_QUESTION;
  const canSend = trimmed !== "" && !tooLong && !ask.isPending;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-text">Questions</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Ask one thing at a time. The customer answers each question once, and both the question
          and the answer stay on this request&rsquo;s record.
        </p>
      </div>

      {enquiry.questions.length > 0 ? (
        <Timeline label="Your questions and the customer's answers">
          {enquiry.questions.map((entry) => (
            <TimelineEvent
              key={entry.id}
              title="You asked"
              timestamp={timeAgo(entry.asked_at)}
              tone={entry.answered_at === null ? "active" : "success"}
            >
              <p className="whitespace-pre-line text-sm leading-6 text-text">{entry.question}</p>
              {entry.answered_at !== null ? (
                <div className="mt-2 rounded-control border border-line bg-surface-sunken p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Customer answered {timeAgo(entry.answered_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-text">
                    {entry.answer}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Waiting for the customer. Vsolve does not chase an answer, so quote on what you
                  know if the deadline is close.
                </p>
              )}
            </TimelineEvent>
          ))}
        </Timeline>
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          You have not asked anything about this request yet.
        </p>
      )}

      {permissions.canAsk ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSend) return;
            ask.mutate({ question: trimmed }, { onSuccess: () => setQuestion("") });
          }}
        >
          <Field
            label="Ask the customer something"
            description="Do not include phone numbers, WhatsApp handles or payment links. Vsolve reviews questions, and taking a customer off the platform removes the protection on both sides."
            error={
              tooLong
                ? `Questions are limited to ${MAX_QUESTION} characters.`
                : ask.error
                  ? describeError(ask.error, "mutation").message
                  : undefined
            }
          >
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder="What would change your price?"
              disabled={ask.isPending}
            />
          </Field>

          <Button
            type="submit"
            variant="outline"
            // Disabled while in flight because this path carries no
            // idempotency key — the contract declares none on
            // `enquiries/{id}/questions/` — so a second submission would be a
            // second question, not a retry of the first.
            disabled={!canSend}
            loading={ask.isPending}
            loadingLabel="Sending"
          >
            Send question
          </Button>
        </form>
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          This enquiry is closed to you, so no further questions can be sent.
        </p>
      )}
    </Card>
  );
}
