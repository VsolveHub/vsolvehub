"use client";

import { Card, FactList, ScheduleSummary } from "@vsolve/ui";
import { Lock } from "lucide-react";

import { shortDate } from "@/lib/format";
import { budgetLine } from "../model/requirement-facts";
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
 * ## The brief is labels now, not codes
 *
 * `EnquiryDetail.brief` (1.48.0) publishes each question as asked and the
 * answer as the label the customer tapped. Until then this screen de-slugged
 * the raw `answers` map — `site_access` → "Site access" — which was this client
 * guessing at what a catalogue question meant. Nothing here reads `answers`
 * any more.
 *
 * The brief is small by design: the customer chose a service and a visit time,
 * and the details are the vendor's to take on site. An empty brief says so in
 * one line rather than apologising for missing prose.
 */

export interface RequirementSummaryProps {
  readonly enquiry: EnquiryRecord;
}

export function RequirementSummary({ enquiry }: RequirementSummaryProps) {
  const budget = budgetLine(enquiry.budgetMinPaise, enquiry.budgetMaxPaise);
  const brief = enquiry.brief.filter((line) => line.value.trim() !== "");

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold text-text">What the customer asked for</h2>

      <ScheduleSummary
        dates={enquiry.requestedStart ? shortDate(enquiry.requestedStart) : "No start date given"}
        serviceBy={enquiry.serviceBy ? shortDate(enquiry.serviceBy) : undefined}
      />

      {brief.length > 0 ? (
        <FactList items={brief.map((line) => ({ label: line.question, value: line.value }))} />
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          The customer chose the service and a visit time — the details are yours to take on
          site.
        </p>
      )}

      {budget ? (
        <FactList
          items={[
            {
              label: "Customer's budget",
              value: budget,
            },
          ]}
        />
      ) : null}

      <p className="flex items-start gap-2 text-xs leading-5 text-text-muted">
        <Lock size={14} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          {enquiry.archetype === "A5_CUSTOM_PROJECT"
            ? "Only the approximate area is shown before booking. The exact site address appears in your visit workspace after customer payment confirms the visit; the customer’s name and phone stay private."
            : "Only the approximate area is shown with this quote request. The customer’s exact address, name and phone stay private."}
        </span>
      </p>
    </Card>
  );
}
