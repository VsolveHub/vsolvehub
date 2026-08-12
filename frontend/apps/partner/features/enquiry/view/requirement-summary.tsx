"use client";

import { Card, FactList, ScheduleSummary } from "@vsolve/ui";
import { Lock } from "lucide-react";

import { shortDate } from "@/lib/format";
import {
  budgetLine,
  requirementFacts,
  unreadableAnswerCount,
} from "../model/requirement-facts";
import type { EnquiryRecord } from "../model/wire";

/**
 * What this vendor was invited against.
 *
 * The structured half of `M2-FE-302`. Reads the **snapshot**, which is the whole
 * point of the record: `EnquiryDetailSerializer` sources every field from
 * `invitation.snapshot`, so a customer editing their request after the
 * invitation went out cannot move the goalposts under a quote in progress. What
 * is on this screen is what the quote answers.
 *
 * ## Two things `M2-FE-302` asks for that cannot be built
 *
 * **The attachment viewer.** `RequirementSnapshot` does not copy attachments and
 * `EnquiryDetail` publishes none, so there is nothing to view. Attachment upload
 * itself is `M2-BE-202`, deferred to Wave C1. Rather than an empty viewer that
 * reads as "the customer attached nothing", the screen states the platform-level
 * truth and points at the channel that does work.
 *
 * **The capacity check.** `CapacityHold` is written on acceptance and never
 * published, and no read answers "am I already committed on these dates". So the
 * consequence of accepting is stated — it is knowable from the domain — and the
 * conflict warning that would need a read is not invented. Both requested in
 * `frontend-execution-plan.md` §7.
 */

export interface RequirementSummaryProps {
  readonly enquiry: EnquiryRecord;
}

export function RequirementSummary({ enquiry }: RequirementSummaryProps) {
  const facts = requirementFacts(enquiry.answers);
  const unreadable = unreadableAnswerCount(enquiry.answers);
  const budget = budgetLine(enquiry.budgetMinPaise, enquiry.budgetMaxPaise);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold text-text">What the customer asked for</h2>

      <ScheduleSummary
        dates={enquiry.requestedStart ? shortDate(enquiry.requestedStart) : "No start date given"}
        serviceBy={enquiry.serviceBy ? shortDate(enquiry.serviceBy) : undefined}
      />

      {facts.length > 0 ? (
        <FactList items={facts.map((fact) => ({ label: fact.label, value: fact.value }))} />
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          The customer answered no structured questions on this request. Everything they said is in
          their own words below.
        </p>
      )}

      {unreadable > 0 ? (
        <p className="text-sm leading-6 text-text-secondary">
          {unreadable === 1
            ? "One of the customer's answers is in a format this screen cannot show."
            : `${unreadable} of the customer's answers are in a format this screen cannot show.`}{" "}
          Ask a question below if it matters to your price.
        </p>
      ) : null}

      {enquiry.additionalDetails.trim() !== "" ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            In the customer&rsquo;s words
          </h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-text">
            {enquiry.additionalDetails}
          </p>
        </div>
      ) : null}

      {budget ? (
        <FactList
          items={[
            {
              label: "Customer's budget",
              value: budget,
            },
          ]}
        />
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          The customer did not state a budget.
        </p>
      )}

      <p className="text-sm leading-6 text-text-secondary">
        Vsolve does not share customer photos or voice notes with vendors yet. If the description
        leaves something unclear, ask a question below rather than pricing around it.
      </p>

      <p className="flex items-start gap-2 text-xs leading-5 text-text-muted">
        <Lock size={14} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          The customer&rsquo;s name, address and phone number are not shared with vendors at any
          point in this screen — not before you accept, and not after.
        </span>
      </p>
    </Card>
  );
}
