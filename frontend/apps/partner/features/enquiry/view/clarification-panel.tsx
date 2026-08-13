"use client";

import { Button, Card, Field, Textarea, Timeline, TimelineEvent } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useState } from "react";

import { timeAgo } from "@/lib/format";
import { permissionsFor } from "../model/enquiry-state";
import type { EnquiryRecord } from "../model/wire";
import { useAnswerQuestion, useAskQuestion, type RequirementQuestion } from "../queries";

/**
 * Structured clarification: one question, one answer, on the shared timeline.
 *
 * Closes `M2-FE-305`, and `SIM-07` is the reason it looks like this.
 *
 * ## It runs both ways since contract 1.26.0
 *
 * Until then only a vendor could open a question, so every row on this timeline
 * was safely titled "You asked". `POST /requirements/{id}/quotes/{proposal_id}/
 * questions/` gave the Customer a question of their own and
 * `RequirementQuestion.asked_by_role` (`CUSTOMER` | `VENDOR` | `OPERATIONS`)
 * says who opened each row — published precisely because a client with no
 * direction field renders both halves of a two-way conversation as though the
 * other side started it.
 *
 * So the row is titled from the server's field, and a customer-asked question
 * carries the answer composer rather than a "waiting for the customer" line that
 * would have the vendor waiting on themselves. Each answer route refuses the
 * side that asked, which is why only one of the two ever offers a control.
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
          Ask one thing at a time. Either side may ask, each question is answered once, and both
          the question and the answer stay on this request&rsquo;s record.
        </p>
      </div>

      {enquiry.questions.length > 0 ? (
        <Timeline label="Questions on this request, and their answers">
          {enquiry.questions.map((entry) => (
            <QuestionRow key={entry.id} entry={entry} invitationId={enquiry.id} />
          ))}
        </Timeline>
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          Nothing has been asked about this request yet, by either side.
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

/**
 * One question, titled by who asked it.
 *
 * Three roles are published and all three are named. `OPERATIONS` is not folded
 * into either side: a question Vsolve asked on somebody's behalf is a different
 * thing to answer, and a client that showed it as the customer's would put words
 * in the customer's mouth. An unrecognised role degrades to a neutral title
 * rather than a guess.
 */
function QuestionRow({
  entry,
  invitationId,
}: {
  readonly entry: RequirementQuestion;
  readonly invitationId: string;
}) {
  const asked = entry.asked_by_role;
  const mine = asked === "VENDOR";
  const title = mine
    ? "You asked"
    : asked === "CUSTOMER"
      ? "The customer asked"
      : asked === "OPERATIONS"
        ? "Vsolve asked"
        : "Asked";

  return (
    <TimelineEvent
      title={title}
      timestamp={timeAgo(entry.asked_at)}
      tone={entry.answered_at === null ? "active" : "success"}
    >
      <p className="whitespace-pre-line text-sm leading-6 text-text">{entry.question}</p>

      {entry.answered_at !== null ? (
        <div className="mt-2 rounded-control border border-line bg-surface-sunken p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {mine ? "Customer answered" : "You answered"} {timeAgo(entry.answered_at)}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-text">{entry.answer}</p>
        </div>
      ) : mine ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Waiting for the customer. Vsolve does not chase an answer, so quote on what you know if
          the deadline is close.
        </p>
      ) : asked === "CUSTOMER" ? (
        <AnswerComposer questionId={entry.id} invitationId={invitationId} />
      ) : (
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Vsolve will come back to you about this one directly.
        </p>
      )}
    </TimelineEvent>
  );
}

/**
 * The vendor's answer to a customer's question.
 *
 * Only rendered on a `CUSTOMER` row, because `m2_partner_question_answer`
 * refuses a question this vendor asked. It is answered once — `answer_question`
 * refuses a second — so the composer disappears with the answer rather than
 * becoming an edit box over a record the customer has already read.
 */
function AnswerComposer({
  questionId,
  invitationId,
}: {
  readonly questionId: string;
  readonly invitationId: string;
}) {
  const [answer, setAnswer] = useState("");
  const send = useAnswerQuestion(invitationId);

  const trimmed = answer.trim();
  const tooLong = answer.length > MAX_QUESTION;
  const canSend = trimmed !== "" && !tooLong && !send.isPending;

  return (
    <form
      className="mt-2 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        send.mutate({ questionId, answer: trimmed }, { onSuccess: () => setAnswer("") });
      }}
    >
      <Field
        label="Your answer"
        description="Answered once, and the customer sees it on this request. The same rule applies: no phone numbers, handles or payment links."
        error={
          tooLong
            ? `Answers are limited to ${MAX_QUESTION} characters.`
            : send.error
              ? describeError(send.error, "mutation").message
              : undefined
        }
      >
        <Textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          rows={3}
          disabled={send.isPending}
        />
      </Field>

      <Button
        type="submit"
        variant="outline"
        // No idempotency key is declared on this path, so the in-flight guard is
        // the only duplicate protection there is.
        disabled={!canSend}
        loading={send.isPending}
        loadingLabel="Sending"
      >
        Send answer
      </Button>
    </form>
  );
}
