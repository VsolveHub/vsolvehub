"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, ErrorState, Logo, Skeleton } from "@vsolve/ui";
import Link from "next/link";

import { useBookingGroup } from "@/features/bookings/queries";
import { Money } from "@/features/checkout/view/money";

import { useOrder, type Order, type TaxDocument } from "../queries";

/**
 * Full-screen formal Tax Invoice & Receipt document view.
 * Includes Vsolve Hub logo, company GSTIN details, itemized service table,
 * payment summary, and a dedicated Download Receipt / Print trigger button.
 */

const DOCUMENT_LABELS: Record<TaxDocument["kind"], string> = {
  INVOICE: "Invoice",
  CREDIT_NOTE: "Credit note",
};

const ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  CONFIRMED: "Paid",
  CANCELLED: "Cancelled",
  REFUNDING: "Refund in progress",
  REFUNDED: "Refunded",
};

function TaxDocumentCard({ document }: { document: TaxDocument }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div className="font-semibold text-text">
          {DOCUMENT_LABELS[document.kind]}{" "}
          <span className="font-mono text-text-secondary">{document.number}</span>
        </div>
        {document.is_test ? <Badge tone="warning">Test document</Badge> : null}
      </div>

      {document.issued_at !== null ? (
        <p className="mt-1 text-text-secondary">
          Issued{" "}
          <time dateTime={document.issued_at}>
            {new Date(document.issued_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        </p>
      ) : null}

      <ul className="mt-2 space-y-1">
        {document.lines.map((line) => (
          <li key={line.id} className="flex justify-between">
            <span className="text-text">
              {line.label} {line.quantity > 1 ? `× ${line.quantity}` : ""}
            </span>
            <span className="tabular-nums text-text-secondary">
              <Money value={line.total} />
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex justify-between font-semibold text-text border-t border-line pt-2">
        <span>Document Total</span>
        <Money value={document.total} className="tabular-nums" />
      </div>
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

  return (
    <div className="space-y-6">
      {/* Top Action Bar (Screen only, hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          href={`/bookings/${group.id}`}
          className="text-sm font-semibold text-text-link hover:underline"
        >
          ← Back to booking
        </Link>
        <div className="flex items-center gap-3">
          <Badge tone={order.status === "CONFIRMED" ? "success" : "neutral"}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
          <Button
            variant="primary"
            onClick={() => window.print()}
            className="flex items-center gap-2"
          >
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download Receipt
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </div>

      {/* Official Tax Invoice & Receipt Paper Document */}
      <div className="rounded-xl border border-line bg-surface p-6 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-0 space-y-8">
        
        {/* Document Header: Logo & Invoice Metadata */}
        <div className="flex flex-wrap justify-between items-start gap-6 border-b border-line pb-6">
          <div>
            <Logo className="h-10 w-auto" />
            <div className="mt-3 text-xs text-text-secondary space-y-0.5">
              <p className="font-semibold text-text">Vsolve Hub Services India Pvt. Ltd.</p>
              <p>GSTIN: 27AAACV9821F1Z8 · SAC: 998713</p>
              <p>Vsolve Tower, Financial District, BKC, Mumbai 400051</p>
              <p>Support: support@vsolvehub.com | www.vsolvehub.com</p>
            </div>
          </div>

          <div className="text-left sm:text-right space-y-1">
            <h1 className="text-2xl font-bold uppercase text-text tracking-tight">
              Payment Receipt & Invoice
            </h1>
            <p className="text-xs text-text-secondary">
              Tax Invoice for Booking Reference{" "}
              <span className="font-mono font-medium text-text">{group.id}</span>
            </p>
            <div className="mt-2 inline-flex items-center gap-2">
              <Badge tone={order.status === "CONFIRMED" ? "success" : "neutral"}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
              <span className="text-xs font-mono text-text-secondary">
                Order Ref: {order.id}
              </span>
            </div>
          </div>
        </div>

        {/* Billed To & Service Information Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-surface-sunken p-4 sm:p-5 rounded-lg border border-line text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Customer & Billing Details
            </p>
            <p className="font-semibold text-text">Service Account Holder</p>
            <p className="text-xs text-text-secondary mt-1">
              Order Reference: <span className="font-mono">{order.id}</span>
            </p>
            <p className="text-xs text-text-secondary">
              Booking Reference: <span className="font-mono">{group.id}</span>
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
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
            <p className="text-xs text-text-secondary mt-1">
              Visits Scheduled:{" "}
              <span className="font-medium text-text">
                {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
              </span>
            </p>
          </div>
        </div>

        {/* Itemized Invoice Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-line-strong bg-surface-sunken text-xs font-semibold uppercase tracking-wider text-text-secondary">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Service / Description</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((line, index) => (
                <tr key={line.id} className="hover:bg-surface-sunken/50">
                  <td className="py-3 px-4 text-xs font-mono text-text-secondary">{index + 1}</td>
                  <td className="py-3 px-4 font-medium text-text">{line.label}</td>
                  <td className="py-3 px-4 text-center text-text-secondary">{line.quantity}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-text">
                    <Money value={line.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary & Tax Documents */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-t border-line pt-6">
          <div className="w-full sm:w-1/2 space-y-3">
            {order.tax_documents.length > 0 ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
                  Tax Documents
                </p>
                <div className="space-y-2">
                  {order.tax_documents.map((doc) => (
                    <TaxDocumentCard key={doc.id} document={doc} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="w-full sm:w-80 rounded-lg border border-line bg-surface-sunken p-4 space-y-3">
            <div className="flex justify-between text-sm text-text-secondary">
              <span>Subtotal</span>
              <Money value={order.total} className="tabular-nums font-mono text-text" />
            </div>
            <div className="flex justify-between text-xs text-text-secondary">
              <span>Applicable Taxes & GST</span>
              <span>Included</span>
            </div>
            <div className="border-t border-line pt-3 flex justify-between items-baseline">
              <span className="text-base font-bold text-text">Total Paid</span>
              <Money value={order.total} className="text-2xl font-bold tabular-nums text-text" />
            </div>
          </div>
        </div>

        {/* Document Footer Sign-off */}
        <div className="border-t border-line pt-6 text-center text-xs text-text-secondary space-y-1">
          <p className="font-medium text-text">
            This is an official computer-generated tax invoice issued by Vsolve Hub Services India Pvt. Ltd.
          </p>
          <p>Thank you for choosing Vsolve Hub for your home service needs!</p>
        </div>

      </div>
    </div>
  );
}
