"use client";

import { Badge, Card } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { shortDate } from "@/lib/format";
import { describeStatus } from "../model/enquiry-state";
import type { EnquiryRow } from "../model/wire";
import { EnquiryDeadlineInline } from "./enquiry-deadline";

/**
 * One enquiry in the inbox.
 *
 * Half of `M2-FE-301`. Everything on this row is either a field the server sent
 * or a label for one; nothing is derived from a category name or a role.
 *
 * ## What is deliberately not here
 *
 * **The area.** `M2-FE-301` asks for it and no Partner-facing read publishes it.
 * `EnquirySummarySerializer` carries the snapshot's schedule, language and
 * budget; the requirement's address is withheld at every status, and the service
 * area is not published at all. Vendors are matched on `PartnerServiceArea`, so
 * every enquiry is inside an area this vendor already serves — but *which* one
 * is the biggest decision input on this row and it is missing. Requested in
 * `frontend-execution-plan.md` §7. Nothing stands in for it.
 *
 * **A fit summary.** Also asked for, also unpublished. The ranking that produced
 * the invitation is recorded in `VendorInvitation.ranking_provenance` and never
 * serialised. Inventing "good fit" out of a category slug would be this client
 * asserting a matching decision it did not make.
 *
 * The row says less than the task asks for, and only true things. That is the
 * trade the no-placeholder rule makes.
 */

const TONE = {
  action: "action",
  progress: "info",
  settled: "neutral",
  gone: "neutral",
} as const;

export interface EnquiryCardProps {
  readonly enquiry: EnquiryRow;
  /** Workspace-scoped list route: `/workforce/enquiries` or `/projects/enquiries`. */
  readonly basePath: string;
}

export function EnquiryCard({ enquiry, basePath }: EnquiryCardProps) {
  const status = describeStatus(enquiry.status);
  // The service is the vendor's own vocabulary for the work. The archetype code
  // is never rendered — it decides which composer opens, and nothing else.
  const service = enquiry.categorySlug.replace(/[-_]+/g, " ");

  const schedule = [
    enquiry.requestedStart ? `Starts ${shortDate(enquiry.requestedStart)}` : null,
    enquiry.serviceBy ? `Needed by ${shortDate(enquiry.serviceBy)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <Card className="p-0">
      <Link
        href={`${basePath}/${enquiry.id}`}
        className="flex min-h-20 items-center justify-between gap-3 rounded-card px-4 py-3 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold capitalize text-text">{service}</span>
            <Badge tone={TONE[status.tone]} dot>
              {status.label}
            </Badge>
          </span>

          <span className="text-xs text-text-secondary">
            {/* No dates at all is a real state — a snapshot can carry neither —
                and saying so beats an empty line the reader has to interpret. */}
            {schedule === "" ? "No dates given" : schedule}
          </span>

          <EnquiryDeadlineInline respondsBy={enquiry.respondsBy} />
        </span>

        <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted" />
      </Link>
    </Card>
  );
}
