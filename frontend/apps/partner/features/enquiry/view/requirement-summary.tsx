"use client";

import { Card, Disclosure, FactList } from "@vsolve/ui";
import type { ReactNode } from "react";

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
 *
 * ## Both dates are labelled
 *
 * `ScheduleSummary` prints its date bare, which put two unlabelled dates at the
 * top of the enquiry screen — one of them not the visit date — and left a
 * vendor to guess which was which. Neither is a time they have to be anywhere,
 * so both are rows in the brief now, each saying what it is.
 *
 * ## Collapsible on the visit screen only
 *
 * On `/work/enquiries/[id]` this is reference material a vendor reads once and
 * then wants out of the way of the address and the arrival button, so it is a
 * `Disclosure` there. In the live offer popup it is the entire basis of a
 * decision being made in seconds, so it stays open — hence the prop rather than
 * a house rule either way.
 */

export interface RequirementSummaryProps {
  readonly enquiry: EnquiryRecord;
  /** Fold the brief behind a summary row. Open on first render when `false`. */
  readonly collapsible?: boolean;
}

export function RequirementSummary({ enquiry, collapsible = false }: RequirementSummaryProps) {
  const budget = budgetLine(enquiry.budgetMinPaise, enquiry.budgetMaxPaise);
  const brief = enquiry.brief.filter((line) => line.value.trim() !== "");

  const dates = [
    ...(enquiry.requestedStart
      ? [{ label: "Wants work to start", value: shortDate(enquiry.requestedStart) }]
      : []),
    ...(enquiry.serviceBy
      ? [{ label: "Enquiry closes", value: shortDate(enquiry.serviceBy) }]
      : []),
  ];

  const body = (
    <>
      {dates.length > 0 ? <FactList items={dates} /> : null}

      {brief.length > 0 ? (
        <FactList items={brief.map((line) => ({ label: line.question, value: line.value }))} />
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          The customer chose the service and a visit time — the details are yours to take on
          site.
        </p>
      )}

      {budget ? <FactList items={[{ label: "Customer's budget", value: budget }]} /> : null}

      {/* Said once, here, rather than repeated under the address card: it is a
          rule about the whole enquiry, not about the map link. */}
      <p className="text-xs leading-5 text-text-muted">
        Use this address only to complete this Vsolve visit. The customer&rsquo;s contact details
        stay private.
      </p>
    </>
  );

  if (collapsible) {
    return (
      <Card className="p-0">
        <Disclosure
          className="px-4 py-3"
          summary="What the customer asked for"
          // Counts what is actually behind the chevron — the dates included.
          // "No details" was wrong on a visit-first enquiry: the brief is empty
          // by design there, but the two dates are still in the drawer.
          hint={`${dates.length + brief.length} details`}
        >
          <Body>{body}</Body>
        </Disclosure>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold text-text">What the customer asked for</h2>
      {body}
    </Card>
  );
}

function Body({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
