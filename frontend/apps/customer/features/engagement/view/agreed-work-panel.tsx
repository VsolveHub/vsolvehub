"use client";

import { readVendorIdentity } from "@vsolve/query";
import { Badge, Skeleton, buttonStyles, formatMoney } from "@vsolve/ui";
import Link from "next/link";

import { useCustomerQuotes } from "@/features/quotes/queries";
import type { EngagementView } from "../adapters";
import type { ModeNouns } from "./engagement-status";

export interface AgreedWorkPanelProps {
  engagement: EngagementView;
  nouns: ModeNouns;
  quotesHref: string;
}

/** The accepted professional and quote, kept compact because the quote has its own page. */
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
      <p className="text-xs font-bold uppercase text-text-muted">Your professional</p>
      <h2 id="agreed-work-heading" className="mt-1 text-xl font-extrabold text-text">
        Who is doing the work
      </h2>

      {query.isPending ? (
        <div className="mt-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
        </div>
      ) : quote === null ? (
        <div className="mt-3 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center">
          <VendorMark name={null} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-text">Professional details unavailable</p>
            <p className="mt-0.5 text-xs font-medium text-text-secondary">
              The accepted quote remains available.
            </p>
          </div>
          <Link href={quotesHref} className={buttonStyles({ variant: "outline" })}>
            Open quote
          </Link>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex items-center gap-4 p-4 sm:p-5">
            <Identity vendor={quote.vendor} />
          </div>

          {engagement.mode === "lead_only" &&
          quote.worker_count !== null &&
          quote.minimum_days !== null ? (
            <div className="flex items-center gap-3 border-t border-line px-4 py-3 sm:px-5">
              <PanelIcon kind="team" />
              <p className="min-w-0 flex-1 text-sm font-medium text-text-secondary">
                <strong className="font-extrabold text-text">
                  {quote.worker_count} {quote.worker_count === 1 ? "person" : "people"}
                </strong>{" "}
                for {quote.minimum_days} {quote.minimum_days === 1 ? "day" : "days"}
                {quote.rate_paise_per_worker_day !== null
                  ? ` at ${formatMoney(quote.rate_paise_per_worker_day)} per person per day`
                  : ""}
              </p>
            </div>
          ) : null}

          {engagement.mode === "lead_only" ? (
            <details className="group border-t border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 text-sm font-bold text-text transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                Team attendance details
              </summary>
              <p className="border-t border-line bg-canvas px-4 py-3 text-sm leading-6 text-text-secondary sm:px-5">
                The professional runs their team. If fewer people arrive than agreed, report it on that {nouns.stage}.
              </p>
            </details>
          ) : null}

          <div className="grid border-t border-line sm:grid-cols-2">
            <div className="flex min-h-16 items-center gap-3 px-4 py-3 sm:border-r sm:border-line sm:px-5">
              <PanelIcon kind="contact" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-muted">Contact</p>
                <p className="mt-0.5 text-sm font-bold text-text">
                  {engagement.contactReleasedAt !== null
                    ? `Available from ${engagement.contactReleasedAt}`
                    : "Not released yet"}
                </p>
              </div>
            </div>
            <Link
              href={quotesHref}
              className="flex min-h-16 items-center gap-3 border-t border-line px-4 py-3 transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:border-t-0 sm:px-5"
            >
              <PanelIcon kind="quote" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-text-muted">Accepted quote</span>
                <span className="mt-0.5 block text-sm font-bold text-text">Scope, terms and warranty</span>
              </span>
              <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-text-muted">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function Identity({ vendor }: { vendor: unknown }) {
  const identity = readVendorIdentity(vendor);
  const name = identity.displayName ?? "Professional assigned";

  return (
    <>
      <VendorMark name={identity.displayName} />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-extrabold text-text">{name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {identity.vendorType !== null ? (
            <Badge tone="neutral">{friendlyVendorType(identity.vendorType)}</Badge>
          ) : null}
          {identity.isVerified ? <Badge tone="success">Verified</Badge> : null}
        </div>
      </div>
    </>
  );
}

function VendorMark({ name }: { name: string | null }) {
  const initials = (name ?? "Professional")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-selected-surface text-sm font-extrabold text-action-active ring-1 ring-action-line">
      {initials}
    </span>
  );
}

function friendlyVendorType(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function PanelIcon({ kind }: { kind: "team" | "contact" | "quote" }) {
  const path = {
    team: "M16 18v-1.5A3.5 3.5 0 0 0 12.5 13h-5A3.5 3.5 0 0 0 4 16.5V18m6-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 0 0 0-5m1 12v-1a3 3 0 0 0-2-2.83",
    contact: "M6 4h3l2 5-2 1.5a14 14 0 0 0 4.5 4.5L15 13l5 2v3a2 2 0 0 1-2 2C10.27 20 4 13.73 4 6a2 2 0 0 1 2-2Z",
    quote: "M7 3h7l4 4v14H7V3Zm7 0v5h5M10 13h5m-5 4h5",
  }[kind];

  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-action-active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d={path} />
      </svg>
    </span>
  );
}
