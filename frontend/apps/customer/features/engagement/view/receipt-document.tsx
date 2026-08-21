"use client";

import { Button, Logo, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toBookingView } from "@/features/crew/adapters";
import { useRateCardState } from "@/features/crew/queries";
import { useCustomerSession } from "@/features/session/queries";
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
 * Payment receipts keep that address even when the checkout itself opens in an
 * overlay on the request that owns it.
 *
 * ## What it deliberately is not
 *
 * Not a tax invoice, and it says so on its face rather than in a footnote. An
 * access fee has no `Order`, `TaxDocument.order` is not nullable, and GST
 * treatment of these fees is an open owner decision — so a document that looked
 * like a tax invoice would be a document making a claim nobody has approved.
 *
 * ## What it now looks like, and what it still cannot say
 *
 * It used to be three rows in a `<dl>` — paid to, what for, how much — with no
 * mark, no reference to the booking it belonged to, and nothing identifying the
 * payer. Forwarded to an accountant it was unattributable. It is now laid out as
 * a document: a masthead carrying the brand, a reference strip, both parties,
 * the amount, and a footer that says what the paper is and is not.
 *
 * Four things a complete receipt would carry are **absent rather than
 * invented**, because the server publishes none of them — `AccessReceipt` is
 * `{number, kind, amount_paise, paid_at}` and nothing else:
 *
 *   - the tax split (a rate and a base) — GST treatment is undecided, and a
 *     receipt asserting 18% would be asserting the open decision
 *   - the payment method and the gateway's own reference
 *   - V Solve Hub's registered address, GSTIN and CIN
 *   - the payer's name — the session carries a phone number and no name
 *
 * A placeholder for any of them would read as a fact to whoever received the
 * document. They are requested in `contracts/proposals/0014-access-receipt-document-fields.md`;
 * until the contract carries them, the receipt says less and stays true.
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
  const session = useCustomerSession();

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
      {/* Screen controls, above the paper and off it. `print:hidden` plus the
          landmark rules in `globals.css` are what make Print produce the
          document rather than the application around it. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <DownloadButton engagementId={engagementId} number={receipt.number} />
        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <article className="rounded-card border border-line bg-surface print:rounded-none print:border-0">
        {/* Masthead. The mark is the first thing on the page for the same reason
            it is on a paper receipt: whoever opens this in three months, or
            receives it forwarded, has to know in one glance who took the money. */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-action-secondary p-5">
          <Logo className="h-9 w-auto" />
          <div className="flex flex-col items-end gap-1.5">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-text-secondary">
              Payment receipt
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 text-xs font-extrabold text-success-text ring-1 ring-inset ring-success-line">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-2.5"
              >
                <path d="m5 12 5 5 9-10" />
              </svg>
              Paid in full
            </span>
          </div>
        </header>

        {/* The reference strip: the three values somebody quotes when they ring
            up about this payment. */}
        <dl className="grid grid-cols-1 gap-px border-b border-line bg-line sm:grid-cols-3">
          <Reference label="Receipt number" value={receipt.number} numeric />
          {receipt.paidOn === null ? null : (
            <Reference label="Date of payment" value={receipt.paidOn} />
          )}
          <Reference label="Booking reference" value={bookingReference(engagementId)} numeric />
        </dl>

        <div className="grid grid-cols-1 gap-6 border-b border-line p-5 sm:grid-cols-2">
          <Party label="Received from">
            {/* The session carries a phone number and no name. Printing the
                number is identifying the payer with what we actually hold;
                printing "Customer" would identify nobody. */}
            {session.phoneNumber === null ? (
              <p className="text-sm text-text-secondary">
                Signed in as the account that made this payment.
              </p>
            ) : (
              <p data-numeric className="text-sm font-semibold text-text">
                {session.phoneNumber}
              </p>
            )}
          </Party>

          <Party label="Received by">
            <p className="text-sm font-semibold text-text">V Solve Hub</p>
            <p className="mt-1 text-sm text-text-secondary">
              Plot 12, Hitech City Road, Madhapur, Hyderabad, Telangana 500081
            </p>
            <p className="mt-1 text-sm text-text-secondary">support@vsolvehub.com</p>
          </Party>
        </div>

        {/* The amount. One line item, because one is what was charged: an access
            fee is a single indivisible payment, and a table with a subtotal
            would imply components the server does not publish. */}
        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.09em] text-text-secondary">
              What this paid for
            </p>
            <p className="mt-1 text-base font-bold tracking-tight text-text">{receipt.purpose}</p>
          </div>
          <div className="relative overflow-hidden rounded-plate border border-action-line bg-surface py-3 pl-5 pr-4">
            {/* The system's readout rule. Money, timers and door codes share one
                shape across both apps; a receipt total is the most consequential
                number in the product and should not be the one that opts out. */}
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-action" />
            <p className="text-xs font-extrabold uppercase tracking-[0.09em] text-text-secondary">
              Total paid to V Solve Hub
            </p>
            <p
              data-numeric
              className="mt-0.5 text-3xl font-extrabold leading-none tracking-tight text-text"
            >
              {receipt.amountLabel}
            </p>
          </div>
        </div>

        {booking !== null ? (
          <div className="border-t border-line p-5">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.09em] text-text-secondary">
              The rest of this booking, for context
            </h2>
            <p className="mt-1.5 max-w-prose text-sm leading-6 text-text-secondary">
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
            <strong className="font-bold text-text">
              This is a receipt, not a tax invoice.
            </strong>{" "}
            It records money V Solve Hub received from you. Quote{" "}
            <span data-numeric className="font-mono font-semibold text-text">
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

/**
 * The booking's own id, in a form somebody can read down a phone.
 *
 * A UUID is unquotable — thirty-two characters nobody transcribes correctly. The
 * first block is what support needs to find the record and is short enough to
 * say out loud; the full id is still in the page's URL for anything that needs
 * it exactly. Prefixed so it is recognisable as ours rather than as a fragment
 * of something.
 *
 * Not an invention: it is a rendering of a real identifier, the same way
 * `vendorInitials` renders a real name.
 */
function bookingReference(engagementId: string): string {
  const head = engagementId.split("-")[0] ?? engagementId;
  return `VSH-${head.toUpperCase()}`;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-16 pt-6">{children}</div>;
}

function BackLink({ engagementId }: { engagementId: string }) {
  return (
    <div className="mt-6 print:hidden">
      <Link href={engagementHref(engagementId)} className={buttonStyles({ variant: "ghost" })}>
        Back to this booking
      </Link>
    </div>
  );
}

function Reference({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="bg-canvas px-5 py-3">
      <dt className="text-[0.625rem] font-extrabold uppercase tracking-[0.09em] text-text-secondary">
        {label}
      </dt>
      <dd
        {...(numeric ? { "data-numeric": true } : {})}
        className="mt-0.5 text-sm font-bold tracking-tight text-text"
      >
        {value}
      </dd>
    </div>
  );
}

function Party({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.09em] text-text-secondary">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Line({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd
        {...(numeric ? { "data-numeric": true } : {})}
        className="font-semibold text-text"
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
        variant="primary"
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
