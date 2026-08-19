"use client";

import { Button, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toBookingView } from "@/features/crew/adapters";
import { useRateCardState } from "@/features/crew/queries";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { engagementHref } from "@/lib/routes";

import { toEngagementView } from "../adapters";
import { useEngagement } from "../queries";

/**
 * The receipt as a document, on its own page.
 *
 * ## Why a route and not a dialog
 *
 * A receipt is a record somebody returns to, forwards to whoever keeps their
 * books, and expects to find at a URL months later. A modal is none of those.
 * The same reasoning put `book-visits` and `book-crew` on routes rather than in
 * overlays: anything that outlives the screen that opened it needs an address.
 *
 * ## What it deliberately is not
 *
 * Not a tax invoice, and it says so on its face rather than in a footnote. An
 * access fee has no `Order`, `TaxDocument.order` is not nullable, and GST
 * treatment of these fees is an open owner decision — so a document that looked
 * like a tax invoice would be a document making a claim nobody has approved.
 *
 * What it *is* is a complete record of one payment: who paid, who was paid, what
 * for, how much, when it cleared, and the gapless `M2A-` reference that ties it
 * to the ledger.
 *
 * ## The crew money is shown, and labelled as not ours
 *
 * The booking costs more than this receipt covers, and a document that mentioned
 * only its own slice would leave the reader to wonder where the rest went. It is
 * stated as context, marked "not collected by V Solve Hub", and kept out of the
 * paid-to-us total — which is the honest way to be both complete and accurate.
 */

export interface ReceiptDocumentProps {
  engagementId: string;
}

export function ReceiptDocument({ engagementId }: ReceiptDocumentProps) {
  const engagementQuery = useEngagement(engagementId);
  const engagement = engagementQuery.data ?? null;
  const view = engagement === null ? null : toEngagementView(engagement);

  const rateQuery = useRateCardState(view?.requirementId ?? null, view !== null);
  const booking =
    rateQuery.data?.booking == null ? null : toBookingView(rateQuery.data.booking);

  if (engagementQuery.isPending) {
    return (
      <Wrapper>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your receipt</span>
          <Skeleton className="h-64 w-full" />
        </div>
      </Wrapper>
    );
  }

  if (engagementQuery.isError || view === null) {
    return (
      <Wrapper>
        <AccessRefusal
          error={engagementQuery.error ?? new Error("No booking")}
          attempting="open your receipt"
          onRetry={() => void engagementQuery.refetch()}
          inline={false}
        />
      </Wrapper>
    );
  }

  const receipt = view.accessReceipt;

  if (receipt === null) {
    return (
      <Wrapper>
        <h1 className="text-xl font-semibold text-text">Receipt</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          There is no receipt on this booking yet. That is normal if nothing has
          been charged. If you have paid and it is not here, contact support with
          the date and we will find it.
        </p>
        <BackLink engagementId={engagementId} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <article className="rounded-card border border-line bg-surface">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h1 className="text-lg font-semibold text-text">Payment receipt</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Not a tax invoice — see the note below
            </p>
          </div>
          <div className="text-right">
            <p data-numeric className="font-mono text-sm text-text">
              {receipt.number}
            </p>
            {receipt.paidOn !== null ? (
              <p className="mt-0.5 text-sm text-text-secondary">{receipt.paidOn}</p>
            ) : null}
            <div className="mt-2">
              <DownloadButton engagementId={engagementId} number={receipt.number} />
            </div>
          </div>
        </header>

        <dl className="divide-y divide-line">
          <Line label="Paid to" value="V Solve Hub" />
          <Line label="What this paid for" value={receipt.purpose} />
          <Line label="Amount paid" value={receipt.amountLabel} numeric emphasis />
        </dl>

        {booking !== null ? (
          <div className="border-t border-line p-5">
            <h2 className="text-sm font-semibold text-text">
              The rest of this booking, for context
            </h2>
            <p className="mt-1 max-w-prose text-xs leading-5 text-text-secondary">
              Not collected by V Solve Hub and not covered by this receipt. You pay
              it to the crew directly, at the end of each day.
            </p>
            <dl className="mt-3 divide-y divide-line rounded-card border border-line">
              <Line
                label={`The work — ${booking.headcount === 1 ? "1 person" : `${booking.headcount} people`} × ${booking.days} ${booking.days === 1 ? "day" : "days"}`}
                value={booking.totalLabel}
                numeric
              />
              <Line label="Paid directly to the crew" value={booking.leadReceiptLabel} numeric />
            </dl>
          </div>
        ) : null}

        <footer className="border-t border-line p-5">
          <p className="max-w-prose text-xs leading-5 text-text-secondary">
            This is a receipt for money V Solve Hub received. It is not a tax
            invoice. Quote{" "}
            <span data-numeric className="font-mono">
              {receipt.number}
            </span>{" "}
            if you contact us about this payment.
          </p>
        </footer>
      </article>

      <BackLink engagementId={engagementId} />
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-xl flex-col px-4 pb-16 pt-6">{children}</div>;
}

function BackLink({ engagementId }: { engagementId: string }) {
  return (
    <div className="mt-6">
      <Link href={engagementHref(engagementId)} className={buttonStyles({ variant: "ghost" })}>
        Back to this booking
      </Link>
    </div>
  );
}

function Line({
  label,
  value,
  numeric = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3">
      <dt className={emphasis ? "font-semibold text-text" : "text-sm text-text-secondary"}>
        {label}
      </dt>
      <dd
        {...(numeric ? { "data-numeric": true } : {})}
        className={emphasis ? "text-lg font-semibold text-text" : "font-medium text-text"}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Fetch the PDF and hand it to the browser as a file.
 *
 * A plain `<a href download>` would be simpler and would not work: the endpoint is
 * session-authenticated, and a top-level navigation to it in some browsers drops
 * the cookie or renders the PDF in a tab instead of saving it. Fetching with
 * credentials, then clicking a synthetic anchor at an object URL, downloads the
 * bytes we actually authorised.
 *
 * The object URL is revoked afterwards. Without it every download leaks its own
 * blob for the life of the tab, which on a receipts list is a real leak rather
 * than a theoretical one.
 */
function DownloadButton({ engagementId, number }: { engagementId: string; number: string }) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  async function download() {
    setState("working");
    try {
      const response = await fetch(
        `${PUBLIC_API_BASE_URL}/api/v1/engagements/${engagementId}/receipt/download/`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `receipt-${number}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      // Said on the button rather than in a banner: the failure belongs to the
      // control that caused it, and the receipt itself is still on screen.
      setState("failed");
    }
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download()}
        loading={state === "working"}
        loadingLabel="Preparing"
      >
        Download PDF
      </Button>
      {state === "failed" ? (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          Could not download. Try again.
        </p>
      ) : null}
    </div>
  );
}
