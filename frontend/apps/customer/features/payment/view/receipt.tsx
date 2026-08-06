"use client";

import { describeError } from "@vsolve/query";
import { Badge, ErrorState, Skeleton } from "@vsolve/ui";

import { useBookingGroup } from "@/features/bookings/queries";
import { Money } from "@/features/checkout/view/money";

import { useOrder, type Order, type TaxDocument } from "../queries";

/**
 * What was charged, split the way Django allocated it.
 *
 * Reached through the group's `order_id` (contract 1.14.0). Before that field
 * existed an Order was retrievable by id alone — no list, no filter — so a
 * customer who had paid had no route to their own invoice.
 *
 * Every figure is a field. The document total is not the sum of its lines as far
 * as this component is concerned: both come from the server, and rendering them
 * side by side without deriving one from the other is what lets a tax rounding
 * rule live in exactly one place.
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

function DocumentCard({ document }: { document: TaxDocument }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          {DOCUMENT_LABELS[document.kind]}{" "}
          <span className="font-mono font-normal text-text-secondary">{document.number}</span>
        </h3>
        {document.is_test ? <Badge tone="warning">Test document</Badge> : null}
      </div>

      {document.issued_at !== null ? (
        <p className="mt-1 text-sm text-text-secondary">
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

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {document.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3">
            <span className="text-text">
              {line.label}
              {line.quantity > 1 ? (
                <span className="text-text-secondary"> × {line.quantity}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-text-secondary">
              <Money value={line.total} />
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex justify-between text-sm font-semibold text-text">
        <span>Document total</span>
        <Money value={document.total} className="tabular-nums" />
      </p>
    </li>
  );
}

export function Receipt({ groupId }: { groupId: string }) {
  const groupQuery = useBookingGroup(groupId);
  const orderId = groupQuery.data?.order_id ?? null;
  const orderQuery = useOrder(orderId);

  if (groupQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (groupQuery.data == null) {
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
    // Not an error. Nothing has been captured, so there is no order to show —
    // and inventing a provisional one would put a receipt on an unpaid booking.
    return (
      <ErrorState
        severity="info"
        title="There is no receipt yet"
        message="A receipt appears once your payment is confirmed. You have not been charged."
      />
    );
  }

  if (orderQuery.isPending) return <Skeleton className="h-32 w-full" />;

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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-text">Your receipt</h2>
        <Badge tone={order.status === "CONFIRMED" ? "success" : "neutral"}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <div className="mt-4 flex items-baseline justify-between rounded-card border border-line-strong bg-surface p-4">
        <span className="text-base font-semibold text-text">Total paid</span>
        <Money value={order.total} className="text-xl font-bold tabular-nums text-text" />
      </div>

      {order.tax_documents.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {order.tax_documents.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">
          Your invoice is being prepared and will appear here shortly.
        </p>
      )}

      <p className="mt-4 text-sm text-text-secondary">
        Reference <span className="font-mono tabular-nums">{order.id}</span>
      </p>
    </div>
  );
}
