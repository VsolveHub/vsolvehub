"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, ErrorState, Logo, Skeleton , formatDate} from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { useBookingGroup } from "@/features/bookings/queries";
import { Money } from "@/features/checkout/view/money";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { SUPPORT } from "@/lib/support";

import { useOrder, type Order, type TaxDocument } from "../queries";

/**
 * The receipt for a paid booking: itemised visits, the documents issued for it, and the PDF.
 *
 * What a document is called comes from the server (`TaxDocument.title`, contract 1.78.0): a
 * payment receipt until V Solve Hub's GSTIN is configured, a tax invoice after. This screen never
 * names the issuer's legal entity, address or GSTIN itself — the downloaded PDF is the formal
 * document and carries exactly what the backend is configured to state.
 */

const ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  CONFIRMED: "Paid",
  CANCELLED: "Cancelled",
  REFUNDING: "Refund in progress",
  REFUNDED: "Refunded",
};

function TaxDocumentCard({ document }: { document: TaxDocument }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 text-xs">
      <div className="flex items-start justify-between gap-2 border-b border-line pb-2">
        <div className="min-w-0 font-semibold text-text">
          {document.title}{" "}
          <span className="break-all font-mono text-text-secondary">{document.number}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {document.is_test ? <Badge tone="warning">Test document</Badge> : null}
        </div>
      </div>

      {document.issued_at !== null ? (
        <p className="mt-1 text-text-secondary">
          Issued{" "}
          <time dateTime={document.issued_at}>
            {formatDate(document.issued_at)}
          </time>
        </p>
      ) : null}

      <ul className="mt-2 space-y-1">
        {document.lines.map((line) => (
          <li key={line.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0 wrap-anywhere text-text">
              {line.label} {line.quantity > 1 ? `× ${line.quantity}` : ""}
            </span>
            <span className="shrink-0 tabular-nums text-text-secondary">
              <Money value={line.total} />
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex justify-between gap-3 border-t border-line pt-2 font-semibold text-text">
        <span>Document Total</span>
        <Money value={document.total} className="shrink-0 tabular-nums" />
      </div>
    </div>
  );
}

function DownloadInvoiceButton({ document }: { document: TaxDocument }) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  const name = document.title.toLowerCase();

  async function download() {
    setState("working");
    try {
      const response = await fetch(
        `${PUBLIC_API_BASE_URL}/api/v1/tax-documents/${document.id}/download/`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${name.replaceAll(" ", "-")}-${document.number}.pdf`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="min-w-0">
      <Button
        variant="primary"
        onClick={() => void download()}
        loading={state === "working"}
        loadingLabel="Preparing PDF"
        className="h-11 max-w-full px-3 text-center leading-tight whitespace-normal md:px-5"
      >
        <span className="md:hidden">
          Download {name}
          <br />
          PDF
        </span>
        <span className="hidden md:inline">Download {name} PDF</span>
      </Button>
      {state === "failed" ? (
        <p className="mt-1 text-xs text-danger-text" role="alert">
          The PDF could not be downloaded. Try again.
        </p>
      ) : null}
    </div>
  );
}

export function Receipt({ groupId }: { groupId: string }) {
  const groupQuery = useBookingGroup(groupId);
  const group = groupQuery.data;
  const orderId = group?.order_id ?? null;
  const orderQuery = useOrder(orderId);

  if (groupQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (group == null) {
    return (
      <ErrorState
        severity="warning"
        title="We could not open this booking"
        message={
          groupQuery.isError
            ? describeError(groupQuery.error, "read").message
            : "This booking could not be found."
        }
      />
    );
  }

  if (orderId === null) {
    return (
      <ErrorState
        severity="info"
        title="There is no receipt yet"
        message="A receipt appears once your payment is confirmed. You have not been charged."
      />
    );
  }

  if (orderQuery.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (orderQuery.data == null) {
    return (
      <ErrorState
        severity="warning"
        title="We could not show your receipt"
        message={
          orderQuery.isError
            ? describeError(orderQuery.error, "read").message
            : "This receipt could not be loaded."
        }
        actionLabel="Try again"
        onAction={() => void orderQuery.refetch()}
      />
    );
  }

  const order = orderQuery.data;
  const lines = group.units.flatMap((u) => u.lines);
  const invoice = order.tax_documents.find((document) => document.kind === "INVOICE") ?? null;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Top Action Bar (Screen only, hidden when printing) */}
      <div className="flex flex-col gap-3 print:hidden md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
        <Link
          href={`/bookings/${group.id}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-text-link hover:underline"
        >
          ← Back to booking
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3">
          <Badge tone={order.status === "CONFIRMED" ? "success" : "neutral"}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
          {invoice === null ? null : <DownloadInvoiceButton document={invoice} />}
          <Button variant="outline" className="h-11 shrink-0 px-3 md:px-5" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* Receipt paper: what the customer paid for, and the documents issued for it */}
      <div className="box-border w-full max-w-full space-y-8 overflow-x-hidden rounded-xl border border-line bg-surface p-4 shadow-sm print:border-none print:p-0 print:shadow-none sm:p-6 lg:p-10">

        {/* Document Header: Logo & Receipt Metadata */}
        <div className="flex flex-col items-start justify-between gap-6 border-b border-line pb-6 md:flex-row">
          <div className="min-w-0">
            <Logo className="h-8 w-auto max-w-full md:h-10" />
            <div className="mt-3 space-y-0.5 text-xs wrap-anywhere text-text-secondary">
              <p className="font-semibold text-text">V Solve Hub</p>
              <p>Home services and project marketplace</p>
              <p>
                Support: {SUPPORT.email}
                {SUPPORT.phone ? ` | ${SUPPORT.phone.display}` : ""} | www.vsolvehub.com
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-1 text-left md:text-right">
            <h1 className="text-xl font-bold tracking-tight text-text uppercase md:text-2xl">
              {invoice?.title ?? "Payment receipt"}
            </h1>
            <p className="text-xs text-text-secondary">
              Booking reference{" "}
              <span className="break-all font-mono font-medium text-text">{group.id}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 md:justify-end">
              <Badge tone={order.status === "CONFIRMED" ? "success" : "neutral"}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
              <span className="break-all text-xs font-mono text-text-secondary">
                Order Ref: {order.id}
              </span>
            </div>
          </div>
        </div>

        {/* Billed To & Service Information Grid */}
        <div className="grid grid-cols-1 gap-6 rounded-lg border border-line bg-surface-sunken p-4 text-sm md:grid-cols-2 sm:p-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold tracking-wider text-text-secondary uppercase">
              Customer & Billing Details
            </p>
            <p className="font-semibold text-text">Service Account Holder</p>
            <p className="mt-1 text-xs text-text-secondary">
              Order Reference:{" "}
              <span className="break-all font-mono">{order.id}</span>
            </p>
            <p className="text-xs text-text-secondary">
              Booking Reference:{" "}
              <span className="break-all font-mono">{group.id}</span>
            </p>
          </div>

          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold tracking-wider text-text-secondary uppercase">
              Fulfillment Summary
            </p>
            <p className="text-xs text-text-secondary">
              Booked Date:{" "}
              <span className="font-medium text-text">
                {new Date(group.created_at).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              Visits Scheduled:{" "}
              <span className="font-medium text-text">
                {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
              </span>
            </p>
          </div>
        </div>

        {/* Itemized Invoice Table — table-fixed so amounts stay in view on a phone */}
        <div className="w-full min-w-0 max-w-full">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[50%]" />
              <col className="w-[15%]" />
              <col className="w-[25%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line-strong bg-surface-sunken text-xs font-semibold tracking-wider text-text-secondary uppercase">
                <th className="px-1 py-3 md:px-4">#</th>
                <th className="px-1 py-3 md:px-4">Service / Description</th>
                <th className="px-1 py-3 text-center md:px-4">Qty</th>
                <th className="px-1 py-3 text-right md:px-4">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((line, index) => (
                <tr key={line.id} className="hover:bg-surface-sunken/50">
                  <td className="px-1 py-3 align-top text-xs font-mono text-text-secondary md:px-4">
                    {index + 1}
                  </td>
                  <td className="min-w-0 px-1 py-3 align-top font-medium wrap-anywhere text-text md:px-4">
                    {line.label}
                  </td>
                  <td className="px-1 py-3 align-top text-center text-text-secondary md:px-4">
                    {line.quantity}
                  </td>
                  <td className="px-1 py-3 align-top text-right font-mono tabular-nums text-text md:px-4">
                    <Money value={line.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary & Tax Documents */}
        <div className="flex flex-col items-start justify-between gap-6 border-t border-line pt-6 lg:flex-row">
          <div className="w-full min-w-0 space-y-3 lg:w-1/2">
            {order.tax_documents.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-bold tracking-wider text-text-secondary uppercase">
                  Documents
                </p>
                <div className="space-y-2">
                  {order.tax_documents.map((doc) => (
                    <TaxDocumentCard key={doc.id} document={doc} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="w-full min-w-0 space-y-3 rounded-lg border border-line bg-surface-sunken p-4 lg:w-80 lg:shrink-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-bold text-text">Total Paid</span>
              <Money value={order.total} className="shrink-0 text-2xl font-bold tabular-nums text-text" />
            </div>
          </div>
        </div>

        {/* Document Footer Sign-off: says what this is, never more than the PDF states */}
        <div className="space-y-1 border-t border-line pt-6 text-center text-xs text-text-secondary">
          <p className="text-pretty font-medium text-text">
            {invoice?.title === "Tax invoice"
              ? "This is a computer-generated tax invoice. The downloadable PDF is the formal copy."
              : "This is a receipt for your payment to V Solve Hub. It is not a tax invoice."}
          </p>
          <p className="text-pretty">Thank you for choosing V Solve Hub for your home service needs!</p>
        </div>

      </div>
    </div>
  );
}
