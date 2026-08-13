"use client";

import { readVendorIdentity } from "@vsolve/query";
import { Badge, Skeleton, formatMoney } from "@vsolve/ui";
import Link from "next/link";

import { useCustomerQuotes } from "@/features/quotes/queries";
import type { EngagementView } from "../adapters";
import type { ModeNouns } from "./engagement-status";

/**
 * Who is doing the work, and what was agreed about them — `M2-FE-509`.
 *
 * The task asks for the **agreed crew composition** and a **permitted identity
 * summary**, and `Engagement` carries neither: it publishes `partner` as a bare
 * id, no worker count, no rate and no name. What it does publish is the
 * `proposal` it was frozen from — so this reads the accepted quote back and
 * renders the composition that was actually agreed.
 *
 * ## Why that read is allowed here, and why it is still optional
 *
 * `customer_may_read_full_quotes` gates it, and an unlock in `CONSUMED` is
 * readable — `READABLE_STATUSES` is `(ACTIVE, CONSUMED)` — so consuming the
 * unlock at engagement creation does not close the quotes back off. On A5 a
 * charged plan does the same job.
 *
 * It is still treated as **supplementary**: a failed or refused read renders as
 * a sentence and a link, never as an error banner. The engagement itself loaded;
 * the agreement, its money and its stages are all on screen, and turning a
 * secondary join into a red box would teach the Customer that something is wrong
 * with a job that is fine.
 *
 * ## The identity rule
 *
 * `display_name` is null until the server decides disclosure is permitted, and
 * this renders that as policy rather than as a missing field. Nothing here
 * un-hides a name, and no phone number exists anywhere on the wire at 1.25.0 —
 * `contact_released_at` says *when* contact becomes permitted and nothing
 * publishes the number itself. Logged in `frontend-execution-plan.md` §7.
 */

export interface AgreedWorkPanelProps {
  engagement: EngagementView;
  nouns: ModeNouns;
  /** Where the accepted quote is readable in full. */
  quotesHref: string;
}

export function AgreedWorkPanel({ engagement, nouns, quotesHref }: AgreedWorkPanelProps) {
  const query = useCustomerQuotes(engagement.requirementId);

  const quote =
    query.data === undefined
      ? null
      : (query.data.quotes.find((candidate) => candidate.status === "ACCEPTED") ??
        query.data.quotes.find((candidate) => candidate.status === "SELECTED") ??
        null);

  return (
    <section aria-labelledby="agreed-work-heading" className="mt-6">
      <h2 id="agreed-work-heading" className="text-lg font-semibold text-text">
        Who is doing this
      </h2>

      {query.isPending ? (
        <div className="mt-3" aria-busy="true">
          <Skeleton className="h-20 w-full" />
        </div>
      ) : quote === null ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          We could not read the quote you accepted just now, so we are not going
          to describe it from memory.{" "}
          <Link href={quotesHref} className="font-medium text-text-link hover:underline">
            It is here in full
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3 rounded-card border border-line bg-surface p-4">
          <Identity vendor={quote.vendor} />

          {/* The A3 composition, exactly as the accepted quote states it. Every
              number is the vendor's own; nothing here is multiplied out into a
              total, because the engagement publishes the total and a second
              arithmetic path is a second answer. */}
          {engagement.mode === "lead_only" &&
          quote.worker_count !== null &&
          quote.minimum_days !== null ? (
            <p className="mt-3 text-sm leading-6 text-text">
              <strong className="font-semibold">
                {quote.worker_count} {quote.worker_count === 1 ? "person" : "people"}
              </strong>{" "}
              for {quote.minimum_days} {quote.minimum_days === 1 ? "day" : "days"}
              {quote.rate_paise_per_worker_day !== null
                ? `, at ${formatMoney(quote.rate_paise_per_worker_day)} per person per day`
                : ""}
              .
            </p>
          ) : null}

          {engagement.mode === "lead_only" ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Who exactly turns up on a given day can change — the professional
              runs their own team. If fewer people arrive than you agreed, say so
              on that {nouns.stage}.
            </p>
          ) : null}

          <p className="mt-3 text-sm leading-6 text-text-secondary">
            {engagement.contactReleasedAt !== null
              ? `You can contact each other from ${engagement.contactReleasedAt}. We do not publish their phone number on this screen.`
              : "Contact details are not released yet."}
          </p>

          <p className="mt-3 text-sm">
            <Link href={quotesHref} className="font-medium text-text-link hover:underline">
              Read the whole quote you accepted
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

function Identity({ vendor }: { vendor: unknown }) {
  const identity = readVendorIdentity(vendor);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-medium text-text">
        {identity.displayName ?? "Their name is shared before they arrive"}
      </p>
      {identity.vendorType !== null ? (
        <Badge tone="neutral">{identity.vendorType}</Badge>
      ) : null}
      {/* Verification defaults to false in the parser, not true: an unverified
          professional shown as verified is the one direction of this field that
          can hurt somebody. */}
      {identity.isVerified ? <Badge tone="success">Verified</Badge> : null}
    </div>
  );
}
