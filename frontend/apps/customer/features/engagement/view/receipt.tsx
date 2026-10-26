"use client";

import { Button, Logo, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { WageLine } from "@/features/crew/view/wage-line";
import { useCustomerSession } from "@/features/session/queries";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { engagementHref, receiptHref } from "@/lib/routes";
import { SUPPORT } from "@/lib/support";

import { toEngagementView, type EngagementView } from "../adapters";
import { toCrewPaymentRecord } from "../model/booking-record";
import { useEngagement } from "../queries";

/**
 * One payment record for the booking, with the legal boundary kept visible.
 * Vsolve can receipt only the fee it collected; direct crew payments are shown
 * beside it from the two-sided day acknowledgements, never relabelled as money
 * Vsolve received.
 */

export interface ReceiptProps {
  engagementId: string;
  variant: "inline" | "document";
}

export function Receipt({ engagementId, variant }: ReceiptProps) {
  const engagementQuery = useEngagement(engagementId);
  const view = engagementQuery.data === undefined ? null : toEngagementView(engagementQuery.data);

  if (engagementQuery.isPending) {
    return (
      <Wrapper variant={variant}>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your receipt</span>
          <Skeleton className="h-48 w-full" />
        </div>
      </Wrapper>
    );
  }

  if (view === null) {
    return (
      <Wrapper variant={variant}>
        <AccessRefusal
          error={engagementQuery.error ?? new Error("No booking")}
          attempting="open your receipt"
          onRetry={() => void engagementQuery.refetch()}
          inline={variant === "inline"}
        />
      </Wrapper>
    );
  }

  const receipt = view.accessReceipt;

  if (receipt === null) {
    return (
      <Wrapper variant={variant}>
        {variant === "document" ? <h1 className="text-xl font-semibold text-text">Receipt</h1> : null}
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          There is no receipt on this booking yet. That is normal if nothing has
          been charged. If you have paid and it is not here, contact support with
          the date and we will find it.
        </p>
        {variant === "document" ? <BackLink engagementId={engagementId} /> : null}
      </Wrapper>
    );
  }

  if (variant === "inline") {
    const crewPayment = toCrewPaymentRecord(view);

    return (
      <Wrapper variant={variant}>
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-text">
                {crewPayment === null ? "Payment receipt" : "Booking payments"}
              </p>
              {crewPayment !== null ? (
                <p className="mt-0.5 text-xs text-text-secondary">
                  Total booking price {crewPayment.totalLabel}
                </p>
              ) : null}
            </div>
            <span className="rounded-full bg-success-surface px-2.5 py-1 text-xs font-bold text-success-text ring-1 ring-inset ring-success-line">
              Vsolve payment received
            </span>
          </div>

          <dl className="mt-3 divide-y divide-line rounded-control border border-line">
            <PaymentRow
              label={crewPayment === null ? receipt.purpose : "V Solve Hub booking fee"}
              amount={receipt.amountLabel}
              detail={`Receipt ${receipt.number}${receipt.paidOn === null ? "" : ` · ${receipt.paidOn}`}`}
            />
            {crewPayment !== null ? (
              <PaymentRow
                label="Paid directly to crew"
                amount={crewPayment.directAmountLabel}
                detail={crewPayment.statusLabel}
              />
            ) : null}
          </dl>

          <div className="mt-3">
            <Link href={receiptHref(engagementId)} className={buttonStyles({ variant: "outline", size: "sm" })}>
              {crewPayment === null ? "View receipt" : "View payment record"}
            </Link>
          </div>
          {crewPayment !== null ? <WageLine className="mt-3" /> : null}
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper variant={variant}>
      <DocumentReceipt engagementId={engagementId} view={view} receipt={receipt} />
      <BackLink engagementId={engagementId} />
    </Wrapper>
  );
}

function DocumentReceipt({
  engagementId,
  view,
  receipt,
}: {
  engagementId: string;
  view: EngagementView;
  receipt: NonNullable<EngagementView["accessReceipt"]>;
}) {
  const session = useCustomerSession();
  const crewPayment = toCrewPaymentRecord(view);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <DownloadButton
          engagementId={engagementId}
          number={receipt.number}
          label={crewPayment === null ? "Download PDF" : "Download V Solve Hub receipt (PDF)"}
        />
        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <article className="rounded-card border border-line bg-surface print:rounded-none print:border-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-action-secondary p-5">
          <Logo className="h-9 w-auto" />
          <div className="flex flex-col items-end gap-1.5">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-text-secondary">
              {crewPayment === null ? "Payment receipt" : "Booking payment record"}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 text-xs font-extrabold text-success-text ring-1 ring-inset ring-success-line">
              <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-2.5">
                <path d="m5 12 5 5 9-10" />
              </svg>
              {crewPayment?.allDaysConfirmed === true
                ? "All payments confirmed"
                : "Vsolve payment received"}
            </span>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-px border-b border-line bg-line sm:grid-cols-3">
          <Reference label="Receipt number" value={receipt.number} numeric />
          {receipt.paidOn === null ? null : <Reference label="Date of payment" value={receipt.paidOn} />}
          <Reference label="Booking reference" value={bookingReference(engagementId)} numeric />
        </dl>

        <div className="grid grid-cols-1 gap-6 border-b border-line p-5 sm:grid-cols-2">
          <Party label="Received from">
            {session.phoneNumber === null ? (
              <p className="text-sm text-text-secondary">Signed in as the account that made this payment.</p>
            ) : (
              <p data-numeric className="text-sm font-semibold text-text">
                {session.phoneNumber}
              </p>
            )}
          </Party>

          <Party label="Received by">
            <p className="text-sm font-semibold text-text">V Solve Hub</p>
            <p className="mt-1 text-sm text-text-secondary">{SUPPORT.email}</p>
            {SUPPORT.phone ? (
              <p className="mt-1 text-sm text-text-secondary">{SUPPORT.phone.display}</p>
            ) : null}
          </Party>
        </div>

        {crewPayment !== null ? (
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.09em] text-text-secondary">
                Entire booking
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                One record, split by who received each payment.
              </p>
            </div>
            <p data-numeric className="text-3xl font-extrabold leading-none tracking-tight text-text">
              {crewPayment.totalLabel}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.09em] text-text-secondary">
              {crewPayment === null ? "What this paid for" : "Paid to V Solve Hub"}
            </p>
            <p className="mt-1 text-base font-bold tracking-tight text-text">{receipt.purpose}</p>
            {receipt.paidOn !== null ? (
              <p className="mt-1 text-sm text-text-secondary">Received {receipt.paidOn}</p>
            ) : null}
          </div>
          <div className="relative overflow-hidden rounded-plate border border-action-line bg-surface py-3 pl-5 pr-4">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-action" />
            <p className="text-xs font-extrabold uppercase tracking-[0.09em] text-text-secondary">
              Total paid to V Solve Hub
            </p>
            <p data-numeric className="mt-0.5 text-3xl font-extrabold leading-none tracking-tight text-text">
              {receipt.amountLabel}
            </p>
          </div>
        </div>

        {crewPayment !== null ? (
          <div className="border-t border-line p-5">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.09em] text-text-secondary">
              Paid directly to crew
            </h2>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-text">{crewPayment.statusLabel}</p>
              <p data-numeric className="text-xl font-extrabold text-text">
                {crewPayment.directAmountLabel}
              </p>
            </div>
            {crewPayment.days.length > 0 ? (
              <ul className="mt-3 divide-y divide-line rounded-control border border-line">
                {crewPayment.days.map((day) => (
                  <li
                    key={day.stageId}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-text">{day.label}</span>
                    <span
                      className={
                        day.confirmed
                          ? "font-semibold text-success-text"
                          : "text-text-secondary"
                      }
                    >
                      {day.confirmed ? "Confirmed paid" : day.statusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <WageLine className="mt-3" />
            <p className="mt-1 max-w-prose text-xs leading-5 text-text-secondary">
              This section is the booking&apos;s acknowledgement record. It is not a V Solve Hub
              receipt because Vsolve did not collect this money.
            </p>
          </div>
        ) : null}

        <footer className="border-t border-line p-5">
          <p className="max-w-prose text-xs leading-5 text-text-secondary">
            <strong className="font-bold text-text">
              {crewPayment === null
                ? "This is a receipt, not a tax invoice."
                : "Only the V Solve Hub payment above is a receipt."}
            </strong>{" "}
            It records money V Solve Hub received from you; direct crew payments are shown only
            as acknowledged booking activity. Quote{" "}
            <span data-numeric className="font-mono font-semibold text-text">
              {receipt.number}
            </span>{" "}
            if you contact us about this payment.
          </p>
        </footer>
      </article>
    </>
  );
}

function bookingReference(engagementId: string): string {
  const head = engagementId.split("-")[0] ?? engagementId;
  return `VSH-${head.toUpperCase()}`;
}

function Wrapper({ variant, children }: { variant: "inline" | "document"; children: React.ReactNode }) {
  if (variant === "inline") return <div>{children}</div>;
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

function PaymentRow({ label, amount, detail }: { label: string; amount: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <dt className="text-sm font-semibold text-text">{label}</dt>
        <dd className="mt-0.5 text-xs leading-5 text-text-secondary">{detail}</dd>
      </div>
      <dd data-numeric className="shrink-0 text-sm font-bold text-text">
        {amount}
      </dd>
    </div>
  );
}

function Reference({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="bg-canvas px-5 py-3">
      <dt className="text-[0.625rem] font-extrabold uppercase tracking-[0.09em] text-text-secondary">{label}</dt>
      <dd {...(numeric ? { "data-numeric": true } : {})} className="mt-0.5 text-sm font-bold tracking-tight text-text">
        {value}
      </dd>
    </div>
  );
}

function Party({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.09em] text-text-secondary">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * Fetch the PDF and hand it to the browser as a file — session-authenticated,
 * so a plain download link would not carry the cookie in every browser.
 */
function DownloadButton({
  engagementId,
  number,
  label,
}: {
  engagementId: string;
  number: string;
  label: string;
}) {
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
      setState("failed");
    }
  }

  return (
    <div>
      <Button variant="primary" onClick={() => void download()} loading={state === "working"} loadingLabel="Preparing">
        {label}
      </Button>
      {state === "failed" ? (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          Could not download. Try again.
        </p>
      ) : null}
    </div>
  );
}
